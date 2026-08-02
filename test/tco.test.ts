import { describe, it, expect } from "vitest";
import {
  calculateTco,
  getStateBySlug,
  NIGERIAN_STATES,
} from "../src/lib/tco";

describe("getStateBySlug", () => {
  it("returns the state for a known slug", () => {
    expect(getStateBySlug("lagos")?.name).toBe("Lagos");
    expect(getStateBySlug("fct")?.name).toBe("FCT (Abuja)");
  });

  it("returns undefined for unknown slugs", () => {
    expect(getStateBySlug("atlantis")).toBeUndefined();
  });

  it("covers all 37 states + FCT without duplicates", () => {
    const slugs = NIGERIAN_STATES.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.length).toBe(37);
    expect(slugs).toContain("lagos");
  });

  it("never defaults to Lagos-only pricing — prices vary by state", () => {
    const priceSet = new Set(NIGERIAN_STATES.map((s) => s.petrolPricePerLitreNgn));
    expect(priceSet.size).toBeGreaterThan(1);
  });
});

describe("calculateTco — fuel costs", () => {
  const base = {
    state: "lagos",
    annualMileageKm: 10000,
    fuelConsumptionLitresPer100km: 8,
    landedCostNgn: 8000000,
  };

  it("petrol uses the state's petrol price", () => {
    const lagos = getStateBySlug("lagos")!;
    const result = calculateTco({ ...base, fuelType: "petrol" });
    // 10000/100 * 8 * 640 = 512,000
    expect(result.annualFuelCostNgn).toBe(Math.round((10000 / 100) * 8 * lagos.petrolPricePerLitreNgn));
  });

  it("diesel uses the state's diesel price", () => {
    const lagos = getStateBySlug("lagos")!;
    const result = calculateTco({ ...base, fuelType: "diesel" });
    expect(result.annualFuelCostNgn).toBe(Math.round((10000 / 100) * 8 * lagos.dieselPricePerLitreNgn));
  });

  it("automatic transmission consumes ~10% more fuel", () => {
    const manual = calculateTco({ ...base, transmissionType: "manual" });
    const automatic = calculateTco({ ...base, transmissionType: "automatic" });
    expect(automatic.annualFuelCostNgn).toBe(Math.round(manual.annualFuelCostNgn * 1.1));
  });

  it("EV uses kWh/100km and charging cost, ignoring petrol price", () => {
    const ev = calculateTco({ ...base, fuelType: "ev", fuelConsumptionLitresPer100km: 0 });
    // (10000/100) * 18 kWh * 120 NGN/kWh = 216,000
    expect(ev.annualFuelCostNgn).toBe(216000);
    expect(ev.breakdown.fuelLabel).toContain("kWh");
  });

  it("unknown state falls back to a national default price", () => {
    const unknown = calculateTco({ ...base, state: "atlantis", fuelType: "petrol" });
    // default petrol 670
    expect(unknown.annualFuelCostNgn).toBe(Math.round((10000 / 100) * 8 * 670));
  });
});

describe("calculateTco — maintenance, insurance, road tax", () => {
  const base = {
    state: "lagos",
    annualMileageKm: 10000,
    fuelConsumptionLitresPer100km: 8,
    landedCostNgn: 8000000,
  };

  it("maintenance rate is lower for Toyota than for BMW", () => {
    const toyota = calculateTco({ ...base, makeName: "Toyota Camry" });
    const bmw = calculateTco({ ...base, makeName: "BMW 3 Series" });
    expect(toyota.estimatedAnnualMaintenanceNgn).toBeLessThan(bmw.estimatedAnnualMaintenanceNgn);
  });

  it("unknown make uses the default 3% maintenance rate", () => {
    const result = calculateTco({ ...base, makeName: "SomeUnknownBrand" });
    expect(result.estimatedAnnualMaintenanceNgn).toBe(Math.round(base.landedCostNgn * 0.03));
  });

  it("insurance brackets by value — higher value pays lower rate", () => {
    const cheap = calculateTco({ ...base, landedCostNgn: 1_000_000 });
    const expensive = calculateTco({ ...base, landedCostNgn: 30_000_000 });
    expect(cheap.breakdown.insuranceRate).toContain("3.5%");
    expect(expensive.breakdown.insuranceRate).toContain("2.0%");
  });

  it("road tax is ₦25,000 above ₦5M landed cost, else ₦15,000", () => {
    expect(calculateTco({ ...base, landedCostNgn: 5_000_001 }).annualRoadTaxNgn).toBe(25000);
    expect(calculateTco({ ...base, landedCostNgn: 5_000_000 }).annualRoadTaxNgn).toBe(15000);
  });

  it("total is the sum of all four components", () => {
    const result = calculateTco({ ...base });
    expect(result.totalAnnualRunningCostNgn).toBe(
      result.annualFuelCostNgn +
        result.estimatedAnnualMaintenanceNgn +
        result.estimatedAnnualInsuranceNgn +
        result.annualRoadTaxNgn,
    );
  });

  it("includes a state-specific verification disclaimer", () => {
    const result = calculateTco({ ...base });
    expect(result.disclaimer).toContain("Verify actual costs");
  });
});
