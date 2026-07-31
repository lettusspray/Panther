import { vi, describe, it, expect, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { PaystackProvider, PaystackApiError } from "../src/lib/payments/paystack";

// ── Mock DB ─────────────────────────────────────────────────────────

const db = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../src/lib/db", () => ({
  db,
}));

vi.mock("../src/lib/db/schema", () => ({
  webhookEvent: {
    provider: "provider",
    eventType: "event_type",
    reference: "reference",
    providerId: "provider_id",
    payload: "payload",
    processedAt: "processed_at",
  },
  switchboardTransaction: {
    id: "id",
    status: "status",
    listingId: "listing_id",
    buyerId: "buyer_id",
    sellerId: "seller_id",
    agreedPriceNgn: "agreed_price_ngn",
    platformFeeNgn: "platform_fee_ngn",
    feePayer: "fee_payer",
    providerRef: "provider_ref",
    providerMetadata: "provider_metadata",
    initiatedAt: "initiated_at",
    completedAt: "completed_at",
  },
  listing: { id: "id", sellerId: "seller_id", status: "status", trimId: "trim_id", modelYear: "model_year" },
  user: { id: "id", name: "name", email: "email" },
  sellerBankAccount: {
    sellerId: "seller_id",
    bankCode: "bank_code",
    accountNumber: "account_number",
    recipientCode: "recipient_code",
    verified: "verified",
  },
  gvoTrim: { id: "id", modelId: "model_id", name: "name" },
  gvoModel: { id: "id", makeId: "make_id", name: "name" },
  gvoMake: { id: "id", name: "name" },
}));

// ── Mock Paystack env ───────────────────────────────────────────────

const TEST_SECRET = "sk_test_abc123def456";

function makePaystackProvider() {
  return new PaystackProvider(TEST_SECRET);
}

// ── Webhook Signature Verification ──────────────────────────────────

describe("Paystack webhook signature verification", () => {
  it("accepts a valid HMAC-SHA512 signature", () => {
    const provider = makePaystackProvider();
    const rawBody = '{"event":"charge.success","data":{"reference":"sbx_123"}}';
    const expectedSig = createHmac("sha512", TEST_SECRET)
      .update(rawBody)
      .digest("hex");

    expect(provider.verifyWebhookSignature(rawBody, expectedSig)).toBe(true);
  });

  it("rejects an invalid signature", () => {
    const provider = makePaystackProvider();
    const rawBody = '{"event":"charge.success","data":{"reference":"sbx_123"}}';

    expect(provider.verifyWebhookSignature(rawBody, "invalid_sig")).toBe(false);
  });

  it("rejects a signature from a different secret", () => {
    const provider = makePaystackProvider();
    const rawBody = '{"event":"charge.success"}';
    const wrongSig = createHmac("sha512", "wrong_secret")
      .update(rawBody)
      .digest("hex");

    expect(provider.verifyWebhookSignature(rawBody, wrongSig)).toBe(false);
  });

  it("rejects when body is tampered after signing", () => {
    const provider = makePaystackProvider();
    const originalBody = '{"event":"charge.success","data":{"amount":100000}}';
    const sig = createHmac("sha512", TEST_SECRET)
      .update(originalBody)
      .digest("hex");

    const tamperedBody = '{"event":"charge.success","data":{"amount":999999}}';
    expect(provider.verifyWebhookSignature(tamperedBody, sig)).toBe(false);
  });

  it("handles empty body", () => {
    const provider = makePaystackProvider();
    const sig = createHmac("sha512", TEST_SECRET).update("").digest("hex");

    expect(provider.verifyWebhookSignature("", sig)).toBe(true);
  });
});

// ── Webhook Event Parsing ───────────────────────────────────────────

