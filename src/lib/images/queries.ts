// ── Vehicle-Specific Search Query Builders ──────────────────────
// Targeted queries that produce the best image matches per vehicle.
// Each builder returns a primary query + fallback queries ranked by specificity.

export interface VehicleQuery {
  query: string;
  tags: string[];
  fallback: VehicleQuery[];
}

// ── Body Type Mappings ──────────────────────────────────────────
// GVO body types → search-friendly terms

const BODY_TYPE_MAP: Record<string, string> = {
  sedan: "sedan",
  suv: "SUV",
  coupe: "coupe",
  convertible: "convertible",
  hatchback: "hatchback",
  pickup: "pickup truck",
  truck: "truck",
  van: "van",
  minivan: "minivan",
  wagon: "station wagon",
  crossover: "crossover SUV",
  jeep: "jeep",
  bus: "bus",
  motorcycle: "motorcycle",
  tricycle: "tricycle",
  trailer: "trailer",
  tanker: "tanker truck",
  flatbed: "flatbed truck",
};

// ── Color Keywords ──────────────────────────────────────────────
// Common vehicle color names → search terms

const COLOR_MAP: Record<string, string> = {
  black: "black",
  white: "white",
  silver: "silver",
  grey: "grey",
  gray: "grey",
  red: "red",
  blue: "blue",
  green: "green",
  gold: "gold",
  yellow: "yellow",
  orange: "orange",
  brown: "brown",
  beige: "beige",
  cream: "cream",
  purple: "purple",
  maroon: "maroon",
  burgundy: "burgundy",
  navy: "navy blue",
  teal: "teal",
};

// ── Query Builders ──────────────────────────────────────────────

/**
 * Build a vehicle search query from GVO attributes.
 * Returns primary query + ranked fallbacks.
 */
export function buildVehicleQuery(params: {
  make: string;
  model: string;
  trim?: string;
  year?: number;
  bodyType?: string;
  color?: string;
  region?: string; // "jdm", "usdm", "european", etc.
}): VehicleQuery {
  const parts: string[] = [];
  const tags: string[] = [];

  if (params.year) {
    parts.push(String(params.year));
    tags.push(String(params.year));
  }
  parts.push(params.make);
  tags.push(params.make);
  parts.push(params.model);
  tags.push(params.model);
  if (params.trim) {
    parts.push(params.trim);
    tags.push(params.trim);
  }

  const bodyTerm = params.bodyType
    ? BODY_TYPE_MAP[params.bodyType] || params.bodyType
    : "car";
  parts.push(bodyTerm);
  tags.push(bodyTerm);

  // Primary: most specific — year make model trim bodyType
  const primary = parts.join(" ");

  // Fallback 1: Remove trim — year make model bodyType
  const fallback1Parts = parts.filter((p) => p !== params.trim);
  const fallback1 = fallback1Parts.join(" ");

  // Fallback 2: Remove trim + body type — year make model
  const fallback2Parts = fallback1Parts.filter((p) => p !== bodyTerm);
  const fallback2 = fallback2Parts.join(" ");

  // Fallback 3: Just make + body type (most generic)
  const fallback3 = `${params.make} ${bodyTerm}`;

  return {
    query: primary,
    tags,
    fallback: [
      { query: fallback1, tags, fallback: [] },
      { query: fallback2, tags, fallback: [] },
      { query: fallback3, tags, fallback: [] },
    ],
  };
}

/**
 * Build a query for a specific vehicle part/feature.
 * Used for gallery images (interior, exterior, engine, etc.).
 */
export function buildPartQuery(params: {
  make: string;
  model: string;
  year?: number;
  part:
    | "exterior"
    | "interior"
    | "engine"
    | "dashboard"
    | "wheels"
    | "rear"
    | "front"
    | "side"
    | "trunk"
    | "seats";
  color?: string;
}): string {
  const parts: string[] = [];
  if (params.year) parts.push(String(params.year));
  parts.push(params.make);
  parts.push(params.model);

  const partTerm =
    params.part === "exterior"
      ? ""
      : params.part === "interior"
        ? "interior"
        : params.part === "engine"
          ? "engine bay"
          : params.part === "dashboard"
            ? "dashboard interior"
            : params.part === "wheels"
              ? "wheels alloy"
              : params.part === "rear"
                ? "rear view"
                : params.part === "front"
                  ? "front view"
                  : params.part === "side"
                    ? "side profile"
                    : params.part === "trunk"
                      ? "trunk open"
                      : params.part === "seats"
                        ? "interior seats"
                        : params.part;

  if (partTerm) parts.push(partTerm);

  const colorTerm = params.color
    ? COLOR_MAP[params.color.toLowerCase()] || params.color
    : "";
  if (colorTerm) parts.push(colorTerm);

  return parts.join(" ");
}

/**
 * Build a generic make+model query for hero/cover images.
 * Tends to return the best-looking promotional shots.
 */
export function buildHeroQuery(params: {
  make: string;
  model: string;
  year?: number;
}): string {
  const parts: string[] = [];
  if (params.year) parts.push(String(params.year));
  parts.push(params.make);
  parts.push(params.model);
  parts.push("car"); // Disambiguate from brand logos etc.
  return parts.join(" ");
}

/**
 * Build a query for condition-related imagery.
 * e.g., dents, scratches, tyre wear, paint condition.
 */
export function buildConditionQuery(params: {
  make: string;
  model: string;
  issue:
    | "dent"
    | "scratch"
    | "tyre"
    | "paint"
    | "rust"
    | "crack"
    | "wear"
    | "stain";
  severity?: "minor" | "moderate" | "severe";
}): string {
  const parts: string[] = [params.make, params.model, "vehicle"];
  if (params.severity) parts.push(params.severity);
  parts.push(params.issue);
  parts.push("close up");
  return parts.join(" ");
}
