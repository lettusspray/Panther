import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Wildcard Subdomain Extraction (routing decision) ──────────
// "Before" = hostname is apex panther.ng → no dealer routing.
// "After" = hostname is *.panther.ng → extract the dealer subdomain.

describe("extractSubdomain", () => {
  async function getModule() {
    return import("../src/lib/dealer/subdomain");
  }

  it("returns null for the apex panther.ng host", async () => {
    const { extractSubdomain } = await getModule();
    expect(extractSubdomain("panther.ng")).toBeNull();
  });

  it("extracts the dealer subdomain from a wildcard host", async () => {
    const { extractSubdomain } = await getModule();
    expect(extractSubdomain("lagos-motors.panther.ng")).toBe("lagos-motors");
  });

  it("is case-insensitive and normalizes to lowercase", async () => {
    const { extractSubdomain } = await getModule();
    expect(extractSubdomain("Lagos-Motors.Panther.NG")).toBe("lagos-motors");
  });

  it("extracts multi-segment subdomains", async () => {
    const { extractSubdomain } = await getModule();
    expect(extractSubdomain("west.lagos-motors.panther.ng")).toBe("west.lagos-motors");
  });

  it("returns null for unrelated domains", async () => {
    const { extractSubdomain } = await getModule();
    expect(extractSubdomain("example.com")).toBeNull();
    expect(extractSubdomain("panther.ng.com")).toBeNull();
    expect(extractSubdomain("notpanther.ng")).toBeNull();
  });

  it("returns null for empty hostnames", async () => {
    const { extractSubdomain } = await getModule();
    expect(extractSubdomain("")).toBeNull();
  });

  it("handles trailing-dot FQDN", async () => {
    const { extractSubdomain } = await getModule();
    expect(extractSubdomain("lagos-motors.panther.ng.")).toBe("lagos-motors");
  });

  it("returns null when the subdomain segment is empty", async () => {
    const { extractSubdomain } = await getModule();
    expect(extractSubdomain(".panther.ng")).toBeNull();
  });
});

// ── Subdomain Normalization / Validation ──────────────────────

describe("normalizeSubdomain", () => {
  async function getModule() {
    return import("../src/lib/dealer/subdomain");
  }

  it("accepts a valid lowercase subdomain", async () => {
    const { normalizeSubdomain } = await getModule();
    expect(normalizeSubdomain("lagos-motors")).toEqual({ ok: true, value: "lagos-motors" });
  });

  it("trims surrounding whitespace", async () => {
    const { normalizeSubdomain } = await getModule();
    expect(normalizeSubdomain("  lagos-motors  ")).toEqual({ ok: true, value: "lagos-motors" });
  });

  it("rejects uppercase letters", async () => {
    const { normalizeSubdomain } = await getModule();
    const result = normalizeSubdomain("LagosMotors");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("invalid");
  });

  it("rejects underscores and spaces", async () => {
    const { normalizeSubdomain } = await getModule();
    expect(normalizeSubdomain("lagos_motors").ok).toBe(false);
    expect(normalizeSubdomain("lagos motors").ok).toBe(false);
  });

  it("rejects non-string input", async () => {
    const { normalizeSubdomain } = await getModule();
    const result = normalizeSubdomain(123);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toMatch(/string/);
  });

  it("treats undefined, null, and empty as 'not provided'", async () => {
    const { normalizeSubdomain } = await getModule();
    expect(normalizeSubdomain(undefined)).toEqual({ ok: false, reason: "empty" });
    expect(normalizeSubdomain(null)).toEqual({ ok: false, reason: "empty" });
    expect(normalizeSubdomain("")).toEqual({ ok: false, reason: "empty" });
    expect(normalizeSubdomain("   ")).toEqual({ ok: false, reason: "empty" });
  });
});

// ── Canonical URL resolution (before/after subdomain assigned) ─

