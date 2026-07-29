/**
 * bikez.com Mass Crawler — Nigerian-Market Motorcycles
 *
 * Crawls motorcycle specs from bikez.com via direct fetch.
 * Extracts JSON-LD structured data (engine, power, torque, weight, etc.)
 * and HTML table data for additional specs.
 *
 * Usage: DATABASE_URL=... npx tsx scripts/batch-bikez.ts [start] [end]
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and, ilike } from "drizzle-orm";
import { gvoMake, gvoModel, gvoTrim, knowledgeEntry } from "../src/lib/db/schema";
import fs from "fs";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ── Fetch ───────────────────────────────────────────────────────────

async function fetchPage(url: string): Promise<{ ok: boolean; html: string }> {
  try {
    const fullUrl = url.startsWith("http") ? url : `https://bikez.com${url}`;
    const res = await fetch(fullUrl, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    });
    const html = await res.text();
    return { ok: res.ok && html.length > 1000, html };
  } catch {
    return { ok: false, html: "" };
  }
}

async function fetchBatch(urls: string[], concurrency = 8): Promise<{ url: string; html: string }[]> {
  const results: { url: string; html: string }[] = [];
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(async (url) => {
      const { ok, html } = await fetchPage(url);
      return ok ? { url, html } : null;
    }));
    results.push(...batchResults.filter(Boolean) as { url: string; html: string }[]);
    if (i + concurrency < urls.length) await new Promise(r => setTimeout(r, 500));
  }
  return results;
}

// ── Parser ──────────────────────────────────────────────────────────

function parseBikez(html: string, url: string): Record<string, unknown> | null {
  // Extract JSON-LD Motorcycle data
  const jsonLdMatch = html.match(/"@type"\s*:\s*"Motorcycle"[\s\S]*?"@context"/);
  if (!jsonLdMatch) return null;

  // Find the full JSON block
  const allJsonLd = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  let bikeData: Record<string, any> | null = null;
  for (const m of allJsonLd) {
    try {
      const d = JSON.parse(m[1]);
      if (d["@type"] === "Motorcycle") { bikeData = d; break; }
    } catch {}
  }
  if (!bikeData) return null;

  // Extract brand and model from name
  const name = bikeData.name || "";
  const brandName = bikeData.brand?.name || "";
  const modelName = bikeData.model || name.replace(/^\d{4}\s+/, "").replace(brandName, "").trim();

  // Extract year from name or URL
  const yearMatch = name.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;

  // Extract engine data
  const engine = bikeData.vehicleEngine || {};
  const displacement = engine.engineDisplacement?.value ? parseFloat(engine.engineDisplacement.value) : null;
  const powerBhp = engine.enginePower?.value ? parseFloat(engine.enginePower.value) : null;
  const powerKw = powerBhp ? Math.round(powerBhp * 0.7457) : null;
  const torqueNm = engine.torque?.value ? parseFloat(engine.torque.value) : null;

  // Extract other data
  const weightKg = bikeData.weight?.value ? parseFloat(bikeData.weight.value) : null;
  const fuelCapacity = bikeData.fuelCapacity?.value ? parseFloat(bikeData.fuelCapacity.value) : null;
  const wheelbase = bikeData.wheelbase?.value ? parseFloat(bikeData.wheelbase.value) : null;
  const fuelConsumption = bikeData.fuelConsumption?.value ? parseFloat(bikeData.fuelConsumption.value) : null;

  // Extract additional specs from HTML tables
  const tableSpecs: Record<string, string> = {};
  const rows = [...html.matchAll(/<b[^>]*>([^<]+)<\/b>\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g)];
  for (const row of rows) {
    const key = row[1].trim();
    const val = row[2].replace(/<[^>]+>/g, "").trim();
    if (val && val !== "Loading..." && val !== "Update specs") {
      tableSpecs[key] = val;
    }
  }

  // Parse additional specs
  const parseFirstNum = (v: string) => {
    const m = v.match(/([\d,.]+)/);
    return m ? parseFloat(m[1].replace(/,/g, "")) : null;
  };

  const topSpeed = parseFirstNum(tableSpecs["Top speed"] ?? "");
  const compression = tableSpecs["Compression"] ?? "";
  const boreStroke = tableSpecs["Bore x stroke"] ?? "";
  const fuelSystem = tableSpecs["Fuel system"] ?? "";
  const coolingSystem = tableSpecs["Cooling system"] ?? "";
  const gearbox = tableSpecs["Gearbox"] ?? "";
  const transmissionType = tableSpecs["Transmission type"] ?? "";
  const frontSuspension = tableSpecs["Front suspension"] ?? "";
  const rearSuspension = tableSpecs["Rear suspension"] ?? "";
  const frontBrakes = tableSpecs["Front brakes"] ?? "";
  const rearBrakes = tableSpecs["Rear brakes"] ?? "";
  const frontTire = tableSpecs["Front tyre"] ?? "";
  const rearTire = tableSpecs["Rear tyre"] ?? "";
  const seatHeight = parseFirstNum(tableSpecs["Seat"] ?? "");
  const dryWeight = parseFirstNum(tableSpecs["Dry weight"] ?? "");
  const wetWeight = parseFirstNum(tableSpecs["Weight incl. oil, gas, etc"] ?? "");
  const category = bikeData.category || bikeData.bodyType || "";

  // URL slug to extract external ID
  const slugMatch = url.match(/\/([^/]+)\.php$/);
  const externalId = slugMatch?.[1] ?? url;

  return {
    external_id: externalId,
    brand: brandName,
    model: modelName.replace(/\d{4}$/, "").trim(),
    year,
    category,
    body_type: bikeData.bodyType || "",
    description: bikeData.description || "",
    engine_displacement_cc: displacement,
    power_hp: powerBhp,
    power_kw: powerKw,
    torque_nm: torqueNm,
    compression,
    bore_stroke: boreStroke,
    fuel_system: fuelSystem,
    cooling_system: coolingSystem,
    gearbox,
    transmission_type: transmissionType,
    top_speed_kmh: topSpeed,
    fuel_consumption_l100km: fuelConsumption,
    fuel_capacity_liters: fuelCapacity,
    wheelbase_mm: wheelbase ? wheelbase * 10 : null, // cm to mm
    weight_kg: weightKg,
    dry_weight_kg: dryWeight,
    wet_weight_kg: wetWeight,
    seat_height_mm: seatHeight,
    front_suspension: frontSuspension,
    rear_suspension: rearSuspension,
    front_brakes: frontBrakes,
    rear_brakes: rearBrakes,
    front_tire: frontTire,
    rear_tire: rearTire,
    color: bikeData.color || "",
    image_url: bikeData.image?.url || "",
    source_url: url.startsWith("http") ? url : `https://bikez.com${url}`,
  };
}

// ── DB Helpers ──────────────────────────────────────────────────────

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function findMake(brand: string) {
  const s = slug(brand);
  const exact = await db.select({ id: gvoMake.id, categoryId: gvoMake.categoryId })
    .from(gvoMake).where(eq(gvoMake.slug, s)).limit(1);
  if (exact.length > 0) return exact[0];
  const fuzzy = await db.select({ id: gvoMake.id, categoryId: gvoMake.categoryId })
    .from(gvoMake).where(ilike(gvoMake.name, `%${brand}%`)).limit(1);
  return fuzzy.length > 0 ? fuzzy[0] : null;
}

async function findOrCreateModel(makeId: string, modelName: string) {
  const s = slug(modelName);
  const existing = await db.select({ id: gvoModel.id }).from(gvoModel)
    .where(and(eq(gvoModel.slug, s), eq(gvoModel.makeId, makeId))).limit(1);
  if (existing.length > 0) return existing[0].id;
  const [row] = await db.insert(gvoModel).values({ makeId, name: modelName, slug: s }).returning();
  return row.id;
}

async function findOrCreateTrim(modelId: string, trimName: string) {
  const s = slug(trimName);
  const existing = await db.select({ id: gvoTrim.id }).from(gvoTrim)
    .where(and(eq(gvoTrim.slug, s), eq(gvoTrim.modelId, modelId))).limit(1);
  if (existing.length > 0) return existing[0].id;
  const [row] = await db.insert(gvoTrim).values({ modelId, name: trimName, slug: s }).returning();
  return row.id;
}

async function upsertKnowledge(trimId: string, specs: Record<string, unknown>) {
  const existing = await db.select().from(knowledgeEntry)
    .where(eq(knowledgeEntry.trimId, trimId)).limit(1);
  const merged = {
    ...(existing[0]?.specs as Record<string, unknown> ?? {}),
    ...specs,
    _source: "bikez.com",
    _lastEnriched: new Date().toISOString(),
  };
  if (existing.length > 0) {
    await db.update(knowledgeEntry)
      .set({ specs: merged, computedAt: new Date() })
      .where(eq(knowledgeEntry.trimId, trimId));
  } else {
    await db.insert(knowledgeEntry).values({ trimId, warnings: [], specs: merged });
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const allUrls = fs.readFileSync("/tmp/bikez-ng-specs-uniq.txt", "utf-8").trim().split("\n").filter(Boolean);
  const startIdx = parseInt(process.argv[2] ?? "0", 10);
  const endIdx = parseInt(process.argv[3] ?? Math.min(allUrls.length, 500).toString(), 10);
  const urls = allUrls.slice(startIdx, endIdx);

  console.log(`=== bikez.com Motorcycle Crawler ===`);
  console.log(`Pool: ${allUrls.length} | Batch: ${startIdx}–${endIdx - 1} (${urls.length} URLs)\n`);

  let upserted = 0, parsed = 0, errors = 0;
  const BATCH_SIZE = 50;

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(urls.length / BATCH_SIZE);

    try {
      const pages = await fetchBatch(batch, 8);
      for (const p of pages) {
        const specs = parseBikez(p.html, p.url);
        if (!specs) { errors++; continue; }
        parsed++;
        try {
          const brand = specs.brand as string;
          const model = (specs.model as string) || "Unknown";
          let makeInfo = await findMake(brand);
          if (!makeInfo) {
            const motoCat = await sql`SELECT id FROM gvo_category WHERE slug = 'motorcycle' LIMIT 1`;
            const catId = motoCat[0]?.id;
            if (!catId) continue;
            const [row] = await db.insert(gvoMake).values({
              categoryId: catId, name: brand, slug: slug(brand), origin: "Global",
            }).returning();
            makeInfo = { id: row.id, categoryId: catId };
          }
          const modelId = await findOrCreateModel(makeInfo.id, model);
          const trimName = specs.year ? `${specs.year} Standard` : "Standard";
          const trimId = await findOrCreateTrim(modelId, trimName);
          await upsertKnowledge(trimId, specs);
          upserted++;
        } catch { errors++; }
      }
      if (batchNum % 10 === 0 || batchNum === totalBatches) {
        console.log(`  [${batchNum}/${totalBatches}] Parsed: ${parsed} | Upserted: ${upserted} | Errors: ${errors}`);
      }
    } catch (err) {
      console.error(`  [${batchNum}] BATCH ERROR: ${(err as Error).message.slice(0, 100)}`);
    }
    if (i + BATCH_SIZE < urls.length) await new Promise(r => setTimeout(r, 1000));
  }

  const totalKe = await db.select().from(knowledgeEntry);
  const makes = await db.select().from(gvoMake);
  const models = await db.select().from(gvoModel);
  console.log(`\n=== Summary ===`);
  console.log(`${upserted} upserted, ${errors} errors`);
  console.log(`DB: ${makes.length} makes, ${models.length} models, ${totalKe.length} knowledge entries`);
}

main().catch(console.error);
