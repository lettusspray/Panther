import { describe, it, expect, vi, beforeEach } from "vitest";

// ── JSON-LD Generator Tests ────────────────────────────────────

describe("generateDealerJsonLd", () => {
  async function getModule() {
    return import("../src/lib/dealer/json-ld");
  }

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

  it("returns an array with LocalBusiness + BreadcrumbList", async () => {
    const { generateDealerJsonLd } = await getModule();
    const result = generateDealerJsonLd(baseParams);
    expect(result).toHaveLength(2);
    expect(result[0]["@type"]).toEqual(["AutoDealer", "LocalBusiness"]);
    expect(result[1]["@type"]).toBe("BreadcrumbList");
  });

  it("includes googleBusinessUrl in sameAs when provided", async () => {
    const { generateDealerJsonLd } = await getModule();
    const gbpUrl = "https://business.google.com/n/123456789";
    const result = generateDealerJsonLd({ ...baseParams, googleBusinessUrl: gbpUrl });
    const business = result[0];
    expect(business.sameAs).toContain(gbpUrl);
    expect(business.url).toBe(gbpUrl);
  });

  it("falls back to dealerUrl when no googleBusinessUrl", async () => {
    const { generateDealerJsonLd } = await getModule();
    const result = generateDealerJsonLd(baseParams);
    const business = result[0];
    expect(business.url).toBe("https://panther.ng/dealers/lagos-motors-ltd");
    expect(business.sameAs).toBeDefined();
    expect(business.sameAs).not.toContain("business.google.com");
  });

  it("includes WhatsApp in sameAs when whatsappNumber is provided", async () => {
    const { generateDealerJsonLd } = await getModule();
    const result = generateDealerJsonLd(baseParams);
    const business = result[0];
    expect(business.sameAs).toContain("https://wa.me/2348031234567");
  });

  it("includes hasMap with encoded search URL", async () => {
    const { generateDealerJsonLd } = await getModule();
    const result = generateDealerJsonLd(baseParams);
    const business = result[0];
    expect(business.hasMap).toMatch(/^https:\/\/www\.google\.com\/maps\/search\//);
    expect(business.hasMap).toContain(encodeURIComponent("Lagos Motors Ltd"));
    expect(business.hasMap).toContain(encodeURIComponent("Lagos"));
  });

  it("includes openingHoursSpecification with Mon-Sat hours", async () => {
    const { generateDealerJsonLd } = await getModule();
    const result = generateDealerJsonLd(baseParams);
    const business = result[0];
    const hours = business.openingHoursSpecification as Array<Record<string, string>>;
    expect(hours).toHaveLength(6);
    expect(hours[0].dayOfWeek).toBe("Monday");
    expect(hours[0].opens).toBe("09:00");
    expect(hours[0].closes).toBe("18:00");
    expect(hours[5].dayOfWeek).toBe("Saturday");
  });

  it("includes address with city, state, country", async () => {
    const { generateDealerJsonLd } = await getModule();
    const result = generateDealerJsonLd(baseParams);
    const business = result[0];
    const addr = business.address as Record<string, string>;
    expect(addr["@type"]).toBe("PostalAddress");
    expect(addr.addressLocality).toBe("Lagos");
    expect(addr.addressRegion).toBe("Lagos");
    expect(addr.addressCountry).toBe("NG");
  });

  it("includes only country in address when no city or state", async () => {
    const { generateDealerJsonLd } = await getModule();
    const result = generateDealerJsonLd({
      ...baseParams,
      city: null,
      state: null,
    });
    const business = result[0];
    const addr = business.address as Record<string, string>;
    expect(addr["@type"]).toBe("PostalAddress");
    expect(addr.addressCountry).toBe("NG");
    expect(addr.addressLocality).toBeUndefined();
    expect(addr.addressRegion).toBeUndefined();
  });

  it("includes aggregateRating when avgRating and reviewCount > 0", async () => {
    const { generateDealerJsonLd } = await getModule();
    const result = generateDealerJsonLd(baseParams);
    const business = result[0];
    const rating = business.aggregateRating as Record<string, unknown>;
    expect(rating["@type"]).toBe("AggregateRating");
    expect(rating.ratingValue).toBe(4.5);
    expect(rating.ratingCount).toBe(12);
  });

  it("omits aggregateRating when no reviews", async () => {
    const { generateDealerJsonLd } = await getModule();
    const result = generateDealerJsonLd({
      ...baseParams,
      avgRating: null,
      reviewCount: 0,
    });
    expect(result[0].aggregateRating).toBeUndefined();
  });

  it("sets priceRange and areaServed", async () => {
    const { generateDealerJsonLd } = await getModule();
    const result = generateDealerJsonLd(baseParams);
    const business = result[0];
    expect(business.priceRange).toBe("\u20A6\u20A6");
    expect(business.areaServed).toEqual({
      "@type": "Country",
      name: "Nigeria",
    });
  });

  it("builds correct BreadcrumbList with two items", async () => {
    const { generateDealerJsonLd } = await getModule();
    const result = generateDealerJsonLd(baseParams);
    const breadcrumb = result[1];
    const items = breadcrumb.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      "@type": "ListItem",
      position: 1,
      name: "Listings",
      item: "https://panther.ng/listings",
    });
    expect(items[1]).toEqual({
      "@type": "ListItem",
      position: 2,
      name: "Lagos Motors Ltd",
      item: "https://panther.ng/dealers/lagos-motors-ltd",
    });
  });
});

