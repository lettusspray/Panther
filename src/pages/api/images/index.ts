import type { APIRoute } from "astro";
import {
  searchVehicleImages,
  searchImages,
  buildVehicleQuery,
  buildPartQuery,
  buildHeroQuery,
} from "../../../lib/images";
import type { ImageProvider } from "../../../lib/images";

const VALID_PROVIDERS: ImageProvider[] = [
  "unsplash",
  "pexels",
  "carimages",
  "sourcesplash",
];

/**
 * GET /api/images/search?make=X&model=Y&year=Z&part=P&count=N
 *
 * Multi-provider image search across Unsplash, Pexels, CarImages, SourceSplash.
 *
 * Query params:
 *   make   (required) — Vehicle make, e.g. "Toyota"
 *   model  (required) — Vehicle model, e.g. "Camry"
 *   year   (optional) — Model year, e.g. 2020
 *   trim   (optional) — Trim level, e.g. "XLE"
 *   bodyType (optional) — Body type, e.g. "sedan"
 *   color  (optional) — Color, e.g. "black"
 *   part   (optional) — Specific part: exterior|interior|engine|dashboard|wheels|rear|front|side
 *   count  (optional) — Number of images to return (default 10)
 *   providers (optional) — Comma-separated: unsplash,pexels,carimages,sourcesplash
 *   raw    (optional) — Return raw search text instead of fetching images
 */
export const GET: APIRoute = async ({ url }) => {
  const make = url.searchParams.get("make");
  const model = url.searchParams.get("model");

  if (!make || !model) {
    return new Response(
      JSON.stringify({ error: "make and model query params are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const yearRaw = url.searchParams.get("year");
  const year = yearRaw ? Number(yearRaw) : undefined;
  if (year !== undefined && Number.isNaN(year)) {
    return new Response(
      JSON.stringify({ error: "year must be a valid number" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const trim = url.searchParams.get("trim") ?? undefined;
  const bodyType = url.searchParams.get("bodyType") ?? undefined;
  const color = url.searchParams.get("color") ?? undefined;
  const part = url.searchParams.get("part") as
    | "exterior"
    | "interior"
    | "engine"
    | "dashboard"
    | "wheels"
    | "rear"
    | "front"
    | "side"
    | null;
  const countRaw = url.searchParams.get("count");
  const count = countRaw ? Number(countRaw) : 10;
  if (Number.isNaN(count) || count < 1 || count > 50) {
    return new Response(
      JSON.stringify({ error: "count must be a number between 1 and 50" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const providersRaw = url.searchParams.get("providers");
  const providersFiltered = providersRaw
    ? providersRaw
        .split(",")
        .filter((p): p is ImageProvider =>
          VALID_PROVIDERS.includes(p as ImageProvider),
        )
    : [];
  const providers = providersFiltered.length > 0 ? providersFiltered : undefined;
  const raw = url.searchParams.get("raw") === "true";

  // If raw mode, return the generated search query text (for debugging)
  if (raw) {
    const vehicleQuery = buildVehicleQuery({
      make,
      model,
      trim,
      year,
      bodyType,
      color,
    });
    const heroQuery = buildHeroQuery({ make, model, year });
    const partQueries = part
      ? { [part]: buildPartQuery({ make, model, year, part, color }) }
      : Object.fromEntries(
          (
            ["exterior", "interior", "engine", "dashboard", "wheels"] as const
          ).map((p) => [p, buildPartQuery({ make, model, year, part: p })]),
        );

    return new Response(
      JSON.stringify({
        vehicleQuery,
        heroQuery,
        partQueries,
        providers: providers ?? ["unsplash", "pexels", "carimages", "sourcesplash"],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // If a specific part is requested, return just that
  if (part) {
    const query = buildPartQuery({ make, model, year, part, color });
    const result = await searchImages(
      { query, perPage: count },
      { providers, perProvider: count },
    );

    return new Response(
      JSON.stringify({ part, query, ...result }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // Otherwise, return vehicle images
  const result = await searchVehicleImages({
    make,
    model,
    trim,
    year,
    bodyType,
    color,
    count,
    providers,
    perProvider: Math.ceil(count / (providers?.length ?? 3)),
  });

  return new Response(
    JSON.stringify(result),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
