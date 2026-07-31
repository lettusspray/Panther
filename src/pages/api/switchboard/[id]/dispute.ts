/**
 * POST /api/switchboard/[id]/dispute — Raise dispute
 *
 * Available from: inspection_window, buyer_confirmed, seller_confirmed.
 * Dispute halts the transaction for manual mediation.
 */

import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { db } from "../../../../lib/db";
import { switchboardTransaction } from "../../../../lib/db/schema";
import { canTransition, transitionTransaction } from "../../../../lib/trust/switchboard";
import type { SwitchboardStatus } from "../../../../lib/trust/switchboard";

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

  const currentStatus = tx.status as SwitchboardStatus;
  const check = canTransition(currentStatus, "disputed");
  if (!check.ok) {
    return json({ error: check.error }, 422);
  }

  const result = await transitionTransaction(txId, "disputed");
  if (!result.ok) {
    return json({ error: result.error }, 422);
  }

  return json({
    ok: true,
    transaction: result.transaction,
    message: "Dispute raised. A platform mediator will review this transaction.",
  });
};

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
