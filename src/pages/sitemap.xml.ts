import type { APIRoute } from "astro";
import { db } from "../lib/db";
import { listing } from "../lib/db/schema";
import { eq } from "drizzle-orm";
import { listingStatusEnum } from "../lib/db/schema";

const BASE = "https://panther.ng";

const staticUrls = [
  { loc: "/", priority: "1.0", changefreq: "weekly" },
  { loc: "/pricing", priority: "0.9", changefreq: "daily" },
  { loc: "/vehicles", priority: "0.8", changefreq: "weekly" },
  { loc: "/listings", priority: "0.9", changefreq: "hourly" },
  { loc: "/switchboard", priority: "0.6", changefreq: "weekly" },
];

const ACTIVE = listingStatusEnum.enumValues.find((s) => s === "active") ?? "active";

export const GET: APIRoute = async () => {
  const activeListings = await db
    .select({ id: listing.id, updatedAt: listing.updatedAt })
    .from(listing)
    .where(eq(listing.status, ACTIVE))
    .limit(1000);

  const urls = [...staticUrls];

  for (const l of activeListings) {
    urls.push({
      loc: `/listings/${l.id}`,
      priority: "0.7",
      changefreq: "daily" as const,
    });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${BASE}${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
};
