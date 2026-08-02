/**
 * EPA Fuel Economy Data Parser
 *
 * Parses the EPA's bulk CSV (vehicles.csv.zip) — 50k+ vehicle records
 * from 1984-2027 with fuel economy, engine specs, emissions, and
 * vehicle classification data.
 *
 * Source: https://www.fueleconomy.gov/feg/epadata/vehicles.csv.zip
 * License: Public domain (US government data)
 *
 * GVO enrichment fields:
 *   - Engine: displacement, cylinders, fuel type
 *   - Fuel economy: city/hwy/combined MPG
 *   - Emissions: CO₂, SmartWay score
 *   - Classification: vehicle class, drive type, transmission
 *   - EV-specific: range, motor power, charge time
 *
 * Constitution compliance:
 *   - No hardcoded constants — data parsed and stored in DB (§II.2)
 *   - Managed data source — no custom scraping (§X.2)
 *   - GVO enrichment only — not a replacement for NHTSA vPIC (§III.1)
 */

import { db } from "../db";
import { gvoTrim, gvoModel, gvoMake } from "../db/schema";
import { eq } from "drizzle-orm";

// ── Types ───────────────────────────────────────────────────────────

export interface EpaVehicleRecord {
  make: string;
  model: string;
  year: number;
  // Engine
  displ: number | null;
  cylinders: number | null;
  // Fuel
  fuelType: string;
  fuelType1: string;
  // Economy (MPG)
  city08: number | null;
  highway08: number | null;
  comb08: number | null;
  // Emissions
  co2: number | null;
  co2TailpipeGpm: number | null;
  // Classification
  VClass: string;
  drive: string;
  trany: string;
  // EV-specific
  evMotor: string;
  range: number | null;
  // Cost
  fuelCost08: number | null;
  barrels08: number | null;
  // Scores
  feScore: number | null;
  ghgScore: number | null;
  smartwayScore: string;
  // Metadata
  atvType: string;
  eng_dscr: string;
}

interface CsvRow {
  [key: string]: string;
}

// ── CSV Parsing ─────────────────────────────────────────────────────

const HEADERS = [
  "barrels08", "barrelsA08", "charge120", "charge240", "city08", "city08U",
  "cityA08", "cityA08U", "cityCD", "cityE", "cityUF", "co2", "co2A",
  "co2TailpipeAGpm", "co2TailpipeGpm", "comb08", "comb08U", "combA08",
  "combA08U", "combE", "combinedCD", "combinedUF", "cylinders", "displ",
  "drive", "engId", "eng_dscr", "feScore", "fuelCost08", "fuelCostA08",
  "fuelType", "fuelType1", "fuelType2", "ghgScore", "ghgScoreA", "guzzler",
  "highway08", "highway08U", "highwayA08", "highwayA08U", "highwayCD",
  "highwayE", "highwayUF", "hpv", "lv2", "lv4", "make", "model", "mpgData",
  "my2023", "petroPlaylist", "pv2", "pv4", "range", "rangeA", "rangeCityA",
  "rangeHwyA", "sCharger", "tCharger", "tank", "trany", "ucity", "ucityA",
  "uhwy", "uhwyA", "ucomb", "ucombA", "VClass", "year", "ylg2you",
  "youSaveSpend", "guzzler", "trans_dscr", "tCharger", "sCharger",
  "atvType", "fuelType2", "rangeCity", "rangeHwy", "regen", "evMotor",
  "mfrCode", "commRating", "lkaAlert", "pzevType", "atvType",
  "hlv", "hpv", "evDrive", "trans2", "eng_dscr", "sCharger", "tCharger",
  "fuelType", "createdOn", "modifiedOn",
];

function parseCsvRow(line: string): CsvRow {
  const row: CsvRow = {};
  const values = line.split(",");
  for (let i = 0; i < Math.min(values.length, HEADERS.length); i++) {
    row[HEADERS[i]] = values[i]?.trim().replace(/^"(.*)"$/, "$1") ?? "";
  }
  return row;
}

