import type { APIRoute } from "astro";
import { db } from "../lib/db";
import { dealer, listing } from "../lib/db/schema";
import { eq } from "drizzle-orm";
import { absoluteUrl } from "../lib/seo";

const urls = [
  { loc: "/", priority: "1.0", changefreq: "weekly" },
  { loc: "/pricing", priority: "0.8", changefreq: "weekly" },
  { loc: "/vehicles", priority: "0.8", changefreq: "weekly" },
  { loc: "/listings", priority: "0.9", changefreq: "hourly" },
  { loc: "/dealers", priority: "0.8", changefreq: "daily" },
];

export const GET: APIRoute = async () => {
  const [activeListings, dealers] = await Promise.all([
    db.select({ id: listing.id, updatedAt: listing.updatedAt }).from(listing).where(eq(listing.status, "active")).limit(5000),
    db.select({ slug: dealer.slug, updatedAt: dealer.updatedAt }).from(dealer).limit(2000),
  ]);

  for (const row of activeListings) urls.push({ loc: `/listings/${row.id}`, priority: "0.7", changefreq: "daily", lastmod: row.updatedAt } as typeof urls[number] & { lastmod?: Date | null });
  for (const row of dealers) urls.push({ loc: `/dealers/${row.slug}`, priority: "0.7", changefreq: "weekly", lastmod: row.updatedAt } as typeof urls[number] & { lastmod?: Date | null });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u: typeof urls[number] & { lastmod?: Date | null }) => `  <url>\n    <loc>${absoluteUrl(u.loc)}</loc>\n    ${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString()}</lastmod>\n    ` : ""}<changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join("\n")}\n</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
