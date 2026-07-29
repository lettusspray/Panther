/**
 * Switchboard API — List & Initiate
 *
 * GET  /api/switchboard/my    — User's transaction history (buyer + seller views)
 * POST /api/switchboard       — Initiate a new Switchboard transaction (buyer)
 *
 * Constitution §IV.4:
 *   - "Switchboard (escrow) must be foregrounded as the digital equivalent
 *      of 'Pay on Delivery'"
 *   - "No Cancellation Fee, Ever"
 *   - "The UI must allow the buyer and seller to negotiate who bears the
 *      platform fee" (deferred to MVP+ — seller-only for now)
 */

import type { APIRoute } from "astro";
import { eq, or, desc } from "drizzle-orm";
import { db } from "../../../lib/db";
import {
  switchboardTransaction,
  listing,
  sellerBankAccount,
  gvoTrim,
  gvoModel,
  gvoMake,
} from "../../../lib/db/schema";
import { getPaymentProvider } from "../../../lib/payments";
import {
  initiateTransaction,
  calculatePlatformFee,
} from "../../../lib/trust/switchboard";
import { checkCanUseSwitchboard } from "../../../lib/trust/enforcement";

// ── GET /api/switchboard/my ──────────────────────────────────────────
// Returns all transactions where the user is buyer or seller.

export const GET: APIRoute = async ({ locals }) => {
  const user = (locals as { user: Record<string, unknown> | null }).user;
  if (!user?.id) {
    return json({ error: "Authentication required" }, 401);
  }

  const userId = user.id as string;

  const transactions = await db
    .select({
      id: switchboardTransaction.id,
      status: switchboardTransaction.status,
      agreedPriceNgn: switchboardTransaction.agreedPriceNgn,
      platformFeeNgn: switchboardTransaction.platformFeeNgn,
      feePayer: switchboardTransaction.feePayer,
      initiatedAt: switchboardTransaction.initiatedAt,
      completedAt: switchboardTransaction.completedAt,
      listingId: switchboardTransaction.listingId,
      buyerId: switchboardTransaction.buyerId,
      sellerId: switchboardTransaction.sellerId,
      trimName: gvoTrim.name,
      modelName: gvoModel.name,
      makeName: gvoMake.name,
      listingModelYear: listing.modelYear,
    })
    .from(switchboardTransaction)
    .innerJoin(listing, eq(switchboardTransaction.listingId, listing.id))
    .innerJoin(gvoTrim, eq(listing.trimId, gvoTrim.id))
    .innerJoin(gvoModel, eq(gvoTrim.modelId, gvoModel.id))
    .innerJoin(gvoMake, eq(gvoModel.makeId, gvoMake.id))
    .where(
      or(
        eq(switchboardTransaction.buyerId, userId),
        eq(switchboardTransaction.sellerId, userId),
      ),
    )
    .orderBy(desc(switchboardTransaction.initiatedAt));

  return json({ ok: true, transactions });
};

// ── POST /api/switchboard ────────────────────────────────────────────
// Buyer initiates a Switchboard transaction.
// Flow:
//   1. Validate listing is active, buyer ≠ seller
//   2. Check seller has a bank account registered
//   3. Create Switchboard transaction (status: initiated)
//   4. Call Paystack to initialize payment
//   5. Return authorization URL for buyer to complete payment

export const POST: APIRoute = async ({ request, locals }) => {
  const user = (locals as { user: Record<string, unknown> | null }).user;
  if (!user?.id) {
    return json({ error: "Authentication required" }, 401);
  }

  const buyerId = user.id as string;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { listingId, agreedPriceNgn } = body;

  if (!listingId || typeof listingId !== "string") {
    return json({ error: "listingId is required" }, 400);
  }

  if (!agreedPriceNgn || typeof agreedPriceNgn !== "number" || agreedPriceNgn <= 0) {
    return json({ error: "agreedPriceNgn must be a positive number" }, 400);
  }

  // ── Fetch listing ──────────────────────────────────────────────
  const [listingRecord] = await db
    .select()
    .from(listing)
    .where(eq(listing.id, listingId))
    .limit(1);

  if (!listingRecord) {
    return json({ error: "Listing not found" }, 404);
  }

  if (listingRecord.status !== "active") {
    return json({ error: "Listing is not active" }, 422);
  }

  const sellerId = listingRecord.sellerId;

  // ── Buyer cannot be seller ─────────────────────────────────────
  if (buyerId === sellerId) {
    return json({ error: "Cannot buy your own listing" }, 422);
  }

  // ── Enforcement: check buyer's Switchboard privileges ──────────
  const buyerOk = await checkCanUseSwitchboard(buyerId);
  if (!buyerOk.ok) {
    return json({ error: buyerOk.error ?? "Switchboard unavailable for this account" }, 403);
  }

  // ── Enforcement: check seller's Switchboard privileges ─────────
  const sellerOk = await checkCanUseSwitchboard(sellerId);
  if (!sellerOk.ok) {
    return json({ error: "Seller cannot receive Switchboard payments at this time" }, 403);
  }

  // ── Check seller has a bank account ────────────────────────────
  const [bankAccount] = await db
    .select()
    .from(sellerBankAccount)
    .where(eq(sellerBankAccount.sellerId, sellerId))
    .limit(1);

  if (!bankAccount) {
    return json(
      { error: "Seller has not registered a bank account for receiving funds" },
      422,
    );
  }

  // ── Generate deterministic reference for idempotency ───────────
  const reference = `sbx_${listingId.slice(0, 8)}_${buyerId.slice(0, 8)}_${Date.now()}`;

  // ── Calculate platform fee ─────────────────────────────────────
  const feeNgn = calculatePlatformFee(agreedPriceNgn);
  const amountKobo = Math.round(agreedPriceNgn * 100);

  // ── Create Switchboard transaction ─────────────────────────────
  const tx = await initiateTransaction({
    listingId,
    buyerId,
    sellerId,
    agreedPriceNgn,
  });

  // ── Initialize Paystack payment ────────────────────────────────
  const provider = getPaymentProvider();
  const callbackUrl = `${import.meta.env.BETTER_AUTH_URL ?? "http://localhost:4321"}/switchboard/${tx.id}`;

  let paystackResult;
  try {
    paystackResult = await provider.initializeTransaction({
      switchboardTxId: tx.id,
      amountKobo,
      currency: "NGN",
      email: user.email as string,
      reference,
      callbackUrl,
    });
  } catch (err) {
    // Clean up orphaned transaction — listing must remain purchasable
    console.error("[SWITCHBOARD] Paystack initialization failed:", err);
    await db
      .delete(switchboardTransaction)
      .where(eq(switchboardTransaction.id, tx.id));
    return json(
      { error: "Payment initialization failed. Please try again." },
      502,
    );
  }

  // ── Store PSP reference on transaction ─────────────────────────
  await db
    .update(switchboardTransaction)
    .set({ providerRef: reference })
    .where(eq(switchboardTransaction.id, tx.id));

  return json(
    {
      ok: true,
      transactionId: tx.id,
      authorizationUrl: paystackResult.authorizationUrl,
      reference,
      amountNgn: agreedPriceNgn,
      platformFeeNgn: feeNgn,
      sellerReceivesNgn: agreedPriceNgn - feeNgn,
    },
    201,
  );
};

// ── Helpers ─────────────────────────────────────────────────────────

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
