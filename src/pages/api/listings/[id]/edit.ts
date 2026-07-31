import type { APIRoute } from "astro";
import { db } from "../../../../lib/db";
import { listing } from "../../../../lib/db/schema";
import { eq } from "drizzle-orm";

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const user = (locals as { user: Record<string, unknown> | null }).user;
  if (!user?.id) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Listing ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const items = await db
    .select({ id: listing.id, sellerId: listing.sellerId })
    .from(listing)
    .where(eq(listing.id, id))
    .limit(1);

  if (items.length === 0) {
    return new Response(JSON.stringify({ error: "Listing not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (items[0].sellerId !== user.id) {
    return new Response(JSON.stringify({ error: "Not your listing" }), {
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

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (body.askingPriceNgn !== undefined) update.askingPriceNgn = String(body.askingPriceNgn);
  if (body.mileageKm !== undefined) update.mileageKm = body.mileageKm;
  if (body.status !== undefined) update.status = body.status;

  await db.update(listing).set(update).where(eq(listing.id, id));

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