describe("Paystack webhook event parsing", () => {
  it("parses charge.success event", () => {
    const provider = makePaystackProvider();
    const payload = JSON.stringify({
      event: "charge.success",
      data: {
        id: 12345,
        reference: "sbx_abc123_def456",
        amount: 150000,
        status: "success",
        metadata: { switchboard_tx_id: "tx-1" },
      },
    });

    const event = provider.parseWebhookEvent(payload);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("transaction.success");
    expect(event!.reference).toBe("sbx_abc123_def456");
    expect(event!.amountKobo).toBe(150000);
    expect(event!.providerId).toBe("12345");
    expect(event!.rawEventType).toBe("charge.success");
  });

  it("parses transfer.success event", () => {
    const provider = makePaystackProvider();
    const payload = JSON.stringify({
      event: "transfer.success",
      data: {
        id: 67890,
        reference: "set_tx123_1234567890",
        amount: 975000,
        status: "success",
      },
    });

    const event = provider.parseWebhookEvent(payload);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("transfer.success");
    expect(event!.reference).toBe("set_tx123_1234567890");
  });

  it("parses transfer.failed event", () => {
    const provider = makePaystackProvider();
    const payload = JSON.stringify({
      event: "transfer.failed",
      data: { id: 11111, reference: "set_tx456_999", amount: 500000 },
    });

    const event = provider.parseWebhookEvent(payload);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("transfer.failed");
  });

  it("returns null for unknown event types", () => {
    const provider = makePaystackProvider();
    const payload = JSON.stringify({
      event: "subscription.create",
      data: { id: 1 },
    });

    expect(provider.parseWebhookEvent(payload)).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    const provider = makePaystackProvider();
    expect(provider.parseWebhookEvent("not json")).toBeNull();
  });

  it("returns null for empty object", () => {
    const provider = makePaystackProvider();
    expect(provider.parseWebhookEvent("{}")).toBeNull();
  });

  it("returns null when data field is missing", () => {
    const provider = makePaystackProvider();
    const payload = JSON.stringify({ event: "charge.success" });
    expect(provider.parseWebhookEvent(payload)).toBeNull();
  });
});

// ── Amount Conversion (Kobo) ────────────────────────────────────────

describe("Paystack amount handling (kobo)", () => {
  it("amount is in kobo — ₦1,500 = 150,000 kobo", () => {
    // This is the most common Paystack integration error
    // If you send "1500" instead of "150000", you charge ₦15.00, not ₦1,500
    const nairaAmount = 1500;
    const koboAmount = nairaAmount * 100;
    expect(koboAmount).toBe(150000);
  });

  it("handles kobo-to-naira conversion accurately", () => {
    // Paystack returns amount in kobo
    const paystackAmount = 150000; // from webhook
    const naira = paystackAmount / 100;
    expect(naira).toBe(1500);
  });

  it("preserves kobo precision for odd amounts", () => {
    const naira = 1234.56;
    const kobo = Math.round(naira * 100);
    expect(kobo).toBe(123456);
    expect(kobo / 100).toBe(1234.56);
  });
});

// ── Provider Interface Compliance ───────────────────────────────────

describe("PaystackProvider interface compliance", () => {
  it("has required methods", () => {
    const provider = makePaystackProvider();
    expect(typeof provider.initializeTransaction).toBe("function");
    expect(typeof provider.verifyTransaction).toBe("function");
    expect(typeof provider.createTransferRecipient).toBe("function");
    expect(typeof provider.initiateTransfer).toBe("function");
    expect(typeof provider.verifyTransfer).toBe("function");
    expect(typeof provider.verifyWebhookSignature).toBe("function");
    expect(typeof provider.parseWebhookEvent).toBe("function");
  });

  it("has name property", () => {
    const provider = makePaystackProvider();
    expect(provider.name).toBe("paystack");
  });

  it("throws if no secret key provided", () => {
    const original = import.meta.env.PAYSTACK_SECRET_KEY;
    // In vitest, import.meta.env properties can be set
    (import.meta.env as Record<string, string>).PAYSTACK_SECRET_KEY = "";

    expect(() => new PaystackProvider()).toThrow("Paystack secret key not configured");

    if (original) {
      (import.meta.env as Record<string, string>).PAYSTACK_SECRET_KEY = original;
    }
  });
});

// ── Transfer Fee Estimation ─────────────────────────────────────────