describe("getDealerCanonicalUrl", () => {
  async function getModule() {
    return import("../src/lib/dealer/subdomain");
  }

  it("uses the subdomain URL when the storefront is served via wildcard host", async () => {
    const { getDealerCanonicalUrl } = await getModule();
    expect(getDealerCanonicalUrl("lagos-motors.panther.ng", "lagos-motors")).toBe(
      "https://lagos-motors.panther.ng",
    );
  });

  it("falls back to panther.ng/dealers/slug before a subdomain is assigned", async () => {
    const { getDealerCanonicalUrl } = await getModule();
    expect(getDealerCanonicalUrl(null, "lagos-motors")).toBe(
      "https://panther.ng/dealers/lagos-motors",
    );
  });

  it("treats an empty subdomain host as unassigned", async () => {
    const { getDealerCanonicalUrl } = await getModule();
    expect(getDealerCanonicalUrl("", "lagos-motors")).toBe("https://panther.ng/dealers/lagos-motors");
  });
});

// ── Dealer JSON-LD with subdomainUrl ──────────────────────────

describe("generateDealerJsonLd subdomainUrl", () => {
  const baseParams = {
    businessName: "Lagos Motors Ltd",
    slug: "lagos-motors-ltd",
    about: "Premium dealer in Lagos",
    city: "Lagos",
    state: "Lagos",
    contactPhone: "08031234567",
    whatsappNumber: "2348031234567",
    logo: "https://img.panther.ng/logo.jpg",
    avgRating: 4.5,
    reviewCount: 12,
    activeCount: 8,
    soldCount: 3,
    googleBusinessUrl: null,
  };

  it("uses subdomainUrl as the business url when provided", async () => {
    const { generateDealerJsonLd } = await import("../src/lib/dealer/json-ld");
    const result = generateDealerJsonLd({
      ...baseParams,
      subdomainUrl: "https://lagos-motors-ltd.panther.ng",
    });
    expect(result[0].url).toBe("https://lagos-motors-ltd.panther.ng");
  });

  it("uses the subdomainUrl in the breadcrumb before the subdomain is assigned", async () => {
    const { generateDealerJsonLd } = await import("../src/lib/dealer/json-ld");
    const result = generateDealerJsonLd({
      ...baseParams,
      subdomainUrl: "https://lagos-motors-ltd.panther.ng",
    });
    const items = result[1].itemListElement as Array<Record<string, unknown>>;
    expect(items[1].item).toBe("https://lagos-motors-ltd.panther.ng");
  });

  it("falls back to panther.ng/dealers/slug when subdomainUrl is absent", async () => {
    const { generateDealerJsonLd } = await import("../src/lib/dealer/json-ld");
    const result = generateDealerJsonLd(baseParams);
    expect(result[0].url).toBe("https://panther.ng/dealers/lagos-motors-ltd");
    const items = result[1].itemListElement as Array<Record<string, unknown>>;
    expect(items[1].item).toBe("https://panther.ng/dealers/lagos-motors-ltd");
  });

  it("keeps googleBusinessUrl as the preferred url when both are present", async () => {
    const { generateDealerJsonLd } = await import("../src/lib/dealer/json-ld");
    const result = generateDealerJsonLd({
      ...baseParams,
      subdomainUrl: "https://lagos-motors-ltd.panther.ng",
      googleBusinessUrl: "https://business.google.com/n/123",
    });
    expect(result[0].url).toBe("https://business.google.com/n/123");
  });
});

// ── DB-backed subdomain lookups ───────────────────────────────

vi.mock("../src/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "dealer-1", slug: "lagos-motors", subdomain: "lagos-motors" }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "dealer-1", slug: "lagos-motors", subdomain: "lagos-motors" }]),
        }),
      }),
    }),
  },
}));

import { db } from "../src/lib/db";
import { getDealerBySubdomain, subdomainExists, getDealerByUserId, upsertDealerProfile } from "../src/lib/dealer";

function mockSelectResult(rows: Record<string, unknown>[]) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const innerJoinFn = vi.fn().mockReturnValue({ where: whereFn });
  const fromFn = vi.fn().mockReturnValue({ innerJoin: innerJoinFn, where: whereFn });
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: fromFn });
  return { whereFn, fromFn };
}