function parseNumber(val: string | undefined): number | null {
  if (!val || val === "" || val === "-1") return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function rowToRecord(row: CsvRow): EpaVehicleRecord {
  return {
    make: row.make ?? "",
    model: row.model ?? "",
    year: parseInt(row.year ?? "0", 10) || 0,
    displ: parseNumber(row.displ),
    cylinders: parseNumber(row.cylinders),
    fuelType: row.fuelType ?? "",
    fuelType1: row.fuelType1 ?? "",
    city08: parseNumber(row.city08),
    highway08: parseNumber(row.highway08),
    comb08: parseNumber(row.comb08),
    co2: parseNumber(row.co2),
    co2TailpipeGpm: parseNumber(row.co2TailpipeGpm),
    VClass: row.VClass ?? "",
    drive: row.drive ?? "",
    trany: row.trany ?? "",
    evMotor: row.evMotor ?? "",
    range: parseNumber(row.range),
    fuelCost08: parseNumber(row.fuelCost08),
    barrels08: parseNumber(row.barrels08),
    feScore: parseNumber(row.feScore),
    ghgScore: parseNumber(row.ghgScore),
    smartwayScore: row.smartwayScore ?? "",
    atvType: row.atvType ?? "",
    eng_dscr: row.eng_dscr ?? "",
  };
}

// ── Bulk Parsing ────────────────────────────────────────────────────

/**
 * Parse EPA CSV data from a zip buffer into vehicle records.
 * Returns deduplicated records (one per unique make+model+year+trim).
 */
export function parseEpaCsv(csvContent: string): EpaVehicleRecord[] {
  const lines = csvContent.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Skip header line
  const records: EpaVehicleRecord[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvRow(lines[i]);
    const record = rowToRecord(row);

    // Skip incomplete records
    if (!record.make || !record.model || !record.year) continue;

    // Deduplicate by make+model+year+fuelType+displ+cylinders
    const key = `${record.make.toLowerCase()}:${record.model.toLowerCase()}:${record.year}:${record.fuelType}:${record.displ}:${record.cylinders}`;
    if (seen.has(key)) continue;
    seen.add(key);

    records.push(record);
  }

  return records;
}

// ── GVO Enrichment ──────────────────────────────────────────────────

export interface EnrichmentResult {
  trimsEnriched: number;
  modelsUpdated: number;
  errors: string[];
}

/**
 * Enrich existing GVO trims with EPA data.
 * Matches by make+model name, applies fuel economy and engine specs.
 */
export async function enrichGvoWithEpa(
  records: EpaVehicleRecord[],
): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    trimsEnriched: 0,
    modelsUpdated: 0,
    errors: [],
  };

  // Build a lookup of existing GVO makes
  const makes = await db.select().from(gvoMake);
  const makeMap = new Map<string, string>();
  for (const make of makes) {
    makeMap.set(make.name.toLowerCase(), make.id);
  }

  // Group EPA records by make+model
  const byMakeModel = new Map<string, EpaVehicleRecord[]>();
  for (const record of records) {
    const key = `${record.make.toLowerCase()}:${record.model.toLowerCase()}`;
    if (!byMakeModel.has(key)) byMakeModel.set(key, []);
    byMakeModel.get(key)!.push(record);
  }

  for (const [key, epaRecords] of byMakeModel) {
    const [makeName, modelName] = key.split(":");
    const makeId = makeMap.get(makeName);
    if (!makeId) continue;

    // Find matching GVO models
    const models = await db
      .select()
      .from(gvoModel)
      .where(eq(gvoModel.makeId, makeId));

    const modelNameLower = modelName.toLowerCase();
    const gvoModel_ = models.find(
      (m) => m.name.toLowerCase() === modelNameLower ||
             m.name.toLowerCase().includes(modelNameLower) ||
             modelNameLower.includes(m.name.toLowerCase()),
    );
    if (!gvoModel_) continue;

    // Update model-level data: first/last year from EPA
    const years = epaRecords.map((r) => r.year).filter((y) => y > 0);
    if (years.length > 0) {
      const minYear = Math.min(...years);
      const maxYear = Math.max(...years);
      try {
        await db
          .update(gvoModel)
          .set({
            firstModelYear: gvoModel_.firstModelYear ?? minYear,
            lastModelYear: maxYear,
          })
          .where(eq(gvoModel.id, gvoModel_.id));
        result.modelsUpdated++;
      } catch (err) {
        result.errors.push(`Model update ${gvoModel_.name}: ${(err as Error).message}`);
      }
    }

    // Enrich trims with fuel type and engine data from most common variant
    const trims = await db
      .select()
      .from(gvoTrim)
      .where(eq(gvoTrim.modelId, gvoModel_.id));

    for (const trim of trims) {
      // Try to match trim name to EPA variant
      const trimLower = trim.name.toLowerCase();
      const match = epaRecords.find((r) => {
        // EPA trany field often contains trim info like "Automatic (S6)"
        return r.trany.toLowerCase().includes(trimLower) ||
               trimLower.includes(r.fuelType?.toLowerCase() ?? "");
      });

      if (match) {
        const engineParts: string[] = [];
        if (match.displ) engineParts.push(`${match.displ}L`);
        if (match.cylinders) {
          const cylMap: Record<number, string> = {
            2: "I2", 3: "I3", 4: "I4", 5: "I5",
            6: "V6", 8: "V8", 10: "V10", 12: "V12",
          };
          engineParts.push(cylMap[match.cylinders] ?? `${match.cylinders}-Cyl`);
        }
        if (match.fuelType) engineParts.push(match.fuelType);

        try {
          await db
            .update(gvoTrim)
            .set({
              engine: engineParts.join(" ") || trim.engine,
              transmission: match.trany || trim.transmission,
            })
            .where(eq(gvoTrim.id, trim.id));
          result.trimsEnriched++;
        } catch (err) {
          result.errors.push(`Trim ${trim.name}: ${(err as Error).message}`);
        }
      }
    }
  }

  return result;
}

// ── Summary Stats ───────────────────────────────────────────────────

export interface EpaDataStats {
  totalRecords: number;
  uniqueMakes: number;
  uniqueModels: number;
  yearRange: { min: number; max: number };
  evCount: number;
  hybridCount: number;
}

export function getEpaStats(records: EpaVehicleRecord[]): EpaDataStats {
  const makes = new Set(records.map((r) => r.make));
  const models = new Set(records.map((r) => `${r.make}:${r.model}`));
  const years = records.map((r) => r.year).filter((y) => y > 0);
  const evCount = records.filter((r) => r.atvType === "EV" || r.range).length;
  const hybridCount = records.filter(
    (r) => r.fuelType.includes("Electric") && r.fuelType1.includes("Gas"),
  ).length;

  return {
    totalRecords: records.length,
    uniqueMakes: makes.size,
    uniqueModels: models.size,
    yearRange: { min: Math.min(...years), max: Math.max(...years) },
    evCount,
    hybridCount,
  };
}
