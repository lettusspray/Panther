/**
 * Auto-Data.net Homepage Crawler
 * Crawls the latest cars from auto-data.net homepage via Crawl4AI.
 * These are real, current spec pages with correct URL format.
 *
 * Usage: DATABASE_URL=... npx tsx scripts/homepage-auto-data.ts
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and, ilike } from "drizzle-orm";
import { gvoMake, gvoModel, gvoTrim, knowledgeEntry } from "../src/lib/db/schema";
import { crawlAutoData } from "../src/lib/data/auto-data";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const HOMEPAGE_URLS = [
  "https://www.auto-data.net/en/subaru-impreza-vi-hatchback-2.0ie-136hp-mild-hybrid-awd-cvt-57546",
  "https://www.auto-data.net/en/byd-seal-05-dm-i-1.5l-25.28-kwh-163hp-plug-in-hybrid-e-cvt-57545",
  "https://www.auto-data.net/en/lynk-co-07-gt-1.5td-evo-530hp-plug-in-hybrid-4wd-dht-evo-57537",
  "https://www.auto-data.net/en/lynk-co-07-gt-1.5td-evo-408hp-plug-in-hybrid-dht-evo-57536",
  "https://www.auto-data.net/en/byd-seal-06-station-wagon-dm-i-1.5l-34.27-kwh-238hp-plug-in-hybrid-e-cvt-57535",
  "https://www.auto-data.net/en/byd-seal-06-station-wagon-dm-i-1.5l-25.28-kwh-238hp-plug-in-hybrid-e-cvt-57534",
  "https://www.auto-data.net/en/byd-seal-06-gt-69.07-kwh-326hp-electric-57533",
  "https://www.auto-data.net/en/byd-seal-06-gt-57.54-kwh-272hp-electric-57532",
  "https://www.auto-data.net/en/honda-super-one-29.6-kwh-95hp-ev-57516",
  "https://www.auto-data.net/en/subaru-solterra-facelift-2025-73.1-kwh-343hp-awd-57509",
  "https://www.auto-data.net/en/proton-e.mas-5-40.16-kwh-116hp-electric-57508",
  "https://www.auto-data.net/en/proton-e.mas-5-30.12-kwh-79hp-electric-57507",
  "https://www.auto-data.net/en/xpeng-mona-l03-69-kwh-249hp-electric-57503",
  "https://www.auto-data.net/en/xpeng-mona-l03-56-kwh-249hp-electric-57502",
  "https://www.auto-data.net/en/volkswagen-id.-polo-37-kwh-135hp-57494",
  "https://www.auto-data.net/en/bestune-e05-54-kwh-163hp-electric-57493",
  "https://www.auto-data.net/en/tata-sierra-ii-75-kwh-349hp-ev-qwd-dual-motor-57492",
  "https://www.auto-data.net/en/tata-sierra-ii-75-kwh-209hp-ev-57491",
  "https://www.auto-data.net/en/tata-sierra-ii-63-kwh-238hp-ev-57490",
  "https://www.auto-data.net/en/volkswagen-id.-cross-55-kwh-211hp-57489",
  "https://www.auto-data.net/en/byd-seal-08-dm-i-1.5t-45.36-kwh-544hp-plug-in-hybrid-4wd-e-cvt-57524",
  "https://www.auto-data.net/en/byd-seal-08-dm-i-1.5t-45.36-kwh-272hp-plug-in-hybrid-e-cvt-57523",
  "https://www.auto-data.net/en/tank-700-facelift-2026-hi4-t-3.0t-v6-537hp-plug-in-hybrid-4wd-automatic-57522",
  "https://www.auto-data.net/en/tank-700-facelift-2026-hi4-z-2.0t-864hp-plug-in-hybrid-4wd-dht-57521",
  "https://www.auto-data.net/en/volkswagen-t-roc-ii-1.5-tsi-170hp-hybrid-automatic-57520",
  "https://www.auto-data.net/en/volkswagen-golf-viii-facelift-2024-1.5-tsi-170hp-hybrid-automatic-57519",
  "https://www.auto-data.net/en/hongqi-guoya-4.0-v8-585hp-hybrid-4wd-automatic-57517",
  "https://www.auto-data.net/en/jetour-g700-2.0td-904hp-plug-in-hybrid-4wd-dht-6-seat-57511",
  "https://www.auto-data.net/en/jetour-g700-2.0td-904hp-plug-in-hybrid-4wd-dht-57510",
  "https://www.auto-data.net/en/skoda-karoq-scout-1.5-tsi-150hp-4x4-dsg-57526",
  "https://www.auto-data.net/en/mercedes-benz-maybach-gls-x167-facelift-2026-gls-680-v8-612hp-eq-boost-4matic-9g-tronic-57512",
  "https://www.auto-data.net/en/proton-e.mas-7-1.5l-29.8-kwh-262hp-plug-in-hybrid-dht-57506",
  "https://www.auto-data.net/en/proton-e.mas-7-1.5l-18.4-kwh-262hp-plug-in-hybrid-dht-57505",
  "https://www.auto-data.net/en/xpeng-mona-l03-1.5l-37.2-kwh-249hp-range-extender-57504",
];

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

async function findOrCreateTrim(modelId: string, trimName: string, engine?: string, trans?: string) {
  const s = slug(trimName);
  const existing = await db.select({ id: gvoTrim.id }).from(gvoTrim)
    .where(and(eq(gvoTrim.slug, s), eq(gvoTrim.modelId, modelId))).limit(1);
  if (existing.length > 0) return existing[0].id;
  const [row] = await db.insert(gvoTrim).values({
    modelId, name: trimName, slug: s, engine: engine ?? null, transmission: trans ?? null,
  }).returning();
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
  console.log(`=== Auto-Data.net Homepage Crawler ===`);
  console.log(`URLs: ${HOMEPAGE_URLS.length}\n`);

  const vehicles = await crawlAutoData(HOMEPAGE_URLS);
  console.log(`Parsed: ${vehicles.length}/${HOMEPAGE_URLS.length}\n`);

  let upserted = 0;
  let errors = 0;

  for (const v of vehicles) {
    try {
      let makeInfo = await findMake(v.brand);
      if (!makeInfo) {
        const evCat = await sql`SELECT id FROM gvo_category WHERE slug = 'electric' LIMIT 1`;
        const carCat = await sql`SELECT id FROM gvo_category WHERE slug = 'car' LIMIT 1`;
        const catId = evCat[0]?.id || carCat[0]?.id;
        if (!catId) continue;
        const [row] = await db.insert(gvoMake).values({
          categoryId: catId, name: v.brand, slug: slug(v.brand), origin: "Global",
        }).returning();
        makeInfo = { id: row.id, categoryId: catId };
        console.log(`  + Created make: ${v.brand}`);
      }

      const modelId = await findOrCreateModel(makeInfo.id, v.model);
      const trimName = v.modification || "Standard";
      const engineStr = [
        v.engine_displacement_cc ? `${v.engine_displacement_cc}cc` : null,
        v.power_hp ? `${v.power_hp}hp` : null,
      ].filter(Boolean).join(", ");

      const trimId = await findOrCreateTrim(modelId, trimName, engineStr || undefined, v.transmission_type || undefined);

      await upsertKnowledge(trimId, {
        generation: v.generation,
        modification: v.modification,
        body_type: v.body_type,
        fuel_type: v.fuel_type,
        powertrain_architecture: v.powertrain_architecture,
        power_hp: v.power_hp,
        power_kw: v.power_kw,
        torque_nm: v.torque_nm,
        engine_displacement_cc: v.engine_displacement_cc,
        engine_cylinders: v.engine_cylinders,
        engine_configuration: v.engine_configuration,
        engine_code: v.engine_code,
        bore_mm: v.bore_mm,
        stroke_mm: v.stroke_mm,
        compression_ratio: v.compression_ratio,
        valvetrain: v.valvetrain,
        aspiration: v.aspiration,
        engine_layout: v.engine_layout,
        fuel_injection: v.fuel_injection,
        engine_systems: v.engine_systems,
        num_valves_per_cylinder: v.num_valves_per_cylinder,
        power_per_litre: v.power_per_litre,
        acceleration_0_100_sec: v.acceleration_0_100_sec,
        top_speed_kmh: v.top_speed_kmh,
        transmission_type: v.transmission_type,
        transmission_gears: v.transmission_gears,
        drivetrain: v.drivetrain,
        curb_weight_kg: v.curb_weight_kg,
        gross_weight_kg: v.gross_weight_kg,
        length_mm: v.length_mm,
        width_mm: v.width_mm,
        height_mm: v.height_mm,
        wheelbase_mm: v.wheelbase_mm,
        front_track_mm: v.front_track_mm,
        rear_track_mm: v.rear_track_mm,
        drag_coefficient: v.drag_coefficient,
        trunk_liters: v.trunk_liters,
        fuel_tank_liters: v.fuel_tank_liters,
        turning_circle_m: v.turning_circle_m,
        front_suspension: v.front_suspension,
        rear_suspension: v.rear_suspension,
        front_brakes: v.front_brakes,
        rear_brakes: v.rear_brakes,
        steering_type: v.steering_type,
        power_steering: v.power_steering,
        tire_size: v.tire_size,
        wheel_rim_size: v.wheel_rim_size,
        assisting_systems: v.assisting_systems,
        seats: v.seats,
        doors: v.doors,
        source_url: v.source_url,
      });

      upserted++;
      console.log(`  ✓ ${v.brand} ${v.model} ${v.modification}`);
    } catch (err) {
      errors++;
      console.error(`  ✗ ${v.brand} ${v.model}: ${(err as Error).message.slice(0, 100)}`);
    }
  }

  const totalKe = await db.select().from(knowledgeEntry);
  const makes = await db.select().from(gvoMake);
  const models = await db.select().from(gvoModel);
  console.log(`\n=== Summary ===`);
  console.log(`${upserted} upserted, ${errors} errors`);
  console.log(`DB: ${makes.length} makes, ${models.length} models, ${totalKe.length} knowledge entries`);
}

main().catch(console.error);
