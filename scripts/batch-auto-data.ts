/**
 * Auto-Data.net Batch Crawler — Phase 2
 *
 * Uses Crawl4AI to:
 * 1. Crawl brand listing pages (JS-rendered) to discover individual car URLs
 * 2. Crawl individual car pages for specs
 * 3. Upsert into Neon DB knowledge_entry
 *
 * Covers all popular Nigerian market brands: Toyota, Honda, Hyundai, Kia,
 * Nissan, Mercedes-Benz, BMW, Volkswagen, Lexus, Mazda, Mitsubishi, etc.
 *
 * Usage: DATABASE_URL=... npx tsx scripts/batch-auto-data.ts
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and, ilike } from "drizzle-orm";
import { gvoMake, gvoModel, gvoTrim, knowledgeEntry } from "../src/lib/db/schema";
import { crawlAutoData, type AutoDataSpecs } from "../src/lib/data/auto-data";
import { crawlHtml, type CrawlResult } from "../src/lib/data/crawl4ai";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// ── Popular brands for Nigerian market ───────────────────────────────

const BRAND_PAGES: Record<string, string> = {
  Toyota: "https://www.auto-data.net/en/toyota-brand-171",
  Honda: "https://www.auto-data.net/en/honda-brand-54",
  Hyundai: "https://www.auto-data.net/en/hyundai-brand-57",
  Kia: "https://www.auto-data.net/en/kia-brand-65",
  Nissan: "https://www.auto-data.net/en/nissan-brand-89",
  "Mercedes-Benz": "https://www.auto-data.net/en/mercedes-benz-brand-78",
  BMW: "https://www.auto-data.net/en/bmw-brand-86",
  Volkswagen: "https://www.auto-data.net/en/volkswagen-brand-100",
  Lexus: "https://www.auto-data.net/en/lexus-brand-80",
  Mazda: "https://www.auto-data.net/en/mazda-brand-74",
  Mitsubishi: "https://www.auto-data.net/en/mitsubishi-brand-83",
  Suzuki: "https://www.auto-data.net/en/suzuki-brand-102",
  Ford: "https://www.auto-data.net/en/ford-brand-46",
  Chevrolet: "https://www.auto-data.net/en/chevrolet-brand-156",
  Peugeot: "https://www.auto-data.net/en/peugeot-brand-95",
  Renault: "https://www.auto-data.net/en/renault-brand-97",
  Subaru: "https://www.auto-data.net/en/subaru-brand-99",
  "Land Rover": "https://www.auto-data.net/en/land-rover-brand-71",
  Jeep: "https://www.auto-data.net/en/jeep-brand-59",
  Acura: "https://www.auto-data.net/en/acura-brand-6",
  Infiniti: "https://www.auto-data.net/en/infiniti-brand-56",
};

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

async function upsertKnowledge(trimId: string, specs: Record<string, unknown>, source: string) {
  const existing = await db.select().from(knowledgeEntry)
    .where(eq(knowledgeEntry.trimId, trimId)).limit(1);
  const merged = {
    ...(existing[0]?.specs as Record<string, unknown> ?? {}),
    ...specs,
    _source: source,
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

// ── Discover car URLs from a brand page via Crawl4AI ─────────────────

async function discoverBrandUrls(brandPageUrl: string): Promise<string[]> {
  const results = await crawlHtml({
    urls: [brandPageUrl],
    lightMode: true,
    pageTimeout: 60000,
  });

  if (!results[0]?.success || !results[0].html) return [];

  // Extract all car page URLs from the brand page HTML
  const html = results[0].html;
  const urls = new Set<string>();

  // Pattern: /en/toyota-camry-...-XXXX where XXXX is the car ID
  const regex = /href="(\/en\/[^"]*-[\d]+)"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const path = match[1];
    // Must look like a car page (has a number ID at the end, not a model/brand page)
    if (/-(\d{3,6})$/.test(path) && !path.includes("brand") && !path.includes("model")) {
      urls.add(`https://www.auto-data.net${path}`);
    }
  }

  return [...urls];
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Auto-Data.net Batch Crawler ===\n");

  let totalUpserted = 0;
  let totalErrors = 0;
  const brandsProcessed: string[] = [];

  for (const [brand, brandUrl] of Object.entries(BRAND_PAGES)) {
    console.log(`\n--- ${brand} ---`);

    // 1. Discover car URLs from brand page
    const carUrls = await discoverBrandUrls(brandUrl);
    console.log(`  Found ${carUrls.length} car URLs`);

    if (carUrls.length === 0) {
      console.log(`  ⚠ No URLs found, skipping`);
      continue;
    }

    // 2. Take top 5 per brand to avoid overload
    const toCrawl = carUrls.slice(0, 5);

    // 3. Crawl car pages
    const vehicles = await crawlAutoData(toCrawl);
    console.log(`  Parsed ${vehicles.length} vehicles`);

    // 4. Upsert into DB
    for (const v of vehicles) {
      try {
        let makeInfo = await findMake(v.brand);
        if (!makeInfo) {
          // Find "car" category to create under
          const carCat = await sql`SELECT id FROM gvo_category WHERE slug = 'car' LIMIT 1`;
          if (carCat.length === 0) {
            // Fallback: use first category
            const anyCat = await sql`SELECT id FROM gvo_category LIMIT 1`;
            if (anyCat.length === 0) { console.log("  ⚠ No categories"); continue; }
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
        }, "auto-data.net");

        totalUpserted++;
        console.log(`    ✓ ${v.brand} ${v.model} ${v.modification}`);
      } catch (err) {
        totalErrors++;
        console.error(`    ✗ ${v.brand} ${v.model}: ${(err as Error).message.slice(0, 100)}`);
      }
    }

    brandsProcessed.push(brand);

    // Polite delay between brands
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Final DB state
  const totalKe = await db.select().from(knowledgeEntry);
  const makes = await db.select().from(gvoMake);
  const models = await db.select().from(gvoModel);

  console.log(`\n=== Summary ===`);
  console.log(`Brands processed: ${brandsProcessed.join(", ")}`);
  console.log(`This run: ${totalUpserted} upserted, ${totalErrors} errors`);
  console.log(`DB: ${makes.length} makes, ${models.length} models, ${totalKe.length} knowledge entries`);
}

main().catch(console.error);