// ── Dealer Profile Upsert Tests ─────────────────────────────────

vi.mock("../src/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "dealer-1", slug: "lagos-motors-ltd" }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "dealer-1", slug: "lagos-motors-ltd" }]),
        }),
      }),
    }),
  },
}));

import { db } from "../src/lib/db";

function mockSelectResult(rows: Record<string, unknown>[]) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: fromFn });
}

describe("upsertDealerProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new dealer profile with googleBusinessUrl", async () => {
    const insertReturning = vi.fn().mockResolvedValue([{ id: "dealer-1", slug: "lagos-motors" }]);
    const insertValues = vi.fn().mockReturnValue({ returning: insertReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: insertValues });

    const { upsertDealerProfile } = await import("../src/lib/dealer");
    mockSelectResult([]);

    const result = await upsertDealerProfile("user-1", {
      businessName: "Lagos Motors",
      slug: "lagos-motors",
      googleBusinessUrl: "https://business.google.com/n/123",
    });

    expect(result.slug).toBe("lagos-motors");
    expect(result.id).toBe("dealer-1");
    expect(db.insert).toHaveBeenCalled();
  });

  it("updates existing dealer profile with googleBusinessUrl", async () => {
    const updateReturning = vi.fn().mockResolvedValue([{ id: "dealer-1", slug: "new-slug" }]);
    const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: updateSet });

    const { upsertDealerProfile } = await import("../src/lib/dealer");
    mockSelectResult([{
      id: "dealer-1",
      userId: "user-1",
      businessName: "Old Name",
      slug: "old-slug",
    }]);

    const result = await upsertDealerProfile("user-1", {
      businessName: "New Name",
      slug: "new-slug",
      googleBusinessUrl: "https://business.google.com/n/456",
    });

    expect(result.slug).toBe("new-slug");
    expect(db.update).toHaveBeenCalled();
  });
});

// ── Dealer JSON-LD: Edge Cases ─────────────────────────────────

describe("generateDealerJsonLd edge cases", () => {
  it("handles null about gracefully", async () => {
    const { generateDealerJsonLd } = await import("../src/lib/dealer/json-ld");
    const result = generateDealerJsonLd({
      businessName: "Test Dealer",
      slug: "test-dealer",
      about: null,
      city: null,
      state: null,
      contactPhone: null,
      whatsappNumber: null,
      logo: null,
      avgRating: null,
      reviewCount: 0,
      activeCount: 0,
      soldCount: 0,
      googleBusinessUrl: null,
    });
    expect(result[0].description).toMatch(/Test Dealer.*Vehicle dealer on Panther/);
  });

  it("generates hasMap even without city/state using businessName + Nigeria", async () => {
    const { generateDealerJsonLd } = await import("../src/lib/dealer/json-ld");
    const result = generateDealerJsonLd({
      businessName: "Kano Auto",
      slug: "kano-auto",
      about: null,
      city: null,
      state: null,
      contactPhone: null,
      whatsappNumber: null,
      logo: null,
      avgRating: null,
      reviewCount: 0,
      activeCount: 0,
      soldCount: 0,
      googleBusinessUrl: null,
    });
    const hasMap = result[0].hasMap as string;
    expect(hasMap).toContain(encodeURIComponent("Kano Auto"));
    expect(hasMap).toContain(encodeURIComponent("Nigeria"));
  });

  it("does not include sameAs when no whatsapp or GBP URL", async () => {
    const { generateDealerJsonLd } = await import("../src/lib/dealer/json-ld");
    const result = generateDealerJsonLd({
      businessName: "Silent Dealer",
      slug: "silent-dealer",
      about: null,
      city: null,
      state: null,
      contactPhone: null,
      whatsappNumber: null,
      logo: null,
      avgRating: null,
      reviewCount: 0,
      activeCount: 0,
      soldCount: 0,
      googleBusinessUrl: null,
    });
    expect(result[0].sameAs).toBeUndefined();
  });
});
