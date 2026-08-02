import type { APIRoute } from "astro";
import { db } from "../../../../lib/db";
import { listingReport, listing } from "../../../../lib/db/schema";
import { eq, and, gte } from "drizzle-orm";

const REPORT_REASONS = [
  "misleading_condition",
  "incorrect_price",
  "wrong_vehicle",
  "suspected_fraud",
  "duplicate",
  "spam",
  "prohibited_item",
  "seller_unresponsive",
  "title_issue",
  "odometer_tampering",
  "salvage_rebuilt_not_disclosed",
  "vin_mismatch",
  "already_sold",
  "other",
] as const;

export const POST: APIRoute = async ({ params, request, locals }) => {
  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing listing ID" }), {
      status: 400,
    });
  }

  const user = locals.user;
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || null;

  let body: { reason?: string; description?: string; category?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
    });
  }

  if (!body.reason || typeof body.reason !== "string" || body.reason.trim().length === 0) {
    return new Response(JSON.stringify({ error: "Reason is required" }), {
      status: 400,
    });
  }

  if (!REPORT_REASONS.includes(body.reason as typeof REPORT_REASONS[number]) && body.reason !== "other") {
    return new Response(JSON.stringify({ error: "Invalid report reason" }), {
      status: 400,
    });
  }

  const [exists] = await db
    .select({ id: listing.id })
    .from(listing)
    .where(eq(listing.id, id))
    .limit(1);

  if (!exists) {
    return new Response(JSON.stringify({ error: "Listing not found" }), {
      status: 404,
    });
  }

  // Duplicate prevention: same user/IP + same listing within 24h
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [recent] = await db
    .select()
    .from(listingReport)
    .where(
      and(
        eq(listingReport.listingId, id),
        user?.id
          ? eq(listingReport.reporterId, user.id as string)
          : eq(listingReport.description, `ip:${ip || "unknown"}`),
        gte(listingReport.createdAt, oneDayAgo),
      ),
    )
    .limit(1);

  if (recent) {
    return new Response(JSON.stringify({
      error: "You have already reported this listing recently. Our team will review your report.",
    }), { status: 429 });
  }

  await db.insert(listingReport).values({
    listingId: id,
    reporterId: (user?.id as string | undefined) ?? null,
    reason: body.reason.trim(),
    description: body.description?.trim()
      ? `${body.description.trim()}${ip ? ` [IP: ${ip}]` : ""}`
      : ip ? `[IP: ${ip}]` : null,
    status: "pending",
  });

  return new Response(
    JSON.stringify({
      ok: true,
      message: "Report submitted. Our team reviews reports within 24 hours.",
    }),
    { status: 201 },
  );
};
