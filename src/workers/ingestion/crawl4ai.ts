/**
 * Crawl4AI Enrichment Pipeline
 *
 * Crawls ev-database.org and auto-data.net via Crawl4AI,
 * matches results to existing GVO trims, and upserts specs
 * into knowledgeEntry.specs JSONB.
 *
 * Constitution compliance:
 *   - Managed APIs only (Crawl4AI) — §X.2
 *   - All DB traffic through Drizzle+Hyperdrive — §X.2
 *   - No runtime LLM calls — §X.4 (Crawl4AI is offline ETL)
 */

import { db } from "../../lib/db";
import {
  gvoDomain,
  gvoCategory,
  gvoMake,
  gvoModel,
  gvoTrim,
  knowledgeEntry,
} from "../../lib/db/schema";
import { eq, and, ilike } from "drizzle-orm";
import { crawlEvDatabase, type EvSpecs } from "../../lib/data/ev-database";
import { crawlAutoData, type AutoDataSpecs } from "../../lib/data/auto-data";

// ── Types ───────────────────────────────────────────────────────────

export interface EnrichmentResult {
  evDatabaseVehicles: number;
  autoDataVehicles: number;
  knowledgeEntriesUpserted: number;
  trimsCreated: number;
  errors: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/**
 * Fuzzy-match a brand name against existing GVO makes.
 * Handles common variations: "Mercedes-Benz" vs "Mercedes Benz",
 * "BMW" vs "BMW", "Tesla" vs "Tesla", etc.
 */
async function findMake(brand: string): Promise<{ id: string; categoryId: string } | null> {
  const s = slug(brand);

  // Exact slug match first
  const exact = await db.select({
    id: gvoMake.id,
    categoryId: gvoMake.categoryId,
  }).from(gvoMake).where(eq(gvoMake.slug, s)).limit(1);

  if (exact.length > 0) return exact[0];

  // Fuzzy match: ilike on name
  const fuzzy = await db.select({
    id: gvoMake.id,
    categoryId: gvoMake.categoryId,
  }).from(gvoMake).where(ilike(gvoMake.name, `%${brand}%`)).limit(1);

  if (fuzzy.length > 0) return fuzzy[0];

  return null;
}

/**
 * Find or create a model under a make.
 */
async function findOrCreateModel(
  makeId: string,
  modelName: string,
  firstYear?: number,
  lastYear?: number,
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
    firstModelYear: firstYear ?? null,
    lastModelYear: lastYear ?? null,
  }).returning();

  return row.id;
}

/**
 * Find or create a trim under a model.
 */
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

/**
 * Upsert knowledge entry specs for a trim.
 * Merges with existing specs if present.
 */
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
      .set({
        specs: mergedSpecs,
        computedAt: new Date(),
      })
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

