import type {
  ImageSearchQuery,
  ImageSearchResponse,
  ImageResult,
} from "../types";

const BASE_URL = "https://api.unsplash.com";

interface UnsplashPhoto {
  id: string;
  width: number;
  height: number;
  color: string;
  alt_description: string;
  user: { name: string; links: { html: string } };
  urls: { raw: string; small: string; regular: string; full: string };
}

interface UnsplashSearchResponse {
  total: number;
  total_pages: number;
  results: UnsplashPhoto[];
}

export async function searchUnsplash(
  query: ImageSearchQuery,
  apiKey: string,
): Promise<ImageSearchResponse> {
  if (!apiKey) {
    return {
      images: [],
      total: 0,
      totalPages: 0,
      provider: "unsplash",
      rateLimit: { remaining: 0, limit: 0, reset: 0 },
    };
  }

  const params = new URLSearchParams({
    query: query.query,
    per_page: String(Math.min(query.perPage ?? 10, 30)),
    page: String(query.page ?? 1),
  });

  if (query.orientation) {
    params.set("orientation", query.orientation);
  }

  if (query.color) {
    params.set("color", query.color);
  }

  const res = await fetch(`${BASE_URL}/search/photos?${params}`, {
    headers: {
      Authorization: `Client-ID ${apiKey}`,
      "Accept-Version": "v1",
    },
  });

  const remaining = Number(res.headers.get("x-ratelimit-remaining") ?? 0);
  const limit = Number(res.headers.get("x-ratelimit-limit") ?? 0);
  const reset = Number(res.headers.get("x-ratelimit-reset") ?? 0);

  if (!res.ok) {
    console.error(`[Unsplash] ${res.status}: ${await res.text()}`);
    return {
      images: [],
      total: 0,
      totalPages: 0,
      provider: "unsplash",
      rateLimit: { remaining, limit, reset },
    };
  }

  const data: UnsplashSearchResponse = await res.json();

  const images: ImageResult[] = data.results.map((photo) => ({
    id: photo.id,
    provider: "unsplash" as const,
    width: photo.width,
    height: photo.height,
    color: photo.color,
    alt: photo.alt_description || "",
    photographer: photo.user.name,
    photographerUrl: photo.user.links.html,
    urls: {
      small: photo.urls.small,
      medium: photo.urls.regular,
      large: photo.urls.full,
      raw: photo.urls.raw,
    },
  }));

  return {
    images,
    total: data.total,
    totalPages: data.total_pages,
    provider: "unsplash",
    rateLimit: { remaining, limit, reset },
  };
}
