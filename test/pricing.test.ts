import { describe, it, expect } from "vitest";
import {
  calculateLandedCost,
  buildLandedCostInput,
} from "../src/lib/pricing/engine";
import type { LandedCostInput } from "../src/lib/pricing/types";

// ---------------------------------------------------------------------------
// Realistic Nigerian import parameters
// ---------------------------------------------------------------------------
const RATES = {
  fobLowUsd: 5_000,
  fobHighUsd: 8_000,
  freightLowUsd: 800,
  freightHighUsd: 2_500,
  insuranceRate: 0.0075,
  ncsRateNgn: 1_500,
  importDutyRate: 0.20,
  nacLevyRate: 0.05,
  surchargeRate: 0.07,
  cissRate: 0.01,
  etlsRate: 0.005,
  vatRate: 0.075,
  portThcLowNgn: 150_000,
  portThcHighNgn: 250_000,
  clearingAgentLowNgn: 100_000,
  clearingAgentHighNgn: 300_000,
  shippingReleaseLowNgn: 80_000,
  shippingReleaseHighNgn: 150_000,
  documentationLowNgn: 20_000,
  documentationHighNgn: 50_000,
} satisfies LandedCostInput;

function input(overrides?: Partial<LandedCostInput>): LandedCostInput {
  return { ...RATES, ...overrides };
}

// ---------------------------------------------------------------------------
// Hand-calculated reference values for RATES
//
// Low side:
//   FOB        = $5,000
//   Insurance  = $5,000 × 0.0075           = $37.50
//   CIF USD    = $5,000 + $800 + $37.50    = $5,837.50
//   CIF NGN    = $5,837.50 × 1,500         = ₦8,756,250
//   Duty       = ₦8,756,250 × 0.20         = ₦1,751,250
//   NAC        = ₦8,756,250 × 0.05         = ₦437,812.50
//   Surcharge  = ₦1,751,250 × 0.07         = ₦122,587.50  (7% × Duty, NOT CIF)
//   FOB NGN    = $5,000 × 1,500            = ₦7,500,000
//   CISS       = ₦7,500,000 × 0.01         = ₦75,000      (1% × FOB NGN, NOT CIF)
//   ETLS       = ₦8,756,250 × 0.005        = ₦43,781.25
//   VAT Base   = 8,756,250 + 1,751,250 + 437,812.50
//              + 122,587.50 + 75,000 + 43,781.25
//              = ₦11,186,681.25
//   VAT        = ₦11,186,681.25 × 0.075    = ₦839,001.09375
//   Statutory  = 1,751,250 + 437,812.50 + 122,587.50
//              + 75,000 + 43,781.25 + 839,001.09375
//              = ₦3,269,432.34375
//   Floor      = round(8,756,250 + 3,269,432.34375 + 350,000)
//              = round(12,375,682.34375) = ₦12,375,682.34
//
// High side:
//   FOB        = $8,000
//   Insurance  = $8,000 × 0.0075           = $60
//   CIF USD    = $8,000 + $2,500 + $60     = $10,560
//   CIF NGN    = $10,560 × 1,500           = ₦15,840,000
//   Duty       = ₦15,840,000 × 0.20        = ₦3,168,000
//   NAC        = ₦15,840,000 × 0.05        = ₦792,000
//   Surcharge  = ₦3,168,000 × 0.07         = ₦221,760
//   FOB NGN    = $8,000 × 1,500            = ₦12,000,000
//   CISS       = ₦12,000,000 × 0.01        = ₦120,000
//   ETLS       = ₦15,840,000 × 0.005       = ₦79,200
//   VAT Base   = 15,840,000 + 3,168,000 + 792,000
//              + 221,760 + 120,000 + 79,200
//              = ₦20,220,960
//   VAT        = ₦20,220,960 × 0.075       = ₦1,516,572
//   Statutory  = 3,168,000 + 792,000 + 221,760
//              + 120,000 + 79,200 + 1,516,572
//              = ₦5,897,532
//   Ceiling    = round(15,840,000 + 5,897,532 + 750,000)
//              = ₦22,487,532
// ---------------------------------------------------------------------------

