// ── Shared Image Types ──────────────────────────────────────────
// Unified interface across Unsplash, Pexels, CarImages, SourceSplash.

export type ImageProvider =
  | "unsplash"
  | "pexels"
  | "carimages"
  | "sourcesplash";

export type ImageOrientation = "landscape" | "portrait" | "squarish";

export type ImageColor =
  | "black_and_white"
  | "black"
  | "white"
  | "yellow"
  | "orange"
  | "red"
  | "purple"
  | "magenta"
  | "green"
  | "teal"
  | "blue";

export interface ImageSearchQuery {
  query: string;
  orientation?: ImageOrientation;
  color?: ImageColor;
  perPage?: number;
  page?: number;
  make?: string;
  model?: string;
  year?: number;
}

export interface ImageResult {
  id: string;
  provider: ImageProvider;
  width: number;
  height: number;
  color: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
  urls: {
    small: string;
    medium: string;
    large: string;
    raw?: string;
  };
}

export interface ImageSearchResponse {
  images: ImageResult[];
  total: number;
  totalPages: number;
  provider: ImageProvider;
  rateLimit: {
    remaining: number;
    limit: number;
    reset: number;
  };
}