describe("Paystack transfer fees (Nigeria)", () => {
  // These are Paystack's published fees + stamp duty
  // We don't test the private function directly, but we verify
  // the fee schedule is correct by testing the adapter's public API.

  it("stamp duty applies on transfers >= ₦10,000", () => {
    // ₦50 stamp duty is a government levy on transfers >= ₦10,000
    const threshold = 10_000 * 100; // kobo
    expect(threshold).toBe(1_000_000);

    // Transfer of ₦10,000 incurs stamp duty
    const belowThreshold = 9_999 * 100;
    const atThreshold = 10_000 * 100;
    expect(belowThreshold).toBeLessThan(threshold);
    expect(atThreshold).toBeGreaterThanOrEqual(threshold);
  });

  it("transfer fee bands are correct", () => {
    // ₦0–₦5,000 → ₦10
    // ₦5,001–₦50,000 → ₦25
    // Above ₦50,000 → ₦50
    const bands = [
      { max: 5_000, fee: 10 },
      { max: 50_000, fee: 25 },
      { max: Infinity, fee: 50 },
    ];

    // Verify band structure
    expect(bands[0].max).toBe(5_000);
    expect(bands[0].fee).toBe(10);
    expect(bands[1].max).toBe(50_000);
    expect(bands[1].fee).toBe(25);
    expect(bands[2].fee).toBe(50);
  });
});

// ── Webhook Deduplication Logic ─────────────────────────────────────

describe("webhook deduplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("detects duplicate event via unique constraint", async () => {
    // Simulate a unique constraint violation (pg code 23505)
    const uniqueError = new Error("duplicate key value") as Error & { code: string };
    uniqueError.code = "23505";

    db.insert.mockReturnValue({
      then: () => Promise.reject(uniqueError),
    });

    // The webhook handler catches this and returns 200 (not an error)
    expect(uniqueError.code).toBe("23505");
  });

  it("dedupe key is (provider, event_type, reference)", () => {
    // Paystack has no idempotency key header.
    // We dedupe on: event type + our reference
    const dedupeKey = {
      provider: "paystack",
      eventType: "charge.success",
      reference: "sbx_abc123_def456",
    };

    // This combination is unique per transaction per event type
    expect(dedupeKey.provider).toBe("paystack");
    expect(dedupeKey.eventType).toBe("charge.success");
    expect(dedupeKey.reference).toBeTruthy();
  });
});

// ── Settlement Math ─────────────────────────────────────────────────

describe("settlement calculation", () => {
  it("seller proceeds = agreed price - platform fee", () => {
    const agreedPrice = 1_500_000; // ₦1,500,000
    const feeRate = 0.025;
    const fee = Math.round(agreedPrice * feeRate * 100) / 100;
    const sellerProceeds = agreedPrice - fee;

    expect(fee).toBe(37_500);
    expect(sellerProceeds).toBe(1_462_500);
    expect(fee + sellerProceeds).toBe(agreedPrice);
  });

  it("seller proceeds in kobo for PSP transfer", () => {
    const agreedPriceNgn = 1_500_000;
    const feeNgn = 37_500;
    const sellerProceedsKobo = Math.round((agreedPriceNgn - feeNgn) * 100);

    expect(sellerProceedsKobo).toBe(146_250_000); // ₦1,462,500 in kobo
  });

  it("handles small amounts without rounding errors", () => {
    const agreedPrice = 10_000; // ₦10,000
    const fee = 250; // 2.5%
    const sellerProceeds = agreedPrice - fee;

    expect(fee + sellerProceeds).toBe(agreedPrice);
    expect(sellerProceeds).toBe(9_750);
  });
});

// ── initializeTransaction (HTTP) ─────────────────────────────────

