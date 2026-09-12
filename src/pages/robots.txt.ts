import type { APIRoute } from "astro";

const SITE = (import.meta.env.PUBLIC_SITE_URL ?? "https://panther.ng").replace(/\/$/, "");

export const GET: APIRoute = () => {
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /dashboard",
    "Disallow: /checkout",
    "Disallow: /auth/",
    "Disallow: /switchboard/",
    `Sitemap: ${SITE}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
