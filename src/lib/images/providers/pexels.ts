import type {
  ImageSearchQuery,
  ImageSearchResponse,
  ImageResult,
} from "../types";

const BASE_URL = "https://api.pexels.com";

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  alt: string;
  src: { small: string; medium: string; large: string; original: string };
}

interface PexelsSearchResponse {
  total_results: number;
  page: number;
  per_page: number;
  photos: PexelsPhoto[];
}

export async function searchPexels(
  query: ImageSearchQuery,
  apiKey: string,
): Promise<ImageSearchResponse> {
  if (!apiKey) {
    return {
      images: [],
      total: 0,
      totalPages: 0,
      provider: "pexels",
      rateLimit: { remaining: 0, limit: 0, reset: 0 },
    };
  }

  const params = new URLSearchParams({
    query: query.query,
    per_page: String(Math.min(query.perPage ?? 10, 80)),
    page: String(query.page ?? 1),
  });

  if (query.orientation) {
    params.set("orientation", query.orientation === "squarish" ? "square" : query.orientation);
  }

  if (query.color) {
    const colorMap: Record<string, string> = {
      black_and_white: "black_and_white",
      magenta: "pink",
      teal: "turquoise",
    };
    params.set("color", colorMap[query.color] ?? query.color);
  }

  const res = await fetch(`${BASE_URL}/v1/search?${params}`, {
    headers: { Authorization: apiKey },
  });

  const remaining = Number(
    res.headers.get("x-ratelimit-remaining-regular-search") ?? 0,
  );
  const limit = Number(
    res.headers.get("x-ratelimit-limit-regular-search") ?? 0,
  );
  const reset = Number(
    res.headers.get("x-ratelimit-reset-regular-search") ?? 0,
  );

  if (!res.ok) {
    console.error(`[Pexels] ${res.status}: ${await res.text()}`);
    return {
      images: [],
      total: 0,
      totalPages: 0,
      provider: "pexels",
      rateLimit: { remaining, limit, reset },
    };
  }

  const data: PexelsSearchResponse = await res.json();

  const images: ImageResult[] = data.photos.map((photo) => ({
    id: String(photo.id),
    provider: "pexels" as const,
    width: photo.width,
    height: photo.height,
    color: "",
    alt: photo.alt,
    photographer: photo.photographer,
    photographerUrl: photo.photographer_url,
    urls: {
      small: photo.src.small,
      medium: photo.src.medium,
      large: photo.src.original,
    },
  }));

  return {
    images,
    total: data.total_results,
    totalPages: Math.ceil(data.total_results / data.per_page),
    provider: "pexels",
    rateLimit: { remaining, limit, reset },
  };
}
