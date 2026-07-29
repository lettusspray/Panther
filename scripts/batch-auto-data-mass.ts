/**
 * auto-data.net Mass Crawler — Nigerian-Market Brands
 *
 * Crawls ~36K URLs from auto-data.net sitemap via Crawl4AI.
 * Reads URLs from /tmp/auto-data-ng-uncrawled.txt.
 * Usage: DATABASE_URL=... npx tsx scripts/batch-auto-data-mass.ts [start] [end]
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and, ilike } from "drizzle-orm";
import { gvoMake, gvoModel, gvoTrim, knowledgeEntry } from "../src/lib/db/schema";
import { extractTables, tableToKeyValue, parseNumeric } from "../src/lib/data/crawl4ai";
import fs from "fs";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

// Direct fetch — auto-data.net is SSR, no browser needed
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function fetchPage(url: string, timeout = 15_000): Promise<{ ok: boolean; html: string }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      signal: AbortSignal.timeout(timeout),
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

// ── auto-data.net parser (inlined) ──────────────────────────────────

function categorizeBodyType(bt: string): string {
  const l = bt.toLowerCase();
  if (l.includes("suv") || l.includes("crossover")) return "suv";
  if (l.includes("truck") || l.includes("pickup")) return "truck";
  if (l.includes("motorcycle")) return "motorcycle";
  return "car";
}

function parseAutoData(html: string, url: string): Record<string, unknown> | null {
  const idMatch = url.match(/-(\d+)$/);
  if (!idMatch) return null;
  const tables = extractTables(html);
  if (tables.length < 2) return null;
  const allSpecs: Record<string, string> = {};
  for (const table of tables) Object.assign(allSpecs, tableToKeyValue(table));

  const bodyType = allSpecs["Body type"] ?? "";
  const powerRaw = allSpecs["Power"] ?? "";
  const hpMatch = powerRaw.match(/(\d+)\s*Hp/i);
  const powerHp = hpMatch ? parseInt(hpMatch[1], 10) : null;
  const powerKw = powerHp ? Math.round(powerHp * 0.7457) : null;
  const torqueMatch = (allSpecs["Torque"] ?? "").match(/(\d+)\s*Nm/i);
  const torqueNm = torqueMatch ? parseInt(torqueMatch[1], 10) : null;
  const transRaw = allSpecs["Number of gears and type of gearbox"] ?? "";
  const gearsMatch = transRaw.match(/(\d+)\s*gears/);
  const gears = gearsMatch ? parseInt(gearsMatch[1], 10) : null;
  const transType = transRaw.replace(/\d+\s*gears,?\s*/i, "").trim();
  const yearStart = (allSpecs["Start of production"] ?? "").match(/(\d{4})/)?.[1] ?? null;
  const yearEnd = (allSpecs["End of production"] ?? "").match(/(\d{4})/)?.[1] ?? null;
  const engineDisp = (allSpecs["Engine displacement"] ?? "").match(/(\d+)\s*cm3/);

  return {
    external_id: idMatch[1],
    brand: allSpecs["Brand"] ?? "",
    model: allSpecs["Model"] ?? "",
    generation: allSpecs["Generation"] ?? "",
    modification: allSpecs["Modification (Engine)"] ?? "",
    year_start: yearStart ? parseInt(yearStart, 10) : null,
    year_end: yearEnd ? parseInt(yearEnd, 10) : null,
    category: categorizeBodyType(bodyType),
    body_type: bodyType,
    seats: parseNumeric(allSpecs["Seats"] ?? ""),
    doors: parseNumeric(allSpecs["Doors"] ?? ""),
    fuel_type: allSpecs["Fuel Type"] ?? "",
    power_hp: powerHp,
    power_kw: powerKw,
    torque_nm: torqueNm,
    engine_displacement_cc: engineDisp ? parseInt(engineDisp[1], 10) : null,
    engine_cylinders: parseNumeric(allSpecs["Number of cylinders"] ?? ""),
    engine_configuration: allSpecs["Engine configuration"] ?? "",
    acceleration_0_100_sec: parseNumeric(allSpecs["Acceleration 0 - 100 km/h"] ?? ""),
    top_speed_kmh: parseNumeric((allSpecs["Maximum speed"] ?? "").match(/([\d,.]+)/)?.[0] ?? ""),
    transmission_type: transType,
    transmission_gears: gears,
    drivetrain: allSpecs["Drive wheel"] ?? "",
    curb_weight_kg: parseNumeric((allSpecs["Kerb Weight"] ?? "").match(/([\d,.]+)/)?.[0] ?? ""),
    length_mm: parseNumeric((allSpecs["Length"] ?? "").match(/([\d,.]+)/)?.[0] ?? ""),
    width_mm: parseNumeric((allSpecs["Width"] ?? "").match(/([\d,.]+)/)?.[0] ?? ""),
    height_mm: parseNumeric((allSpecs["Height"] ?? "").match(/([\d,.]+)/)?.[0] ?? ""),
    wheelbase_mm: parseNumeric((allSpecs["Wheelbase"] ?? "").match(/([\d,.]+)/)?.[0] ?? ""),
    drag_coefficient: parseNumeric(allSpecs["Drag coefficient (Cd)"] ?? ""),
    trunk_liters: parseNumeric((allSpecs["Trunk (boot) space - minimum"] ?? "").match(/([\d,.]+)/)?.[0] ?? ""),
    fuel_tank_liters: parseNumeric((allSpecs["Fuel tank capacity"] ?? "").match(/([\d,.]+)/)?.[0] ?? ""),
    source_url: url,
  };
}

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
    _source: "auto-data.net",
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

