/**
 * POST /api/switchboard/[id]/confirm — Buyer or seller confirms
 *
 * Both confirmed → triggers settlement (transfer to seller minus fee).
 */

import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { db } from "../../../../lib/db";
import { switchboardTransaction, sellerBankAccount } from "../../../../lib/db/schema";
import { getPaymentProvider } from "../../../../lib/payments";
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

  const isBuyer = tx.buyerId === userId;
  const isSeller = tx.sellerId === userId;
  if (!isBuyer && !isSeller) {
    return json({ error: "Forbidden" }, 403);
  }

  const currentStatus = tx.status as SwitchboardStatus;
  const targetStatus: SwitchboardStatus = isBuyer
    ? "buyer_confirmed"
    : "seller_confirmed";

  const check = canTransition(currentStatus, targetStatus);
  if (!check.ok) {
    return json({ error: check.error }, 422);
  }

  const result = await transitionTransaction(txId, targetStatus);
  if (!result.ok) {
    return json({ error: result.error }, 422);
  }

  // ── Both confirmed → trigger settlement ────────────────────────
  if (currentStatus === "buyer_confirmed" && targetStatus === "seller_confirmed") {
    await attemptSettlement(tx);
  }

  return json({ ok: true, transaction: result.transaction });
};

// ── Settlement ──────────────────────────────────────────────────────

async function attemptSettlement(tx: {
  id: string;
  sellerId: string;
  agreedPriceNgn: string | number;
  platformFeeNgn: string | number | null;
}): Promise<void> {
  const price = Number(tx.agreedPriceNgn);
  const fee = Number(tx.platformFeeNgn);
  const sellerProceedsKobo = Math.round((price - fee) * 100);

  const [bankAccount] = await db
    .select()
    .from(sellerBankAccount)
    .where(eq(sellerBankAccount.sellerId, tx.sellerId))
    .limit(1);

  if (!bankAccount) {
    console.error(`[SWITCHBOARD] Settlement failed: seller ${tx.sellerId} has no bank account`);
    return;
  }

  const provider = getPaymentProvider();
  const transferRef = `set_${tx.id.slice(0, 12)}_${Date.now()}`;

  try {
    const result = await provider.initiateTransfer({
      recipientCode: bankAccount.recipientCode,
      amountKobo: sellerProceedsKobo,
      reference: transferRef,
      reason: `Panther Switchboard: proceeds for ${tx.id}`,
    });

    console.log(
      `[SWITCHBOARD] Transfer tx=${tx.id}: ${sellerProceedsKobo} kobo → ${bankAccount.recipientCode} (fee=${result.feeKobo})`,
    );

    const releaseResult = await transitionTransaction(tx.id, "released");
    if (!releaseResult.ok) {
      console.error(`[SWITCHBOARD] Release failed tx=${tx.id}: ${releaseResult.error}`);
    }
  } catch (err) {
    console.error(`[SWITCHBOARD] Transfer failed tx=${tx.id}:`, err);
  }
}

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
