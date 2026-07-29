import { eq } from "drizzle-orm";
import { db } from "../db";
import { switchboardTransaction, listing, user, gvoTrim, gvoModel, gvoMake } from "../db/schema";

// ── State Machine ────────────────────────────────────────────────
// Derived from reference implementation but adapted for P2P vehicle sales.
// Key differences from service-based escrow:
//   - No provider/customer split — buyer/seller
//   - No warranty escrow hold — vehicle is sold as-is post-inspection
//   - Platform fee is ALWAYS on the seller — not negotiable
//   - No cancellation fees. Ever.

export type SwitchboardStatus =
  | "initiated"
  | "funds_held"
  | "inspection_window"
  | "buyer_confirmed"
  | "seller_confirmed"
  | "disputed"
  | "released"
  | "refunded";

interface TransitionResult {
  ok: boolean;
  newStatus?: SwitchboardStatus;
  error?: string;
}

/**
 * Valid state transitions. Mirrors the constitution's flow:
 * 1. Buyer initiates → funds collected via PSP
 * 2. Funds held in escrow
 * 3. Inspection window opens (buyer inspects vehicle)
 * 4. Buyer confirms OR disputes
 * 5. Seller confirms
 * 6. Both confirmed → funds released to seller (minus platform fee)
 * 7. Dispute → manual resolution → release or refund
 * 8. Cancellation at any pre-release stage → full refund, zero fee
 */
const VALID_TRANSITIONS: Record<SwitchboardStatus, SwitchboardStatus[]> = {
  initiated: ["funds_held", "refunded"],
  funds_held: ["inspection_window", "refunded"],
  inspection_window: ["buyer_confirmed", "disputed", "refunded"],
  buyer_confirmed: ["seller_confirmed", "disputed", "refunded"],
  seller_confirmed: ["released", "disputed"],
  disputed: ["released", "refunded"],
  released: [],
  refunded: [],
};

export function canTransition(
  current: SwitchboardStatus,
  target: SwitchboardStatus,
): TransitionResult {
  const allowed = VALID_TRANSITIONS[current];
  if (!allowed || !allowed.includes(target)) {
    return {
      ok: false,
      error: `Invalid transition: ${current} → ${target}. Allowed: ${allowed?.join(", ") || "none"}`,
    };
  }
  return { ok: true, newStatus: target };
}

// ── Fee Calculation ──────────────────────────────────────────────
// Platform fee is ALWAYS deducted from seller proceeds.
// No negotiation. No split. Seller bears the fee.
// No cancellation fees. Refunds always return 100% of held funds.

const DEFAULT_FEE_RATE = 0.025; // 2.5% — configurable via system_config

export function calculatePlatformFee(
  agreedPriceNgn: number,
  feeRate: number = DEFAULT_FEE_RATE,
): number {
  return Math.round(agreedPriceNgn * feeRate * 100) / 100;
}

/**
 * Calculate what the seller receives after platform fee deduction.
 * Fee is always on the seller — non-negotiable.
 */
export function calculateSellerProceeds(
  agreedPriceNgn: number,
  feeRate: number = DEFAULT_FEE_RATE,
): { feeNgn: number; sellerReceivesNgn: number } {
  const feeNgn = calculatePlatformFee(agreedPriceNgn, feeRate);
  return {
    feeNgn,
    sellerReceivesNgn: Math.round((agreedPriceNgn - feeNgn) * 100) / 100,
  };
}

// ── Transaction Operations ───────────────────────────────────────

export async function initiateTransaction(params: {
  listingId: string;
  buyerId: string;
  sellerId: string;
  agreedPriceNgn: number;
  feeRate?: number;
}) {
  const feeNgn = calculatePlatformFee(params.agreedPriceNgn, params.feeRate);

  const [tx] = await db
    .insert(switchboardTransaction)
    .values({
      listingId: params.listingId,
      buyerId: params.buyerId,
      sellerId: params.sellerId,
      status: "initiated",
      agreedPriceNgn: String(params.agreedPriceNgn),
      platformFeeNgn: String(feeNgn),
      feePayer: "seller", // Always seller. Not negotiable.
    })
    .returning();

  return tx;
}

export async function transitionTransaction(
  transactionId: string,
  targetStatus: SwitchboardStatus,
) {
  const [current] = await db
    .select()
    .from(switchboardTransaction)
    .where(eq(switchboardTransaction.id, transactionId))
    .limit(1);

  if (!current) {
    return { ok: false as const, error: "Transaction not found" };
  }

  const check = canTransition(current.status as SwitchboardStatus, targetStatus);
  if (!check.ok) {
    return { ok: false as const, error: check.error };
  }

  const updates: Record<string, unknown> = { status: targetStatus };
  if (targetStatus === "released" || targetStatus === "refunded") {
    updates.completedAt = new Date();
  }

  const [updated] = await db
    .update(switchboardTransaction)
    .set(updates)
    .where(eq(switchboardTransaction.id, transactionId))
    .returning();

  return { ok: true as const, transaction: updated };
}

// ── Refund (Zero Fee) ────────────────────────────────────────────
// Constitution: "No Cancellation Fee, Ever."
// Refund always returns 100% of held funds to buyer.

export async function refundTransaction(transactionId: string) {
  return transitionTransaction(transactionId, "refunded");
}

// ── Query Helpers ────────────────────────────────────────────────

export async function getTransactionById(transactionId: string) {
  const [tx] = await db
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
    })
    .from(switchboardTransaction)
    .where(eq(switchboardTransaction.id, transactionId))
    .limit(1);

  return tx ?? null;
}

export async function getTransactionWithDetails(transactionId: string) {
  const [tx] = await db
    .select({
      id: switchboardTransaction.id,
      status: switchboardTransaction.status,
      agreedPriceNgn: switchboardTransaction.agreedPriceNgn,
      platformFeeNgn: switchboardTransaction.platformFeeNgn,
      feePayer: switchboardTransaction.feePayer,
      initiatedAt: switchboardTransaction.initiatedAt,
      completedAt: switchboardTransaction.completedAt,
      buyerName: user.name,
      buyerEmail: user.email,
      listingModelYear: listing.modelYear,
      trimName: gvoTrim.name,
      modelName: gvoModel.name,
      makeName: gvoMake.name,
    })
    .from(switchboardTransaction)
    .innerJoin(listing, eq(switchboardTransaction.listingId, listing.id))
    .innerJoin(user, eq(switchboardTransaction.buyerId, user.id))
    .innerJoin(gvoTrim, eq(listing.trimId, gvoTrim.id))
    .innerJoin(gvoModel, eq(gvoTrim.modelId, gvoModel.id))
    .innerJoin(gvoMake, eq(gvoModel.makeId, gvoMake.id))
    .where(eq(switchboardTransaction.id, transactionId))
    .limit(1);

  return tx ?? null;
}

export async function getTransactionsByBuyer(buyerId: string) {
  return db
    .select()
    .from(switchboardTransaction)
    .where(eq(switchboardTransaction.buyerId, buyerId))
    .orderBy(switchboardTransaction.initiatedAt);
}

export async function getTransactionsBySeller(sellerId: string) {
  return db
    .select()
    .from(switchboardTransaction)
    .where(eq(switchboardTransaction.sellerId, sellerId))
    .orderBy(switchboardTransaction.initiatedAt);
}
