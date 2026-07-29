export interface NigerianState {
  name: string;
  slug: string;
  petrolPricePerLitreNgn: number;
  dieselPricePerLitreNgn: number;
}

export type FuelType = "petrol" | "diesel" | "ev";

export interface TcoInput {
  state: string;
  annualMileageKm: number;
  fuelConsumptionLitresPer100km: number;
  landedCostNgn: number;
  makeName?: string;
  fuelType?: FuelType;
  transmissionType?: "automatic" | "manual";
}

export interface TcoResult {
  annualFuelCostNgn: number;
  estimatedAnnualMaintenanceNgn: number;
  estimatedAnnualInsuranceNgn: number;
  annualRoadTaxNgn: number;
  totalAnnualRunningCostNgn: number;
  breakdown: {
    fuelLabel: string;
    maintenanceRate: string;
    insuranceRate: string;
    roadTaxLabel: string;
  };
  disclaimer: string;
}

export const NIGERIAN_STATES: NigerianState[] = [
  { name: "Abia", slug: "abia", petrolPricePerLitreNgn: 670, dieselPricePerLitreNgn: 1200 },
  { name: "Adamawa", slug: "adamawa", petrolPricePerLitreNgn: 690, dieselPricePerLitreNgn: 1250 },
  { name: "Akwa Ibom", slug: "akwa-ibom", petrolPricePerLitreNgn: 650, dieselPricePerLitreNgn: 1180 },
  { name: "Anambra", slug: "anambra", petrolPricePerLitreNgn: 680, dieselPricePerLitreNgn: 1220 },
  { name: "Bauchi", slug: "bauchi", petrolPricePerLitreNgn: 700, dieselPricePerLitreNgn: 1280 },
  { name: "Bayelsa", slug: "bayelsa", petrolPricePerLitreNgn: 640, dieselPricePerLitreNgn: 1150 },
  { name: "Benue", slug: "benue", petrolPricePerLitreNgn: 690, dieselPricePerLitreNgn: 1240 },
  { name: "Borno", slug: "borno", petrolPricePerLitreNgn: 720, dieselPricePerLitreNgn: 1300 },
  { name: "Cross River", slug: "cross-river", petrolPricePerLitreNgn: 660, dieselPricePerLitreNgn: 1200 },
  { name: "Delta", slug: "delta", petrolPricePerLitreNgn: 650, dieselPricePerLitreNgn: 1160 },
  { name: "Ebonyi", slug: "ebonyi", petrolPricePerLitreNgn: 680, dieselPricePerLitreNgn: 1230 },
  { name: "Edo", slug: "edo", petrolPricePerLitreNgn: 670, dieselPricePerLitreNgn: 1210 },
  { name: "Ekiti", slug: "ekiti", petrolPricePerLitreNgn: 680, dieselPricePerLitreNgn: 1220 },
  { name: "Enugu", slug: "enugu", petrolPricePerLitreNgn: 670, dieselPricePerLitreNgn: 1200 },
  { name: "FCT (Abuja)", slug: "fct", petrolPricePerLitreNgn: 660, dieselPricePerLitreNgn: 1190 },
  { name: "Gombe", slug: "gombe", petrolPricePerLitreNgn: 700, dieselPricePerLitreNgn: 1260 },
  { name: "Imo", slug: "imo", petrolPricePerLitreNgn: 680, dieselPricePerLitreNgn: 1220 },
  { name: "Jigawa", slug: "jigawa", petrolPricePerLitreNgn: 710, dieselPricePerLitreNgn: 1280 },
  { name: "Kaduna", slug: "kaduna", petrolPricePerLitreNgn: 690, dieselPricePerLitreNgn: 1250 },
  { name: "Kano", slug: "kano", petrolPricePerLitreNgn: 700, dieselPricePerLitreNgn: 1270 },
  { name: "Katsina", slug: "katsina", petrolPricePerLitreNgn: 710, dieselPricePerLitreNgn: 1280 },
  { name: "Kebbi", slug: "kebbi", petrolPricePerLitreNgn: 710, dieselPricePerLitreNgn: 1290 },
  { name: "Kogi", slug: "kogi", petrolPricePerLitreNgn: 680, dieselPricePerLitreNgn: 1230 },
  { name: "Kwara", slug: "kwara", petrolPricePerLitreNgn: 680, dieselPricePerLitreNgn: 1220 },
  { name: "Lagos", slug: "lagos", petrolPricePerLitreNgn: 640, dieselPricePerLitreNgn: 1150 },
  { name: "Nasarawa", slug: "nasarawa", petrolPricePerLitreNgn: 690, dieselPricePerLitreNgn: 1240 },
  { name: "Niger", slug: "niger", petrolPricePerLitreNgn: 690, dieselPricePerLitreNgn: 1250 },
  { name: "Ogun", slug: "ogun", petrolPricePerLitreNgn: 660, dieselPricePerLitreNgn: 1180 },
  { name: "Ondo", slug: "ondo", petrolPricePerLitreNgn: 670, dieselPricePerLitreNgn: 1210 },
  { name: "Osun", slug: "osun", petrolPricePerLitreNgn: 670, dieselPricePerLitreNgn: 1200 },
  { name: "Oyo", slug: "oyo", petrolPricePerLitreNgn: 670, dieselPricePerLitreNgn: 1200 },
  { name: "Plateau", slug: "plateau", petrolPricePerLitreNgn: 690, dieselPricePerLitreNgn: 1240 },
  { name: "Rivers", slug: "rivers", petrolPricePerLitreNgn: 640, dieselPricePerLitreNgn: 1150 },
  { name: "Sokoto", slug: "sokoto", petrolPricePerLitreNgn: 720, dieselPricePerLitreNgn: 1300 },
  { name: "Taraba", slug: "taraba", petrolPricePerLitreNgn: 710, dieselPricePerLitreNgn: 1290 },
  { name: "Yobe", slug: "yobe", petrolPricePerLitreNgn: 720, dieselPricePerLitreNgn: 1300 },
  { name: "Zamfara", slug: "zamfara", petrolPricePerLitreNgn: 720, dieselPricePerLitreNgn: 1310 },
];

