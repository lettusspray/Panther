/**
 * Auto-Data.net Curated Batch Crawler
 *
 * Crawls a curated list of popular Nigerian market vehicle spec pages.
 * Uses Crawl4AI for JS-rendered pages, direct fetch for SSR pages.
 * Two-phase: brand pages for discovery, then car pages for specs.
 *
 * Usage: DATABASE_URL=... npx tsx scripts/curated-auto-data.ts
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

// ── Curated URL list: popular vehicles in Nigerian import market ─────

const CURATED_URLS = [
  // Toyota — dominant in Nigeria
  "https://www.auto-data.net/en/toyota-camry-xv70-2.5-hybrid-218-hp-3928",
  "https://www.auto-data.net/en/toyota-corolla-e210-1.8-hybrid-122-hp-3929",
  "https://www.auto-data.net/en/toyota-rav4-xa50-2.5-hybrid-218-hp-3889",
  "https://www.auto-data.net/en/toyota-highlander-xu70-2.4-turbo-269-hp-4201",
  "https://www.auto-data.net/en/toyota-prado-j250-2.8-diesel-204-hp-51340",
  "https://www.auto-data.net/en/toyota-land-cruiser-300-3.5-v6-twin-turbo-415-hp-43327",
  "https://www.auto-data.net/en/toyota-avalon-xv70-2.5-hybrid-215-hp-3950",
  "https://www.auto-data.net/en/toyota-hilux-revo-2.8-diesel-204-hp-41532",
  "https://www.auto-data.net/en/toyota-yaris-cross-xa15-1.5-hybrid-116-hp-43337",
  "https://www.auto-data.net/en/toyota-sienna-xm40-2.5-hybrid-245-hp-45035",
  "https://www.auto-data.net/en/toyota-tacoma-n400-3.5-v6-278-hp-44296",
  "https://www.auto-data.net/en/toyota-crown-crossover-2.4-turbo-hybrid-340-hp-48344",

  // Honda
  "https://www.auto-data.net/en/honda-civic-xi-1.5-vtec-turbo-182-hp-3795",
  "https://www.auto-data.net/en/honda-cr-v-rx5-1.5-vtec-turbo-193-hp-3832",
  "https://www.auto-data.net/en/honda-accord-x11-1.5-vtec-turbo-194-hp-3900",
  "https://www.auto-data.net/en/honda-hr-v-rf3-1.5-i-vtec-131-hp-3943",
  "https://www.auto-data.net/en/honda-freed-gp5-1.5-i-vtec-131-hp-3834",

  // Hyundai
  "https://www.auto-data.net/en/hyundai-elantra-vii-1.6-t-gdi-204-hp-3851",
  "https://www.auto-data.net/en/hyundai-tucson-nx4-1.6-t-gdi-180-hp-4161",
  "https://www.auto-data.net/en/hyundai-santa-fe-mx5-1.6-t-gdi-hybrid-230-hp-4366",
  "https://www.auto-data.net/en/hyundai-ioniq-5-77.4-kwh-325-hp-44361",
  "https://www.auto-data.net/en/hyundai-kona-iii-1.0-t-gdi-120-hp-43285",

  // Kia
  "https://www.auto-data.net/en/kia-ceed-iii-1.5-t-gdi-160-hp-4221",
  "https://www.auto-data.net/en/kia-sportage-nq5-1.6-t-gdi-180-hp-4185",
  "https://www.auto-data.net/en/kia-sonet-1.0-t-gdi-120-hp-43195",
  "https://www.auto-data.net/en/kia-seltos-1.6-t-gdi-175-hp-4107",
  "https://www.auto-data.net/en/kia-ev6-77.4-kwh-325-hp-44362",

  // Mercedes-Benz
  "https://www.auto-data.net/en/mercedes-benz-c-class-w206-c-200-204-hp-4101",
  "https://www.auto-data.net/en/mercedes-benz-e-class-w214-e-300-258-hp-49026",
  "https://www.auto-data.net/en/mercedes-benz-gla-h247-200-163-hp-3751",
  "https://www.auto-data.net/en/mercedes-benz-glc-x254-300-258-hp-47128",
  "https://www.auto-data.net/en/mercedes-benz-gle-w167-450-367-hp-4149",
  "https://www.auto-data.net/en/mercedes-benz-a-class-w177-a-200-163-hp-3850",

  // BMW
  "https://www.auto-data.net/en/bmw-3-series-g20-330i-258-hp-3984",
  "https://www.auto-data.net/en/bmw-5-series-g60-530i-286-hp-51533",
  "https://www.auto-data.net/en/bmw-x3-g01-xdrive30i-252-hp-3971",
  "https://www.auto-data.net/en/bmw-x5-g05-xdrive40i-340-hp-3981",
  "https://www.auto-data.net/en/bmw-x1-u11-xdrive20i-204-hp-51675",

  // Volkswagen
  "https://www.auto-data.net/en/volkswagen-golf-viii-1.5-tsi-150-hp-3916",
  "https://www.auto-data.net/en/volkswagen-tiguan-ii-2.0-tdi-150-hp-3783",
  "https://www.auto-data.net/en/volkswagen-passat-b9-1.5-tsi-150-hp-51059",
  "https://www.auto-data.net/en/volkswagen-teramont-2.0-tsi-220-hp-42726",
  "https://www.auto-data.net/en/volkswagen-id.4-77-kwh-204-hp-44363",

  // Nissan
  "https://www.auto-data.net/en/nissan-altima-l34-2.5-188-hp-4050",
  "https://www.auto-data.net/en/nissan-x-trail-t33-1.5-turbo-204-hp-46727",
  "https://www.auto-data.net/en/nissan-qashqai-j12-1.3-turbo-158-hp-43227",
  "https://www.auto-data.net/en/nissan-kicks-p13-1.6-122-hp-3951",

  // Mazda
  "https://www.auto-data.net/en/mazda-cx-5-kf-2.5-skyactiv-g-194-hp-3874",
  "https://www.auto-data.net/en/mazda-3-bp-2.0-skyactiv-g-150-hp-3961",
  "https://www.auto-data.net/en/mazda-cx-30 dm-2.5-skyactiv-g-186-hp-4200",

  // Mitsubishi
  "https://www.auto-data.net/en/mitsubishi-outlander-iv-2.4-phev-306-hp-4203",
  "https://www.auto-data.net/en/mitsubishi-asx-xb-1.5-turbo-163-hp-43238",
  "https://www.auto-data.net/en/mitsubishi-montero-sport-ii-2.4-diesel-181-hp-4129",

  // Lexus
  "https://www.auto-data.net/en/lexus-nx-450h-2.5-hybrid-309-hp-44663",
  "https://www.auto-data.net/en/lexus-rx-500h-2.4-turbo-hybrid-371-hp-46890",
  "https://www.auto-data.net/en/lexus-es-300h-2.5-hybrid-218-hp-3896",

  // Suzuki
  "https://www.auto-data.net/en/suzuki-vitara-hb-1.4-boosterjet-140-hp-3872",
  "https://www.auto-data.net/en/suzuki-swift-iv-1.2-dualjet-hybrid-83-hp-43236",

  // Ford
  "https://www.auto-data.net/en/ford-escape-iv-1.5-ecoboost-180-hp-3910",
  "https://www.auto-data.net/en/ford-ranger-iv-3.0-v6-turbo-diesel-250-hp-46585",

  // Peugeot
  "https://www.auto-data.net/en/peugeot-208-ii-1.2-puretech-100-hp-4100",
  "https://www.auto-data.net/en/peugeot-3008-iii-1.6-puretech-180-hp-45552",

  // Renault
  "https://www.auto-data.net/en/renault-clio-v-1.0-tce-100-hp-3857",
  "https://www.auto-data.net/en/renault-duster-iii-1.3-tce-150-hp-43261",

  // Subaru
  "https://www.auto-data.net/en/subaru-forester-sk-2.5-boxer-182-hp-4118",

  // BYD
  "https://www.auto-data.net/en/byd-seal-3.8-s-awd-530-hp-46718",
  "https://www.auto-data.net/en/byd-atto-3-60.5-kwh-204-hp-45793",
  "https://www.auto-data.net/en/byd-dolphin-44.9-kwh-95-hp-46716",

  // Tesla
  "https://www.auto-data.net/en/tesla-model-3-60-kwh-208-hp-44364",
  "https://www.auto-data.net/en/tesla-model-y-60-kwh-217-hp-44365",

  // Porsche
  "https://www.auto-data.net/en/porsche-cayenne-e3-3.0-v6-turbo-353-hp-4164",
  "https://www.auto-data.net/en/porsche-macan-ii-2.9-v6-turbo-440-hp-46651",

  // Acura
  "https://www.auto-data.net/en/acura-adx-1.5l-190hp-sh-awd-cvt-53849",
];

// ── Helpers ─────────────────────────────────────────────────────────

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

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Curated Auto-Data.net Crawler ===");
  console.log(`URLs to crawl: ${CURATED_URLS.length}\n`);

  // Crawl in batches of 10
  const BATCH = 10;
  let totalUpserted = 0;
  let totalErrors = 0;
  const skipped: string[] = [];

  for (let i = 0; i < CURATED_URLS.length; i += BATCH) {
    const batch = CURATED_URLS.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;
    const totalBatches = Math.ceil(CURATED_URLS.length / BATCH);
    console.log(`\n--- Batch ${batchNum}/${totalBatches} (${batch.length} URLs) ---`);

    const vehicles = await crawlAutoData(batch);
    console.log(`  Parsed ${vehicles.length}/${batch.length} vehicles`);

    for (const v of vehicles) {
      try {
        let makeInfo = await findMake(v.brand);
        if (!makeInfo) {
          const carCat = await sql`SELECT id FROM gvo_category WHERE slug = 'car' LIMIT 1`;
          if (carCat.length === 0) {
            const anyCat = await sql`SELECT id FROM gvo_category LIMIT 1`;
            if (anyCat.length === 0) continue;
            const [row] = await db.insert(gvoMake).values({
              categoryId: anyCat[0].id, name: v.brand, slug: slug(v.brand), origin: "Global",
            }).returning();
            makeInfo = { id: row.id, categoryId: anyCat[0].id };
          } else {
            const [row] = await db.insert(gvoMake).values({
              categoryId: carCat[0].id, name: v.brand, slug: slug(v.brand), origin: "Global",
            }).returning();
            makeInfo = { id: row.id, categoryId: carCat[0].id };
          }
          console.log(`    + Created make: ${v.brand}`);
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
        },);

        totalUpserted++;
        console.log(`    ✓ ${v.brand} ${v.model} ${v.modification}`);
      } catch (err) {
        totalErrors++;
        skipped.push(`${v.brand} ${v.model}`);
        console.error(`    ✗ ${v.brand} ${v.model}: ${(err as Error).message.slice(0, 100)}`);
      }
    }

    // Polite delay between batches
    if (i + BATCH < CURATED_URLS.length) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // Final DB state
  const totalKe = await db.select().from(knowledgeEntry);
  const makes = await db.select().from(gvoMake);
  const models = await db.select().from(gvoModel);

  console.log(`\n=== Summary ===`);
  console.log(`This run: ${totalUpserted} upserted, ${totalErrors} errors`);
  if (skipped.length > 0) console.log(`Skipped: ${skipped.join(", ")}`);
  console.log(`DB: ${makes.length} makes, ${models.length} models, ${totalKe.length} knowledge entries`);
}

main().catch(console.error);
