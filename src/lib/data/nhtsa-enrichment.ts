/**
 * NHTSA Enrichment — VIN Decode + Recalls
 *
 * Supplements the GVO with detailed vehicle specs from NHTSA vPIC
 * (VIN decoding) and safety recall data.
 *
 * NHTSA vPIC VIN decoder provides 60+ fields per VIN:
 *   BodyClass, DisplacementL, EngineCylinders, DriveType, FuelTypePrimary,
 *   Doors, TransmissionSpeeds, EngineHP, etc.
 *
 * NHTSA Recalls API provides safety recall history per Make/Model/Year.
 *
 * Constitution compliance:
 *   - Managed APIs only — no custom scrapers (§X.2)
 *   - GVO enrichment only — not a replacement for cascading selectors (§III.1)
 *   - No VIN-level pricing — enrichment data only (§III.2)
 */

import { db } from "../db";
import { gvoTrim, gvoModel, gvoMake } from "../db/schema";
import { eq } from "drizzle-orm";

// ── Types ───────────────────────────────────────────────────────────

export interface VinDecode {
  make: string;
  model: string;
  year: number;
  trim: string;
  bodyClass: string;
  displacementL: number | null;
  displacementCC: number | null;
  engineCylinders: number | null;
  engineConfig: string;
  engineHP: number | null;
  engineManufacturer: string;
  fuelTypePrimary: string;
  driveType: string;
  doors: number | null;
  transmissionSpeeds: number | null;
  transmissionType: string;
  valveTrainDesign: string;
  plantCountry: string;
  gvwrClass: string;
}

export interface RecallRecord {
  campaignNumber: string;
  manufacturer: string;
  component: string;
  summary: string;
  consequence: string;
  remedy: string;
  modelYear: number;
  make: string;
  model: string;
  parkIt: boolean;
  parkOutSide: boolean;
}

export interface NhtsaEnrichmentResult {
  vinsDecoded: number;
  recallsFetched: number;
  trimsEnriched: number;
  errors: string[];
}

// ── NHTSA vPIC VIN Decoder ──────────────────────────────────────────

const NHTSA_BASE = "https://vpic.nhtsa.dot.gov/api";

/**
 * Decode a single VIN via NHTSA vPIC.
 * Returns parsed vehicle data or null on failure.
 */
