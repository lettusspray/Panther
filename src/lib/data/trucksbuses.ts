/**
 * TrucksBuses.com Crawler — Indian 3-Wheeler Auto Rickshaws
 *
 * Parses spec pages (Cloudflare-protected, SSR HTML) via Crawl4AI.
 * Each model has an overview page (price) + /specifications page (full specs).
 *
 * Data pattern: Every spec renders as 3 text lines:
 *   1. "ModelName SpecLabel" (combined)
 *   2. "SpecLabel"
 *   3. "Value"
 */

import { crawlHtml } from "./crawl4ai";
import fs from "fs";

// ── Types ───────────────────────────────────────────────────────────

export interface TruckBusesSpecs {
  external_id: string;
  brand: string;
  model_name: string;
  vehicle_type: "passenger" | "load";

  // Engine / Motor
  engine_displacement_cc: number | null;
  power_hp: number | null;
  torque_nm: string;
  cylinders: number | null;
  fuel_type: string;
  transmission: string;
  clutch: string;

  // Performance
  gradeability: string;
  top_speed_kmh: number | null;

  // Dimensions
  gvw_kg: number | null;
  payload_kg: number | null;
  wheelbase_mm: number | null;
  ground_clearance_mm: number | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;

  // Body
  seating_capacity: string;
  emission_norms: string;
  fuel_tank_capacity_litres: number | null;
  brakes: string;
  tyres: string;

  // EV-specific (null for ICE)
  battery_voltage: string;
  battery_capacity: string;
  ev_range_km: number | null;
  charging_time: string;

  // Price
  price_inr_lakh: number | null;

  source_url: string;
  overview_url: string;
  specs_url: string;
}

// ── Helpers ─────────────────────────────────────────────────────────

function parseNum(v: string): number | null {
  const m = v.replace(/,/g, "").match(/[\d]+\.?\d*/);
  return m ? parseFloat(m[0]) : null;
}

