// ── CarImages Provider ────────────────────────────────────────────
// Vehicle-specific studio photos by make/model/year.
// 206 car brands, 12,000+ generations, 250+ motorcycle brands.
// Free tier: 5,000 calls/mo, watermarked WebP. Paid: PNG/JPG/WebP.
// Signed URLs via server-side HMAC-SHA256 signing.
// Docs: https://carimagesapi.com/docs

import type {
  ImageSearchResponse,
  ImageResult,
} from "../types";

const BASE_URL = "https://carimagesapi.com";
const CARIMAGES_MONTHLY_LIMIT = 5000;
let carimagesRequestsThisMonth = 0;

interface SignedUrlResponse {
  url: string;
}

export interface CarMake {
  slug: string;
  name: string;
  logo: string | null;
  model_count?: number;
}

export interface CarGeneration {
  slug: string;
  name: string;
  year_start: number;
  year_end: number | null;
  body_type: string;
  images: {
    png: string | null;
    webp: string | null;
    jpg: string | null;
    sizes: Record<string, { png: string; webp: string; jpg: string }>;
  } | null;
}

export interface CarModelsResponse {
  make: { slug: string; name: string };
  data: Array<{
    slug: string;
    name: string;
    year_start: number;
    year_end: number | null;
    generation_count: number;
  }>;
  total: number;
}

/**
 * Generate a signed URL for a CarImages image request.
 * Uses HMAC-SHA256 signing via the server-side API.
 */
async function getSignedUrl(
  apiKey: string,
  apiSecret: string,
  params: Record<string, string>,
): Promise<string> {
  const res = await fetch(
    `${BASE_URL}/api/v1/signed-url?api_key=${apiKey}&${new URLSearchParams(params)}`,
    {
      headers: {
        "X-Api-Secret": apiSecret,
      },
    },
  );

  if (!res.ok) {
    console.error(`[CarImages] signed-url ${res.status}: ${await res.text()}`);
    return "";
  }

  const data: SignedUrlResponse = await res.json();
  return data.url ?? "";
}

interface CarImagesQuery {
  query: string;
  make?: string;
  model?: string;
  year?: number;
}

/**
 * Parse structured vehicle data from query or structured fields.
 * Prefers structured make/model/year when available.
 */
function resolveVehicleParams(q: CarImagesQuery): {
  make: string;
  model: string;
  year: number | undefined;
} {
  if (q.make) {
    return { make: q.make, model: q.model ?? "", year: q.year };
  }

  // Fallback: parse from query string (assumes "YEAR MAKE MODEL" or "MAKE MODEL")
  const parts = q.query.trim().split(/\s+/);
  let year: number | undefined;
  let makeStart = 0;

  const firstNum = parseInt(parts[0], 10);
  if (!isNaN(firstNum) && firstNum >= 1900 && firstNum <= 2100) {
    year = firstNum;
    makeStart = 1;
  }

  const remaining = parts.slice(makeStart);
  if (remaining.length === 0) {
    return { make: "", model: "", year };
  }

  const make = remaining[0];
  const model = remaining.slice(1).join(" ");

  return { make, model, year };
}

export async function searchCarImages(
  query: CarImagesQuery,
  apiKey: string,
  apiSecret: string,
): Promise<ImageSearchResponse> {
  if (!apiKey || !apiSecret) {
    return {
      images: [],
      total: 0,
      totalPages: 0,
      provider: "carimages",
      rateLimit: { remaining: 0, limit: 5000, reset: 0 },
    };
  }

  const { make, model, year } = resolveVehicleParams(query);

  if (!make) {
    return {
      images: [],
      total: 0,
      totalPages: 0,
      provider: "carimages",
      rateLimit: { remaining: 0, limit: 5000, reset: 0 },
    };
  }

  // CarImages returns one image per request — use it as the primary result
  const urlParams: Record<string, string> = { make };
  if (model) urlParams.model = model;
  if (year) urlParams.year = String(year);
  urlParams.width = "800";
  urlParams.format = "webp";

  const url = await getSignedUrl(apiKey, apiSecret, urlParams);
  carimagesRequestsThisMonth++;

  if (!url) {
    return {
      images: [],
      total: 0,
      totalPages: 0,
      provider: "carimages",
      rateLimit: {
        remaining: Math.max(0, CARIMAGES_MONTHLY_LIMIT - carimagesRequestsThisMonth),
        limit: CARIMAGES_MONTHLY_LIMIT,
        reset: 0,
      },
    };
  }

  // Build a descriptive alt from the query
  const alt = [year, make, model].filter(Boolean).join(" ") || query.query;

  const images: ImageResult[] = [
    {
      id: `carimages-${make}-${model}-${year ?? "any"}`,
      provider: "carimages",
      width: 800,
      height: 500,
      color: "",
      alt,
      photographer: "CarImages",
      photographerUrl: BASE_URL,
      urls: {
        small: url.replace(/width=\d+/, "width=400"),
        medium: url,
        large: url.replace(/width=\d+/, "width=1200"),
      },
    },
  ];

  return {
    images,
    total: 1,
    totalPages: 1,
    provider: "carimages",
    rateLimit: {
      remaining: Math.max(0, CARIMAGES_MONTHLY_LIMIT - carimagesRequestsThisMonth),
      limit: CARIMAGES_MONTHLY_LIMIT,
      reset: 0,
    },
  };
}

/**
 * Fetch available makes from the CarImages catalog.
 */
export async function fetchCarMakes(
  apiKey: string,
  apiSecret: string,
): Promise<CarMake[]> {
  if (!apiKey || !apiSecret) return [];

  const res = await fetch(`${BASE_URL}/api/v1/makes?api_key=${apiKey}`, {
    headers: { "X-Api-Secret": apiSecret },
  });

  if (!res.ok) return [];
  const data: { data?: CarMake[] } = await res.json();
  return data.data ?? [];
}

/**
 * Fetch models for a given make.
 */
export async function fetchCarModels(
  apiKey: string,
  apiSecret: string,
  makeSlug: string,
): Promise<CarModelsResponse | null> {
  if (!apiKey || !apiSecret || !makeSlug) return null;

  const res = await fetch(
    `${BASE_URL}/api/v1/makes/${makeSlug}/models?api_key=${apiKey}`,
    { headers: { "X-Api-Secret": apiSecret } },
  );

  if (!res.ok) return null;
  return res.json();
}

/**
 * Get generations (image URLs) for a specific make/model.
 */
export async function fetchCarGenerations(
  apiKey: string,
  apiSecret: string,
  makeSlug: string,
  modelSlug: string,
): Promise<CarGeneration[]> {
  if (!apiKey || !apiSecret || !makeSlug || !modelSlug) return [];

  const res = await fetch(
    `${BASE_URL}/api/v1/makes/${makeSlug}/models/${modelSlug}?api_key=${apiKey}`,
    { headers: { "X-Api-Secret": apiSecret } },
  );

  if (!res.ok) return [];
  const data: { generations?: CarGeneration[] } = await res.json();
  return data.generations ?? [];
}
