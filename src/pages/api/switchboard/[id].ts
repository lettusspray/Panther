/**
 * GET /api/switchboard/[id] — Transaction status + details
 *
 * Only buyer or seller can view their own transactions.
 */

import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { db } from "../../../../lib/db";
import { switchboardTransaction } from "../../../../lib/db/schema";

export const GET: APIRoute = async ({ params, locals }) => {
  const user = (locals as { user: Record<string, unknown> | null }).user;
  if (!user?.id) {
    return json({ error: "Authentication required" }, 401);
  }

  const txId = params.id;
  if (!txId) {
    return json({ error: "Transaction ID required" }, 400);
  }

  const [tx] = await db
    .select()
    .from(switchboardTransaction)
    .where(eq(switchboardTransaction.id, txId))
    .limit(1);

  if (!tx) {
    return json({ error: "Transaction not found" }, 404);
  }

  const userId = user.id as string;
  if (tx.buyerId !== userId && tx.sellerId !== userId) {
    return json({ error: "Forbidden" }, 403);
  }

  return json({ ok: true, transaction: tx });
};

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
