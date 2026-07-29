/**
 * Second-pass crawler for remaining ev-database.org URLs.
 * Uses the uncrawled list from /tmp/ev-uncrawled.json.
 * Usage: DATABASE_URL=... NODE_TLS_REJECT_UNAUTHORIZED=0 npx tsx scripts/batch-ev-pass2.ts [start] [end]
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and, ilike } from "drizzle-orm";
import { gvoMake, gvoModel, gvoTrim, knowledgeEntry } from "../src/lib/db/schema";
import { extractTables, tableToKeyValue, parseNumeric } from "../src/lib/data/crawl4ai";
import fs from "fs";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

const PROXY_URL = "http://14a07991fe1df:b53ce5ae33@174.140.207.69:12323";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

let _dispatcher: any = null;
async function getDispatcher() {
  if (!_dispatcher) {
    const { ProxyAgent } = await import("undici");
    _dispatcher = new ProxyAgent({ uri: PROXY_URL });
  }
  return _dispatcher;
}

async function fetchViaProxy(url: string, timeout = 45_000, retries = 2): Promise<{ status: number; html: string }> {
  const { fetch: undiciFetch } = await import("undici");
  const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  try {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await undiciFetch(url, {
          dispatcher: await getDispatcher(),
          headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
          signal: AbortSignal.timeout(timeout),
        });
        const html = await res.text();
        if (res.status === 200 && html.length > 1000) return { status: res.status, html };
        if ((res.status === 422 || res.status === 429) && attempt < retries) {
          await new Promise(r => setTimeout(r, 5000 * (attempt + 1)));
          continue;
        }
        return { status: res.status, html };
      } catch (err) {
        if (attempt === retries) throw err;
        await new Promise(r => setTimeout(r, 5000 * (attempt + 1)));
      }
    }
    return { status: 0, html: "" };
  } finally {
    if (prev === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev;
  }
}

function parseEvSpecs(html: string, url: string): Record<string, unknown> | null {
  const idMatch = url.match(/\/car\/(\d+)\//);
  if (!idMatch) return null;
  const slugMatch = url.match(/\/car\/\d+\/([\w-]+)$/);
  const slug = slugMatch?.[1] ?? "";
  const slugParts = slug.split("-");
  let brand = (slugParts[0] ?? "").replace(/_/g, " ");
  let model = slugParts.slice(1).join(" ");
  const tables = extractTables(html);
  if (tables.length === 0) return null;
  const allSpecs: Record<string, string> = {};
  for (const table of tables) Object.assign(allSpecs, tableToKeyValue(table));
  const parseBool = (v: string) => v.toLowerCase() === "yes";
  const parsePowerHp = (v: string) => {
    const m = v.match(/\((\d+)\s*PS\)/);
    if (m) return parseInt(m[1], 10);
    const kw = parseNumeric(v);
    return kw ? Math.round(kw * 1.341) : null;
  };
  const priceStr = allSpecs["Germany"] ?? "";
  const warrantyKmStr = allSpecs["Warranty Mileage"] ?? "";
  return {
    external_id: idMatch[1], brand, model,
    battery_nominal_kwh: parseNumeric(allSpecs["Nominal Capacity"] ?? allSpecs["Nominal Capacity *"] ?? ""),
    battery_usable_kwh: parseNumeric(allSpecs["Useable Capacity*"] ?? allSpecs["Useable Capacity"] ?? ""),
    battery_type: allSpecs["Battery Type"] ?? "",
    battery_architecture: allSpecs["Architecture"] ?? "",
    battery_warranty_years: parseNumeric(allSpecs["Warranty Period"] ?? ""),
    battery_warranty_km: warrantyKmStr.includes("km") ? parseNumeric(warrantyKmStr.replace(/,/g, "")) : null,
    range_km: parseNumeric(allSpecs["Electric Range"] ?? ""),
    efficiency_wh_per_km: parseNumeric(allSpecs["Vehicle Consumption"] ?? allSpecs["Combined - Mild Weather"] ?? ""),
    real_range_city_cold: parseNumeric(allSpecs["City - Cold Weather"] ?? ""),
    real_range_highway_cold: parseNumeric(allSpecs["Highway - Cold Weather"] ?? ""),
    real_range_combined_cold: parseNumeric(allSpecs["Combined - Cold Weather"] ?? ""),
    real_range_city_mild: parseNumeric(allSpecs["City - Mild Weather"] ?? ""),
    real_range_highway_mild: parseNumeric(allSpecs["Highway - Mild Weather"] ?? ""),
    real_range_combined_mild: parseNumeric(allSpecs["Combined - Mild Weather"] ?? ""),
    wltp_range_km: parseNumeric(allSpecs["Range"] && !allSpecs["Range"].includes("km/h") ? allSpecs["Range"] : ""),
    ac_charge_port: allSpecs["Charge Port"] ?? "",
    ac_charge_power_kw: parseNumeric(allSpecs["Charge Power"] ?? ""),
    dc_charge_port: (() => { const m = html.match(/Fast Charging[\s\S]*?Charge Port[\s\S]*?<td[^>]*>(.*?)<\/td>/i); return m?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "CCS"; })(),
    dc_charge_max_kw: parseNumeric(allSpecs["Charge Power (max)"] ?? ""),
    dc_charge_10_80_kw: parseNumeric(allSpecs["Charge Power (10-80%)"] ?? ""),
    autocharge_supported: parseBool(allSpecs["Autocharge Supported"] ?? ""),
    plug_charge_supported: parseBool(allSpecs["Plug & Charge Supported"] ?? ""),
    preconditioning_possible: parseBool(allSpecs["Preconditioning Possible"] ?? ""),
    acceleration_0_100_sec: parseNumeric(allSpecs["Acceleration 0 - 100 km/h"] ?? ""),
    top_speed_kmh: parseNumeric(allSpecs["Top Speed"] ?? ""),
    power_kw: parseNumeric(allSpecs["Total Power"] ?? ""),
    power_hp: parsePowerHp(allSpecs["Total Power"] ?? ""),
    torque_nm: parseNumeric(allSpecs["Total Torque"] ?? ""),
    drivetrain: allSpecs["Drive"] ?? "",
    v2l_supported: parseBool(allSpecs["V2L Supported"] ?? ""),
    v2h_ac_supported: parseBool(allSpecs["V2H via AC Supported"] ?? ""),
    v2g_ac_supported: parseBool(allSpecs["V2G via AC Supported"] ?? ""),
    length_mm: parseNumeric(allSpecs["Length"] ?? ""),
    width_mm: parseNumeric(allSpecs["Width"] ?? ""),
    height_mm: parseNumeric(allSpecs["Height"] ?? ""),
    wheelbase_mm: parseNumeric(allSpecs["Wheelbase"] ?? ""),
    curb_weight_kg: parseNumeric(allSpecs["Weight Unladen (EU)"] ?? ""),
    gross_weight_kg: parseNumeric(allSpecs["Gross Vehicle Weight (GVWR)"] ?? ""),
    cargo_liters: parseNumeric(allSpecs["Cargo Volume"] ?? ""),
    cargo_max_liters: parseNumeric(allSpecs["Cargo Volume Max"] ?? ""),
    frunk_liters: parseNumeric(allSpecs["Cargo Volume Frunk"] ?? ""),
    tow_hitch_possible: parseBool(allSpecs["Tow Hitch Possible"] ?? ""),
    towing_braked_kg: parseNumeric(allSpecs["Towing Weight Braked"] ?? ""),
    ncap_stars: (() => { const m = html.match(/(\d)\s*(?:out of|\/)\s*5/); return m ? parseInt(m[1], 10) : null; })(),
    ncap_adult: parseNumeric(allSpecs["Adult Occupant"] ?? ""),
    ncap_child: parseNumeric(allSpecs["Child Occupant"] ?? ""),
    ncap_pedestrian: parseNumeric(allSpecs["Vulnerable Road Users"] ?? ""),
    ncap_assist: parseNumeric(allSpecs["Safety Assist"] ?? ""),
    seats: parseNumeric(allSpecs["Seats"] ?? "") ?? null,
    platform: allSpecs["Platform"] ?? "",
    ev_dedicated_platform: parseBool(allSpecs["EV Dedicated Platform"] ?? ""),
    car_body: allSpecs["Car Body"] ?? "",
    segment: allSpecs["Segment"] ?? "",
    heat_pump: parseBool(allSpecs["Heat pump (HP)"] ?? ""),
    price_eur: priceStr.includes("€") ? (() => { const m = priceStr.match(/[\d,]+/); return m ? parseInt(m[0].replace(/,/g, ""), 10) : null; })() : null,
    source_url: url,
  };
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function findMake(brand: string) {
  const s = slug(brand);
  const exact = await db.select({ id: gvoMake.id, categoryId: gvoMake.categoryId }).from(gvoMake).where(eq(gvoMake.slug, s)).limit(1);
  if (exact.length > 0) return exact[0];
  const fuzzy = await db.select({ id: gvoMake.id, categoryId: gvoMake.categoryId }).from(gvoMake).where(ilike(gvoMake.name, `%${brand}%`)).limit(1);
  return fuzzy.length > 0 ? fuzzy[0] : null;
}

async function findOrCreateModel(makeId: string, modelName: string) {
  const s = slug(modelName);
  const existing = await db.select({ id: gvoModel.id }).from(gvoModel).where(and(eq(gvoModel.slug, s), eq(gvoModel.makeId, makeId))).limit(1);
  if (existing.length > 0) return existing[0].id;
  const [row] = await db.insert(gvoModel).values({ makeId, name: modelName, slug: s }).returning();
  return row.id;
}

async function findOrCreateTrim(modelId: string, trimName: string) {
  const s = slug(trimName);
  const existing = await db.select({ id: gvoTrim.id }).from(gvoTrim).where(and(eq(gvoTrim.slug, s), eq(gvoTrim.modelId, modelId))).limit(1);
  if (existing.length > 0) return existing[0].id;
  const [row] = await db.insert(gvoTrim).values({ modelId, name: trimName, slug: s }).returning();
  return row.id;
}

async function upsertKnowledge(trimId: string, specs: Record<string, unknown>) {
  const existing = await db.select().from(knowledgeEntry).where(eq(knowledgeEntry.trimId, trimId)).limit(1);
  const merged = { ...(existing[0]?.specs as Record<string, unknown> ?? {}), ...specs, _source: "ev-database.org", _lastEnriched: new Date().toISOString() };
  if (existing.length > 0) {
    await db.update(knowledgeEntry).set({ specs: merged, computedAt: new Date() }).where(eq(knowledgeEntry.trimId, trimId));
  } else {
    await db.insert(knowledgeEntry).values({ trimId, warnings: [], specs: merged });
  }
}

async function main() {
  const allUrls: string[] = JSON.parse(fs.readFileSync("/tmp/ev-uncrawled.json", "utf-8"));
  const startIdx = parseInt(process.argv[2] ?? "0", 10);
  const endIdx = parseInt(process.argv[3] ?? Math.min(allUrls.length, 100).toString(), 10);
  const urls = allUrls.slice(startIdx, endIdx);
  console.log(`=== ev-database.org Pass 2 ===`);
  console.log(`Uncrawled pool: ${allUrls.length} | Batch: ${startIdx}–${endIdx - 1}\n`);

  let upserted = 0, errors = 0;
  const CONCURRENCY = 5;
  const DELAY_MS = 1000;

  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async (url) => {
      try {
        const { status, html } = await fetchViaProxy(url);
        if (status !== 200 || html.length < 1000) return { url, error: `HTTP ${status}` };
        const specs = parseEvSpecs(html, url);
        if (!specs) return { url, error: "parse failed" };
        return { url, specs };
      } catch (err) { return { url, error: (err as Error).message.slice(0, 80) }; }
    }));

    for (const r of results) {
      if ("error" in r) { errors++; continue; }
      try {
        const s = r.specs!;
        let makeInfo = await findMake(s.brand as string);
        if (!makeInfo) {
          const evCat = await sql`SELECT id FROM gvo_category WHERE slug = 'electric' LIMIT 1`;
          const catId = evCat[0]?.id;
          if (!catId) continue;
          const [row] = await db.insert(gvoMake).values({ categoryId: catId, name: s.brand as string, slug: slug(s.brand as string), origin: "Global" }).returning();
          makeInfo = { id: row.id, categoryId: catId };
        }
        const modelId = await findOrCreateModel(makeInfo.id, s.model as string);
        const trimId = await findOrCreateTrim(modelId, "Standard");
        await upsertKnowledge(trimId, s);
        upserted++;
        if (upserted % 20 === 0) console.log(`  ✓ ${upserted} upserted...`);
      } catch (err) { errors++; }
    }
    if (i + CONCURRENCY < urls.length) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  const totalKe = await db.select().from(knowledgeEntry);
  console.log(`\n=== Summary ===`);
  console.log(`${upserted} upserted, ${errors} errors`);
  console.log(`Total knowledge entries: ${totalKe.length}`);
}

main().catch(console.error);
