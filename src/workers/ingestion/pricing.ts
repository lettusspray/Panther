/**
 * Pricing Ingestion Worker
 *
 * Fetches wholesale market values for each GVO trim cohort from auto.dev
 * listings API, plus FX and NCS customs rates. Updates cohort_pricing +
 * system_config.
 *
 * auto.dev listings endpoint supports make/model/year search:
 *   GET /listings?vehicle.make=Toyota&vehicle.model=Camry&vehicle.year=2015
 * Returns retail and wholesale prices. We aggregate min/max retail per
 * cohort as the FOB range.
 *
 * FX source: Open Exchange Rate API (open.er.com) — free tier, no key
 * required for basic USD→NGN.
 *
 * NCS customs rate: scraped via ScraperAPI (JS-rendered NCS site).
 *
 * Constitution compliance:
 *   - No VIN-level pricing — cohort-level macro pricing only (§III.2)
 *   - No hardcoded constants — rates stored in system_config (§II.2)
 *   - Managed APIs only — no custom scrapers (§X.2)
 *   - Stale-data kill switch: effectiveTimestamp set on all updates (§II.2)
 */

import { db } from "../../lib/db";
import { cohortPricing, systemConfig, gvoTrim, gvoModel, gvoMake } from "../../lib/db/schema";
import { eq, and } from "drizzle-orm";
import { fetchNcsRate } from "../../lib/scraper";
import { readEnv } from "../../lib/env";

// ── Types ───────────────────────────────────────────────────────────

interface AutoDevListing {
  vehicle?: { vin?: string; year?: number; make?: string; model?: string };
  retailListing?: { price?: number };
  wholesaleListing?: { price?: number };
}

interface AutoDevListingsResponse {
  data?: AutoDevListing[];
}

// Open Access FX response: https://open.er-api.com/v6/latest/USD
interface OpenAccessFxResponse {
  result: string;
  base_code: string;
  rates: Record<string, number>;
  time_last_update_unix: number;
  time_next_update_unix: number;
  time_eol_unix: number;
}

// ── Config Keys ─────────────────────────────────────────────────────

const STATUTORY_RATES: { key: string; value: string; source: string }[] = [
  { key: "import_duty_rate", value: "0.20", source: "statutory" },
  { key: "nac_levy_rate", value: "0.05", source: "statutory" },
  { key: "vat_rate", value: "0.075", source: "statutory" },
  { key: "surcharge_rate", value: "0.07", source: "statutory" },
  { key: "ciss_rate", value: "0.01", source: "statutory" },
  { key: "etls_rate", value: "0.005", source: "statutory" },
  { key: "insurance_rate", value: "0.0075", source: "statutory" },
];

// ── auto.dev Listings Fetcher ───────────────────────────────────────
const AUTO_DEV_BASE = readEnv("AUTO_DEV_API_URL") ?? "https://api.auto.dev";

/**
 * Fetch active listings for a make/model/year from auto.dev.
 * Returns aggregated FOB range (min/max retail price) or null.
 *
 * auto.dev Growth plan: 100 results per page. We fetch 1 page (100 listings)
 * per cohort — sufficient for min/max aggregation.
 */