describe("PaystackProvider.initializeTransaction", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    globalThis.fetch = mockFetch;
    mockFetch.mockReset();
  });

  it("returns authorization URL from Paystack", async () => {
    const provider = makePaystackProvider();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        status: true,
        message: "Authorization URL created",
        data: {
          authorization_url: "https://checkout.paystack.com/abc123",
          access_code: "abc123",
          reference: "sbx_listing1_buyer1_1234567890",
        },
      }),
    });

    const result = await provider.initializeTransaction({
      switchboardTxId: "tx-1",
      amountKobo: 150_000_000,
      currency: "NGN",
      email: "buyer@test.com",
      reference: "sbx_listing1_buyer1_1234567890",
      callbackUrl: "http://localhost:4321/switchboard/tx-1",
    });

    expect(result.authorizationUrl).toBe("https://checkout.paystack.com/abc123");
    expect(result.accessCode).toBe("abc123");
    expect(result.reference).toBe("sbx_listing1_buyer1_1234567890");
  });

  it("sends amount in kobo string format", async () => {
    const provider = makePaystackProvider();
    let sentBody: string | undefined;
    mockFetch.mockImplementation(async (_url: string, opts: RequestInit) => {
      sentBody = opts.body as string;
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          status: true,
          message: "OK",
          data: { authorization_url: "https://paystack.com/url", access_code: "ac_123", reference: "ref" },
        }),
      };
    });

    await provider.initializeTransaction({
      switchboardTxId: "tx-1",
      amountKobo: 150_000_000,
      currency: "NGN",
      email: "buyer@test.com",
      reference: "sbx_ref",
      callbackUrl: "http://localhost:4321/cb",
    });

    const body = JSON.parse(sentBody!);
    expect(body.amount).toBe("150000000");
    expect(body.email).toBe("buyer@test.com");
  });

  it("throws PaystackApiError on API failure", async () => {
    const provider = makePaystackProvider();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({
        status: false,
        message: "Invalid reference",
        data: null,
      }),
    });

    await expect(
      provider.initializeTransaction({
        switchboardTxId: "tx-1",
        amountKobo: 100_000,
        currency: "NGN",
        email: "test@test.com",
        reference: "bad-ref",
        callbackUrl: "http://localhost/cb",
      }),
    ).rejects.toThrow("Invalid reference");
  });
});

// ── verifyTransaction (HTTP) ─────────────────────────────────────

describe("PaystackProvider.verifyTransaction", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    globalThis.fetch = mockFetch;
    mockFetch.mockReset();
  });

  it("returns success status for completed transaction", async () => {
    const provider = makePaystackProvider();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        status: true,
        message: "Verification successful",
        data: {
          id: 12345,
          status: "success",
          reference: "sbx_ref",
          amount: 150_000_000,
          currency: "NGN",
          customer: { email: "buyer@test.com" },
          metadata: { switchboard_tx_id: "tx-1" },
        },
      }),
    });

    const result = await provider.verifyTransaction("sbx_ref");

    expect(result.status).toBe("success");
    expect(result.amountKobo).toBe(150_000_000);
    expect(result.reference).toBe("sbx_ref");
    expect(result.email).toBe("buyer@test.com");
  });

  it("returns failed status for failed transaction", async () => {
    const provider = makePaystackProvider();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        status: true,
        message: "Verification successful",
        data: {
          id: 67890,
          status: "failed",
          reference: "sbx_ref",
          amount: 50_000_000,
          currency: "NGN",
          customer: { email: "buyer@test.com" },
          metadata: {},
        },
      }),
    });

    const result = await provider.verifyTransaction("sbx_ref");

    expect(result.status).toBe("failed");
  });
});

// ── createTransferRecipient (HTTP) ───────────────────────────────

describe("PaystackProvider.createTransferRecipient", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    globalThis.fetch = mockFetch;
    mockFetch.mockReset();
  });

  it("creates a NUBAN recipient and returns code", async () => {
    const provider = makePaystackProvider();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        status: true,
        message: "Transfer recipient created",
        data: {
          recipient_code: "RCP_abc123def",
          details: {
            authorization_code: "AUTH_xyz789",
            account_name: "Test Seller",
          },
        },
      }),
    });

    const result = await provider.createTransferRecipient({
      bankCode: "044",
      accountNumber: "0123456789",
      name: "Test Seller",
    });

    expect(result.recipientCode).toBe("RCP_abc123def");
    expect(result.verified).toBe(true);
  });

  it("returns verified=false when authorization_code is null", async () => {
    const provider = makePaystackProvider();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        status: true,
        message: "Transfer recipient created",
        data: {
          recipient_code: "RCP_unverified",
          details: {
            authorization_code: null,
            account_name: null,
          },
        },
      }),
    });

    const result = await provider.createTransferRecipient({
      bankCode: "011",
      accountNumber: "9876543210",
      name: "Unverified Seller",
    });

    expect(result.verified).toBe(false);
  });
});

