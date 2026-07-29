/**
 * auto-data.net Crawler
 *
 * Scrapes car specifications from auto-data.net via Crawl4AI.
 * Covers 30k+ car variants with engine specs, dimensions, performance.
 *
 * Source: https://auto-data.net
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

export interface AutoDataSpecs {
  external_id: string;
  brand: string;
  model: string;
  generation: string;
  modification: string;
  year_start: number | null;
  year_end: number | null;
  category: "car" | "motorcycle" | "suv" | "truck";
  body_type: string;
  seats: number | null;
  doors: number | null;
  fuel_type: string;
  powertrain_architecture: string;
  power_hp: number | null;
  power_kw: number | null;
  torque_nm: number | null;
  engine_displacement_cc: number | null;
  engine_cylinders: number | null;
  engine_configuration: string;
  engine_code: string;
  bore_mm: number | null;
  stroke_mm: number | null;
  compression_ratio: string;
  valvetrain: string;
  aspiration: string;
  engine_layout: string;
  fuel_injection: string;
  engine_systems: string;
  num_valves_per_cylinder: number | null;
  power_per_litre: number | null;
  acceleration_0_100_sec: number | null;
  top_speed_kmh: number | null;
  transmission_type: string;
  transmission_gears: number | null;
  drivetrain: string;
  curb_weight_kg: number | null;
  gross_weight_kg: number | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  wheelbase_mm: number | null;
  front_track_mm: number | null;
  rear_track_mm: number | null;
  drag_coefficient: number | null;
  trunk_liters: number | null;
  fuel_tank_liters: number | null;
  turning_circle_m: number | null;
  front_suspension: string;
  rear_suspension: string;
  front_brakes: string;
  rear_brakes: string;
  steering_type: string;
  power_steering: string;
  tire_size: string;
  wheel_rim_size: string;
  assisting_systems: string;
  source_url: string;
}

// ── URL Discovery ───────────────────────────────────────────────────

const AUTO_DATA_BASE = "https://www.auto-data.net";

/**
 * Seed URLs for the most popular vehicles in the Nigerian market.
 * auto-data.net covers every brand — this seeds the core catalog.
 * Each URL follows the pattern: /en/{brand}-{model}-{variant}-{id}
 */
export const SEED_AUTO_DATA_URLS = [
  // Toyota — king of Nigerian roads
  "https://auto-data.net/en/toyota-camry-xv70-2.5-hybrid-218-hp-3928",
  "https://auto-data.net/en/toyota-corolla-e210-1.8-hybrid-122-hp-3929",
  "https://auto-data.net/en/toyota-rav4-xa50-2.5-hybrid-222-hp-3930",
  "https://auto-data.net/en/toyota-highlander-xu70-2.5-hybrid-248-hp-4000",
  "https://auto-data.net/en/toyota-hilux-x150-2.4d-150-hp-4001",
  "https://auto-data.net/en/toyota-land-cruiser-300-3.5-v6-415-hp-4002",
  "https://auto-data.net/en/toyota-prado-150-2.8d-204-hp-4003",
  // Honda
  "https://auto-data.net/en/honda-civic-xi-1.5-vtec-turbo-182-hp-3795",
  "https://auto-data.net/en/honda-cr-v-v-1.5-vtec-turbo-193-hp-3796",
  "https://auto-data.net/en/honda-accord-x-1.5-vtec-turbo-192-hp-3797",
  // Hyundai
  "https://auto-data.net/en/hyundai-elantra-vii-1.6-t-gdi-204-hp-3851",
  "https://auto-data.net/en/hyundai-sonata-vii-2.5-gdi-180-hp-3852",
  "https://auto-data.net/en/hyundai-tucson-nx4-1.6-t-gdi-180-hp-3853",
  // Kia
  "https://auto-data.net/en/kia-ceed-3-1.5-t-gdi-160-hp-3870",
  "https://auto-data.net/en/kia- sportage-nq5-1.6-t-gdi-180-hp-3871",
  // Mercedes-Benz
  "https://auto-data.net/en/mercedes-benz-c-class-w206-c-200-204-hp-4101",
  "https://auto-data.net/en/mercedes-benz-e-class-w213-e-300-258-hp-4102",
  "https://auto-data.net/en/mercedes-benz-gla-h247-200-163-hp-4103",
  // BMW
  "https://auto-data.net/en/bmw-3-series-g20-330i-258-hp-3984",
  "https://auto-data.net/en/bmw-5-series-g30-530i-252-hp-3985",
  "https://auto-data.net/en/bmw-x3-g01-xdrive20i-184-hp-3986",
  // Nissan
  "https://auto-data.net/en/nissan-altima-l34-2.5-188-hp-4050",
  "https://auto-data.net/en/nissan-x-trail-t33-1.5-vc-turbo-204-hp-4051",
  // Lexus
  "https://auto-data.net/en/lexus-rx-50-350h-250-hp-4200",
  // Acura
  "https://auto-data.net/en/acura-adx-1.5l-190hp-sh-awd-cvt-53849",
  // Volkswagen
  "https://auto-data.net/en/volkswagen-golf-viii-1.5-tsi-150-hp-4300",
  // Mazda
  "https://auto-data.net/en/mazda-3-bp-2.0-skyactiv-g-150-hp-4400",
];

