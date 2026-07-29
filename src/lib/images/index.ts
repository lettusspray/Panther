// ── Multi-Provider Image Service ────────────────────────────────
// Unified search across Unsplash, Pexels, CarImages, SourceSplash.
//
// Provider strategy:
//   Unsplash:    CDN hotlinking required, 50/hr demo → 1000/hr prod, best quality
//   Pexels:      CDN hotlinking allowed, 200/hr, good coverage
//   CarImages:   Vehicle-specific studio photos, 5k/mo free, signed URLs
//   SourceSplash: Hotlink-ready aggregator, 1k/hr free, no auth needed
//
// Vehicle queries: carimages → unsplash → pexels → sourcesplash
// General queries: unsplash → pexels → sourcesplash
//
// All providers are queried in parallel; results merged and deduplicated.
// Rate limit tracking prevents one exhausted provider from blocking others.

import type {
  ImageProvider,
  ImageSearchQuery,
  ImageSearchResponse,
  ImageResult,
  ImageColor,
} from "./types";
import { searchUnsplash } from "./providers/unsplash";
import { searchPexels } from "./providers/pexels";
import { searchCarImages } from "./providers/carimages";
import { searchSourceSplash } from "./providers/sourcesplash";
import {
  buildVehicleQuery,
  buildPartQuery,
  buildHeroQuery,
  buildConditionQuery,
} from "./queries";

export type {
  ImageProvider,
  ImageSearchQuery,
  ImageSearchResponse,
  ImageResult,
};
export {
  buildVehicleQuery,
  buildPartQuery,
  buildHeroQuery,
  buildConditionQuery,
};
export { fetchCarMakes, fetchCarModels, fetchCarGenerations } from "./providers/carimages";
export type { CarMake, CarModelsResponse, CarGeneration } from "./providers/carimages";
export { getRandomImageUrl } from "./providers/sourcesplash";

// ── API Key Access ──────────────────────────────────────────────

const UNSPLASH_KEY = import.meta.env.UNSPLASH_ACCESS_KEY ?? "";
const PEXELS_KEY = import.meta.env.PEXELS_API_KEY ?? "";
const CARIMAGES_KEY = import.meta.env.CARIMAGES_API_KEY ?? "";
const CARIMAGES_SECRET = import.meta.env.CARIMAGES_API_SECRET ?? "";
const SOURCESPLASH_KEY = import.meta.env.SOURCESPLASH_API_KEY ?? "";

// ── Provider Status Tracking ────────────────────────────────────

interface ProviderStatus {
  available: boolean;
  remaining: number;
  limit: number;
  reset: number;
}

const providerStatus: Record<ImageProvider, ProviderStatus> = {
  unsplash: { available: true, remaining: 50, limit: 50, reset: 0 },
  pexels: { available: true, remaining: 200, limit: 200, reset: 0 },
  carimages: { available: true, remaining: 5000, limit: 5000, reset: 0 },
  sourcesplash: { available: true, remaining: 1000, limit: 1000, reset: 0 },
};

export function getProviderStatus(): Record<ImageProvider, ProviderStatus> {
  return { ...providerStatus };
}

function updateProviderStatus(
  provider: ImageProvider,
  response: ImageSearchResponse,
) {
  providerStatus[provider] = {
    available: response.rateLimit.remaining > 0,
    remaining: response.rateLimit.remaining,
    limit: response.rateLimit.limit,
    reset: response.rateLimit.reset,
  };
}

// ── Provider Priority Lists ─────────────────────────────────────

/** General-purpose search: hotlinkable stock photo providers */
const GENERAL_PROVIDERS: ImageProvider[] = ["unsplash", "pexels", "sourcesplash"];

/** Vehicle-specific search: CarImages first, then stock fallbacks */
const VEHICLE_PROVIDERS: ImageProvider[] = [
  "carimages",
  "unsplash",
  "pexels",
  "sourcesplash",
];

// ── Unified Search ──────────────────────────────────────────────

export interface MultiProviderSearchOptions {
  providers?: ImageProvider[];
  perProvider?: number;
  dedupe?: boolean;
}

/**
 * Search across all enabled providers in parallel.
 * Returns merged, optionally deduplicated results.
 */