async function main() {
  const allUrls = fs.readFileSync("/tmp/auto-data-ng-uncrawled.txt", "utf-8").trim().split("\n").filter(Boolean);
  const startIdx = parseInt(process.argv[2] ?? "0", 10);
  const endIdx = parseInt(process.argv[3] ?? Math.min(allUrls.length, 500).toString(), 10);
  const urls = allUrls.slice(startIdx, endIdx);

  console.log(`=== auto-data.net Mass Crawler ===`);
  console.log(`Pool: ${allUrls.length} | Batch: ${startIdx}–${endIdx - 1} (${urls.length} URLs)`);
  console.log(`Direct fetch: 8 concurrent, 50 per batch, 1s delay\n`);

  let upserted = 0;
  let parsed = 0;
  let errors = 0;
  const BATCH_SIZE = 50;

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(urls.length / BATCH_SIZE);

    try {
      const pages = await fetchBatch(batch, 8);
      const vehicles: Record<string, unknown>[] = [];
      for (const p of pages) {
        const specs = parseAutoData(p.html, p.url);
        if (specs) { vehicles.push(specs); parsed++; }
      }

      for (const v of vehicles) {
        try {
          const brand = v.brand as string;
          const model = v.model as string;
          let makeInfo = await findMake(brand);
          if (!makeInfo) {
            const catId = (await sql`SELECT id FROM gvo_category WHERE slug = 'car' LIMIT 1`)[0]?.id;
            if (!catId) continue;
            const [row] = await db.insert(gvoMake).values({
              categoryId: catId, name: brand, slug: slug(brand), origin: "Global",
            }).returning();
            makeInfo = { id: row.id, categoryId: catId };
          }

          const modelId = await findOrCreateModel(makeInfo.id, model);
          const trimName = (v.modification as string) || "Standard";
          const trimId = await findOrCreateTrim(modelId, trimName);

          await upsertKnowledge(trimId, v);

          upserted++;
        } catch (err) {
          errors++;
        }
      }

      if (batchNum % 5 === 0 || batchNum === totalBatches) {
        console.log(`  [${batchNum}/${totalBatches}] Parsed: ${parsed} | Upserted: ${upserted} | Errors: ${errors}`);
      }
    } catch (err) {
      console.error(`  [${batchNum}/${totalBatches}] BATCH ERROR: ${(err as Error).message.slice(0, 100)}`);
      errors += batch.length;
    }

    // Polite delay — direct fetch, auto-data.net SSR
    if (i + BATCH_SIZE < urls.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  const totalKe = await db.select().from(knowledgeEntry);
  console.log(`\n=== Summary ===`);
  console.log(`${upserted} upserted, ${errors} errors out of ${urls.length} URLs`);
  console.log(`Total knowledge entries in DB: ${totalKe.length}`);
}

main().catch(console.error);