async function enrichFromEvDatabase(
  vehicles: EvSpecs[],
): Promise<{ upserted: number; created: number; errors: string[] }> {
  let upserted = 0;
  let created = 0;
  const errors: string[] = [];

  // Ensure EV domain exists
  const evDomainSlug = slug("ev");
  let evDomain = await db.select().from(gvoDomain).where(eq(gvoDomain.slug, evDomainSlug)).limit(1);
  if (evDomain.length === 0) {
    const [row] = await db.insert(gvoDomain).values({ name: "ev", slug: evDomainSlug }).returning();
    evDomain = [row];
  }

  // Ensure EV category exists
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
      // Try to find existing make first (might be under "car" domain)
      let makeInfo = await findMake(v.brand);

      // If not found, create under EV category
      if (!makeInfo) {
        const s = slug(v.brand);
        const existingMake = await db.select({ id: gvoMake.id, categoryId: gvoMake.categoryId })
          .from(gvoMake)
          .where(eq(gvoMake.slug, s))
          .limit(1);

        if (existingMake.length > 0) {
          makeInfo = existingMake[0];
        } else {
          const [row] = await db.insert(gvoMake).values({
            categoryId: evCategory[0].id,
            name: v.brand,
            slug: s,
            origin: "Global",
          }).returning();
          makeInfo = { id: row.id, categoryId: evCategory[0].id };
        }
      }

      if (!makeInfo) {
        errors.push(`${v.brand}: make not found in GVO`);
        continue;
      }

      const modelId = await findOrCreateModel(
        makeInfo.id,
        v.model,
        v.source_url.includes("ev-database.org") ? undefined : undefined,
      );

      // Create trim with engine spec
      const engineSpec = [
        v.battery_nominal_kwh ? `${v.battery_nominal_kwh} kWh` : null,
        v.power_kw ? `${v.power_kw} kW` : null,
      ].filter(Boolean).join(", ");

      const trimId = await findOrCreateTrim(
        modelId,
        "Standard", // ev-database.org doesn't differentiate trims
        engineSpec || undefined,
        "Automatic", // EVs are single-speed
      );

      // Upsert knowledge specs — full 60+ field capture
      await upsertKnowledgeSpecs(trimId, {
        // Battery
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
        // Range & Efficiency
        range_km: v.range_km,
        efficiency_wh_per_km: v.efficiency_wh_per_km,
        real_range_city_cold: v.real_range_city_cold,
        real_range_highway_cold: v.real_range_highway_cold,
        real_range_combined_cold: v.real_range_combined_cold,
        real_range_city_mild: v.real_range_city_mild,
        real_range_highway_mild: v.real_range_highway_mild,
        real_range_combined_mild: v.real_range_combined_mild,
        // WLTP
        wltp_range_km: v.wltp_range_km,
        wltp_consumption: v.wltp_consumption,
        wltp_fuel_equivalent: v.wltp_fuel_equivalent,
        // AC Charging
        ac_charge_port: v.ac_charge_port,
        ac_port_location: v.ac_port_location,
        ac_charge_power_kw: v.ac_charge_power_kw,
        ac_charge_time: v.ac_charge_time,
        // DC Charging
        dc_charge_port: v.dc_charge_port,
        dc_port_location: v.dc_port_location,
        dc_charge_max_kw: v.dc_charge_max_kw,
        dc_charge_10_80_kw: v.dc_charge_10_80_kw,
        dc_charge_time: v.dc_charge_time,
        // Smart Charging
        autocharge_supported: v.autocharge_supported,
        plug_charge_supported: v.plug_charge_supported,
        preconditioning_possible: v.preconditioning_possible,
        preconditioning_auto_nav: v.preconditioning_auto_nav,
        // Performance
        acceleration_0_100_sec: v.acceleration_0_100_sec,
        top_speed_kmh: v.top_speed_kmh,
        power_kw: v.power_kw,
        power_hp: v.power_hp,
        torque_nm: v.torque_nm,
        drivetrain: v.drivetrain,
        // V2X
        v2l_supported: v.v2l_supported,
        v2l_output_kw: v.v2l_output_kw,
        v2l_exterior_outlets: v.v2l_exterior_outlets,
        v2h_ac_supported: v.v2h_ac_supported,
        v2g_ac_supported: v.v2g_ac_supported,
        // Energy
        co2_emissions: v.co2_emissions,
        fuel_equivalent_l_100km: v.fuel_equivalent_l_100km,
        // Dimensions
        length_mm: v.length_mm,
        width_mm: v.width_mm,
        width_with_mirrors_mm: v.width_with_mirrors_mm,
        height_mm: v.height_mm,
        wheelbase_mm: v.wheelbase_mm,
        curb_weight_kg: v.curb_weight_kg,
        gross_weight_kg: v.gross_weight_kg,
        max_payload_kg: v.max_payload_kg,
        // Cargo
        cargo_liters: v.cargo_liters,
        cargo_max_liters: v.cargo_max_liters,
        frunk_liters: v.frunk_liters,
        roof_load_kg: v.roof_load_kg,
        // Towing
        tow_hitch_possible: v.tow_hitch_possible,
        towing_unbraked_kg: v.towing_unbraked_kg,
        towing_braked_kg: v.towing_braked_kg,
        vertical_load_max_kg: v.vertical_load_max_kg,
        // Safety
        ncap_stars: v.ncap_stars,
        ncap_adult: v.ncap_adult,
        ncap_child: v.ncap_child,
        ncap_pedestrian: v.ncap_pedestrian,
        ncap_assist: v.ncap_assist,
        ncap_year: v.ncap_year,
        // Miscellaneous
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
        // Long Distance
        long_distance_rating: v.long_distance_rating,
        one_stop_range_km: v.one_stop_range_km,
        // Pricing
        price_eur: v.price_eur,
      }, "ev-database.org");

      upserted++;
    } catch (err) {
      errors.push(`${v.brand} ${v.model}: ${(err as Error).message}`);
    }
  }

  return { upserted, created, errors };
}

