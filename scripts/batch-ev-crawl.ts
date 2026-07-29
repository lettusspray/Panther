/**
 * Batch crawl 50 popular EVs from ev-database.org
 * Direct Neon connection, bypasses Hyperdrive for one-time seeding.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and, ilike } from "drizzle-orm";
import { gvoMake, gvoModel, gvoTrim, knowledgeEntry } from "../src/lib/db/schema";
import { crawlEvDatabase } from "../src/lib/data/ev-database";
import { readFileSync } from "fs";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

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

async function findOrCreateTrim(modelId: string, trimName: string, engine?: string) {
  const s = slug(trimName);
  const existing = await db.select({ id: gvoTrim.id }).from(gvoTrim)
    .where(and(eq(gvoTrim.slug, s), eq(gvoTrim.modelId, modelId))).limit(1);
  if (existing.length > 0) return existing[0].id;
  const [row] = await db.insert(gvoTrim).values({
    modelId, name: trimName, slug: s, engine: engine ?? null, transmission: "Automatic",
  }).returning();
  return row.id;
}

async function upsertKnowledge(trimId: string, specs: Record<string, unknown>) {
  const existing = await db.select().from(knowledgeEntry)
    .where(eq(knowledgeEntry.trimId, trimId)).limit(1);
  const merged = {
    ...(existing[0]?.specs as Record<string, unknown> ?? {}),
    ...specs,
    _source: "ev-database.org",
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
  const urls = readFileSync("/tmp/ev_batch.txt", "utf8").trim().split("\n");
  console.log("Crawling", urls.length, "EVs...");

  const vehicles = await crawlEvDatabase(urls);
  console.log("Parsed", vehicles.length, "vehicles");

  let upserted = 0;
  let newMakes = 0;

  for (const v of vehicles) {
    try {
      let makeInfo = await findMake(v.brand);
      if (!makeInfo) {
        const evCat = await sql`SELECT id FROM gvo_category WHERE slug = 'electric' LIMIT 1`;
        if (evCat.length === 0) { console.log("  ⚠ No EV category"); continue; }
        const [row] = await db.insert(gvoMake).values({
          categoryId: evCat[0].id, name: v.brand, slug: slug(v.brand), origin: "Global",
        }).returning();
        makeInfo = { id: row.id, categoryId: evCat[0].id };
        newMakes++;
        console.log("  + Created make:", v.brand);
      }

      const modelId = await findOrCreateModel(makeInfo.id, v.model);
      const engineStr = [
        v.battery_nominal_kwh ? `${v.battery_nominal_kwh}kWh` : null,
        v.power_kw ? `${v.power_kw}kW` : null,
      ].filter(Boolean).join(", ");
      const trimId = await findOrCreateTrim(modelId, "Standard", engineStr || undefined);

      await upsertKnowledge(trimId, {
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
        real_range_combined_cold: v.real_range_combined_cold,
        real_range_combined_mild: v.real_range_combined_mild,
        wltp_range_km: v.wltp_range_km,
        wltp_consumption: v.wltp_consumption,
        ac_charge_port: v.ac_charge_port,
        ac_charge_power_kw: v.ac_charge_power_kw,
        ac_charge_time: v.ac_charge_time,
        dc_charge_port: v.dc_charge_port,
        dc_charge_max_kw: v.dc_charge_max_kw,
        dc_charge_10_80_kw: v.dc_charge_10_80_kw,
        dc_charge_time: v.dc_charge_time,
        autocharge_supported: v.autocharge_supported,
        plug_charge_supported: v.plug_charge_supported,
        preconditioning_possible: v.preconditioning_possible,
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
        length_mm: v.length_mm,
        width_mm: v.width_mm,
        height_mm: v.height_mm,
        wheelbase_mm: v.wheelbase_mm,
        curb_weight_kg: v.curb_weight_kg,
        gross_weight_kg: v.gross_weight_kg,
        cargo_liters: v.cargo_liters,
        frunk_liters: v.frunk_liters,
        tow_hitch_possible: v.tow_hitch_possible,
        towing_braked_kg: v.towing_braked_kg,
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
        heat_pump: v.heat_pump,
        hp_standard: v.hp_standard,
        long_distance_rating: v.long_distance_rating,
        one_stop_range_km: v.one_stop_range_km,
        price_eur: v.price_eur,
      });

      upserted++;
      console.log("  ✓", v.brand, v.model);
    } catch (err) {
      console.error("  ✗", v.brand, v.model, (err as Error).message);
    }
  }

  console.log(`\nDone: ${upserted} upserted, ${newMakes} new makes`);

  const total = await db.select().from(knowledgeEntry);
  const makes = await db.select().from(gvoMake);
  const models = await db.select().from(gvoModel);
  console.log(`DB: ${makes.length} makes, ${models.length} models, ${total.length} knowledge entries`);
}

main().catch(console.error);