const dealerRow = {
  id: "dealer-1",
  userId: "user-1",
  businessName: "Lagos Motors",
  slug: "lagos-motors",
  subdomain: "lagos-motors",
  logo: null,
  bannerImage: null,
  about: null,
  city: "Lagos",
  state: "Lagos",
  contactPhone: null,
  whatsappNumber: null,
  naddcRegistrationId: null,
  isVerified: false,
  inspectionAvailable: false,
  deliveryAvailable: false,
  googleBusinessUrl: null,
  memberName: "Doe",
  memberImage: null,
  memberSince: new Date("2025-01-01"),
};

describe("getDealerBySubdomain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries by subdomain and returns the dealer profile", async () => {
    mockSelectResult([dealerRow]);
    const result = await getDealerBySubdomain("lagos-motors");
    expect(result?.businessName).toBe("Lagos Motors");
    expect(result?.slug).toBe("lagos-motors");
  });

  it("returns null when no dealer owns the subdomain", async () => {
    mockSelectResult([]);
    const result = await getDealerBySubdomain("unclaimed");
    expect(result).toBeNull();
  });

  it("passes the extracted subdomain into the where clause", async () => {
    const { whereFn } = mockSelectResult([]);
    await getDealerBySubdomain("lagos-motors");
    expect(whereFn).toHaveBeenCalled();
  });
});

describe("subdomainExists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when the subdomain is already taken", async () => {
    mockSelectResult([dealerRow]);
    expect(await subdomainExists("lagos-motors")).toBe(true);
  });

  it("returns false when the subdomain is free", async () => {
    mockSelectResult([]);
    expect(await subdomainExists("free-name")).toBe(false);
  });

  it("returns false when the only holder is the current user", async () => {
    mockSelectResult([dealerRow]);
    const own = await getDealerByUserId("user-1");
    expect(own).not.toBeNull();
    const result = await subdomainExists("lagos-motors", "user-1");
    expect(result).toBe(false);
  });
});

describe("upsertDealerProfile with subdomain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a dealer profile including the chosen subdomain", async () => {
    const insertReturning = vi.fn().mockResolvedValue([
      { id: "dealer-1", slug: "lagos-motors", subdomain: "lagos-motors" },
    ]);
    const insertValues = vi.fn().mockReturnValue({ returning: insertReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: insertValues });
    mockSelectResult([]);

    const result = await upsertDealerProfile("user-1", {
      businessName: "Lagos Motors",
      slug: "lagos-motors",
      subdomain: "lagos-motors",
    });

    expect(result.subdomain).toBe("lagos-motors");
    const values = insertValues.mock.calls[0][0] as Record<string, unknown>;
    expect(values.subdomain).toBe("lagos-motors");
  });

  it("stores null subdomain when none is provided on create", async () => {
    const insertValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: "dealer-1", slug: "lagos-motors", subdomain: null }]),
    });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: insertValues });
    mockSelectResult([]);

    await upsertDealerProfile("user-1", { businessName: "Lagos Motors", slug: "lagos-motors" });
    const values = insertValues.mock.calls[0][0] as Record<string, unknown>;
    expect(values.subdomain).toBeNull();
  });

  it("updates an existing profile with a new subdomain", async () => {
    const updateReturning = vi.fn().mockResolvedValue([
      { id: "dealer-1", slug: "lagos-motors", subdomain: "new-sub" },
    ]);
    const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: updateSet });
    mockSelectResult([dealerRow]);

    const result = await upsertDealerProfile("user-1", {
      businessName: "Lagos Motors",
      slug: "lagos-motors",
      subdomain: "new-sub",
    });

    expect(result.subdomain).toBe("new-sub");
    const setCall = updateSet.mock.calls[0][0] as Record<string, unknown>;
    expect(setCall.subdomain).toBe("new-sub");
  });

  it("clears the subdomain when an empty string is passed on update", async () => {
    const updateReturning = vi.fn().mockResolvedValue([
      { id: "dealer-1", slug: "lagos-motors", subdomain: null },
    ]);
    const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: updateSet });
    mockSelectResult([dealerRow]);

    const result = await upsertDealerProfile("user-1", {
      businessName: "Lagos Motors",
      slug: "lagos-motors",
      subdomain: undefined,
    });

    expect(result.subdomain).toBeNull();
    const setCall = updateSet.mock.calls[0][0] as Record<string, unknown>;
    expect(setCall.subdomain).toBeNull();
  });
});
