/**
 * POST /api/switchboard/[id]/cancel — Cancel and refund
 *
 * Available at any pre-release stage.
 * Constitution: "No Cancellation Fee, Ever."
 * "Anti-Gambiarra Enforcement: it is strictly forbidden to build
 *  'trap' mechanics that make it financially painful to cancel"
 */

import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { db } from "../../../../lib/db";
import { switchboardTransaction } from "../../../../lib/db/schema";
import { refundTransaction } from "../../../../lib/trust/switchboard";

export const POST: APIRoute = async ({ params, locals }) => {
  const user = (locals as { user: Record<string, unknown> | null }).user;
  if (!user?.id) {
    return json({ error: "Authentication required" }, 401);
  }

  const txId = params.id;
  if (!txId) {
    return json({ error: "Transaction ID required" }, 400);
  }

  const userId = user.id as string;

  const [tx] = await db
    .select()
    .from(switchboardTransaction)
    .where(eq(switchboardTransaction.id, txId))
    .limit(1);

  if (!tx) {
    return json({ error: "Transaction not found" }, 404);
  }

  if (tx.buyerId !== userId && tx.sellerId !== userId) {
    return json({ error: "Forbidden" }, 403);
  }

  if (tx.status === "released" || tx.status === "refunded") {
    return json(
      { error: `Cannot cancel: transaction is already ${tx.status}` },
      422,
    );
  }

  // ── Process refund ─────────────────────────────────────────────
  // Paystack refunds are handled via their dashboard or API.
  // For MVP, we record the refund intent locally.
  // The PSP refund (if funds were collected) is an admin action.
  if (tx.status !== "initiated" && tx.providerRef) {
    console.log(
      `[SWITCHBOARD] Refund intent for tx=${tx.id}, psp_ref=${tx.providerRef}`,
    );
  }

  const result = await refundTransaction(txId);
  if (!result.ok) {
    return json({ error: result.error }, 422);
  }

  return json({
    ok: true,
    transaction: result.transaction,
    message: "Transaction cancelled. Full refund. No cancellation fee.",
  });
};

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
