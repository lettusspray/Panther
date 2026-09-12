/** NOWPayments API adapter for marketplace crypto collection. */

const BASE = "https://api.nowpayments.io/v1";

type ApiResponse<T> = { data?: T; message?: string; status?: boolean };

export interface NowPayment {
  payment_id: number | string;
  payment_status: string;
  pay_address?: string;
  pay_amount?: number;
  pay_currency?: string;
  price_amount: number;
  price_currency: string;
  actually_paid?: number;
  outcome_amount?: number;
  outcome_currency?: string;
  order_id?: string;
  order_description?: string;
  created_at?: string;
  updated_at?: string;
}

export class NowPaymentsApiError extends Error {
  constructor(message: string, public statusCode: number, public response: unknown) {
    super(message);
    this.name = "NowPaymentsApiError";
  }
}

function getApiKey() {
  const key = import.meta.env.NOWPAYMENTS_API_KEY;
  if (!key) throw new Error("NOWPayments API key not configured. Set NOWPAYMENTS_API_KEY.");
  return key;
}

export async function createNowPayment(params: {
  priceAmount: number;
  priceCurrency: string;
  payCurrency: string;
  orderId: string;
  orderDescription: string;
  ipnCallbackUrl: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<NowPayment> {
  return request<NowPayment>("POST", "/payment", {
    price_amount: params.priceAmount,
    price_currency: params.priceCurrency.toLowerCase(),
    pay_currency: params.payCurrency.toLowerCase(),
    order_id: params.orderId,
    order_description: params.orderDescription,
    ipn_callback_url: params.ipnCallbackUrl,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    is_fee_paid_by_user: true,
  });
}

export async function getNowPaymentStatus(paymentId: string) {
  return request<NowPayment>("GET", `/payment/${encodeURIComponent(paymentId)}`);
}

export async function getNowPaymentCurrencies(): Promise<string[]> {
  const result = await request<{ currencies: string[] }>("GET", "/currencies");
  return result.currencies ?? [];
}

export function verifyNowPaymentsSignature(
  payload: Record<string, unknown>,
  signature: string,
): boolean {
  const secret = import.meta.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret || !signature) return false;
  const { createHmac, timingSafeEqual } = awaitCrypto();
  const canonical = JSON.stringify(sortObjectDeep(payload));
  const expected = createHmac("sha512", secret).update(canonical).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

function sortObjectDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectDeep);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((out, key) => {
        out[key] = sortObjectDeep((value as Record<string, unknown>)[key]);
        return out;
      }, {});
  }
  return value;
}

async function request<T>(method: string, path: string, body?: Record<string, unknown>) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "x-api-key": getApiKey(),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as ApiResponse<T> & T;
  if (!res.ok) {
    throw new NowPaymentsApiError(
      json.message ?? `NOWPayments API error: ${res.status}`,
      res.status,
      json,
    );
  }
  return (json.data ?? json) as T;
}

function awaitCrypto() {
  // Supported in the existing Astro/Cloudflare runtime setup used by Panther.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("node:crypto") as typeof import("node:crypto");
  return { createHmac: crypto.createHmac, timingSafeEqual: crypto.timingSafeEqual };
}
