/**
 * ev-database.org Crawler
 *
 * Scrapes EV specifications from ev-database.org via Crawl4AI.
 * Covers 400+ electric vehicles with 60+ fields: battery architecture,
 * charging, V2X, performance, WLTP, real-world range, safety, dimensions.
 *
 * Source: https://ev-database.org
 * Method: Crawl4AI (Railway) → raw HTML → table parser
 * Constitution compliance:
 *   - Managed APIs only — Crawl4AI is the managed service (§X.2)
 *   - All DB traffic through Drizzle+Hyperdrive (§X.2)
 */

import {
  crawlHtml,
  extractTables,
  tableToKeyValue,
  parseNumeric,
} from "./crawl4ai";

// ── Types ───────────────────────────────────────────────────────────

export interface EvSpecs {
  external_id: string;
  brand: string;
  model: string;
  category: "ev";

  // Battery
  battery_nominal_kwh: number | null;
  battery_usable_kwh: number | null;
  battery_type: string;
  battery_cells: number | null;
  battery_architecture: string;
  battery_nominal_voltage: string;
  battery_pack_config: string;
  battery_cathode: string;
  battery_form_factor: string;
  battery_name: string;
  battery_warranty_years: number | null;
  battery_warranty_km: number | null;

  // Range & Efficiency
  range_km: number | null;
  efficiency_wh_per_km: number | null;
  real_range_city_cold: number | null;
  real_range_highway_cold: number | null;
  real_range_combined_cold: number | null;
  real_range_city_mild: number | null;
  real_range_highway_mild: number | null;
  real_range_combined_mild: number | null;

  // WLTP
  wltp_range_km: number | null;
  wltp_consumption: number | null;
  wltp_fuel_equivalent: string;

  // Charging — AC
  ac_charge_port: string;
  ac_port_location: string;
  ac_charge_power_kw: number | null;
  ac_charge_time: string;
  ac_charge_speed: string;

  // Charging — DC
  dc_charge_port: string;
  dc_port_location: string;
  dc_charge_max_kw: number | null;
  dc_charge_10_80_kw: number | null;
  dc_charge_time: string;
  dc_charge_speed: string;

  // Charging — Smart
  autocharge_supported: boolean;
  plug_charge_supported: boolean;
  preconditioning_possible: boolean;
  preconditioning_auto_nav: boolean;

  // Performance
  acceleration_0_100_sec: number | null;
  top_speed_kmh: number | null;
  power_kw: number | null;
  power_hp: number | null;
  torque_nm: number | null;
  drivetrain: string;

  // V2X / Bidirectional
  v2l_supported: boolean;
  v2l_output_kw: number | null;
  v2l_exterior_outlets: string;
  v2l_interior_outlets: string;
  v2h_ac_supported: boolean;
  v2h_dc_supported: boolean;
  v2g_ac_supported: boolean;
  v2g_dc_supported: boolean;

  // Energy
  co2_emissions: number | null;
  fuel_equivalent_l_100km: number | null;

  // Dimensions & Weight
  length_mm: number | null;
  width_mm: number | null;
  width_with_mirrors_mm: number | null;
  height_mm: number | null;
  wheelbase_mm: number | null;
  curb_weight_kg: number | null;
  gross_weight_kg: number | null;
  max_payload_kg: number | null;

  // Cargo
  cargo_liters: number | null;
  cargo_max_liters: number | null;
  frunk_liters: number | null;
  roof_load_kg: number | null;

  // Towing
  tow_hitch_possible: boolean;
  towing_unbraked_kg: number | null;
  towing_braked_kg: number | null;
  vertical_load_max_kg: number | null;

  // Safety
  ncap_stars: number | null;
  ncap_adult: number | null;
  ncap_child: number | null;
  ncap_pedestrian: number | null;
  ncap_assist: number | null;
  ncap_year: number | null;

  // Miscellaneous
  seats: number | null;
  isofix_seats: string;
  turning_circle_m: number | null;
  platform: string;
  ev_dedicated_platform: boolean;
  car_body: string;
  segment: string;
  roof_rails: boolean;
  heat_pump: boolean;
  hp_standard: boolean;

  // Long Distance
  long_distance_rating: number | null;
  one_stop_range_km: number | null;

  // Pricing (EUR — reference market)
  price_eur: number | null;

  source_url: string;
}

// ── URL Discovery ───────────────────────────────────────────────────

const EV_DB_BASE = "https://ev-database.org";

/**
 * Discover car detail page URLs from the ev-database.org homepage.
 * Returns up to ~400 URLs (full catalog).
 */
