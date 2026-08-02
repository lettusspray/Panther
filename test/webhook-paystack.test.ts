import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { createHmac } from "node:crypto";
import type { APIContext } from "astro";

vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_abc123def456");

// ── Mock DB ──────────────────────────────────────────────────────────

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../src/lib/db", () => ({ db }));

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
}));

// ── Chain helper ─────────────────────────────────────────────────────

function chain(returnData: unknown) {
  const c: Record<string, Mock> = {};
  for (const method of [
    "select", "from", "where", "limit",
    "insert", "values", "returning",
    "update", "set", "orderBy", "innerJoin",
  ]) {
    c[method] = vi.fn(() => c);
  }
  c.then = vi.fn((resolve: (v: unknown) => void) =>
    Promise.resolve(returnData).then(resolve),
  );
  return c;
}

// ── Test helpers ─────────────────────────────────────────────────────

const TEST_SECRET = "sk_test_abc123def456";

function makeRequest(body: string, signature?: string): Request {
  const headers = new Headers();
  if (signature) headers.set("x-paystack-signature", signature);
  return new Request("https://panther.pages.dev/api/webhooks/paystack", {
    method: "POST",
    headers,
    body,
  });
}

function validSig(body: string): string {
  return createHmac("sha512", TEST_SECRET).update(body).digest("hex");
}

function makeContext(req: Request): APIContext {
  return {
    request: req,
    params: {},
    locals: { user: null, session: null, subdomainHost: null, cfContext: null as unknown as ExecutionContext },
    url: new URL(req.url),
    site: undefined,
    generator: "Astro",
    redirect: () => new Response(null, { status: 302 }),
    rewrite: () => Promise.resolve(new Response(null, { status: 302 })),
    cookies: {} as APIContext["cookies"],
    clientAddress: "127.0.0.1",
    preferredLocale: undefined,
    preferredLocaleList: undefined,
    props: {},
    currentLocale: undefined,
    session: undefined,
    cache: {
      enabled: false,
      set: () => {},
      tags: [],
      options: {} as APIContext["cache"]["options"],
      invalidate: () => Promise.resolve(),
    },
    originPathname: "/",
    getActionResult: () => undefined,
    callAction: async (): Promise<never> => {
      throw new Error("not implemented");
    },
    isPrerendered: false,
    csp: undefined,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    routePattern: "/api/webhooks/paystack",
  };
}

// ── Load handler AFTER mocks ────────────────────────────────────────

const { POST } = await import("../src/pages/api/webhooks/paystack");

beforeEach(() => {
  vi.clearAllMocks();
  // Default: all DB calls return empty chains
  db.select.mockReturnValue(chain([]));
  db.insert.mockReturnValue(chain([]));
  db.update.mockReturnValue(chain([]));
});

// ── Missing / Invalid Signature ─────────────────────────────────────

describe("signature verification", () => {
  it("returns 401 when signature header is missing", async () => {
    const req = makeRequest(JSON.stringify({ event: "charge.success", data: {} }));
    const response = await POST(makeContext(req));
    expect(response.status).toBe(401);
  });

  it("returns 401 when signature is invalid", async () => {
    const body = JSON.stringify({ event: "charge.success", data: {} });
    const req = makeRequest(body, "invalid_hmac");
    const response = await POST(makeContext(req));
    expect(response.status).toBe(401);
  });
});

// ── Unknown Event Types ─────────────────────────────────────────────

describe("unknown event types", () => {
  it("returns 200 for unparseable events", async () => {
    const body = JSON.stringify({ event: "subscription.create", data: { id: 1 } });
    const req = makeRequest(body, validSig(body));
    const response = await POST(makeContext(req));
    expect(response.status).toBe(200);
  });
});

// ── Idempotency ─────────────────────────────────────────────────────

