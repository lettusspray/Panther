import { db } from "../db";
import { cohortPricing } from "../db/schema";
import { eq, and } from "drizzle-orm";
import {
  calculateLandedCost,
  buildLandedCostInput,
} from "./engine";
import { generatePricingJsonLd } from "./json-ld";
import {
  checkDataFreshness,
  PRICING_RATE_KEYS,
  getNcsRate,
  getImportDutyRate,
  getNacLevyRate,
  getVatRate,
  getSurchargeRate,
  getCissRate,
  getEtlsRate,
  getInsuranceRate,
} from "../config";
import { resolveTrimBySlugs, type GvoPath } from "../gvo";

export interface CohortResult {
  modelYear: number;
  fobRange: { low: number; high: number };
  source: string | null;
  fetchedAt: Date;
  landedCost: {
    floorNgn: number;
    ceilingNgn: number;
    steps: Array<{
      step: number;
      name: string;
      valueLow: number;
      valueHigh: number;
      formula: string;
    }>;
  };
}

export interface TrimPricingResult {
  vehicle: GvoPath & { trimId: string };
  cohorts: CohortResult[];
  jsonLd: Record<string, unknown>[];
  freshness: { ok: boolean; staleFields: string[] };
}

export async function getTrimPricingData(
  domain: string,
  make: string,
  model: string,
  trim: string,
  year?: string,
): Promise<TrimPricingResult | { error: string; status: number }> {
  const gvoPath = await resolveTrimBySlugs({ domain, make, model, trim });
  if (!gvoPath) {
    return { error: "Vehicle not found in GVO", status: 404 };
  }

  const freshness = await checkDataFreshness(PRICING_RATE_KEYS);
  if (!freshness.ok) {
    return { error: "Live market data temporarily unavailable", status: 503 };
  }

  const whereConditions = [eq(cohortPricing.trimId, gvoPath.trimId)];
  if (year) {
    whereConditions.push(eq(cohortPricing.modelYear, parseInt(year, 10)));
  }

  const cohorts = await db
    .select()
    .from(cohortPricing)
    .where(and(...whereConditions))
    .orderBy(cohortPricing.modelYear);

  if (cohorts.length === 0) {
    return { error: "No pricing data available for this cohort", status: 404 };
  }

  const [ncsRate, dutyRate, nacRate, vatRate, surchargeRate, cissRate, etlsRate, insuranceRate] =
    await Promise.all([
      getNcsRate(),
      getImportDutyRate(),
      getNacLevyRate(),
      getVatRate(),
      getSurchargeRate(),
      getCissRate(),
      getEtlsRate(),
      getInsuranceRate(),
    ]);

  const results = await Promise.all(
    cohorts.map(async (cohort) => {
      const input = await buildLandedCostInput({
        fobLowUsd: parseFloat(cohort.fobLowUsd),
        fobHighUsd: parseFloat(cohort.fobHighUsd),
        ncsRateNgn: ncsRate,
        importDutyRate: dutyRate,
        nacLevyRate: nacRate,
        vatRate,
        surchargeRate,
        cissRate,
        etlsRate,
        insuranceRate,
      });

      const result = calculateLandedCost(input, freshness);

      return {
        modelYear: cohort.modelYear,
        fobRange: {
          low: parseFloat(cohort.fobLowUsd),
          high: parseFloat(cohort.fobHighUsd),
        },
        source: cohort.source,
        fetchedAt: cohort.fetchedAt,
        landedCost: {
          floorNgn: result.floorNgn,
          ceilingNgn: result.ceilingNgn,
          steps: result.steps,
        },
      };
    }),
  );

  const primary = results[0];
  const jsonLd = generatePricingJsonLd({
    cohort: {
      domain: gvoPath.domain.name,
      make: gvoPath.make.name,
      model: gvoPath.model.name,
      trim: gvoPath.trim.name,
      modelYear: primary.modelYear,
    },
    result: {
      steps: primary.landedCost.steps,
      floorNgn: primary.landedCost.floorNgn,
      ceilingNgn: primary.landedCost.ceilingNgn,
      dataFreshnessOk: freshness.ok,
      staleFields: freshness.staleFields,
    },
    effectiveTimestamp: new Date(),
  });

  return {
    vehicle: gvoPath,
    cohorts: results,
    jsonLd,
    freshness,
  };
}
