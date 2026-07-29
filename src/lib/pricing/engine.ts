import type {
  LandedCostInput,
  LandedCostResult,
  LandedCostStep,
} from "./types";

/**
 * The 13-Step Landed-Cost Formula.
 *
 * Order of operations is statutory law.
 * Every constant must come from System_Config — never hardcoded.
 */
export function calculateLandedCost(
  input: LandedCostInput,
  freshness?: { ok: boolean; staleFields: string[] },
): LandedCostResult {
  // Constitution §II.2: "If the data is older than the defined freshness
  // threshold, the engine halts." Silence is structurally safer than a lie.
  if (freshness && !freshness.ok) {
    return {
      steps: [],
      floorNgn: 0,
      ceilingNgn: 0,
      dataFreshnessOk: false,
      staleFields: freshness.staleFields,
    };
  }

  const steps: LandedCostStep[] = [];

  // Step 1: FOB — already provided as cohort range
  steps.push({
    step: 1,
    name: "FOB (Free on Board)",
    valueLow: input.fobLowUsd,
    valueHigh: input.fobHighUsd,
    formula: "Cohort macro wholesale low/high (USD)",
  });

  // Step 2: CIF = FOB + Freight + Insurance
  const insuranceLow = input.fobLowUsd * input.insuranceRate;
  const insuranceHigh = input.fobHighUsd * input.insuranceRate;
  const cifLowUsd =
    input.fobLowUsd + input.freightLowUsd + insuranceLow;
  const cifHighUsd =
    input.fobHighUsd + input.freightHighUsd + insuranceHigh;

  steps.push({
    step: 2,
    name: "CIF (Cost, Insurance, Freight)",
    valueLow: round(cifLowUsd),
    valueHigh: round(cifHighUsd),
    formula: `FOB + Freight($${input.freightLowUsd}–$${input.freightHighUsd}) + Insurance(${input.insuranceRate * 100}% × FOB)`,
  });

  // Step 3: Naira Conversion (LIVE NCS customs rate)
  const cifLowNgn = cifLowUsd * input.ncsRateNgn;
  const cifHighNgn = cifHighUsd * input.ncsRateNgn;

  steps.push({
    step: 3,
    name: "Naira Conversion (CIF × NCS Rate)",
    valueLow: round(cifLowNgn),
    valueHigh: round(cifHighNgn),
    formula: `CIF(USD) × NCS Rate (₦${input.ncsRateNgn}/$)`,
  });

  // Step 4: Import Duty = 20% × CIF (Naira)
  const dutyLow = cifLowNgn * input.importDutyRate;
  const dutyHigh = cifHighNgn * input.importDutyRate;

  steps.push({
    step: 4,
    name: "Import Duty",
    valueLow: round(dutyLow),
    valueHigh: round(dutyHigh),
    formula: `${input.importDutyRate * 100}% × CIF (₦)`,
  });

  // Step 5: NAC Levy = 5% × CIF (Naira) — corrected May 2026
  const nacLow = cifLowNgn * input.nacLevyRate;
  const nacHigh = cifHighNgn * input.nacLevyRate;

  steps.push({
    step: 5,
    name: "NAC Levy",
    valueLow: round(nacLow),
    valueHigh: round(nacHigh),
    formula: `${input.nacLevyRate * 100}% × CIF (₦)`,
  });

  // Step 6: Surcharge = 7% × Import Duty (NOT CIF)
  const surchargeLow = dutyLow * input.surchargeRate;
  const surchargeHigh = dutyHigh * input.surchargeRate;

  steps.push({
    step: 6,
    name: "Surcharge",
    valueLow: round(surchargeLow),
    valueHigh: round(surchargeHigh),
    formula: `${input.surchargeRate * 100}% × Import Duty (NOT CIF)`,
  });

  // Step 7: CISS = 1% × FOB in Naira
  const fobLowNgn = input.fobLowUsd * input.ncsRateNgn;
  const fobHighNgn = input.fobHighUsd * input.ncsRateNgn;
  const cissLow = fobLowNgn * input.cissRate;
  const cissHigh = fobHighNgn * input.cissRate;

  steps.push({
    step: 7,
    name: "CISS / FCS",
    valueLow: round(cissLow),
    valueHigh: round(cissHigh),
    formula: `${input.cissRate * 100}% × FOB (₦)`,
  });

  // Step 8: ETLS = 0.5% × CIF (Naira)
  const etlsLow = cifLowNgn * input.etlsRate;
  const etlsHigh = cifHighNgn * input.etlsRate;

  steps.push({
    step: 8,
    name: "ETLS",
    valueLow: round(etlsLow),
    valueHigh: round(etlsHigh),
    formula: `${input.etlsRate * 100}% × CIF (₦)`,
  });

  // Step 9: VAT Base = CIF + Duty + NAC + Surcharge + CISS + ETLS
  const vatBaseLow = cifLowNgn + dutyLow + nacLow + surchargeLow + cissLow + etlsLow;
  const vatBaseHigh = cifHighNgn + dutyHigh + nacHigh + surchargeHigh + cissHigh + etlsHigh;

  steps.push({
    step: 9,
    name: "VAT Base",
    valueLow: round(vatBaseLow),
    valueHigh: round(vatBaseHigh),
    formula: "CIF + Import Duty + NAC + Surcharge + CISS + ETLS",
  });

  // Step 10: VAT = 7.5% × VAT Base
  const vatLow = vatBaseLow * input.vatRate;
  const vatHigh = vatBaseHigh * input.vatRate;

  steps.push({
    step: 10,
    name: "VAT",
    valueLow: round(vatLow),
    valueHigh: round(vatHigh),
    formula: `${input.vatRate * 100}% × VAT Base`,
  });

  // Step 11: Total Statutory Charges = Steps 4–10
  const statutoryLow = dutyLow + nacLow + surchargeLow + cissLow + etlsLow + vatLow;
  const statutoryHigh = dutyHigh + nacHigh + surchargeHigh + cissHigh + etlsHigh + vatHigh;

  steps.push({
    step: 11,
    name: "Total Statutory Charges",
    valueLow: round(statutoryLow),
    valueHigh: round(statutoryHigh),
    formula: "Sum of Steps 4–10",
  });

  // Step 12: Non-Statutory Real-World Additions
  const nonStatutoryLow =
    input.portThcLowNgn +
    input.clearingAgentLowNgn +
    input.shippingReleaseLowNgn +
    input.documentationLowNgn;
  const nonStatutoryHigh =
    input.portThcHighNgn +
    input.clearingAgentHighNgn +
    input.shippingReleaseHighNgn +
    input.documentationHighNgn;

  steps.push({
    step: 12,
    name: "Non-Statutory Costs",
    valueLow: round(nonStatutoryLow),
    valueHigh: round(nonStatutoryHigh),
    formula: "Port THC + Clearing Agent + Shipping Release + Documentation",
  });

  // Step 13: Final Landed-Cost Range
  const floorNgn = round(cifLowNgn + statutoryLow + nonStatutoryLow);
  const ceilingNgn = round(cifHighNgn + statutoryHigh + nonStatutoryHigh);

  steps.push({
    step: 13,
    name: "Landed Cost",
    valueLow: floorNgn,
    valueHigh: ceilingNgn,
    formula: "CIF(₦) + Total Statutory + Non-Statutory",
  });

  return {
    steps,
    floorNgn,
    ceilingNgn,
    dataFreshnessOk: true,
    staleFields: [],
  };
}