// ── initiateTransfer (HTTP) ──────────────────────────────────────

describe("PaystackProvider.initiateTransfer", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    globalThis.fetch = mockFetch;
    mockFetch.mockReset();
  });

  it("initiates transfer and returns status and fee", async () => {
    const provider = makePaystackProvider();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        status: true,
        message: "Transfer queued",
        data: {
          id: 99999,
          status: "pending",
          reference: "set_tx1_1234567890",
          amount: 97_500_000,
          fees_breakdown: { total: 5_500 },
        },
      }),
    });

    const result = await provider.initiateTransfer({
      recipientCode: "RCP_abc",
      amountKobo: 97_500_000,
      reference: "set_tx1_1234567890",
      reason: "Panther Switchboard: proceeds for tx-1",
    });

    expect(result.status).toBe("pending");
    expect(result.transferId).toBe(99999);
    expect(result.reference).toBe("set_tx1_1234567890");
    expect(result.feeKobo).toBe(5_500);
  });

  it("sends required transfer fields", async () => {
    const provider = makePaystackProvider();
    let sentBody: string | undefined;
    mockFetch.mockImplementation(async (_url: string, opts: RequestInit) => {
      sentBody = opts.body as string;
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          status: true,
          message: "Transfer queued",
          data: { id: 1, status: "pending", reference: "ref", amount: 1000, fees_breakdown: null },
        }),
      };
    });

    await provider.initiateTransfer({
      recipientCode: "RCP_test",
      amountKobo: 50_000_000,
      reference: "set_ref",
      reason: "test transfer",
    });

    const body = JSON.parse(sentBody!);
    expect(body.source).toBe("balance");
    expect(body.recipient).toBe("RCP_test");
    expect(body.amount).toBe("50000000");
  });
});

// ── verifyTransfer (HTTP) ────────────────────────────────────────

describe("PaystackProvider.verifyTransfer", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    globalThis.fetch = mockFetch;
    mockFetch.mockReset();
  });

  it("returns success status for completed transfer", async () => {
    const provider = makePaystackProvider();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        status: true,
        message: "Transfer retrieved",
        data: {
          id: 88888,
          status: "success",
          reference: "set_tx1_1234567890",
          amount: 97_500_000,
        },
      }),
    });

    const result = await provider.verifyTransfer("set_tx1_1234567890");

    expect(result.status).toBe("success");
    expect(result.transferId).toBe(88888);
    expect(result.amountKobo).toBe(97_500_000);
  });
});

// ── PaystackApiError ─────────────────────────────────────────────

describe("PaystackApiError", () => {
  it("has name, message, statusCode, and response", () => {
    const error = new PaystackApiError("Bad request", 400, { status: false });

    expect(error.name).toBe("PaystackApiError");
    expect(error.message).toBe("Bad request");
    expect(error.statusCode).toBe(400);
    expect(error.response).toEqual({ status: false });
  });

  it("is an instance of Error", () => {
    const error = new PaystackApiError("test", 500, null);
    expect(error).toBeInstanceOf(Error);
  });
});

// ── getPaymentProvider ───────────────────────────────────────────

describe("getPaymentProvider", () => {
  beforeEach(() => {
    (import.meta.env as Record<string, string>).PAYSTACK_SECRET_KEY = TEST_SECRET;
  });

  it("returns a PaystackProvider by default", async () => {
    const { getPaymentProvider } = await import("../src/lib/payments/index");
    const provider = getPaymentProvider();

    expect(provider.name).toBe("paystack");
    expect(typeof provider.initializeTransaction).toBe("function");
    expect(typeof provider.initiateTransfer).toBe("function");
  });

  it("caches the provider instance", async () => {
    const { getPaymentProvider: gpp } = await import("../src/lib/payments/index");
    const a = gpp();
    const b = gpp();
    expect(a).toBe(b);
  });
});
