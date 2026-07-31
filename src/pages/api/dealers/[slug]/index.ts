import type { APIRoute } from "astro";
import { getDealerBySlug, getDealerListings, getDealerReviews, getDealerStats } from "../../../../lib/dealer";

export const GET: APIRoute = async ({ params }) => {
  const { slug } = params;
  if (!slug) {
    return new Response(JSON.stringify({ error: "Slug required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const profile = await getDealerBySlug(slug);
  if (!profile) {
    return new Response(JSON.stringify({ error: "Dealer not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const [listings, reviews, stats] = await Promise.all([
    getDealerListings(profile.userId, "active"),
    getDealerReviews(profile.id),
    getDealerStats(profile.userId),
  ]);

  return new Response(
    JSON.stringify({ profile, listings, reviews, stats }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
