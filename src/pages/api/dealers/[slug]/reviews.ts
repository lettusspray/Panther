import type { APIRoute } from "astro";
import { db } from "../../../../lib/db";
import { dealerReview, dealer } from "../../../../lib/db/schema";
import { eq } from "drizzle-orm";

export const GET: APIRoute = async ({ params }) => {
  const { slug } = params;
  if (!slug) {
    return new Response(JSON.stringify({ error: "Slug required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const dealers = await db
    .select({ id: dealer.id })
    .from(dealer)
    .where(eq(dealer.slug, slug))
    .limit(1);

  if (dealers.length === 0) {
    return new Response(JSON.stringify({ error: "Dealer not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const reviews = await db
    .select({
      id: dealerReview.id,
      rating: dealerReview.rating,
      title: dealerReview.title,
      body: dealerReview.body,
      createdAt: dealerReview.createdAt,
    })
    .from(dealerReview)
    .where(eq(dealerReview.dealerId, dealers[0].id))
    .orderBy(dealerReview.createdAt);

  return new Response(JSON.stringify({ reviews }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const POST: APIRoute = async ({ params, request, locals }) => {
  const user = (locals as { user: Record<string, unknown> | null }).user;
  if (!user?.id) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { slug } = params;
  if (!slug) {
    return new Response(JSON.stringify({ error: "Slug required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const dealers = await db
    .select({ id: dealer.id, userId: dealer.userId })
    .from(dealer)
    .where(eq(dealer.slug, slug))
    .limit(1);

  if (dealers.length === 0) {
    return new Response(JSON.stringify({ error: "Dealer not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const dealerId = dealers[0].id;

  // Sellers cannot review themselves
  if (dealers[0].userId === user.id) {
    return new Response(JSON.stringify({ error: "Cannot review yourself" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return new Response(JSON.stringify({ error: "Rating must be 1-5" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const [created] = await db
    .insert(dealerReview)
    .values({
      dealerId,
      buyerId: user.id as string,
      listingId: (body.listingId as string) ?? null,
      rating,
      title: (body.title as string) ?? null,
      body: (body.body as string) ?? null,
    })
    .returning({ id: dealerReview.id });

  return new Response(JSON.stringify({ ok: true, reviewId: created.id }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
