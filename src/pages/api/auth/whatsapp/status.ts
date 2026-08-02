/**
 * WhatsApp Auth Status (SSE)
 *
 * Constitution §VII.3: Frontend listens for auth state changes via SSE.
 * After webhook confirms token, this endpoint returns verified status.
 */

import type { APIRoute } from "astro";
import { db } from "../../../../lib/db";
import { user } from "../../../../lib/db/schema";
import { eq } from "drizzle-orm";

export const GET: APIRoute = async ({ url }) => {
  const userId = url.searchParams.get("userId");

  if (!userId) {
    return new Response(
      JSON.stringify({ error: "userId query param required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Check if user has a verified phone
  const rows = await db
    .select({
      id: user.id,
      phone: user.phone,
      phoneVerified: user.phoneVerified,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (rows.length === 0) {
    return new Response(
      JSON.stringify({ verified: false, error: "User not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const u = rows[0];
  const isVerified = u.phoneVerified !== null && u.phone !== null;

  return new Response(
    JSON.stringify({
      verified: isVerified,
      phone: isVerified ? u.phone : null,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
    },
  );
};