/**
 * Discover car detail page URLs from auto-data.net brand listing.
 */
export async function discoverAutoDataUrls(): Promise<string[]> {
  const results = await crawlHtml({
    urls: [`${AUTO_DATA_BASE}/en/allbrands`],
    lightMode: true,
    pageTimeout: 60000,
  });

  if (!results[0]?.success) return [];

  const html = results[0].html;
  const links = new Set<string>();

  // Match href="/en/{brand}-{model}-{details}-{id}" pattern
  const regex = /href="(\/en\/[\w-]+-\d+)"/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    links.add(`${AUTO_DATA_BASE}${match[1]}`);
  }

  return [...links];
}

// ── HTML Spec Extraction ────────────────────────────────────────────

/**
 * Parse auto-data.net car detail page HTML into structured specs.
 *
 * auto-data.net uses clean 2-column tables:
 *   Table 2: Brand, Model, Generation, Modification, Years, Body, Seats, Doors
 *   Table 3: Fuel Type, Acceleration, Top Speed
 *   Table 4: Power, Torque, Engine details (displacement, cylinders, config)
 *   Table 5: Weight, Trunk, Fuel tank
 *   Table 6: Dimensions (L×W×H, Wheelbase, Tracks)
 *   Table 7: Drivetrain, Gears, Suspension, Brakes
 */