describe("idempotency", () => {
  it("returns 200 for duplicate events", async () => {
    db.select.mockReturnValue(chain([{ id: "existing" }]));
    const body = JSON.stringify({
      event: "charge.success",
      data: { id: 12345, reference: "sbx_ref", amount: 150000000 },
    });
    const req = makeRequest(body, validSig(body));
    const response = await POST(makeContext(req));
    expect(response.status).toBe(200);
  });

  it("handles race condition (unique constraint violation)", async () => {
    // Simulate a thenable that rejects with a PG unique violation
    const rejectThenable = {
      then(_resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
        const err = Object.assign(new Error("duplicate key"), { code: "23505" });
        reject(err);
      },
    };
    db.insert.mockReturnValue({ values: () => rejectThenable });

    const body = JSON.stringify({
      event: "charge.success",
      data: { id: 54321, reference: "sbx_ref", amount: 100000 },
    });
    const req = makeRequest(body, validSig(body));
    const response = await POST(makeContext(req));
    expect(response.status).toBe(200);
  });
});

// ── Transaction Not Found ───────────────────────────────────────────

describe("transaction not found", () => {
  it("returns 200 when switchboard transaction missing", async () => {
    // db.select returns empty for both idempotency and tx lookup
    const body = JSON.stringify({
      event: "charge.success",
      data: { id: 99999, reference: "sbx_unknown", amount: 200000 },
    });
    const req = makeRequest(body, validSig(body));
    const response = await POST(makeContext(req));
    expect(response.status).toBe(200);
  });
});

// ── Invalid State Transition ────────────────────────────────────────

describe("invalid state transition", () => {
  it("returns 200 when transition is invalid", async () => {
    // db.select for idempotency: empty (first call)
    // db.select for tx lookup: found but already released → initiated → released not valid
    db.select
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([{
        id: "tx-rel",
        status: "released",
        providerRef: "sbx_done",
      }]));

    const body = JSON.stringify({
      event: "charge.success",
      data: { id: 77777, reference: "sbx_done", amount: 100000 },
    });
    const req = makeRequest(body, validSig(body));
    const response = await POST(makeContext(req));
    expect(response.status).toBe(200);
  });
});

// ── Happy Path ───────────────────────────────────────────────────────

describe("charge.success (happy path)", () => {
  it("transitions initiated → funds_held → inspection_window", async () => {
    db.select
      .mockReturnValueOnce(chain([]))   // idempotency: no existing
      .mockReturnValueOnce(chain([{      // tx lookup: found
        id: "tx-1",
        status: "initiated",
        providerRef: "sbx_pay",
      }]));

    const body = JSON.stringify({
      event: "charge.success",
      data: { id: 12345, reference: "sbx_pay", amount: 150000000 },
    });
    const req = makeRequest(body, validSig(body));
    const response = await POST(makeContext(req));
    expect(response.status).toBe(200);
    expect(db.update).toHaveBeenCalledTimes(2);
  });

  it("does NOT overwrite providerRef", async () => {
    db.select
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([{
        id: "tx-1",
        status: "initiated",
        providerRef: "sbx_pay",
      }]));

    const body = JSON.stringify({
      event: "charge.success",
      data: { id: 12345, reference: "sbx_pay", amount: 100000 },
    });
    const req = makeRequest(body, validSig(body));

    // Track the objects passed to .set()
    const setCalls: Record<string, unknown>[] = [];
    const setMock = vi.fn((updates: Record<string, unknown>) => {
      setCalls.push(updates);
      return c;
    });
    // Override the default update chain with one that captures .set() args
    const c = chain([]);
    c.set = setMock;
    db.update.mockReturnValue(c);

    await POST(makeContext(req));

    expect(setCalls.length).toBeGreaterThan(0);
    for (const s of setCalls) {
      expect(s.providerRef).toBeUndefined();
    }
  });
});

// ── Transfer Events ─────────────────────────────────────────────────

describe("transfer events", () => {
  it("acknowledges transfer.success", async () => {
    const body = JSON.stringify({
      event: "transfer.success",
      data: { id: 66666, reference: "set_tx1_123", amount: 97500000 },
    });
    const req = makeRequest(body, validSig(body));
    const response = await POST(makeContext(req));
    expect(response.status).toBe(200);
  });
});