// ── Auto-Data.net Enrichment ────────────────────────────────────────

async function enrichFromAutoData(
  vehicles: AutoDataSpecs[],
): Promise<{ upserted: number; created: number; errors: string[] }> {
  let upserted = 0;
  let created = 0;
  const errors: string[] = [];

  for (const v of vehicles) {
    try {
      const makeInfo = await findMake(v.brand);
      if (!makeInfo) {
        errors.push(`${v.brand}: make not found in GVO`);
        continue;
      }

      const modelId = await findOrCreateModel(
        makeInfo.id,
        v.model,
        v.year_start ?? undefined,
        v.year_end ?? undefined,
      );

      // Create trim with engine spec
      const engineSpec = [
        v.engine_displacement_cc ? `${v.engine_displacement_cc}cc` : null,
        v.power_hp ? `${v.power_hp}hp` : null,
        v.engine_configuration,
      ].filter(Boolean).join(", ");

      const trimName = v.modification || "Standard";
      const trimId = await findOrCreateTrim(
        modelId,
        trimName,
        engineSpec || undefined,
        v.transmission_type || undefined,
      );

      // Upsert knowledge specs
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
        engine_layout: v.engine_layout,
        fuel_injection: v.fuel_injection,
        engine_systems: v.engine_systems,
        num_valves_per_cylinder: v.num_valves_per_cylinder,
        power_per_litre: v.power_per_litre,
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

      upserted++;
    } catch (err) {
      errors.push(`${v.brand} ${v.model}: ${(err as Error).message}`);
    }
  }

  return { upserted, created, errors };
}

// ── Main Pipeline ───────────────────────────────────────────────────

/**
 * Run the full Crawl4AI enrichment pipeline.
 * Crawls both sources and upserts specs into knowledgeEntry.
 */
export async function runCrawl4AiEnrichment(
  options: {
    evDatabaseUrls?: string[];
    autoDataUrls?: string[];
    skipEvDatabase?: boolean;
    skipAutoData?: boolean;
  } = {},
): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    evDatabaseVehicles: 0,
    autoDataVehicles: 0,
    knowledgeEntriesUpserted: 0,
    trimsCreated: 0,
    errors: [],
  };

  // 1. Crawl ev-database.org
  if (!options.skipEvDatabase) {
    try {
      const urls = options.evDatabaseUrls ?? [];
      const vehicles = await crawlEvDatabase(urls);
      result.evDatabaseVehicles = vehicles.length;

      const evResult = await enrichFromEvDatabase(vehicles);
      result.knowledgeEntriesUpserted += evResult.upserted;
      result.trimsCreated += evResult.created;
      result.errors.push(...evResult.errors);
    } catch (err) {
      result.errors.push(`ev-database.org crawl failed: ${(err as Error).message}`);
    }
  }

  // 2. Crawl auto-data.net
  if (!options.skipAutoData) {
    try {
      const urls = options.autoDataUrls ?? [];
      const vehicles = await crawlAutoData(urls);
      result.autoDataVehicles = vehicles.length;

      const adResult = await enrichFromAutoData(vehicles);
      result.knowledgeEntriesUpserted += adResult.upserted;
      result.trimsCreated += adResult.created;
      result.errors.push(...adResult.errors);
    } catch (err) {
      result.errors.push(`auto-data.net crawl failed: ${(err as Error).message}`);
    }
  }

  return result;
}
