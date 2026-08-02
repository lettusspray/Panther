import { describe, it, expect } from "vitest";
import { generatePricingJsonLd } from "../src/lib/pricing/json-ld";
import type { PricingPageData } from "../src/lib/pricing/types";

const sampleData: PricingPageData = {
  cohort: {
    domain: "car",
    make: "Toyota",
    model: "Camry",
    trim: "XLE",
    modelYear: 2022,
  },
  result: {
    steps: [
      { step: 1, name: "FOB", valueLow: 1000000, valueHigh: 1200000, formula: "FOB × 1" },
      { step: 9, name: "VAT", valueLow: 250000, valueHigh: 300000, formula: "7.5% × VAT base" },
    ],
    floorNgn: 5000000,
    ceilingNgn: 6000000,
    dataFreshnessOk: true,
    staleFields: [],
  },
  effectiveTimestamp: new Date("2026-01-15T10:00:00Z"),
};

describe("generatePricingJsonLd", () => {
  it("returns exactly three schemas: Product, FAQPage, HowTo", () => {
    const schemas = generatePricingJsonLd(sampleData);
    expect(schemas.map((s) => s["@type"])).toEqual(["Product", "FAQPage", "HowTo"]);
  });

  it("Product schema carries the cohort-specific price range in NGN", () => {
    const [product] = generatePricingJsonLd(sampleData);
    const offers = product.offers as { lowPrice: number; highPrice: number; priceCurrency: string };
    expect(offers.lowPrice).toBe(5000000);
    expect(offers.highPrice).toBe(6000000);
    expect(offers.priceCurrency).toBe("NGN");
    expect(product.name).toBe("2022 Toyota Camry XLE Landed Cost in Nigeria");
  });

  it("Product schema is branded with the actual make, not a placeholder", () => {
    const [product] = generatePricingJsonLd(sampleData);
    expect((product.brand as { name: string }).name).toBe("Toyota");
    expect((product.brand as { name: string }).name).not.toBe("MakePlaceholder");
  });

  it("dateModified uses the engine's effective timestamp", () => {
    const [product] = generatePricingJsonLd(sampleData);
    expect(product.dateModified).toBe(sampleData.effectiveTimestamp.toISOString());
  });

  it("FAQ questions are generated from the cohort, not hardcoded copy", () => {
    const faq = generatePricingJsonLd(sampleData)[1];
    const firstQuestion = (faq.mainEntity as Array<{ name: string }>)[0];
    expect(firstQuestion.name).toContain("2022 Toyota Camry XLE");
  });

  it("HowTo steps mirror the engine's step list and value ranges", () => {
    const howTo = generatePricingJsonLd(sampleData)[2];
    const steps = howTo.step as Array<{ position: number; name: string; text: string }>;
    expect(steps).toHaveLength(2);
    expect(steps[0].position).toBe(1);
    expect(steps[0].name).toBe("FOB");
    expect(steps[0].text).toContain("₦1,000,000");
    expect(steps[0].text).toContain("₦1,200,000");
  });

  it("every schema carries the schema.org context", () => {
    for (const s of generatePricingJsonLd(sampleData)) {
      expect(s["@context"]).toBe("https://schema.org");
    }
  });

  it("changes when the cohort changes (proves dynamic generation)", () => {
    const other: PricingPageData = {
      ...sampleData,
      cohort: { ...sampleData.cohort, make: "BMW", model: "3 Series", trim: "330i", modelYear: 2023 },
      result: { ...sampleData.result, floorNgn: 9000000, ceilingNgn: 10000000 },
    };
    const [productA] = generatePricingJsonLd(sampleData);
    const [productB] = generatePricingJsonLd(other);
    expect(productA.name).not.toBe(productB.name);
    expect((productB.offers as { lowPrice: number }).lowPrice).toBe(9000000);
  });
});
