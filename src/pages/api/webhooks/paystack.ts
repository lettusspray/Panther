/**
 * Paystack Webhook Handler
 *
 * Constitution §X.4: "Third-party rails are dumb pipes for fiat movement."
 *
 * Paystack sends webhooks to this endpoint on payment/transfer events.
 * CRITICAL (from rigorous audit):
 *   1. Signature is HMAC-SHA512 (NOT SHA256) over raw body bytes
 *   2. 72-hour retry window — mandatory idempotency via webhook_event table
 *   3. No timestamp in signature — IP whitelist + idempotency DB required
 *   4. Must return 200 immediately — process async after acknowledgment
 *
 * Webhook source IPs: 52.31.139.75, 52.49.173.169, 52.214.14.220
 */

import type { APIRoute } from "astro";
import { eq, and } from "drizzle-orm";
import { db } from "../../../lib/db";
import { webhookEvent, switchboardTransaction } from "../../../lib/db/schema";
import { getPaymentProvider } from "../../../lib/payments";
import type { SwitchboardStatus } from "../../../lib/trust/switchboard";
import { canTransition } from "../../../lib/trust/switchboard";

// ── Webhook Event → Switchboard Status Mapping ──────────────────────
// Transaction events move the state machine forward.
// Transfer events confirm fund movement.

const STATUS_MAP: Record<string, SwitchboardStatus> = {
  "transaction.success": "funds_held",
  "transfer.success": "released",
  "transfer.failed": "funds_held", // stays — flag for manual review
  "transfer.reversed": "funds_held", // stays — flag for manual review
};

export const POST: APIRoute = async ({ request }) => {
  // ── Step 1: Raw body for HMAC-SHA512 verification ───────────────
  // CRITICAL: We MUST read the raw body bytes, NOT use request.json().
  // JSON.stringify(req.body) does not guarantee byte-perfect reproduction.
  const rawBody = await request.text();

  // ── Step 2: Signature verification ───────────────────────────────
  const signature = request.headers.get("x-paystack-signature");
  if (!signature) {
    return new Response("Missing signature", { status: 401 });
  }

  const provider = getPaymentProvider();
  if (!provider.verifyWebhookSignature(rawBody, signature)) {
    console.error("[WEBHOOK] Invalid Paystack signature — rejecting");
    return new Response("Invalid signature", { status: 401 });
  }

  // ── Step 3: Parse webhook event ──────────────────────────────────
  const event = provider.parseWebhookEvent(rawBody);
  if (!event) {
    // Unknown event type — acknowledge silently (Paystack retries on error)
    console.log(`[WEBHOOK] Unknown event type — acknowledging`);
    return new Response("OK", { status: 200 });
  }

  // ── Step 4: Idempotency check ────────────────────────────────────
  // Paystack retries for 72 hours. Without dedup, a single transaction
  // can trigger 20+ ledger writes.
  const dedupeKey = {
    provider: "paystack",
    eventType: event.type,
    reference: event.reference,
  };

  const [existing] = await db
    .select()
    .from(webhookEvent)
    .where(
      and(
        eq(webhookEvent.provider, dedupeKey.provider),
        eq(webhookEvent.eventType, dedupeKey.eventType),
        eq(webhookEvent.reference, dedupeKey.reference),
      ),
    )
    .limit(1);

  if (existing) {
    // Already processed — acknowledge (do NOT reprocess)
    console.log(
      `[WEBHOOK] Duplicate event: ${event.type} ref=${event.reference} — acknowledging`,
    );
    return new Response("OK", { status: 200 });
  }

  // ── Step 5: Record event (unique constraint catches race conditions) ──
  try {
    await db.insert(webhookEvent).values({
      provider: "paystack",
      eventType: event.type,
      reference: event.reference,
      providerId: event.providerId,
      payload: event.rawPayload,
    });
  } catch (err: unknown) {
    // Unique constraint violation = race condition with concurrent delivery
    if (isPgUniqueViolation(err)) {
      console.log(
        `[WEBHOOK] Race condition on ${event.type} ref=${event.reference} — acknowledging`,
      );
      return new Response("OK", { status: 200 });
    }
    throw err;
  }

  // ── Step 6: Process event → update Switchboard state ─────────────
  const targetStatus = STATUS_MAP[event.type];
  if (!targetStatus) {
    // Event type we don't act on — already logged, just acknowledge
    console.log(`[WEBHOOK] Event ${event.type} logged (no action)`);
    return new Response("OK", { status: 200 });
  }

  // Find the switchboard transaction by providerRef (the sbx_... reference)
  const [tx] = await db
    .select()
    .from(switchboardTransaction)
    .where(eq(switchboardTransaction.providerRef, event.reference))
    .limit(1);

  if (!tx) {
    // Transaction not found — log and acknowledge (don't retry)
    console.warn(
      `[WEBHOOK] Switchboard transaction not found for ref=${event.reference}`,
    );
    return new Response("OK", { status: 200 });
  }

  // Validate the state transition
  const check = canTransition(tx.status as SwitchboardStatus, targetStatus);
  if (!check.ok) {
    // Invalid transition — log warning but acknowledge (don't retry)
    console.warn(
      `[WEBHOOK] Invalid transition ${tx.status} → ${targetStatus} for tx=${tx.id}: ${check.error}`,
    );
    return new Response("OK", { status: 200 });
  }

  // Update the transaction
  const updates: Record<string, unknown> = {
    status: targetStatus,
    providerRef: event.providerId,
    providerMetadata: event.rawPayload,
  };

  if (targetStatus === "released" || targetStatus === "refunded") {
    updates.completedAt = new Date();
  }

  await db
    .update(switchboardTransaction)
    .set(updates)
    .where(eq(switchboardTransaction.id, tx.id));

  console.log(
    `[WEBHOOK] Switchboard tx=${tx.id}: ${tx.status} → ${targetStatus} (event: ${event.type})`,
  );

  return new Response("OK", { status: 200 });
};

// ── Helpers ─────────────────────────────────────────────────────────

function isPgUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}
