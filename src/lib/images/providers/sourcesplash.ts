// ── SourceSplash Provider ──────────────────────────────────────────
// Hotlink-ready stock photo aggregator. No auth needed for basic use.
// Aggregates from Unsplash + Pexels. Returns hotlinkable CDN URLs.
// Free: 1,000 req/hr with a key, anonymous hotlinks available.
// Docs: https://www.sourcesplash.com/docs

import type {
  ImageSearchQuery,
  ImageSearchResponse,
  ImageResult,
} from "../types";

const BASE_URL = "https://api.sourcesplash.com";

interface SourceSplashImage {
  id: string;
  url: string;
  thumbnail: string;
  width: number;
  height: number;
  author: string;
  author_url: string;
  source: string;
  description: string;
}

interface SourceSplashSearchResponse {
  query: string;
  photos: SourceSplashImage[];
  total_results: number;
  page: number;
  per_page: number;
}

export async function searchSourceSplash(
  query: ImageSearchQuery,
  apiKey?: string,
): Promise<ImageSearchResponse> {
  const params = new URLSearchParams({
    q: query.query,
    page: String(query.page ?? 1),
  });

  if (query.perPage) {
    params.set("per_page", String(query.perPage));
  }

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const res = await fetch(`${BASE_URL}/api/search?${params}`, { headers });

  const remaining = Number(
    res.headers.get("x-ratelimit-remaining") ?? (apiKey ? 1000 : 100),
  );
  const limit = Number(
    res.headers.get("x-ratelimit-limit") ?? (apiKey ? 1000 : 100),
  );
  const reset = Number(res.headers.get("x-ratelimit-reset") ?? 0);

  if (!res.ok) {
    console.error(
      `[SourceSplash] ${res.status}: ${await res.text()}`,
    );
    return {
      images: [],
      total: 0,
      totalPages: 0,
      provider: "sourcesplash",
      rateLimit: { remaining, limit, reset },
    };
  }

  const data: SourceSplashSearchResponse = await res.json();

  const images: ImageResult[] = (data.photos ?? []).map((img) => ({
    id: img.id,
    provider: "sourcesplash" as const,
    width: img.width,
    height: img.height,
    color: "",
    alt: img.description || query.query,
    photographer: img.author,
    photographerUrl: img.author_url,
    urls: {
      small: img.thumbnail || img.url,
      medium: img.url,
      large: img.url,
    },
  }));

  return {
    images,
    total: data.total_results ?? images.length,
    totalPages: Math.ceil((data.total_results ?? images.length) / (data.per_page ?? 15)),
    provider: "sourcesplash",
    rateLimit: { remaining, limit, reset },
  };
}

/**
 * Get a random hotlink-ready image URL directly (no JSON parsing needed).
 * Useful for placeholder/fallback images.
 * Returns the direct image URL for use in <img src="...">.
 */
export function getRandomImageUrl(
  query: string,
  width?: number,
  height?: number,
): string {
  const params = new URLSearchParams({ q: query });
  if (width) params.set("w", String(width));
  if (height) params.set("h", String(height));
  return `https://www.sourcesplash.com/i/random?${params}`;
}
