import { db } from "../db";
import { systemConfig } from "../db/schema";

const STALENESS_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

interface ConfigResult {
  value: string;
  effectiveTimestamp: Date;
  source: string | null;
}

interface FreshCheck {
  ok: boolean;
  staleFields: string[];
}

const CACHE = new Map<string, ConfigResult>();
let lastCachePopulate = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function populateCache(): Promise<void> {
  const rows = await db
    .select({
      key: systemConfig.key,
      value: systemConfig.value,
      effectiveTimestamp: systemConfig.effectiveTimestamp,
      source: systemConfig.source,
    })
    .from(systemConfig);

  CACHE.clear();
  for (const row of rows) {
    CACHE.set(row.key, {
      value: row.value,
      effectiveTimestamp: row.effectiveTimestamp,
      source: row.source,
    });
  }
  lastCachePopulate = Date.now();
}

async function getConfig(key: string): Promise<ConfigResult | null> {
  if (Date.now() - lastCachePopulate > CACHE_TTL_MS) {
    await populateCache();
  }
  return CACHE.get(key) ?? null;
}

export async function getRequiredConfig(key: string): Promise<ConfigResult> {
  const val = await getConfig(key);
  if (!val) {
    throw new Error(`Missing required system config: ${key}`);
  }
  return val;
}

export async function checkDataFreshness(
  keys: string[],
): Promise<FreshCheck> {
  const staleFields: string[] = [];

  for (const key of keys) {
    const config = await getConfig(key);
    if (!config) {
      staleFields.push(key);
      continue;
    }
    const age = Date.now() - config.effectiveTimestamp.getTime();
    if (age > STALENESS_THRESHOLD_MS) {
      staleFields.push(key);
    }
  }

  return { ok: staleFields.length === 0, staleFields };
}

export async function getNcsRate(): Promise<number> {
  const config = await getRequiredConfig("ncs_customs_rate");
  return parseFloat(config.value);
}

export async function getVatRate(): Promise<number> {
  const config = await getRequiredConfig("vat_rate");
  return parseFloat(config.value);
}

export async function getImportDutyRate(): Promise<number> {
  const config = await getRequiredConfig("import_duty_rate");
  return parseFloat(config.value);
}

export async function getNacLevyRate(): Promise<number> {
  const config = await getRequiredConfig("nac_levy_rate");
  return parseFloat(config.value);
}

export async function getExchangeRate(): Promise<number> {
  const config = await getRequiredConfig("exchange_rate_usd_ngn");
  return parseFloat(config.value);
}

export async function getSurchargeRate(): Promise<number> {
  const config = await getRequiredConfig("surcharge_rate");
  return parseFloat(config.value);
}

export async function getCissRate(): Promise<number> {
  const config = await getRequiredConfig("ciss_rate");
  return parseFloat(config.value);
}

export async function getEtlsRate(): Promise<number> {
  const config = await getRequiredConfig("etls_rate");
  return parseFloat(config.value);
}

export async function getInsuranceRate(): Promise<number> {
  const config = await getRequiredConfig("insurance_rate");
  return parseFloat(config.value);
}

/** All statutory rate keys that must be fresh for pricing to run. */
export const PRICING_RATE_KEYS = [
  "ncs_customs_rate",
  "import_duty_rate",
  "nac_levy_rate",
  "vat_rate",
  "surcharge_rate",
  "ciss_rate",
  "etls_rate",
  "insurance_rate",
];