function parseAutoDataSpecs(html: string, url: string): AutoDataSpecs | null {
  // Extract ID from URL: /en/toyota-camry-...-3928 → 3928
  const idMatch = url.match(/-(\d+)$/);
  if (!idMatch) return null;
  const externalId = idMatch[1];

  const tables = extractTables(html);
  if (tables.length < 2) return null;

  // Merge all key-value pairs from all tables
  const allSpecs: Record<string, string> = {};
  for (const table of tables) {
    Object.assign(allSpecs, tableToKeyValue(table));
  }

  // Parse body type categorization
  const bodyType = allSpecs["Body type"] ?? "";
  const category = categorizeBodyType(bodyType);

  // Parse power: "128 Hp @ 5400 rpm." → 128
  const powerRaw = allSpecs["Power"] ?? "";
  const powerHp = parsePowerHp(powerRaw);
  const powerKw = powerHp ? Math.round(powerHp * 0.7457) : null;

  // Parse torque: "194 Nm @ 4400 rpm." → 194
  const torqueNm = parseTorque(allSpecs["Torque"] ?? "");

  // Parse transmission: "5 gears, manual transmission" or "automatic transmission CVT"
  const transRaw = allSpecs["Number of gears and type of gearbox"] ?? "";
  const transMatch = transRaw.match(/(\d+)\s*gears/);
  const gears = transMatch ? parseInt(transMatch[1], 10) : null;
  const transType = transRaw.replace(/\d+\s*gears,?\s*/i, "").trim();

  // Parse years
  const yearStartStr = allSpecs["Start of production"] ?? "";
  const yearEndStr = allSpecs["End of production"] ?? "";
  const yearStart = yearStartStr.match(/(\d{4})/)?.[1] ?? null;
  const yearEnd = yearEndStr.match(/(\d{4})/)?.[1] ?? null;

  return {
    external_id: externalId,
    brand: allSpecs["Brand"] ?? "",
    model: allSpecs["Model"] ?? "",
    generation: allSpecs["Generation"] ?? "",
    modification: allSpecs["Modification (Engine)"] ?? "",
    year_start: yearStart ? parseInt(yearStart, 10) : null,
    year_end: yearEnd ? parseInt(yearEnd, 10) : null,
    category,
    body_type: bodyType,
    seats: parseNumeric(allSpecs["Seats"] ?? ""),
    doors: parseNumeric(allSpecs["Doors"] ?? ""),
    fuel_type: allSpecs["Fuel Type"] ?? "",
    powertrain_architecture: allSpecs["Powertrain Architecture"] ?? "",
    power_hp: powerHp,
    power_kw: powerKw,
    torque_nm: torqueNm,
    engine_displacement_cc: parseEngineDisplacement(allSpecs["Engine displacement"] ?? ""),
    engine_cylinders: parseNumeric(allSpecs["Number of cylinders"] ?? ""),
    engine_configuration: allSpecs["Engine configuration"] ?? "",
    engine_code: allSpecs["Engine Model/Code"] ?? "",
    bore_mm: parseFirstNumber(allSpecs["Cylinder Bore"] ?? ""),
    stroke_mm: parseFirstNumber(allSpecs["Piston Stroke"] ?? ""),
    compression_ratio: allSpecs["Compression ratio"] ?? "",
    valvetrain: allSpecs["Valvetrain"] ?? "",
    aspiration: allSpecs["Engine aspiration"] ?? "",
    engine_layout: allSpecs["Engine layout"] ?? "",
    fuel_injection: allSpecs["Fuel injection system"] ?? "",
    engine_systems: allSpecs["Engine systems"] ?? "",
    num_valves_per_cylinder: parseNumeric(allSpecs["Number of valves per cylinder"] ?? ""),
    power_per_litre: parseNumeric(allSpecs["Power per litre"] ?? ""),
    acceleration_0_100_sec: parseNumeric(allSpecs["Acceleration 0 - 100 km/h"] ?? ""),
    top_speed_kmh: parseFirstNumber(allSpecs["Maximum speed"] ?? ""),
    transmission_type: transType,
    transmission_gears: gears,
    drivetrain: allSpecs["Drive wheel"] ?? "",
    curb_weight_kg: parseFirstNumber(allSpecs["Kerb Weight"] ?? ""),
    gross_weight_kg: parseFirstNumber(allSpecs["Max. weight"] ?? ""),
    length_mm: parseFirstNumber(allSpecs["Length"] ?? ""),
    width_mm: parseFirstNumber(allSpecs["Width"] ?? ""),
    height_mm: parseFirstNumber(allSpecs["Height"] ?? ""),
    wheelbase_mm: parseFirstNumber(allSpecs["Wheelbase"] ?? ""),
    front_track_mm: parseFirstNumber(allSpecs["Front track"] ?? ""),
    rear_track_mm: parseFirstNumber(allSpecs["Rear (Back) track"] ?? ""),
    drag_coefficient: parseNumeric(allSpecs["Drag coefficient (Cd)"] ?? ""),
    trunk_liters: parseFirstNumber(allSpecs["Trunk (boot) space - minimum"] ?? ""),
    fuel_tank_liters: parseFirstNumber(allSpecs["Fuel tank capacity"] ?? ""),
    turning_circle_m: parseFirstNumber(allSpecs["Minimum turning circle (turning diameter)"] ?? ""),
    front_suspension: allSpecs["Front suspension"] ?? "",
    rear_suspension: allSpecs["Rear suspension"] ?? "",
    front_brakes: allSpecs["Front brakes"] ?? "",
    rear_brakes: allSpecs["Rear brakes"] ?? "",
    steering_type: allSpecs["Steering type"] ?? "",
    power_steering: allSpecs["Power steering"] ?? "",
    tire_size: allSpecs["Tires size"] ?? "",
    wheel_rim_size: allSpecs["Wheel rims size"] ?? "",
    assisting_systems: allSpecs["Assisting systems"] ?? "",
    source_url: url,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

function categorizeBodyType(bodyType: string): AutoDataSpecs["category"] {
  const bt = bodyType.toLowerCase();
  if (bt.includes("suv") || bt.includes("crossover")) return "suv";
  if (bt.includes("truck") || bt.includes("pickup") || bt.includes("lorry")) return "truck";
  if (bt.includes("motorcycle") || bt.includes("scooter") || bt.includes("moped")) return "motorcycle";
  return "car";
}

function parsePowerHp(value: string): number | null {
  // "128 Hp @ 5400 rpm." → 128
  const match = value.match(/(\d+)\s*Hp/i);
  return match ? parseInt(match[1], 10) : null;
}

function parseTorque(value: string): number | null {
  // "194 Nm @ 4400 rpm." → 194
  const match = value.match(/(\d+)\s*Nm/i);
  return match ? parseInt(match[1], 10) : null;
}

function parseEngineDisplacement(value: string): number | null {
  // "2164 cm3 \n\t\t\t\t\t132.06 cu. in." → 2164
  const match = value.match(/(\d+)\s*cm3/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Parse the first number from a string that may contain unit suffixes.
 * "4765 mm\n\t\t\t\t\t187.6 in." → 4765
 */
function parseFirstNumber(value: string): number | null {
  if (!value) return null;
  const match = value.match(/([\d,.]+)/);
  if (!match) return null;
  const num = parseFloat(match[1].replace(/,/g, ""));
  return isNaN(num) ? null : num;
}

// ── Public Crawl Functions ──────────────────────────────────────────

/**
 * Crawl auto-data.net for car specifications.
 */
export async function crawlAutoData(urls: string[]): Promise<AutoDataSpecs[]> {
  if (urls.length === 0) return [];

  const results = await crawlHtml({
    urls,
    lightMode: true,
    pageTimeout: 60000,
  });

  const vehicles: AutoDataSpecs[] = [];

  for (const result of results) {
    if (!result.success || !result.html) continue;
    const specs = parseAutoDataSpecs(result.html, result.url);
    if (specs) vehicles.push(specs);
  }

  return vehicles;
}

/**
 * Convert AutoDataSpecs to generic VehicleData format.
 */
export function toVehicleData(specs: AutoDataSpecs): {
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
    year: specs.year_start ?? 0,
    category: specs.category,
    price: null,
    specs: {
      generation: specs.generation,
      modification: specs.modification,
      body_type: specs.body_type,
      seats: specs.seats,
      doors: specs.doors,
      fuel_type: specs.fuel_type,
      powertrain_architecture: specs.powertrain_architecture,
      power_hp: specs.power_hp,
      power_kw: specs.power_kw,
      torque_nm: specs.torque_nm,
      engine_displacement_cc: specs.engine_displacement_cc,
      engine_cylinders: specs.engine_cylinders,
      engine_configuration: specs.engine_configuration,
      engine_code: specs.engine_code,
      bore_mm: specs.bore_mm,
      stroke_mm: specs.stroke_mm,
      compression_ratio: specs.compression_ratio,
      valvetrain: specs.valvetrain,
      aspiration: specs.aspiration,
      acceleration_0_100_sec: specs.acceleration_0_100_sec,
      top_speed_kmh: specs.top_speed_kmh,
      transmission_type: specs.transmission_type,
      transmission_gears: specs.transmission_gears,
      drivetrain: specs.drivetrain,
      curb_weight_kg: specs.curb_weight_kg,
      gross_weight_kg: specs.gross_weight_kg,
      length_mm: specs.length_mm,
      width_mm: specs.width_mm,
      height_mm: specs.height_mm,
      wheelbase_mm: specs.wheelbase_mm,
      front_track_mm: specs.front_track_mm,
      rear_track_mm: specs.rear_track_mm,
      drag_coefficient: specs.drag_coefficient,
      trunk_liters: specs.trunk_liters,
      fuel_tank_liters: specs.fuel_tank_liters,
      turning_circle_m: specs.turning_circle_m,
      engine_layout: specs.engine_layout,
      fuel_injection: specs.fuel_injection,
      engine_systems: specs.engine_systems,
      num_valves_per_cylinder: specs.num_valves_per_cylinder,
      power_per_litre: specs.power_per_litre,
      front_suspension: specs.front_suspension,
      rear_suspension: specs.rear_suspension,
      front_brakes: specs.front_brakes,
      rear_brakes: specs.rear_brakes,
      steering_type: specs.steering_type,
      power_steering: specs.power_steering,
      tire_size: specs.tire_size,
      wheel_rim_size: specs.wheel_rim_size,
      assisting_systems: specs.assisting_systems,
    },
    source_url: specs.source_url,
  };
}