function cleanLine(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

// ── Parser ──────────────────────────────────────────────────────────

/**
 * Parse the specs HTML page into structured data.
 * The page renders spec values as 3 consecutive text lines:
 *   [0] "ModelName Label"  [1] "Label"  [2] "Value"
 */
function parseSpecsPage(html: string, url: string, overviewPrice: number | null): TruckBusesSpecs | null {
  const slugMatch = url.match(/\/3-wheeler\/(passenger|load)\/([\w-]+?)(?:\/specifications)?$/);
  if (!slugMatch) return null;

  const vehicleType = slugMatch[1] as "passenger" | "load";
  const modelSlug = slugMatch[2];

  // Extract text lines from HTML for model name
  const titleMatch = html.match(/Key Specifications of ([^<\n]+)/i);
  const pageTitle = titleMatch?.[1]?.trim() ?? "";
  let modelName = pageTitle.replace(/\s*(Auto Rickshaw|3 Wheeler|Three Wheeler).*$/i, "").trim();

  // Extract brand from page title
  let brand = modelSlug.split("-")[0] ?? "";
  const htmlTitle = html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? "";
  const brandFromTitle = htmlTitle.match(/^([\w\s-]+?)(?:\s+(?:RE|Ap[eé]|Treo|Deluxe|Maxima|Optima|Vespa|Chetak|Nao))/i);
  if (brandFromTitle) brand = brandFromTitle[1].trim();

  if (!modelName) modelName = modelSlug.replace(/-/g, " ");

  // Parse spec pairs from HTML structure: <li><div class="leftview">...label...</div><div class="rightview">...value...</div></li>
  const specs: Record<string, string> = {};
  const pairRegex = /<li>\s*<div class="leftview">[\s\S]*?<\/div>\s*<div class="rightview">[\s\S]*?<\/div>\s*<\/li>/gi;
  for (const match of html.matchAll(pairRegex)) {
    const li = match[0];
    const label = li.match(/<div class="leftview">(?:<h4[^>]*>[^<]*<\/h4>)?([^<]+)/i)?.[1]?.trim();
    const value = li.match(/<div class="rightview">(?:<[^>]+>)*\s*([^<]+)/i)?.[1]?.trim();
    if (label && value && label.length < 60) {
      specs[label] = value;
    }
  }

  // Parse price from overview (passed in)
  const price = overviewPrice;

  // Extract ev-specific fields
  const batteryVoltage = specs["Battery Voltage"] ?? specs["Battery"] ?? "";
  const batteryCapacity = specs["Battery Capacity"] ?? specs["Battery"] ?? "";
  const evRange = specs["Range"] ?? specs["Driving Range"] ?? specs["EV Range"] ?? "";
  const chargingTime = specs["Charging Time"] ?? specs["Full Charge Time"] ?? "";

  return {
    external_id: `tb-${modelSlug}`,
    brand,
    model_name: modelName,
    vehicle_type: vehicleType,
    engine_displacement_cc: parseNum(specs["Engine Displacement"] ?? specs["Engine"] ?? ""),
    power_hp: parseNum(specs["Power"] ?? ""),
    torque_nm: specs["Torque"] ?? "",
    cylinders: parseNum(specs["Engine Cylinders"] ?? "") ?? null,
    fuel_type: specs["Fuel Type"] ?? "",
    transmission: specs["Transmission"] ?? "",
    clutch: specs["Clutch"] ?? "",
    gradeability: specs["Gradeability"] ?? "",
    top_speed_kmh: parseNum(specs["Top Speed"] ?? ""),
    gvw_kg: parseNum(specs["GVW"] ?? ""),
    payload_kg: parseNum(specs["Payload"] ?? ""),
    wheelbase_mm: parseNum(specs["Wheelbase"] ?? ""),
    ground_clearance_mm: parseNum(specs["Ground Clearance"] ?? ""),
    length_mm: parseNum(specs["Overall Length"] ?? specs["Length"] ?? ""),
    width_mm: parseNum(specs["Overall Width"] ?? specs["Width"] ?? ""),
    height_mm: parseNum(specs["Overall Height"] ?? specs["Height"] ?? ""),
    seating_capacity: specs["Seating Capacity"] ?? "",
    emission_norms: specs["Emission Norms Compliance"] ?? specs["Emission Norms"] ?? "",
    fuel_tank_capacity_litres: parseNum(specs["Fuel Tank Capacity"] ?? ""),
    brakes: [specs["Front Brake"], specs["Rear Brake"]].filter(Boolean).join(", "),
    tyres: specs["Tyre Size"] ?? specs["Tyres"] ?? "",
    battery_voltage: batteryVoltage,
    battery_capacity: batteryCapacity,
    ev_range_km: parseNum(evRange),
    charging_time: chargingTime,
    price_inr_lakh: price,
    source_url: url,
    overview_url: url,
    specs_url: `${url}/specifications`,
  };
}

// ── URL Loader ──────────────────────────────────────────────────────

export function loadUrls(filePath: string): string[] {
  const raw = fs.readFileSync(filePath, "utf-8");
  return raw.split("\n").map((l) => l.trim()).filter(Boolean);
}

// ── Batch Fetch ─────────────────────────────────────────────────────

export interface BatchResult {
  url: string;
  specs: TruckBusesSpecs | null;
  error?: string;
}

/**
 * Fetch overview + specs for a single 3W model.
 * Overview page gives price; specs page gives full spec list.
 */
async function fetchModel(
  overviewUrl: string
): Promise<BatchResult> {
  const specsUrl = `${overviewUrl}/specifications`;
  try {
    // Fetch both pages in one Crawl4AI call
    const results = await crawlHtml({
      urls: [overviewUrl, specsUrl],
      pageTimeout: 30_000,
    });

    const overviewResult = results.find((r) => r.url === overviewUrl);
    const specsResult = results.find((r) => r.url === specsUrl);

    if (!overviewResult?.success || !specsResult?.success) {
      return {
        url: overviewUrl,
        specs: null,
        error: `fetch failed: overview=${overviewResult?.success} specs=${specsResult?.success}`,
      };
    }

    // Extract price from overview
    const overviewText = overviewResult.html.replace(/<[^>]+>/g, " ");
    const priceMatch = overviewText.match(/₹\s*([\d.,]+)\s*Lakh/i);
    const price = priceMatch ? parseFloat(priceMatch[1]) : null;

    const specs = parseSpecsPage(specsResult.html, specsUrl, price);
    if (!specs) return { url: overviewUrl, specs: null, error: "parse failed" };
    return { url: overviewUrl, specs };
  } catch (err) {
    return { url: overviewUrl, specs: null, error: (err as Error).message.slice(0, 100) };
  }
}

export async function fetchBatch(
  urls: string[],
  concurrency = 2,
  delayMs = 3000
): Promise<BatchResult[]> {
  const results: BatchResult[] = [];
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((u) => fetchModel(u)));
    results.push(...batchResults);
    if (i + concurrency < urls.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return results;
}

export { parseSpecsPage as _parseSpecsPage };
