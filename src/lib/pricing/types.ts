export type VehicleDomain = "car" | "motorcycle" | "tricycle" | "commercial";

export interface LandedCostInput {
  /** Cohort macro wholesale FOB range (USD) */
  fobLowUsd: number;
  fobHighUsd: number;
  /** Freight range (USD) — typical $800–$2,500 */
  freightLowUsd: number;
  freightHighUsd: number;
  /** Insurance as fraction of FOB — typically 0.0075 */
  insuranceRate: number;
  /** Live NCS customs exchange rate (NGN per USD) */
  ncsRateNgn: number;
  /** Import duty rate — 0.20 for standard passenger cars */
  importDutyRate: number;
  /** NAC levy rate — 0.05 for used vehicles (corrected May 2026) */
  nacLevyRate: number;
  /** Surcharge rate — 0.07 of Import Duty (NOT of CIF) */
  surchargeRate: number;
  /** CISS rate — 0.01 of FOB in Naira */
  cissRate: number;
  /** ETLS rate — 0.005 of CIF */
  etlsRate: number;
  /** VAT rate — 0.075 */
  vatRate: number;
  /** Non-statutory cost ranges (NGN) */
  portThcLowNgn: number;
  portThcHighNgn: number;
  clearingAgentLowNgn: number;
  clearingAgentHighNgn: number;
  shippingReleaseLowNgn: number;
  shippingReleaseHighNgn: number;
  documentationLowNgn: number;
  documentationHighNgn: number;
}

export interface LandedCostStep {
  step: number;
  name: string;
  valueLow: number;
  valueHigh: number;
  formula: string;
}

export interface LandedCostResult {
  steps: LandedCostStep[];
  floorNgn: number;
  ceilingNgn: number;
  dataFreshnessOk: boolean;
  staleFields: string[];
}

export interface CohortKey {
  domain: string;
  make: string;
  model: string;
  trim: string;
  modelYear: number;
}

export interface PricingPageData {
  cohort: CohortKey;
  result: LandedCostResult;
  effectiveTimestamp: Date;
}
