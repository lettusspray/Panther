/**
 * Paystack Payment Provider Adapter
 *
 * Constitution §X.4: "Third-party rails are dumb pipes for fiat movement."
 *
 * Paystack API surface: https://api.paystack.co
 * Auth: Bearer <secret_key> (static, long-lived)
 * Amounts: kobo (subunit of NGN) — ₦1,500 = 150000 kobo
 *
 * Critical gotchas (from rigorous audit):
 *   1. Amount field MUST be in kobo — sending "200" charges ₦2.00, not ₦200
 *   2. Webhook signature is HMAC-SHA512 (NOT SHA256) over raw body bytes
 *   3. 72-hour retry window — mandatory idempotency on our side
 *   4. No timestamp in signature — IP whitelist + idempotency DB required
 *   5. Transfer fees include ₦50 stamp duty on amounts ≥₦10,000
 *   6. Settlement is T+1 (Friday revenue settles Monday)
 */

import type {
  PaymentProvider,
  InitializeTransactionParams,
  InitializeTransactionResult,
  VerifyTransactionResult,
  CreateTransferRecipientParams,
  CreateTransferRecipientResult,
  InitiateTransferParams,
  InitiateTransferResult,
  VerifyTransferResult,
  WebhookEvent,
} from "./types";

const PAYSTACK_BASE = "https://api.paystack.co";

// ── Paystack Transfer Fee Schedule (Nigeria, verified) ──────────────
// These are Paystack's published fees for outbound transfers.
// Stamp duty (₦50) is a government levy on transfers ≥₦10,000.
// We store these for audit; the actual fee is returned by the API.

const TRANSFER_FEES = [
  { maxKobo: 500_000, feeKobo: 1_000 },     // ₦0–₦5,000 → ₦10
  { maxKobo: 5_000_000, feeKobo: 2_500 },    // ₦5,001–₦50,000 → ₦25
  { maxKobo: Infinity, feeKobo: 5_000 },     // Above ₦50,000 → ₦50
];
const STAMP_DUTY_THRESHOLD = 1_000_000; // ₦10,000 in kobo
const STAMP_DUTY_FEE = 5_000; // ₦50 in kobo

function estimateTransferFee(amountKobo: number): number {
  const bracket = TRANSFER_FEES.find((b) => amountKobo <= b.maxKobo);
  const baseFee = bracket?.feeKobo ?? 5_000;
  const stampDuty = amountKobo >= STAMP_DUTY_THRESHOLD ? STAMP_DUTY_FEE : 0;
  return baseFee + stampDuty;
}

// ── Paystack API Response Wrappers ──────────────────────────────────

interface PaystackApiResponse<T> {
  status: boolean;
  message: string;
  data: T;
}

interface PaystackTransactionData {
  id: number;
  domain: string;
  status: string;
  reference: string;
  amount: number;
  message: string | null;
  gateway_response: string;
  paid_at: string | null;
  created_at: string;
  channel: string;
  currency: string;
  ip_address: string;
  metadata: Record<string, unknown>;
  customer: {
    id: number;
    email: string;
    customer_code: string;
  };
  authorization?: {
    authorization_code: string;
    bin: string;
    last4: string;
    exp_month: string;
    exp_year: string;
    channel: string;
    bank: string;
  };
}

interface PaystackInitializeResponse {
  authorization_url: string;
  access_code: string;
  reference: string;
}

interface PaystackTransferRecipientData {
  name: string;
  account_number: string;
  bank_code: string;
  currency: string;
  type: "nuban";
  recipient_code: string;
  details: {
    authorization_code: string | null;
    account_name: string | null;
  };
}

interface PaystackTransferData {
  id: number;
  domain: string;
  amount: number;
  currency: string;
  source: string;
  reason: string;
  recipient: number;
  status: string;
  transfer_code: string;
  reference: string;
  createdAt: string;
  fees_breakdown: {
    flat_fee: number;
    percentage_fee: number;
    cap: number;
    total: number;
  } | null;
}

// ── Event Type Mapping ──────────────────────────────────────────────
// Paystack event types → our normalized WebhookEventType

const EVENT_MAP: Record<string, WebhookEvent["type"]> = {
  "charge.success": "transaction.success",
  "charge.failed": "transaction.failed",
  "charge.abandoned": "transaction.failed",
  "transfer.success": "transfer.success",
  "transfer.failed": "transfer.failed",
  "transfer.reversed": "transfer.reversed",
};

// ── Paystack Adapter ────────────────────────────────────────────────

export class PaystackProvider implements PaymentProvider {
  readonly name = "paystack";

  private secretKey: string;

  constructor(secretKey?: string) {
    this.secretKey = secretKey ?? import.meta.env.PAYSTACK_SECRET_KEY;
    if (!this.secretKey) {
      throw new Error(
        "Paystack secret key not configured. Set PAYSTACK_SECRET_KEY.",
      );
    }
  }

  // ── Collections ─────────────────────────────────────────────────

