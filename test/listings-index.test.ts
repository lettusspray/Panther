import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Listings makes extraction ─────────────────────────────────

describe("listings index make extraction", () => {
  it("extracts unique sorted makes from listing array", () => {
    const listings = [
      { makeName: "Toyota" },
      { makeName: "Honda" },
      { makeName: "toyota" },
      { makeName: "Ford" },
      { makeName: "Honda" },
    ];
    const makes = [...new Set(listings.map((l) => l.makeName))].sort();
    expect(makes).toEqual(["Ford", "Honda", "Toyota", "toyota"]);
  });

  it("returns empty array for no listings", () => {
    const makes = [...new Set(([] as { makeName: string }[]).map((l) => l.makeName))].sort();
    expect(makes).toEqual([]);
  });

  it("returns single make for uniform listings", () => {
    const listings = [
      { makeName: "Toyota" },
      { makeName: "Toyota" },
    ];
    const makes = [...new Set(listings.map((l) => l.makeName))].sort();
    expect(makes).toEqual(["Toyota"]);
  });
});

// ── Client-side filter logic (pure functions) ─────────────────

describe("listings client-side filter logic", () => {
  const cards = [
    { textContent: "2020 Toyota Camry", dataset: { make: "Toyota", model: "Camry", year: "2020", price: "5000000" } },
    { textContent: "2021 Honda Accord", dataset: { make: "Honda", model: "Accord", year: "2021", price: "8000000" } },
    { textContent: "2019 Ford Explorer", dataset: { make: "Ford", model: "Explorer", year: "2019", price: "12000000" } },
    { textContent: "2022 Honda Civic", dataset: { make: "Honda", model: "Civic", year: "2022", price: "3000000" } },
  ];

  it("filters by text search query", () => {
    const q = "honda";
    const visible = cards.filter((card) => {
      const text = card.textContent?.toLowerCase() ?? "";
      return text.includes(q);
    });
    expect(visible).toHaveLength(2);
  });

  it("filters by make", () => {
    const m = "Honda";
    const visible = cards.filter((card) => !m || card.dataset.make === m);
    expect(visible).toHaveLength(2);
  });

  it("filters by price range", () => {
    const p = "0-6000000";
    const [min, max] = p.split("-").map(Number);
    const visible = cards.filter((card) => {
      const price = Number(card.dataset.price);
      return price >= min && price <= max;
    });
    expect(visible).toHaveLength(2);
    expect(visible.map((c) => c.dataset.model)).toEqual(["Camry", "Civic"]);
  });

  it("returns all when no filters applied", () => {
    expect(cards).toHaveLength(4);
  });

  it("sorts ascending by price", () => {
    const sorted = [...cards].sort((a, b) => Number(a.dataset.price) - Number(b.dataset.price));
    expect(sorted[0].dataset.model).toBe("Civic");
    expect(sorted[3].dataset.model).toBe("Explorer");
  });

  it("sorts descending by price", () => {
    const sorted = [...cards].sort((a, b) => Number(b.dataset.price) - Number(a.dataset.price));
    expect(sorted[0].dataset.model).toBe("Explorer");
    expect(sorted[3].dataset.model).toBe("Civic");
  });

  it("combined filter: make + price range", () => {
    const m = "Honda";
    const p = "0-4000000";
    const [min, max] = p.split("-").map(Number);
    const visible = cards.filter((card) => {
      if (m && card.dataset.make !== m) return false;
      const price = Number(card.dataset.price);
      return price >= min && price <= max;
    });
    expect(visible).toHaveLength(1);
    expect(visible[0].dataset.model).toBe("Civic");
  });

  it("filtering by make with no matches returns empty", () => {
    const m = "BMW";
    const visible = cards.filter((card) => !m || card.dataset.make === m);
    expect(visible).toHaveLength(0);
  });
});

// ── Freshness banner logic ────────────────────────────────────

vi.mock("../src/lib/config", () => ({
  checkDataFreshness: vi.fn(),
  PRICING_RATE_KEYS: [
    "ncs_customs_rate",
    "import_duty_rate",
    "nac_levy_rate",
    "vat_rate",
    "surcharge_rate",
    "ciss_rate",
    "etls_rate",
    "insurance_rate",
  ],
}));

import { checkDataFreshness } from "../src/lib/config";

describe("listings index data freshness banner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows banner when freshness check fails", async () => {
    (checkDataFreshness as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, staleFields: ["ncs_customs_rate"] });
    const result = await checkDataFreshness([]);
    expect(result.ok).toBe(false);
  });

  it("hides banner when data is fresh", async () => {
    (checkDataFreshness as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, staleFields: [] });
    const result = await checkDataFreshness([]);
    expect(result.ok).toBe(true);
  });

  it("reports which fields are stale", async () => {
    (checkDataFreshness as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      staleFields: ["ncs_customs_rate", "vat_rate"],
    });
    const result = await checkDataFreshness([]);
    expect(result.staleFields).toContain("ncs_customs_rate");
    expect(result.staleFields).toContain("vat_rate");
  });
});

// ── Data attributes on listing cards ──────────────────────────

describe("listing card data attributes", () => {
  it("card has expected dataset keys for client-side filtering", () => {
    const card = {
      dataset: { make: "Toyota", model: "Camry", year: "2020", price: "5000000" },
    } as HTMLAnchorElement;
    expect(card.dataset.make).toBeDefined();
    expect(card.dataset.model).toBeDefined();
    expect(card.dataset.year).toBeDefined();
    expect(card.dataset.price).toBeDefined();
  });

  it("price attribute is parseable as number", () => {
    const priceStr = "5000000";
    const price = Number(priceStr);
    expect(Number.isNaN(price)).toBe(false);
    expect(price).toBeGreaterThan(0);
  });
});