export async function decodeVin(vin: string): Promise<VinDecode | null> {
  const url = `${NHTSA_BASE}/vehicles/decodevinvalues/${vin}?format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json() as { Results: Record<string, string>[] };
  const r = data.Results?.[0];
  if (!r) return null;

  const parseNum = (v: string): number | null => {
    const n = parseFloat(v);
    return isNaN(n) || n === 0 || v === "Not Applicable" ? null : n;
  };

  return {
    make: r.Make ?? "",
    model: r.Model ?? "",
    year: parseInt(r.ModelYear ?? "0", 10) || 0,
    trim: r.Trim ?? "",
    bodyClass: r.BodyClass ?? "",
    displacementL: parseNum(r.DisplacementL),
    displacementCC: parseNum(r.DisplacementCC),
    engineCylinders: parseNum(r.EngineCylinders),
    engineConfig: r.EngineConfiguration ?? "",
    engineHP: parseNum(r.EngineHP),
    engineManufacturer: r.EngineManufacturer ?? "",
    fuelTypePrimary: r.FuelTypePrimary ?? "",
    driveType: r.DriveType ?? "",
    doors: parseNum(r.Doors),
    transmissionSpeeds: parseNum(r.TransmissionSpeeds),
    transmissionType: r.TransmissionType ?? "",
    valveTrainDesign: r.ValveTrainDesign ?? "",
    plantCountry: r.PlantCountry ?? "",
    gvwrClass: r.GVWRClass ?? "",
  };
}

// ── NHTSA Recalls API ───────────────────────────────────────────────

/**
 * Fetch safety recalls for a specific Make/Model/Year.
 * Returns array of recall records.
 */
export async function fetchRecalls(
  make: string,
  model: string,
  year: number,
): Promise<RecallRecord[]> {
  const url = `${NHTSA_BASE.replace("vpic", "api.nhtsa.gov")}/recalls/recallsByVehicle` +
    `?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${year}`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await res.json() as { results?: Record<string, unknown>[] };
  if (!data.results) return [];

  return data.results.map((r) => ({
    campaignNumber: (r.NHTSACampaignNumber as string) ?? "",
    manufacturer: (r.Manufacturer as string) ?? "",
    component: (r.Component as string) ?? "",
    summary: (r.Summary as string) ?? "",
    consequence: (r.Consequence as string) ?? "",
    remedy: (r.Remedy as string) ?? "",
    modelYear: (r.ModelYear as number) ?? year,
    make: (r.Make as string) ?? make,
    model: (r.Model as string) ?? model,
    parkIt: r.parkIt === true,
    parkOutSide: r.parkOutSide === true,
  }));
}

// ── GVO Enrichment via VIN Decode ───────────────────────────────────

/**
 * Enrich GVO trims with VIN-decoded specs.
 * Uses NHTSA vPIC to get detailed engine, body, and drivetrain data.
 *
 * This runs against a sample of known VINs to enrich trim-level data.
 * It does NOT store VINs — only extracts spec data.
 */
export async function enrichGvoWithVinDecode(
  sampleVins: string[],
): Promise<NhtsaEnrichmentResult> {
  const result: NhtsaEnrichmentResult = {
    vinsDecoded: 0,
    recallsFetched: 0,
    trimsEnriched: 0,
    errors: [],
  };

  // Build make lookup
  const makes = await db.select().from(gvoMake);
  const makeMap = new Map<string, string>();
  for (const make of makes) {
    makeMap.set(make.name.toLowerCase(), make.id);
  }

  for (const vin of sampleVins) {
    try {
      const decode = await decodeVin(vin);
      if (!decode || !decode.make || !decode.model) continue;
      result.vinsDecoded++;

      // Find matching GVO make
      const makeId = makeMap.get(decode.make.toLowerCase());
      if (!makeId) continue;

      // Find matching GVO model
      const models = await db
        .select()
        .from(gvoModel)
        .where(eq(gvoModel.makeId, makeId));

      const modelNameLower = decode.model.toLowerCase();
      const gvoModel_ = models.find(
        (m) => m.name.toLowerCase() === modelNameLower ||
               m.name.toLowerCase().includes(modelNameLower) ||
               modelNameLower.includes(m.name.toLowerCase()),
      );
      if (!gvoModel_) continue;

      // Find matching trim
      const trims = await db
        .select()
        .from(gvoTrim)
        .where(eq(gvoTrim.modelId, gvoModel_.id));

      for (const trim of trims) {
        // Build enriched engine string from VIN decode
        const engineParts: string[] = [];
        if (decode.displacementL) engineParts.push(`${decode.displacementL}L`);
        if (decode.engineCylinders) {
          const cylMap: Record<number, string> = {
            2: "I2", 3: "I3", 4: "I4", 5: "I5",
            6: "V6", 8: "V8", 10: "V10", 12: "V12",
          };
          engineParts.push(cylMap[decode.engineCylinders] ?? `${decode.engineCylinders}-Cyl`);
        }
        if (decode.valveTrainDesign) engineParts.push(decode.valveTrainDesign);
        if (decode.fuelTypePrimary) engineParts.push(decode.fuelTypePrimary);

        const engineStr = engineParts.join(" ");
        if (engineStr && engineStr !== trim.engine) {
          try {
            await db
              .update(gvoTrim)
              .set({ engine: engineStr })
              .where(eq(gvoTrim.id, trim.id));
            result.trimsEnriched++;
          } catch (err) {
            result.errors.push(`VIN enrich ${trim.name}: ${(err as Error).message}`);
          }
        }
      }
    } catch (err) {
      result.errors.push(`VIN ${vin}: ${(err as Error).message}`);
    }
  }

  return result;
}

// ── Batch Recall Fetcher ────────────────────────────────────────────

export interface RecallSummary {
  totalRecalls: number;
  criticalRecalls: number;
  modelsWithRecalls: number;
  results: Array<{
    make: string;
    model: string;
    year: number;
    recallCount: number;
    components: string[];
    hasParkIt: boolean;
  }>;
}

/**
 * Fetch recalls for all GVO makes/models.
 * Returns a summary for knowledge hub content generation.
 */
export async function fetchGvoRecalls(
  yearRange: { min: number; max: number } = { min: 2015, max: new Date().getFullYear() },
): Promise<RecallSummary> {
  const summary: RecallSummary = {
    totalRecalls: 0,
    criticalRecalls: 0,
    modelsWithRecalls: 0,
    results: [],
  };

  const makes = await db.select().from(gvoMake);
  const makeModelPairs: Array<{ make: string; model: string; makeId: string }> = [];

  for (const make of makes) {
    const models = await db
      .select()
      .from(gvoModel)
      .where(eq(gvoModel.makeId, make.id));

    for (const model of models) {
      makeModelPairs.push({
        make: make.name,
        model: model.name,
        makeId: make.id,
      });
    }
  }

  // Sample: fetch recalls for a subset (most popular makes in Nigeria)
  const priorityMakes = new Set([
    "toyota", "honda", "mercedes-benz", "bmw", "hyundai",
    "kia", "nissan", "lexus", "ford", "volkswagen",
  ]);

  const sampled = makeModelPairs
    .filter((p) => priorityMakes.has(p.make.toLowerCase()))
    .slice(0, 50);

  for (const pair of sampled) {
    for (let year = yearRange.min; year <= yearRange.max; year++) {
      try {
        const recalls = await fetchRecalls(pair.make, pair.model, year);
        if (recalls.length === 0) continue;

        summary.totalRecalls += recalls.length;
        const hasCritical = recalls.some(
          (r) => r.parkIt || r.component.toLowerCase().includes("fire") ||
                 r.component.toLowerCase().includes("brake"),
        );
        if (hasCritical) summary.criticalRecalls++;
        summary.modelsWithRecalls++;

        const components = [...new Set(recalls.map((r) => r.component))];
        summary.results.push({
          make: pair.make,
          model: pair.model,
          year,
          recallCount: recalls.length,
          components,
          hasParkIt: recalls.some((r) => r.parkIt),
        });
      } catch {
        // Skip on error — non-critical
      }
    }
  }

  return summary;
}