  async initializeTransaction(
    params: InitializeTransactionParams,
  ): Promise<InitializeTransactionResult> {
    const res = await this.request<PaystackInitializeResponse>(
      "POST",
      "/transaction/initialize",
      {
        email: params.email,
        amount: String(params.amountKobo),
        currency: params.currency,
        reference: params.reference,
        callback_url: params.callbackUrl,
        metadata: {
          switchboard_tx_id: params.switchboardTxId,
          ...params,
        },
      },
    );

    return {
      authorizationUrl: res.authorization_url,
      accessCode: res.access_code,
      reference: res.reference,
    };
  }

  async verifyTransaction(
    reference: string,
  ): Promise<VerifyTransactionResult> {
    const res = await this.request<PaystackTransactionData>(
      "GET",
      `/transaction/verify/${reference}`,
    );

    // Paystack returns status as "success", "failed", or "abandoned"
    const status = res.status as VerifyTransactionResult["status"];

    return {
      status,
      amountKobo: res.amount,
      currency: res.currency,
      reference: res.reference,
      providerId: String(res.id),
      email: res.customer.email,
      metadata: res.metadata ?? {},
    };
  }

  // ── Transfers / Disbursement ────────────────────────────────────

  async createTransferRecipient(
    params: CreateTransferRecipientParams,
  ): Promise<CreateTransferRecipientResult> {
    const res = await this.request<PaystackTransferRecipientData>(
      "POST",
      "/transferrecipient",
      {
        type: "nuban",
        name: params.name,
        account_number: params.accountNumber,
        bank_code: params.bankCode,
        currency: "NGN",
      },
    );

    return {
      recipientCode: res.recipient_code,
      verified: res.details.authorization_code !== null,
    };
  }

  async initiateTransfer(
    params: InitiateTransferParams,
  ): Promise<InitiateTransferResult> {
    const res = await this.request<PaystackTransferData>(
      "POST",
      "/transfer",
      {
        source: "balance",
        amount: String(params.amountKobo),
        recipient: params.recipientCode,
        reason: params.reason,
        reference: params.reference,
      },
    );

    return {
      status: res.status as "pending" | "failed",
      transferId: res.id,
      reference: res.reference,
      feeKobo: res.fees_breakdown?.total ?? estimateTransferFee(params.amountKobo),
    };
  }

  async verifyTransfer(
    reference: string,
  ): Promise<VerifyTransferResult> {
    const res = await this.request<PaystackTransferData>(
      "GET",
      `/transfer/${reference}`,
    );

    return {
      status: res.status as VerifyTransferResult["status"],
      transferId: res.id,
      reference: res.reference,
      amountKobo: res.amount,
    };
  }

  // ── Webhook Signature Verification ──────────────────────────────
  // CRITICAL: Paystack uses HMAC-SHA512 (not SHA256).
  // Must hash the raw body bytes — NOT JSON.stringify(req.body).

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const { createHmac, timingSafeEqual } = await_crypto();
    const expected = createHmac("sha512", this.secretKey)
      .update(rawBody)
      .digest("hex");

    // timingSafeEqual prevents timing attacks
    try {
      return timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(signature),
      );
    } catch {
      // Length mismatch — definitely invalid
      return false;
    }
  }

  // ── Webhook Event Parsing ───────────────────────────────────────

  parseWebhookEvent(rawBody: string): WebhookEvent | null {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return null;
    }

    const rawEventType = payload.event as string;
    if (!rawEventType) return null;

    const type = EVENT_MAP[rawEventType];
    if (!type) return null; // Unknown event type — ignore

    const data = payload.data as Record<string, unknown> | undefined;
    if (!data) return null;

    // For transaction events, reference is in data.reference
    // For transfer events, reference is in data.reference
    const reference = (data.reference as string) ?? "";
    const providerId = String(data.id ?? "");
    const amountKobo = (data.amount as number) ?? 0;

    return {
      type,
      reference,
      providerId,
      amountKobo,
      rawEventType,
      rawPayload: payload,
    };
  }

  // ── HTTP Helper ─────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${PAYSTACK_BASE}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
      "Content-Type": "application/json",
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = (await res.json()) as PaystackApiResponse<T>;

    if (!json.status || !res.ok) {
      throw new PaystackApiError(
        json.message ?? `Paystack API error: ${res.status}`,
        res.status,
        json,
      );
    }

    return json.data;
  }
}

// ── Error Class ─────────────────────────────────────────────────────

export class PaystackApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public response: unknown,
  ) {
    super(message);
    this.name = "PaystackApiError";
  }
}

// ── Crypto Helper ───────────────────────────────────────────────────
// In Cloudflare Workers, Node.js crypto is available via node:crypto.
// In vitest (Node.js), it's also available natively.

function await_crypto() {
  // Node.js environment (Cloudflare Workers polyfills node:crypto)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("node:crypto") as typeof import("node:crypto");
  return {
    createHmac: crypto.createHmac,
    timingSafeEqual: crypto.timingSafeEqual,
  };
}