export function getStateBySlug(slug: string): NigerianState | undefined {
  return NIGERIAN_STATES.find((s) => s.slug === slug);
}

// Maintenance factor by make group
const MAINTENANCE_RATES: Record<string, number> = {
  toyota: 0.025,
  lexus: 0.030,
  honda: 0.025,
  nissan: 0.028,
  mitsubishi: 0.028,
  mazda: 0.030,
  ford: 0.032,
  chevrolet: 0.032,
  mercedes: 0.040,
  bmw: 0.045,
  audi: 0.045,
  volkswagen: 0.035,
  peugeot: 0.030,
  renault: 0.028,
  hyundai: 0.025,
  kia: 0.025,
  suzuki: 0.022,
  bajaj: 0.015,
  tvw: 0.015,
  man: 0.035,
};

// Insurance brackets by landed cost value (NGN)
const INSURANCE_BRACKETS: Array<{ min: number; max: number; rate: number }> = [
  { min: 0, max: 2_000_000, rate: 0.035 },
  { min: 2_000_001, max: 5_000_000, rate: 0.030 },
  { min: 5_000_001, max: 10_000_000, rate: 0.025 },
  { min: 10_000_001, max: 20_000_000, rate: 0.022 },
  { min: 20_000_001, max: Infinity, rate: 0.020 },
];

// Transmission consumption factor (auto uses ~10% more fuel)
const TRANSMISSION_FACTOR: Record<string, number> = {
  automatic: 1.10,
  manual: 1.00,
};

const EV_EFFICIENCY_KWH_PER_100KM = 18; // avg EV consumption in kWh/100km
const EV_CHARGING_COST_PER_KWH = 120; // avg NGN/kWh for public charging

export function calculateTco(input: TcoInput): TcoResult {
  const state = getStateBySlug(input.state);

  const fuelType = input.fuelType ?? "petrol";
  const transmissionType = input.transmissionType ?? "manual";
  const transmissionFactor = TRANSMISSION_FACTOR[transmissionType] ?? 1.0;

  let annualFuelCostNgn: number;
  let fuelLabel: string;

  if (fuelType === "ev") {
    const annualKwh = (input.annualMileageKm / 100) * EV_EFFICIENCY_KWH_PER_100KM;
    annualFuelCostNgn = Math.round(annualKwh * EV_CHARGING_COST_PER_KWH);
    fuelLabel = `Electricity (${EV_CHARGING_COST_PER_KWH} ₦/kWh)`;
  } else {
    const pricePerLitre = fuelType === "diesel"
      ? state?.dieselPricePerLitreNgn ?? 1200
      : state?.petrolPricePerLitreNgn ?? 670;
    const baseConsumption = input.fuelConsumptionLitresPer100km * transmissionFactor;
    annualFuelCostNgn = Math.round(
      (input.annualMileageKm / 100) * baseConsumption * pricePerLitre
    );
    fuelLabel = fuelType === "diesel"
      ? `Diesel at ${pricePerLitre} ₦/L (${input.fuelConsumptionLitresPer100km} L/100km × ${transmissionType})`
      : `Petrol at ${pricePerLitre} ₦/L (${input.fuelConsumptionLitresPer100km} L/100km × ${transmissionType})`;
  }

  // Maintenance rate by make
  const makeKey = (input.makeName ?? "").toLowerCase().split(" ")[0];
  const maintenanceRate = Object.entries(MAINTENANCE_RATES).find(([key]) =>
    makeKey.includes(key) || key.includes(makeKey)
  )?.[1] ?? 0.030;
  const estimatedAnnualMaintenanceNgn = Math.round(input.landedCostNgn * maintenanceRate);

  // Insurance by value bracket
  const bracket = INSURANCE_BRACKETS.find(
    (b) => input.landedCostNgn >= b.min && input.landedCostNgn <= b.max
  ) ?? INSURANCE_BRACKETS[0];
  const estimatedAnnualInsuranceNgn = Math.round(input.landedCostNgn * bracket.rate);

  // Road tax (annual vehicle license + road worthiness)
  const annualRoadTaxNgn = input.landedCostNgn > 5_000_000 ? 25000 : 15000;

  return {
    annualFuelCostNgn,
    estimatedAnnualMaintenanceNgn,
    estimatedAnnualInsuranceNgn,
    annualRoadTaxNgn,
    totalAnnualRunningCostNgn: Math.round(
      annualFuelCostNgn + estimatedAnnualMaintenanceNgn + estimatedAnnualInsuranceNgn + annualRoadTaxNgn
    ),
    breakdown: {
      fuelLabel,
      maintenanceRate: `${(maintenanceRate * 100).toFixed(1)}% of landed cost`,
      insuranceRate: `${(bracket.rate * 100).toFixed(1)}% of landed cost (₦${input.landedCostNgn.toLocaleString()} bracket)`,
      roadTaxLabel: "Annual vehicle license + road worthiness",
    },
    disclaimer:
      "Fuel prices are estimates based on average state-level data and may vary. Maintenance rates are by make group. Insurance is bracket-based on vehicle value. Verify actual costs with local providers in your specific State/LGA.",
  };
}