export async function discoverEvUrls(): Promise<string[]> {
  const results = await crawlHtml({
    urls: [`${EV_DB_BASE}/`],
    lightMode: true,
    pageTimeout: 60000,
  });

  if (!results[0]?.success) return [];

  const html = results[0].html;
  const links = new Set<string>();

  const regex = /href="\/car\/(\d+\/[\w-]+)"/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    links.add(`${EV_DB_BASE}/car/${match[1]}`);
  }

  return [...links];
}

// ── HTML Spec Extraction ────────────────────────────────────────────

function parseEvSpecs(html: string, url: string): EvSpecs | null {
  const idMatch = url.match(/\/car\/(\d+)\//);
  if (!idMatch) return null;
  const externalId = idMatch[1];

  const slugMatch = url.match(/\/car\/\d+\/([\w-]+)$/);
  const slug = slugMatch?.[1] ?? "";
  const slugParts = slug.split("-");
  let brand = slugParts[0] ?? "";
  let model = slugParts.slice(1).join(" ");
  brand = brand.replace(/_/g, " ");

  const tables = extractTables(html);
  if (tables.length === 0) return null;

  const allSpecs: Record<string, string> = {};
  for (const table of tables) {
    Object.assign(allSpecs, tableToKeyValue(table));
  }

  // Parse boolean fields
  const parseBool = (val: string): boolean => val.toLowerCase() === "yes";

  // Parse power HP from "230 kW (313 PS)"
  const parsePowerHp = (val: string): number | null => {
    const match = val.match(/\((\d+)\s*PS\)/);
    if (match) return parseInt(match[1], 10);
    const kw = parseNumeric(val);
    return kw ? Math.round(kw * 1.341) : null;
  };

  // Parse price from "€49,990" or "£45,730"
  const parsePrice = (val: string): number | null => {
    if (!val) return null;
    const match = val.match(/[\d,]+/);
    if (!match) return null;
    return parseInt(match[0].replace(/,/g, ""), 10);
  };

  // Extract price — prefer Germany (EUR)
  const priceStr = allSpecs["Germany"] ?? "";
  const priceEur = priceStr.includes("€") ? parsePrice(priceStr) : null;

  // Extract battery warranty
  const warrantyKmStr = allSpecs["Warranty Mileage"] ?? "";
  const warrantyKm = warrantyKmStr.includes("km")
    ? parseNumeric(warrantyKmStr.replace(/,/g, ""))
    : null;

  return {
    external_id: externalId,
    brand,
    model,
    category: "ev",

    // Battery
    battery_nominal_kwh: parseNumeric(
      allSpecs["Nominal Capacity"] ?? allSpecs["Nominal Capacity *"] ?? ""
    ),
    battery_usable_kwh: parseNumeric(
      allSpecs["Useable Capacity*"] ?? allSpecs["Useable Capacity"] ?? ""
    ),
    battery_type: allSpecs["Battery Type"] ?? "",
    battery_cells: parseNumeric(allSpecs["Number of Cells"] ?? ""),
    battery_architecture: allSpecs["Architecture"] ?? "",
    battery_nominal_voltage: allSpecs["Nominal Voltage"] ?? "",
    battery_pack_config: allSpecs["Pack Configuration"] ?? "",
    battery_cathode: allSpecs["Cathode Material"] ?? "",
    battery_form_factor: allSpecs["Form Factor"] ?? "",
    battery_name: allSpecs["Name / Reference"] ?? "",
    battery_warranty_years: parseNumeric(allSpecs["Warranty Period"] ?? ""),
    battery_warranty_km: warrantyKm,

    // Range & Efficiency
    range_km: parseNumeric(allSpecs["Electric Range"] ?? ""),
    efficiency_wh_per_km: parseNumeric(
      allSpecs["Vehicle Consumption"] ?? allSpecs["Combined - Mild Weather"] ?? ""
    ),
    real_range_city_cold: parseNumeric(allSpecs["City - Cold Weather"] ?? ""),
    real_range_highway_cold: parseNumeric(allSpecs["Highway - Cold Weather"] ?? ""),
    real_range_combined_cold: parseNumeric(allSpecs["Combined - Cold Weather"] ?? ""),
    real_range_city_mild: parseNumeric(allSpecs["City - Mild Weather"] ?? ""),
    real_range_highway_mild: parseNumeric(allSpecs["Highway - Mild Weather"] ?? ""),
    real_range_combined_mild: parseNumeric(allSpecs["Combined - Mild Weather"] ?? ""),

    // WLTP
    wltp_range_km: parseNumeric(
      allSpecs["Range"] && !allSpecs["Range"].includes("km/h") ? allSpecs["Range"] : ""
    ),
    wltp_consumption: parseNumeric(allSpecs["Rated Consumption"] ?? ""),
    wltp_fuel_equivalent: allSpecs["Rated Fuel Equivalent"] ?? "",

    // AC Charging
    ac_charge_port: allSpecs["Charge Port"] ?? "",
    ac_port_location: allSpecs["Port Location"] ?? "",
    ac_charge_power_kw: parseNumeric(allSpecs["Charge Power"] ?? ""),
    ac_charge_time: allSpecs["Charge Time (0->480 km)"] ?? allSpecs["Charge Time (0->450 km)"] ?? "",
    ac_charge_speed: allSpecs["Charge Speed"] ?? "",

    // DC Charging
    dc_charge_port: (() => {
      // DC section has its own "Charge Port" — find it after "Fast Charging" heading
      const dcPortMatch = html.match(/Fast Charging[\s\S]*?Charge Port[\s\S]*?<td[^>]*>(.*?)<\/td>/i);
      return dcPortMatch?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "CCS";
    })(),
    dc_port_location: (() => {
      const dcLocMatch = html.match(/Fast Charging[\s\S]*?Port Location[\s\S]*?<td[^>]*>(.*?)<\/td>/i);
      return dcLocMatch?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
    })(),
    dc_charge_max_kw: parseNumeric(allSpecs["Charge Power (max)"] ?? ""),
    dc_charge_10_80_kw: parseNumeric(allSpecs["Charge Power (10-80%)"] ?? ""),
    dc_charge_time: allSpecs["Charge Time (48->384 km)"] ?? allSpecs["Charge Time (45->360 km)"] ?? "",
    dc_charge_speed: (() => {
      const speeds = Object.entries(allSpecs)
        .filter(([k]) => k.startsWith("CCS") || k.startsWith("Supercharger"))
        .map(([, v]) => v);
      return speeds.length > 0 ? speeds[speeds.length - 1] : "";
    })(),

    // Smart Charging
    autocharge_supported: parseBool(allSpecs["Autocharge Supported"] ?? ""),
    plug_charge_supported: parseBool(allSpecs["Plug & Charge Supported"] ?? ""),
    preconditioning_possible: parseBool(allSpecs["Preconditioning Possible"] ?? ""),
    preconditioning_auto_nav: parseBool(allSpecs["Automatically using Navigation"] ?? ""),

    // Performance
    acceleration_0_100_sec: parseNumeric(allSpecs["Acceleration 0 - 100 km/h"] ?? ""),
    top_speed_kmh: parseNumeric(allSpecs["Top Speed"] ?? ""),
    power_kw: parseNumeric(allSpecs["Total Power"] ?? ""),
    power_hp: parsePowerHp(allSpecs["Total Power"] ?? ""),
    torque_nm: parseNumeric(allSpecs["Total Torque"] ?? ""),
    drivetrain: allSpecs["Drive"] ?? "",

    // V2X
    v2l_supported: parseBool(allSpecs["V2L Supported"] ?? ""),
    v2l_output_kw: parseNumeric(allSpecs["Max. Output Power"] ?? ""),
    v2l_exterior_outlets: allSpecs["Exterior Outlet(s)"] ?? "",
    v2l_interior_outlets: allSpecs["Interior Outlet(s)"] ?? "",
    v2h_ac_supported: parseBool(allSpecs["V2H via AC Supported"] ?? ""),
    v2h_dc_supported: parseBool(allSpecs["V2H via DC Supported"] ?? ""),
    v2g_ac_supported: parseBool(allSpecs["V2G via AC Supported"] ?? ""),
    v2g_dc_supported: parseBool(allSpecs["V2G via DC Supported"] ?? ""),

    // Energy
    co2_emissions: parseNumeric(allSpecs["CO2 Emissions"] ?? ""),
    fuel_equivalent_l_100km: parseNumeric(
      allSpecs["Vehicle Fuel Equivalent"] ?? allSpecs["Rated Fuel Equivalent"] ?? ""
    ),

    // Dimensions
    length_mm: parseNumeric(allSpecs["Length"] ?? ""),
    width_mm: parseNumeric(allSpecs["Width"] ?? ""),
    width_with_mirrors_mm: parseNumeric(allSpecs["Width with mirrors"] ?? ""),
    height_mm: parseNumeric(allSpecs["Height"] ?? ""),
    wheelbase_mm: parseNumeric(allSpecs["Wheelbase"] ?? ""),
    curb_weight_kg: parseNumeric(allSpecs["Weight Unladen (EU)"] ?? ""),
    gross_weight_kg: parseNumeric(allSpecs["Gross Vehicle Weight (GVWR)"] ?? ""),
    max_payload_kg: parseNumeric(allSpecs["Max. Payload"] ?? ""),

    // Cargo
    cargo_liters: parseNumeric(allSpecs["Cargo Volume"] ?? ""),
    cargo_max_liters: parseNumeric(allSpecs["Cargo Volume Max"] ?? ""),
    frunk_liters: parseNumeric(allSpecs["Cargo Volume Frunk"] ?? ""),
    roof_load_kg: parseNumeric(allSpecs["Roof Load"] ?? ""),

    // Towing
    tow_hitch_possible: parseBool(allSpecs["Tow Hitch Possible"] ?? ""),
    towing_unbraked_kg: parseNumeric(allSpecs["Towing Weight Unbraked"] ?? ""),
    towing_braked_kg: parseNumeric(allSpecs["Towing Weight Braked"] ?? ""),
    vertical_load_max_kg: parseNumeric(allSpecs["Vertical Load Max"] ?? ""),

    // Safety
    ncap_stars: (() => {
      const starsMatch = html.match(/(\d)\s*(?:out of|\/)\s*5/);
      return starsMatch ? parseInt(starsMatch[1], 10) : null;
    })(),
    ncap_adult: parseNumeric(allSpecs["Adult Occupant"] ?? ""),
    ncap_child: parseNumeric(allSpecs["Child Occupant"] ?? ""),
    ncap_pedestrian: parseNumeric(allSpecs["Vulnerable Road Users"] ?? ""),
    ncap_assist: parseNumeric(allSpecs["Safety Assist"] ?? ""),
    ncap_year: parseNumeric(allSpecs["Rating Year"] ?? ""),

    // Miscellaneous
    seats: parseNumeric(allSpecs["Seats"] ?? "") ?? null,
    isofix_seats: allSpecs["Isofix"] ?? "",
    turning_circle_m: parseNumeric(allSpecs["Turning Circle"] ?? ""),
    platform: allSpecs["Platform"] ?? "",
    ev_dedicated_platform: parseBool(allSpecs["EV Dedicated Platform"] ?? ""),
    car_body: allSpecs["Car Body"] ?? "",
    segment: allSpecs["Segment"] ?? "",
    roof_rails: parseBool(allSpecs["Roof Rails"] ?? ""),
    heat_pump: parseBool(allSpecs["Heat pump (HP)"] ?? ""),
    hp_standard: parseBool(allSpecs["HP Standard Equipment"] ?? ""),

    // Long Distance
    long_distance_rating: (() => {
      const ratingMatch = html.match(/(\d)\s*\/\s*5[\s\S]*?1-Stop Range/i);
      return ratingMatch ? parseInt(ratingMatch[1], 10) : null;
    })(),
    one_stop_range_km: parseNumeric(
      (() => {
        const rangeMatch = html.match(/(\d+)\s*km[\s\S]*?1-Stop Range/i);
        return rangeMatch?.[0] ?? "";
      })()
    ),

    // Pricing
    price_eur: priceEur,

    source_url: url,
  };
}

// ── Public Crawl Functions ──────────────────────────────────────────

/**
 * Crawl ev-database.org for a set of car URLs.
 * Returns parsed EV specs ready for DB upsert.
 */
export async function crawlEvDatabase(urls: string[]): Promise<EvSpecs[]> {
  if (urls.length === 0) return [];

  const results = await crawlHtml({
    urls,
    lightMode: true,
    pageTimeout: 60000,
  });

  const vehicles: EvSpecs[] = [];

  for (const result of results) {
    if (!result.success || !result.html) continue;
    const specs = parseEvSpecs(result.html, result.url);
    if (specs) vehicles.push(specs);
  }

  return vehicles;
}

/**
 * Crawl ev-database.org homepage and discover all car URLs.
 */
export async function crawlEvDatabaseFull(): Promise<EvSpecs[]> {
  const urls = await discoverEvUrls();
  if (urls.length === 0) return [];
  return crawlEvDatabase(urls);
}

/**
 * Convert EvSpecs to a generic VehicleData format for pipeline integration.
 */
export function toVehicleData(specs: EvSpecs): {
  external_id: string;
  brand: string;
  model: string;
  year: number;
  category: string;
  price: string | null;
  specs: Record<string, unknown>;
  source_url: string;
} {
  return {
    external_id: specs.external_id,
    brand: specs.brand,
    model: specs.model,
    year: 0,
    category: specs.category,
    price: specs.price_eur ? `€${specs.price_eur}` : null,
    specs: {
      battery_nominal_kwh: specs.battery_nominal_kwh,
      battery_usable_kwh: specs.battery_usable_kwh,
      battery_type: specs.battery_type,
      battery_cells: specs.battery_cells,
      battery_architecture: specs.battery_architecture,
      battery_nominal_voltage: specs.battery_nominal_voltage,
      battery_pack_config: specs.battery_pack_config,
      battery_cathode: specs.battery_cathode,
      battery_form_factor: specs.battery_form_factor,
      battery_name: specs.battery_name,
      battery_warranty_years: specs.battery_warranty_years,
      battery_warranty_km: specs.battery_warranty_km,
      range_km: specs.range_km,
      efficiency_wh_per_km: specs.efficiency_wh_per_km,
      real_range_city_cold: specs.real_range_city_cold,
      real_range_highway_cold: specs.real_range_highway_cold,
      real_range_combined_cold: specs.real_range_combined_cold,
      real_range_city_mild: specs.real_range_city_mild,
      real_range_highway_mild: specs.real_range_highway_mild,
      real_range_combined_mild: specs.real_range_combined_mild,
      wltp_range_km: specs.wltp_range_km,
      wltp_consumption: specs.wltp_consumption,
      wltp_fuel_equivalent: specs.wltp_fuel_equivalent,
      ac_charge_port: specs.ac_charge_port,
      ac_port_location: specs.ac_port_location,
      ac_charge_power_kw: specs.ac_charge_power_kw,
      ac_charge_time: specs.ac_charge_time,
      dc_charge_port: specs.dc_charge_port,
      dc_port_location: specs.dc_port_location,
      dc_charge_max_kw: specs.dc_charge_max_kw,
      dc_charge_10_80_kw: specs.dc_charge_10_80_kw,
      dc_charge_time: specs.dc_charge_time,
      autocharge_supported: specs.autocharge_supported,
      plug_charge_supported: specs.plug_charge_supported,
      preconditioning_possible: specs.preconditioning_possible,
      preconditioning_auto_nav: specs.preconditioning_auto_nav,
      acceleration_0_100_sec: specs.acceleration_0_100_sec,
      top_speed_kmh: specs.top_speed_kmh,
      power_kw: specs.power_kw,
      power_hp: specs.power_hp,
      torque_nm: specs.torque_nm,
      drivetrain: specs.drivetrain,
      v2l_supported: specs.v2l_supported,
      v2l_output_kw: specs.v2l_output_kw,
      v2l_exterior_outlets: specs.v2l_exterior_outlets,
      v2h_ac_supported: specs.v2h_ac_supported,
      v2g_ac_supported: specs.v2g_ac_supported,
      co2_emissions: specs.co2_emissions,
      fuel_equivalent_l_100km: specs.fuel_equivalent_l_100km,
      length_mm: specs.length_mm,
      width_mm: specs.width_mm,
      width_with_mirrors_mm: specs.width_with_mirrors_mm,
      height_mm: specs.height_mm,
      wheelbase_mm: specs.wheelbase_mm,
      curb_weight_kg: specs.curb_weight_kg,
      gross_weight_kg: specs.gross_weight_kg,
      max_payload_kg: specs.max_payload_kg,
      cargo_liters: specs.cargo_liters,
      cargo_max_liters: specs.cargo_max_liters,
      frunk_liters: specs.frunk_liters,
      roof_load_kg: specs.roof_load_kg,
      tow_hitch_possible: specs.tow_hitch_possible,
      towing_unbraked_kg: specs.towing_unbraked_kg,
      towing_braked_kg: specs.towing_braked_kg,
      vertical_load_max_kg: specs.vertical_load_max_kg,
      ncap_stars: specs.ncap_stars,
      ncap_adult: specs.ncap_adult,
      ncap_child: specs.ncap_child,
      ncap_pedestrian: specs.ncap_pedestrian,
      ncap_assist: specs.ncap_assist,
      ncap_year: specs.ncap_year,
      seats: specs.seats,
      isofix_seats: specs.isofix_seats,
      turning_circle_m: specs.turning_circle_m,
      platform: specs.platform,
      ev_dedicated_platform: specs.ev_dedicated_platform,
      car_body: specs.car_body,
      segment: specs.segment,
      roof_rails: specs.roof_rails,
      heat_pump: specs.heat_pump,
      hp_standard: specs.hp_standard,
      long_distance_rating: specs.long_distance_rating,
      one_stop_range_km: specs.one_stop_range_km,
      price_eur: specs.price_eur,
    },
    source_url: specs.source_url,
  };
}