async function fetchAutoDevListings(
  makeName: string,
  modelName: string,
  year: number,
): Promise<{ fobLow: number; fobHigh: number } | null> {
  const apiKey = readEnv("AUTO_DEV_API_KEY");
  if (!apiKey) return null;

  const params = new URLSearchParams({
    "vehicle.make": makeName,
    "vehicle.model": modelName,
    "vehicle.year": String(year),
    select: "retailListing.price,wholesaleListing.price",
    limit: "100",
  });

  const url = `${AUTO_DEV_BASE}/listings?${params.toString()}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) return null;

  const body = await res.json() as AutoDevListingsResponse;
  const listings = body.data;
  if (!listings || listings.length === 0) return null;

  // Collect all prices (prefer wholesale, fallback to retail)
  const prices: number[] = [];
  for (const listing of listings) {
    const wholesale = listing.wholesaleListing?.price;
    const retail = listing.retailListing?.price;

    if (typeof wholesale === "number" && wholesale > 0) {
      prices.push(wholesale);
    } else if (typeof retail === "number" && retail > 0) {
      prices.push(retail);
    }
  }

  if (prices.length === 0) return null;

  // FOB range: min and max of available prices
  const sorted = prices.sort((a, b) => a - b);
  // Trim outliers: use 10th and 90th percentile for robust range
  const p10 = sorted[Math.floor(sorted.length * 0.1)] ?? sorted[0];
  const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? sorted[sorted.length - 1];

  return { fobLow: p10, fobHigh: p90 };
}

// ── FX Rate Fetcher (Open Access, no API key) ────────────────────────

async function fetchFxRates(): Promise<{ ngnRate: number; lastUpdated: Date } | null> {
  const url = "https://open.er-api.com/v6/latest/USD";
  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json() as OpenAccessFxResponse;
  if (data.result !== "success" || !data.rates?.NGN) return null;

  return {
    ngnRate: data.rates.NGN,
    lastUpdated: new Date(data.time_last_update_unix * 1000),
  };
}

// ── System Config Upsert ────────────────────────────────────────────

async function upsertSystemConfig(key: string, value: string, source: string): Promise<void> {
  const existing = await db.select().from(systemConfig).where(eq(systemConfig.key, key));
  if (existing.length > 0) {
    await db.update(systemConfig)
      .set({ value, effectiveTimestamp: new Date(), source })
      .where(eq(systemConfig.key, key));
  } else {
    await db.insert(systemConfig).values({
      key, value, effectiveTimestamp: new Date(), source,
    });
  }
}

// ── Cohort Pricing Upsert ───────────────────────────────────────────

async function upsertCohortPricing(
  trimId: string,
  modelYear: number,
  fobLowUsd: number,
  fobHighUsd: number,
  source: string,
): Promise<void> {
  const existing = await db
    .select()
    .from(cohortPricing)
    .where(
      and(
        eq(cohortPricing.trimId, trimId),
        eq(cohortPricing.modelYear, modelYear),
      ),
    );

  if (existing.length > 0) {
    await db.update(cohortPricing)
      .set({
        fobLowUsd: String(fobLowUsd),
        fobHighUsd: String(fobHighUsd),
        source,
        fetchedAt: new Date(),
      })
      .where(
        and(
          eq(cohortPricing.trimId, trimId),
          eq(cohortPricing.modelYear, modelYear),
        ),
      );
  } else {
    await db.insert(cohortPricing).values({
      trimId,
      modelYear,
      fobLowUsd: String(fobLowUsd),
      fobHighUsd: String(fobHighUsd),
      source,
      fetchedAt: new Date(),
    });
  }
}

// ── Main Ingestion ──────────────────────────────────────────────────

export interface PricingResult {
  cohortsUpdated: number;
  fxUpdated: boolean;
  statutoryUpdated: boolean;
  errors: string[];
}

export async function ingestPricing(): Promise<PricingResult> {
  const result: PricingResult = {
    cohortsUpdated: 0,
    fxUpdated: false,
    statutoryUpdated: false,
    errors: [],
  };

  // 1. Update statutory rates (these rarely change)
  for (const rate of STATUTORY_RATES) {
    try {
      await upsertSystemConfig(rate.key, rate.value, rate.source);
      result.statutoryUpdated = true;
    } catch (err) {
      result.errors.push(`Statutory ${rate.key}: ${(err as Error).message}`);
    }
  }

  // 2. Update FX rates (Open Access)
  try {
    const fxResult = await fetchFxRates();
    if (fxResult) {
      await upsertSystemConfig("exchange_rate_usd_ngn", String(fxResult.ngnRate), "open.er-api.com");
      result.fxUpdated = true;
    }
  } catch (err) {
    result.errors.push(`FX rate fetch failed: ${(err as Error).message}`);
  }

  // 3. Fetch NCS customs rate via ScraperAPI
  try {
    const ncsResult = await fetchNcsRate();
    if (ncsResult) {
      await upsertSystemConfig("ncs_customs_rate", String(ncsResult.usdSelling), ncsResult.source);
      result.fxUpdated = true;
    }
  } catch (err) {
    result.errors.push(`NCS customs rate fetch failed: ${(err as Error).message}`);
  }

  // 4. Fetch cohort pricing from auto.dev listings
  try {
    // Join trim → model → make to get make+model names for each trim cohort
    const trims = await db
      .select({
        trimId: gvoTrim.id,
        modelName: gvoModel.name,
        makeName: gvoMake.name,
      })
      .from(gvoTrim)
      .innerJoin(gvoModel, eq(gvoTrim.modelId, gvoModel.id))
      .innerJoin(gvoMake, eq(gvoModel.makeId, gvoMake.id));

    // Deduplicate by make+model (multiple trims share pricing)
    const makeModelMap = new Map<string, { make: string; model: string; trimIds: string[] }>();

    for (const trim of trims) {
      const key = `${trim.makeName}:${trim.modelName}`;
      if (!makeModelMap.has(key)) {
        makeModelMap.set(key, {
          make: trim.makeName,
          model: trim.modelName,
          trimIds: [],
        });
      }
      makeModelMap.get(key)!.trimIds.push(trim.trimId);
    }

    // Fetch pricing for each unique make+model across active years
    // Nigerian used car market: primarily 2010-2025 models
    const FIRST_YEAR = 2010;
    const LAST_YEAR = new Date().getFullYear();

    for (const [, data] of makeModelMap) {
      for (let year = FIRST_YEAR; year <= LAST_YEAR; year++) {
        try {
          const pricing = await fetchAutoDevListings(data.make, data.model, year);
          if (!pricing) continue;

          // Apply FOB range to all trims of this make+model
          for (const trimId of data.trimIds) {
            await upsertCohortPricing(
              trimId,
              year,
              pricing.fobLow,
              pricing.fobHigh,
              "auto.dev",
            );
            result.cohortsUpdated++;
          }
        } catch (err) {
          result.errors.push(`${data.make} ${data.model} ${year}: ${(err as Error).message}`);
        }
      }
    }
  } catch (err) {
    result.errors.push(`Cohort pricing fetch failed: ${(err as Error).message}`);
  }

  return result;
}