describe("calculateLandedCost", () => {
  // -----------------------------------------------------------------------
  // 1. Basic 13-step calculation
  // -----------------------------------------------------------------------
  describe("basic 13-step calculation", () => {
    const result = calculateLandedCost(input());

    it("returns exactly 13 steps", () => {
      expect(result.steps).toHaveLength(13);
    });

    it("step 1 — FOB passes through unchanged", () => {
      const s = result.steps[0];
      expect(s.step).toBe(1);
      expect(s.name).toBe("FOB (Free on Board)");
      expect(s.valueLow).toBe(5_000);
      expect(s.valueHigh).toBe(8_000);
    });

    it("step 2 — CIF = FOB + Freight + Insurance", () => {
      const s = result.steps[1];
      expect(s.step).toBe(2);
      expect(s.valueLow).toBe(5_837.50);
      expect(s.valueHigh).toBe(10_560);
    });

    it("step 3 — Naira Conversion = CIF × NCS Rate", () => {
      const s = result.steps[2];
      expect(s.step).toBe(3);
      expect(s.valueLow).toBe(8_756_250);
      expect(s.valueHigh).toBe(15_840_000);
    });

    it("step 4 — Import Duty = 20% × CIF NGN", () => {
      const s = result.steps[3];
      expect(s.step).toBe(4);
      expect(s.valueLow).toBe(1_751_250);
      expect(s.valueHigh).toBe(3_168_000);
    });

    it("step 5 — NAC Levy = 5% × CIF NGN", () => {
      const s = result.steps[4];
      expect(s.step).toBe(5);
      expect(s.valueLow).toBe(437_812.50);
      expect(s.valueHigh).toBe(792_000);
    });

    it("step 6 — Surcharge = 7% × Import Duty", () => {
      const s = result.steps[5];
      expect(s.step).toBe(6);
      expect(s.valueLow).toBe(122_587.50);
      expect(s.valueHigh).toBe(221_760);
    });

    it("step 7 — CISS = 1% × FOB in Naira", () => {
      const s = result.steps[6];
      expect(s.step).toBe(7);
      expect(s.valueLow).toBe(75_000);
      expect(s.valueHigh).toBe(120_000);
    });

    it("step 8 — ETLS = 0.5% × CIF NGN", () => {
      const s = result.steps[7];
      expect(s.step).toBe(8);
      expect(s.valueLow).toBe(43_781.25);
      expect(s.valueHigh).toBe(79_200);
    });

    it("step 9 — VAT Base = CIF + Duty + NAC + Surcharge + CISS + ETLS", () => {
      const s = result.steps[8];
      expect(s.step).toBe(9);
      expect(s.valueLow).toBe(11_186_681.25);
      expect(s.valueHigh).toBe(20_220_960);
    });

    it("step 10 — VAT = 7.5% × VAT Base", () => {
      const s = result.steps[9];
      expect(s.step).toBe(10);
      expect(s.valueLow).toBe(839_001.09);
      expect(s.valueHigh).toBe(1_516_572);
    });

    it("step 11 — Total Statutory Charges = Steps 4–10", () => {
      const s = result.steps[10];
      expect(s.step).toBe(11);
      expect(s.valueLow).toBe(3_269_432.34);
      expect(s.valueHigh).toBe(5_897_532);
    });

    it("step 12 — Non-Statutory Costs (fixed)", () => {
      const s = result.steps[11];
      expect(s.step).toBe(12);
      expect(s.valueLow).toBe(350_000);
      expect(s.valueHigh).toBe(750_000);
    });

    it("step 13 — Final Landed Cost range", () => {
      const s = result.steps[12];
      expect(s.step).toBe(13);
      expect(s.valueLow).toBe(12_375_682.34);
      expect(s.valueHigh).toBe(22_487_532);
    });

    it("floorNgn and ceilingNgn match step 13", () => {
      expect(result.floorNgn).toBe(12_375_682.34);
      expect(result.ceilingNgn).toBe(22_487_532);
    });

    it("dataFreshnessOk is true with no freshness param", () => {
      expect(result.dataFreshnessOk).toBe(true);
      expect(result.staleFields).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Step 6 — Surcharge is 7% of Import Duty, NOT CIF
  // -----------------------------------------------------------------------
  describe("step 6 surcharge bases on Import Duty, not CIF", () => {
    it("surcharge equals duty × 0.07", () => {
      const r = calculateLandedCost(input());
      const duty = r.steps[3].valueLow;
      const surcharge = r.steps[5].valueLow;
      expect(surcharge).toBeCloseTo(duty * 0.07, 2);
    });

    it("surcharge is NOT 7% of CIF", () => {
      const r = calculateLandedCost(input());
      const cifNgn = r.steps[2].valueLow;
      const surcharge = r.steps[5].valueLow;
      expect(surcharge).not.toBeCloseTo(cifNgn * 0.07, 2);
      // The wrong calculation would yield ₦612,937.50
      expect(surcharge).not.toBe(612_937.50);
    });

    it("holds on high side too", () => {
      const r = calculateLandedCost(input());
      const dutyHigh = r.steps[3].valueHigh;
      const surchargeHigh = r.steps[5].valueHigh;
      expect(surchargeHigh).toBeCloseTo(dutyHigh * 0.07, 2);
      expect(surchargeHigh).not.toBeCloseTo(r.steps[2].valueHigh * 0.07, 2);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Step 7 — CISS is 1% of FOB in Naira, NOT CIF
  // -----------------------------------------------------------------------
  describe("step 7 CISS bases on FOB NGN, not CIF", () => {
    it("CISS equals FOB NGN × 0.01", () => {
      const r = calculateLandedCost(input());
      const fobNgnLow = RATES.fobLowUsd * RATES.ncsRateNgn;
      expect(r.steps[6].valueLow).toBeCloseTo(fobNgnLow * 0.01, 2);
    });

    it("CISS is NOT 1% of CIF", () => {
      const r = calculateLandedCost(input());
      const cifNgn = r.steps[2].valueLow;
      const ciss = r.steps[6].valueLow;
      expect(ciss).not.toBeCloseTo(cifNgn * 0.01, 2);
      // Wrong calc would give ₦87,562.50
      expect(ciss).not.toBe(87_562.50);
    });

    it("CISS low = ₦75,000 exactly", () => {
      const r = calculateLandedCost(input());
      expect(r.steps[6].valueLow).toBe(75_000);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Step 9 — VAT Base sums Steps 3–8 raw values
  // -----------------------------------------------------------------------
  describe("step 9 VAT Base summation", () => {
    it("VAT Base = CIF NGN + Duty + NAC + Surcharge + CISS + ETLS", () => {
      const r = calculateLandedCost(input());
      const cifNgn = r.steps[2].valueLow;
      const duty = r.steps[3].valueLow;
      const nac = r.steps[4].valueLow;
      const surcharge = r.steps[5].valueLow;
      const ciss = r.steps[6].valueLow;
      const etls = r.steps[7].valueLow;
      const expected = cifNgn + duty + nac + surcharge + ciss + etls;
      // Note: step outputs are rounded individually, but the VAT base is
      // computed from unrounded intermediates then rounded at output.
      expect(r.steps[8].valueLow).toBeCloseTo(expected, 1);
    });

    it("VAT Base high side sums correctly", () => {
      const r = calculateLandedCost(input());
      const cifNgn = r.steps[2].valueHigh;
      const duty = r.steps[3].valueHigh;
      const nac = r.steps[4].valueHigh;
      const surcharge = r.steps[5].valueHigh;
      const ciss = r.steps[6].valueHigh;
      const etls = r.steps[7].valueHigh;
      const expected = cifNgn + duty + nac + surcharge + ciss + etls;
      expect(r.steps[8].valueHigh).toBeCloseTo(expected, 1);
    });

    it("VAT Base does NOT include VAT itself", () => {
      const r = calculateLandedCost(input());
      const vatBase = r.steps[8].valueLow;
      const vat = r.steps[9].valueLow;
      expect(vatBase).toBeGreaterThan(0);
      expect(vat).toBeGreaterThan(0);
      expect(vatBase).toBeLessThan(vatBase + vat);
    });
  });

  // -----------------------------------------------------------------------
  // 5. Step 10 — VAT is 7.5% of VAT Base
  // -----------------------------------------------------------------------
  describe("step 10 VAT calculation", () => {
    it("VAT = 7.5% × VAT Base", () => {
      const r = calculateLandedCost(input());
      const vatBase = r.steps[8].valueLow;
      const vat = r.steps[9].valueLow;
      expect(vat).toBeCloseTo(vatBase * 0.075, 2);
    });

    it("VAT high = 7.5% × VAT Base high", () => {
      const r = calculateLandedCost(input());
      const vatBaseHigh = r.steps[8].valueHigh;
      const vatHigh = r.steps[9].valueHigh;
      expect(vatHigh).toBeCloseTo(vatBaseHigh * 0.075, 2);
    });

    it("VAT is NOT 7.5% of CIF", () => {
      const r = calculateLandedCost(input());
      const cifNgn = r.steps[2].valueLow;
      const vat = r.steps[9].valueLow;
      expect(vat).not.toBeCloseTo(cifNgn * 0.075, 2);
    });
  });

  // -----------------------------------------------------------------------
  // 6. NAC rate is 5% (corrected May 2026), not 15%
  // -----------------------------------------------------------------------
  describe("NAC levy rate is 5%", () => {
    it("NAC = 5% × CIF NGN", () => {
      const r = calculateLandedCost(input());
      const cifNgn = r.steps[2].valueLow;
      const nac = r.steps[4].valueLow;
      expect(nac).toBeCloseTo(cifNgn * 0.05, 2);
    });

    it("NAC is NOT 15% of CIF NGN", () => {
      const r = calculateLandedCost(input());
      const cifNgn = r.steps[2].valueLow;
      const nac = r.steps[4].valueLow;
      expect(nac).not.toBeCloseTo(cifNgn * 0.15, 2);
      // 15% would give ₦1,313,437.50
      expect(nac).not.toBe(1_313_437.50);
    });

    it("NAC low = ₦437,812.50 exactly", () => {
      const r = calculateLandedCost(input());
      expect(r.steps[4].valueLow).toBe(437_812.50);
    });
  });

  // -----------------------------------------------------------------------
  // 7. Staleness — freshness.ok = false
  // -----------------------------------------------------------------------
  describe("staleness halts the engine", () => {
    it("returns empty steps and dataFreshnessOk=false when stale", () => {
      const result = calculateLandedCost(input(), {
        ok: false,
        staleFields: ["ncsRateNgn", "exchangeRate"],
      });

      expect(result.dataFreshnessOk).toBe(false);
      expect(result.steps).toEqual([]);
      expect(result.floorNgn).toBe(0);
      expect(result.ceilingNgn).toBe(0);
      expect(result.staleFields).toEqual(["ncsRateNgn", "exchangeRate"]);
    });

    it("returns empty steps even when freshness param is omitted ok=false", () => {
      const result = calculateLandedCost(input(), {
        ok: false,
        staleFields: [],
      });

      expect(result.steps).toHaveLength(0);
      expect(result.floorNgn).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // 8. Staleness — freshness.ok = true
  // -----------------------------------------------------------------------
  describe("freshness.ok = true proceeds normally", () => {
    it("returns all 13 steps with dataFreshnessOk=true", () => {
      const result = calculateLandedCost(input(), {
        ok: true,
        staleFields: [],
      });

      expect(result.dataFreshnessOk).toBe(true);
      expect(result.steps).toHaveLength(13);
      expect(result.floorNgn).toBeGreaterThan(0);
      expect(result.ceilingNgn).toBeGreaterThan(0);
      expect(result.staleFields).toEqual([]);
    });

    it("produces identical output to calling without freshness param", () => {
      const withoutFreshness = calculateLandedCost(input());
      const withFreshOk = calculateLandedCost(input(), {
        ok: true,
        staleFields: [],
      });

      expect(withoutFreshness.floorNgn).toBe(withFreshOk.floorNgn);
      expect(withoutFreshness.ceilingNgn).toBe(withFreshOk.ceilingNgn);
      expect(withoutFreshness.steps).toEqual(withFreshOk.steps);
    });
  });

  // -----------------------------------------------------------------------
  // 9. Rounding — all output values are rounded to 2 decimal places
  // -----------------------------------------------------------------------
  describe("rounding to 2 decimal places", () => {
    const result = calculateLandedCost(input());

    it.each(result.steps.map((s) => [s.step, s.name, s.valueLow, s.valueHigh]))(
      "step %i (%s) — valueLow and valueHigh have at most 2 decimals",
      (_step, _name, valueLow, valueHigh) => {
        expect(valueLow).toBe(Math.round(valueLow * 100) / 100);
        expect(valueHigh).toBe(Math.round(valueHigh * 100) / 100);
      },
    );

    it("floorNgn is rounded to 2 decimals", () => {
      expect(result.floorNgn).toBe(
        Math.round(result.floorNgn * 100) / 100,
      );
    });

    it("ceilingNgn is rounded to 2 decimals", () => {
      expect(result.ceilingNgn).toBe(
        Math.round(result.ceilingNgn * 100) / 100,
      );
    });
  });

  // -----------------------------------------------------------------------
  // 10. Edge case — FOB = 0
  // -----------------------------------------------------------------------
  describe("FOB = 0 edge case", () => {
    const zeroFobInput = input({
      fobLowUsd: 0,
      fobHighUsd: 0,
      freightLowUsd: 0,
      freightHighUsd: 0,
    });

    const result = calculateLandedCost(zeroFobInput);

    it("steps 1–11 are all zero (low and high)", () => {
      for (let i = 0; i < 11; i++) {
        expect(result.steps[i].valueLow).toBe(0);
        expect(result.steps[i].valueHigh).toBe(0);
      }
    });

    it("step 12 (non-statutory) still has constant values", () => {
      expect(result.steps[11].valueLow).toBe(350_000);
      expect(result.steps[11].valueHigh).toBe(750_000);
    });

    it("step 13 (landed cost) equals non-statutory costs", () => {
      expect(result.steps[12].valueLow).toBe(350_000);
      expect(result.steps[12].valueHigh).toBe(750_000);
      expect(result.floorNgn).toBe(350_000);
      expect(result.ceilingNgn).toBe(750_000);
    });
  });

  // -----------------------------------------------------------------------
  // 11. Edge case — very large FOB values (no overflow)
  // -----------------------------------------------------------------------
  describe("very large FOB values do not overflow", () => {
    const largeInput = input({
      fobLowUsd: 100_000_000,
      fobHighUsd: 200_000_000,
      freightLowUsd: 5_000_000,
      freightHighUsd: 10_000_000,
    });

    const result = calculateLandedCost(largeInput);

    it("produces 13 steps with finite values", () => {
      expect(result.steps).toHaveLength(13);
      for (const s of result.steps) {
        expect(Number.isFinite(s.valueLow)).toBe(true);
        expect(Number.isFinite(s.valueHigh)).toBe(true);
      }
    });

    it("floorNgn and ceilingNgn are finite and positive", () => {
      expect(Number.isFinite(result.floorNgn)).toBe(true);
      expect(Number.isFinite(result.ceilingNgn)).toBe(true);
      expect(result.floorNgn).toBeGreaterThan(0);
      expect(result.ceilingNgn).toBeGreaterThan(result.floorNgn);
    });

    it("values are still properly rounded to 2 decimals", () => {
      expect(result.floorNgn).toBe(
        Math.round(result.floorNgn * 100) / 100,
      );
      expect(result.ceilingNgn).toBe(
        Math.round(result.ceilingNgn * 100) / 100,
      );
    });

    it("CIF NGN = (FOB + Freight + Insurance) × NCS Rate", () => {
      const cifLowNgn = result.steps[2].valueLow;
      const insuranceLow = 100_000_000 * RATES.insuranceRate;
      const expectedCifLow = (100_000_000 + 5_000_000 + insuranceLow) * RATES.ncsRateNgn;
      expect(cifLowNgn).toBeCloseTo(expectedCifLow, 0);
    });
  });

  // -----------------------------------------------------------------------
  // 12. buildLandedCostInput
  // -----------------------------------------------------------------------
  describe("buildLandedCostInput", () => {
    it("returns a valid LandedCostInput with all rate params", async () => {
      const result = await buildLandedCostInput({
        fobLowUsd: 3_000,
        fobHighUsd: 7_000,
        ncsRateNgn: 1_600,
        importDutyRate: 0.20,
        nacLevyRate: 0.05,
        vatRate: 0.075,
        surchargeRate: 0.07,
        cissRate: 0.01,
        etlsRate: 0.005,
        insuranceRate: 0.0075,
      });

      expect(result.fobLowUsd).toBe(3_000);
      expect(result.fobHighUsd).toBe(7_000);
      expect(result.ncsRateNgn).toBe(1_600);
      expect(result.importDutyRate).toBe(0.20);
      expect(result.nacLevyRate).toBe(0.05);
      expect(result.vatRate).toBe(0.075);
      expect(result.surchargeRate).toBe(0.07);
      expect(result.cissRate).toBe(0.01);
      expect(result.etlsRate).toBe(0.005);
      expect(result.insuranceRate).toBe(0.0075);
    });

    it("hardcodes freight to $800–$2,500", async () => {
      const result = await buildLandedCostInput({
        fobLowUsd: 5_000,
        fobHighUsd: 8_000,
        ncsRateNgn: 1_500,
        importDutyRate: 0.20,
        nacLevyRate: 0.05,
        vatRate: 0.075,
        surchargeRate: 0.07,
        cissRate: 0.01,
        etlsRate: 0.005,
        insuranceRate: 0.0075,
      });

      expect(result.freightLowUsd).toBe(800);
      expect(result.freightHighUsd).toBe(2_500);
    });

    it("hardcodes non-statutory costs to expected ranges", async () => {
      const result = await buildLandedCostInput({
        fobLowUsd: 5_000,
        fobHighUsd: 8_000,
        ncsRateNgn: 1_500,
        importDutyRate: 0.20,
        nacLevyRate: 0.05,
        vatRate: 0.075,
        surchargeRate: 0.07,
        cissRate: 0.01,
        etlsRate: 0.005,
        insuranceRate: 0.0075,
      });

      expect(result.portThcLowNgn).toBe(150_000);
      expect(result.portThcHighNgn).toBe(250_000);
      expect(result.clearingAgentLowNgn).toBe(100_000);
      expect(result.clearingAgentHighNgn).toBe(300_000);
      expect(result.shippingReleaseLowNgn).toBe(80_000);
      expect(result.shippingReleaseHighNgn).toBe(150_000);
      expect(result.documentationLowNgn).toBe(20_000);
      expect(result.documentationHighNgn).toBe(50_000);
    });

    it("output feeds correctly into calculateLandedCost", async () => {
      const builtInput = await buildLandedCostInput({
        fobLowUsd: 4_000,
        fobHighUsd: 6_000,
        ncsRateNgn: 1_500,
        importDutyRate: 0.20,
        nacLevyRate: 0.05,
        vatRate: 0.075,
        surchargeRate: 0.07,
        cissRate: 0.01,
        etlsRate: 0.005,
        insuranceRate: 0.0075,
      });

      const result = calculateLandedCost(builtInput);
      expect(result.steps).toHaveLength(13);
      expect(result.dataFreshnessOk).toBe(true);
      expect(result.floorNgn).toBeGreaterThan(0);
      expect(result.ceilingNgn).toBeGreaterThan(result.floorNgn);
    });
  });

  // -----------------------------------------------------------------------
  // Bonus: step formula strings document the correct base
  // -----------------------------------------------------------------------
  describe("formula strings are accurate", () => {
    it("step 6 formula says NOT CIF", () => {
      const r = calculateLandedCost(input());
      expect(r.steps[5].formula).toContain("NOT CIF");
    });

    it("step 7 formula says FOB", () => {
      const r = calculateLandedCost(input());
      expect(r.steps[6].formula).toContain("FOB");
    });

    it("step 10 formula shows 7.5%", () => {
      const r = calculateLandedCost(input());
      expect(r.steps[9].formula).toContain("7.5");
    });

    it("step 5 formula shows 5%", () => {
      const r = calculateLandedCost(input());
      expect(r.steps[4].formula).toContain("5");
    });
  });
});