export async function searchImages(
  query: ImageSearchQuery,
  options: MultiProviderSearchOptions = {},
): Promise<{
  images: ImageResult[];
  total: number;
  providerStatus: Record<ImageProvider, ProviderStatus>;
}> {
  const providers = options.providers ?? GENERAL_PROVIDERS;
  const perProvider = options.perProvider ?? query.perPage ?? 10;
  const shouldDedupe = options.dedupe ?? true;

  const searches = providers
    .filter((p) => providerStatus[p].available)
    .map(async (provider) => {
      try {
        const result = await searchImagesFromProvider(provider, {
          ...query,
          perPage: perProvider,
        });
        updateProviderStatus(provider, result);
        return result;
      } catch (err) {
        console.error(`[Images] ${provider} failed:`, err);
        return null;
      }
    });

  const results = await Promise.all(searches);
  let allImages = results.filter(Boolean).flatMap((r) => r!.images);

  if (shouldDedupe) {
    allImages = deduplicateImages(allImages);
  }

  return {
    images: allImages,
    total: allImages.length,
    providerStatus: { ...providerStatus },
  };
}

// ── Single Provider Search ──────────────────────────────────────

async function searchImagesFromProvider(
  provider: ImageProvider,
  query: ImageSearchQuery,
): Promise<ImageSearchResponse> {
  switch (provider) {
    case "unsplash":
      return searchUnsplash(query, UNSPLASH_KEY);
    case "pexels":
      return searchPexels(query, PEXELS_KEY);
    case "carimages":
      return searchCarImages(query, CARIMAGES_KEY, CARIMAGES_SECRET);
    case "sourcesplash":
      return searchSourceSplash(query, SOURCESPLASH_KEY || undefined);
  }
}

// ── Vehicle-Specific Search ─────────────────────────────────────

export interface VehicleImageOptions extends MultiProviderSearchOptions {
  make: string;
  model: string;
  trim?: string;
  year?: number;
  bodyType?: string;
  color?: string;
  count?: number;
}

/**
 * Search for vehicle images using targeted queries.
 * CarImages is tried first (vehicle-specific studio photos),
 * then falls back through stock providers if needed.
 */
export async function searchVehicleImages(
  options: VehicleImageOptions,
): Promise<{
  images: ImageResult[];
  query: string;
  fallbackUsed: boolean;
  providerStatus: Record<ImageProvider, ProviderStatus>;
}> {
  const vehicleQuery = buildVehicleQuery(options);
  const providers = options.providers ?? VEHICLE_PROVIDERS;
  const perProvider = Math.ceil(
    (options.count ?? 10) / providers.length,
  );

  let result = await searchImages(
    { query: vehicleQuery.query, perPage: perProvider, color: options.color as ImageColor | undefined, make: options.make, model: options.model, year: options.year },
    { ...options, providers },
  );

  let fallbackUsed = false;
  let fallbackQuery = vehicleQuery.query;

  if (
    result.images.length < (options.count ?? 10) &&
    vehicleQuery.fallback.length > 0
  ) {
    for (const fb of vehicleQuery.fallback) {
      const fbResult = await searchImages(
        { query: fb.query, perPage: perProvider, color: options.color as ImageColor | undefined, make: options.make, model: options.model, year: options.year },
        { ...options, providers },
      );

      if (fbResult.images.length > result.images.length) {
        result = fbResult;
        fallbackQuery = fb.query;
        fallbackUsed = true;
      }

      if (result.images.length >= (options.count ?? 10)) break;
    }
  }

  return {
    images: result.images.slice(0, options.count ?? 10),
    query: fallbackQuery,
    fallbackUsed,
    providerStatus: result.providerStatus,
  };
}

// ── Hero Image Search ───────────────────────────────────────────

export async function getHeroImage(
  make: string,
  model: string,
  year?: number,
): Promise<ImageResult | null> {
  const query = buildHeroQuery({ make, model, year });
  const result = await searchImages(
    { query, perPage: 5, orientation: "landscape" },
    { providers: VEHICLE_PROVIDERS, perProvider: 3 },
  );

  return result.images[0] ?? null;
}

// ── Gallery Image Search ────────────────────────────────────────

export async function getGalleryImages(
  make: string,
  model: string,
  year?: number,
  parts: Array<
    | "exterior"
    | "interior"
    | "engine"
    | "dashboard"
    | "wheels"
    | "rear"
    | "front"
    | "side"
  > = ["exterior", "interior"],
): Promise<Record<string, ImageResult[]>> {
  const queries = parts.map((part) => ({
    part,
    query: buildPartQuery({ make, model, year, part }),
  }));

  const results = await Promise.all(
    queries.map(async ({ part, query }) => {
      const res = await searchImages(
        { query, perPage: 3 },
        { providers: VEHICLE_PROVIDERS, perProvider: 1 },
      );
      return { part, images: res.images };
    }),
  );

  return Object.fromEntries(results.map((r) => [r.part, r.images]));
}

// ── Deduplication ───────────────────────────────────────────────

function deduplicateImages(images: ImageResult[]): ImageResult[] {
  const seen = new Set<string>();
  return images.filter((img) => {
    const key = `${img.provider}-${img.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