/**
 * Build a LandedCostInput from System_Config values.
 * ALL statutory/FX constants pulled live from caller — never hardcoded.
 */
export async function buildLandedCostInput(params: {
  fobLowUsd: number;
  fobHighUsd: number;
  ncsRateNgn: number;
  importDutyRate: number;
  nacLevyRate: number;
  vatRate: number;
  surchargeRate: number;
  cissRate: number;
  etlsRate: number;
  insuranceRate: number;
}): Promise<LandedCostInput> {
  return {
    fobLowUsd: params.fobLowUsd,
    fobHighUsd: params.fobHighUsd,
    freightLowUsd: 800,
    freightHighUsd: 2500,
    insuranceRate: params.insuranceRate,
    ncsRateNgn: params.ncsRateNgn,
    importDutyRate: params.importDutyRate,
    nacLevyRate: params.nacLevyRate,
    surchargeRate: params.surchargeRate,
    cissRate: params.cissRate,
    etlsRate: params.etlsRate,
    vatRate: params.vatRate,
    portThcLowNgn: 150_000,
    portThcHighNgn: 250_000,
    clearingAgentLowNgn: 100_000,
    clearingAgentHighNgn: 300_000,
    shippingReleaseLowNgn: 80_000,
    shippingReleaseHighNgn: 150_000,
    documentationLowNgn: 20_000,
    documentationHighNgn: 50_000,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
