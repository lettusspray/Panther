/**
 * Crawl4AI Enrichment Script — Direct Neon connection
 *
 * Runs the Crawl4AI crawler and upserts specs into knowledgeEntry.
 * Uses @neondatabase/serverless for direct connection (not Hyperdrive).
 * This is a ONE-TIME seeding script — production uses the Worker with Hyperdrive.
 *
 * Usage: DATABASE_URL=... CRAWL4AI_API_URL=... CRAWL4AI_API_KEY=... npx tsx scripts/enrich-crawl4ai.ts
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and, ilike } from "drizzle-orm";
import {
  gvoDomain,
  gvoCategory,
  gvoMake,
  gvoModel,
  gvoTrim,
  knowledgeEntry,
} from "../src/lib/db/schema";
import { crawlEvDatabase, type EvSpecs } from "../src/lib/data/ev-database";
import { crawlAutoData } from "../src/lib/data/auto-data";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

// ── Helpers ─────────────────────────────────────────────────────────

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function findMake(brand: string): Promise<{ id: string; categoryId: string } | null> {
  const s = slug(brand);
  const exact = await db.select({
    id: gvoMake.id,
    categoryId: gvoMake.categoryId,
  }).from(gvoMake).where(eq(gvoMake.slug, s)).limit(1);
  if (exact.length > 0) return exact[0];

  const fuzzy = await db.select({
    id: gvoMake.id,
    categoryId: gvoMake.categoryId,
  }).from(gvoMake).where(ilike(gvoMake.name, `%${brand}%`)).limit(1);
  if (fuzzy.length > 0) return fuzzy[0];

  return null;
}

async function findOrCreateModel(
  makeId: string,
  modelName: string,
): Promise<string> {
  const s = slug(modelName);
  const existing = await db.select({ id: gvoModel.id })
    .from(gvoModel)
    .where(and(eq(gvoModel.slug, s), eq(gvoModel.makeId, makeId)))
    .limit(1);
  if (existing.length > 0) return existing[0].id;

  const [row] = await db.insert(gvoModel).values({
    makeId,
    name: modelName,
    slug: s,
  }).returning();
  return row.id;
}

async function findOrCreateTrim(
  modelId: string,
  trimName: string,
  engine?: string,
  transmission?: string,
): Promise<string> {
  const s = slug(trimName);
  const existing = await db.select({ id: gvoTrim.id })
    .from(gvoTrim)
    .where(and(eq(gvoTrim.slug, s), eq(gvoTrim.modelId, modelId)))
    .limit(1);
  if (existing.length > 0) return existing[0].id;

  const [row] = await db.insert(gvoTrim).values({
    modelId,
    name: trimName,
    slug: s,
    engine: engine ?? null,
    transmission: transmission ?? null,
  }).returning();
  return row.id;
}

async function upsertKnowledgeSpecs(
  trimId: string,
  specs: Record<string, unknown>,
  source: string,
): Promise<void> {
  const existing = await db.select()
    .from(knowledgeEntry)
    .where(eq(knowledgeEntry.trimId, trimId))
    .limit(1);

  const mergedSpecs = {
    ...(existing[0]?.specs as Record<string, unknown> ?? {}),
    ...specs,
    _source: source,
    _lastEnriched: new Date().toISOString(),
  };

  if (existing.length > 0) {
    await db.update(knowledgeEntry)
      .set({ specs: mergedSpecs, computedAt: new Date() })
      .where(eq(knowledgeEntry.trimId, trimId));
  } else {
    await db.insert(knowledgeEntry).values({
      trimId,
      warnings: [],
      specs: mergedSpecs,
    });
  }
}

// ── EV Database Enrichment ──────────────────────────────────────────

async function enrichEvDatabase(): Promise<number> {
  console.log("\n=== ev-database.org ===");

  // Seed URLs — top EVs in the Nigerian/import market
  const urls = [
    "https://ev-database.org/car/3515/BYD-SEAL-825-kWh-RWD-Design",
    "https://ev-database.org/car/3403/Tesla-Model-3-RWD",
    "https://ev-database.org/car/1921/BYD-Atto-3-Extended-Range",
    "https://ev-database.org/car/1565/Hyundai-Ioniq-5-58-kWh-2WD",
    "https://ev-database.org/car/1566/Kia-EV6-58-kWh-2WD",
    "https://ev-database.org/car/1708/MG-MG4-Electric-64-kWh",
    "https://ev-database.org/car/1563/Volkswagen-ID.3-Pro-58-kWh",
    "https://ev-database.org/car/1863/BMW-i4-eDrive40",
  ];

  console.log("Crawling", urls.length, "EV pages...");
  const vehicles = await crawlEvDatabase(urls);
  console.log("Parsed", vehicles.length, "vehicles");

  let upserted = 0;
  let errors = 0;

  // Ensure EV domain/category exist
  const evDomainSlug = slug("ev");
  let evDomain = await db.select().from(gvoDomain).where(eq(gvoDomain.slug, evDomainSlug)).limit(1);
  if (evDomain.length === 0) {
    const [row] = await db.insert(gvoDomain).values({ name: "ev", slug: evDomainSlug }).returning();
    evDomain = [row];
  }

  const evCatSlug = slug("Electric");
  let evCategory = await db.select().from(gvoCategory).where(
    and(eq(gvoCategory.slug, evCatSlug), eq(gvoCategory.domainId, evDomain[0].id)),
  ).limit(1);
  if (evCategory.length === 0) {
    const [row] = await db.insert(gvoCategory).values({
      domainId: evDomain[0].id,
      name: "Electric",
      slug: evCatSlug,
      hsCode: "8703",
      dutyBand: 3,
    }).returning();
    evCategory = [row];
  }

  for (const v of vehicles) {
    try {
      // Find existing make or create under EV category
      let makeInfo = await findMake(v.brand);
      if (!makeInfo) {
        const s = slug(v.brand);
        const [row] = await db.insert(gvoMake).values({
          categoryId: evCategory[0].id,
          name: v.brand,
          slug: s,
          origin: "Global",
        }).returning();
        makeInfo = { id: row.id, categoryId: evCategory[0].id };
        console.log("  Created make:", v.brand);
      }

      const modelId = await findOrCreateModel(makeInfo.id, v.model);
      const engineSpec = [
        v.battery_nominal_kwh ? `${v.battery_nominal_kwh} kWh` : null,
        v.power_kw ? `${v.power_kw} kW` : null,
      ].filter(Boolean).join(", ");

      const trimId = await findOrCreateTrim(modelId, "Standard", engineSpec || undefined, "Automatic");

      await upsertKnowledgeSpecs(trimId, {
        battery_nominal_kwh: v.battery_nominal_kwh,
        battery_usable_kwh: v.battery_usable_kwh,
        battery_type: v.battery_type,
        battery_cells: v.battery_cells,
        battery_architecture: v.battery_architecture,
        battery_nominal_voltage: v.battery_nominal_voltage,
        battery_pack_config: v.battery_pack_config,
        battery_cathode: v.battery_cathode,
        battery_form_factor: v.battery_form_factor,
        battery_name: v.battery_name,
        battery_warranty_years: v.battery_warranty_years,
        battery_warranty_km: v.battery_warranty_km,
        range_km: v.range_km,
        efficiency_wh_per_km: v.efficiency_wh_per_km,
        real_range_city_cold: v.real_range_city_cold,
        real_range_highway_cold: v.real_range_highway_cold,
        real_range_combined_cold: v.real_range_combined_cold,
        real_range_city_mild: v.real_range_city_mild,
        real_range_highway_mild: v.real_range_highway_mild,
        real_range_combined_mild: v.real_range_combined_mild,
        wltp_range_km: v.wltp_range_km,
        wltp_consumption: v.wltp_consumption,
        wltp_fuel_equivalent: v.wltp_fuel_equivalent,
        ac_charge_port: v.ac_charge_port,
        ac_port_location: v.ac_port_location,
        ac_charge_power_kw: v.ac_charge_power_kw,
        ac_charge_time: v.ac_charge_time,
        dc_charge_port: v.dc_charge_port,
        dc_port_location: v.dc_port_location,
        dc_charge_max_kw: v.dc_charge_max_kw,
        dc_charge_10_80_kw: v.dc_charge_10_80_kw,
        dc_charge_time: v.dc_charge_time,
        autocharge_supported: v.autocharge_supported,
        plug_charge_supported: v.plug_charge_supported,
        preconditioning_possible: v.preconditioning_possible,
        preconditioning_auto_nav: v.preconditioning_auto_nav,
        acceleration_0_100_sec: v.acceleration_0_100_sec,
        top_speed_kmh: v.top_speed_kmh,
        power_kw: v.power_kw,
        power_hp: v.power_hp,
        torque_nm: v.torque_nm,
        drivetrain: v.drivetrain,
        v2l_supported: v.v2l_supported,
        v2l_output_kw: v.v2l_output_kw,
        v2l_exterior_outlets: v.v2l_exterior_outlets,
        v2h_ac_supported: v.v2h_ac_supported,
        v2g_ac_supported: v.v2g_ac_supported,
        co2_emissions: v.co2_emissions,
        fuel_equivalent_l_100km: v.fuel_equivalent_l_100km,
        length_mm: v.length_mm,
        width_mm: v.width_mm,
        width_with_mirrors_mm: v.width_with_mirrors_mm,
        height_mm: v.height_mm,
        wheelbase_mm: v.wheelbase_mm,
        curb_weight_kg: v.curb_weight_kg,
        gross_weight_kg: v.gross_weight_kg,
        max_payload_kg: v.max_payload_kg,
        cargo_liters: v.cargo_liters,
        cargo_max_liters: v.cargo_max_liters,
        frunk_liters: v.frunk_liters,
        roof_load_kg: v.roof_load_kg,
        tow_hitch_possible: v.tow_hitch_possible,
        towing_unbraked_kg: v.towing_unbraked_kg,
        towing_braked_kg: v.towing_braked_kg,
        vertical_load_max_kg: v.vertical_load_max_kg,
        ncap_stars: v.ncap_stars,
        ncap_adult: v.ncap_adult,
        ncap_child: v.ncap_child,
        ncap_pedestrian: v.ncap_pedestrian,
        ncap_assist: v.ncap_assist,
        ncap_year: v.ncap_year,
        seats: v.seats,
        isofix_seats: v.isofix_seats,
        turning_circle_m: v.turning_circle_m,
        platform: v.platform,
        ev_dedicated_platform: v.ev_dedicated_platform,
        car_body: v.car_body,
        segment: v.segment,
        roof_rails: v.roof_rails,
        heat_pump: v.heat_pump,
        hp_standard: v.hp_standard,
        long_distance_rating: v.long_distance_rating,
        one_stop_range_km: v.one_stop_range_km,
        price_eur: v.price_eur,
      }, "ev-database.org");

      console.log("  ✓", v.brand, v.model, `(${Object.keys(v).filter(k => v[k as keyof EvSpecs] !== null && v[k as keyof EvSpecs] !== '' && v[k as keyof EvSpecs] !== false).length} fields)`);
      upserted++;
    } catch (err) {
      console.error("  ✗", v.brand, v.model, (err as Error).message);
      errors++;
    }
  }

  console.log(`EV Database: ${upserted} upserted, ${errors} errors`);
  return upserted;
}

// ── Auto-Data.net Enrichment ────────────────────────────────────────

async function enrichAutoData(): Promise<number> {
  console.log("\n=== auto-data.net ===");

  const urls = [
    "https://www.auto-data.net/en/toyota-camry-xv70-2.5-hybrid-218-hp-3928",
    "https://www.auto-data.net/en/toyota-corolla-e210-1.8-hybrid-122-hp-3929",
    "https://www.auto-data.net/en/honda-civic-xi-1.5-vtec-turbo-182-hp-3795",
    "https://www.auto-data.net/en/hyundai-elantra-vii-1.6-t-gdi-204-hp-3851",
    "https://www.auto-data.net/en/mercedes-benz-c-class-w206-c-200-204-hp-4101",
    "https://www.auto-data.net/en/bmw-3-series-g20-330i-258-hp-3984",
    "https://www.auto-data.net/en/nissan-altima-l34-2.5-188-hp-4050",
    "https://www.auto-data.net/en/acura-adx-1.5l-190hp-sh-awd-cvt-53849",
  ];

  console.log("Crawling", urls.length, "auto-data.net pages...");
  const vehicles = await crawlAutoData(urls);
  console.log("Parsed", vehicles.length, "vehicles");

  let upserted = 0;
  let errors = 0;

  for (const v of vehicles) {
    try {
      const makeInfo = await findMake(v.brand);
      if (!makeInfo) {
        console.log("  ⚠ Make not found:", v.brand);
        errors++;
        continue;
      }

      const modelId = await findOrCreateModel(makeInfo.id, v.model);
      const engineSpec = [
        v.engine_displacement_cc ? `${v.engine_displacement_cc}cc` : null,
        v.power_hp ? `${v.power_hp}hp` : null,
        v.engine_configuration,
      ].filter(Boolean).join(", ");

      const trimName = v.modification || "Standard";
      const trimId = await findOrCreateTrim(modelId, trimName, engineSpec || undefined, v.transmission_type || undefined);

      await upsertKnowledgeSpecs(trimId, {
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
      }, "auto-data.net");

      console.log("  ✓", v.brand, v.model, v.modification);
      upserted++;
    } catch (err) {
      console.error("  ✗", v.brand, v.model, (err as Error).message);
      errors++;
    }
  }

  console.log(`Auto-Data: ${upserted} upserted, ${errors} errors`);
  return upserted;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log("Crawl4AI Enrichment — Direct Neon");
  console.log("DB:", process.env.DATABASE_URL?.split("@")[1]?.split("/")[0] ?? "unknown");
  console.log("Crawl4AI:", process.env.CRAWL4AI_API_URL ?? "not set");

  const evCount = await enrichEvDatabase();
  const adCount = await enrichAutoData();

  console.log("\n=== Summary ===");
  console.log("Total knowledge entries upserted:", evCount + adCount);

  // Verify
  const total = await db.select().from(knowledgeEntry);
  console.log("Total entries in DB:", total.length);
}

main().catch(console.error);
