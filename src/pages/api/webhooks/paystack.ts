import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { db } from "../../../lib/db";
import { webhookEvent, switchboardTransaction, orderPayment } from "../../../lib/db/schema";
import { getPaymentProvider } from "../../../lib/payments";
import { markOrderPaymentStatus } from "../../../lib/orders";
import type { SwitchboardStatus } from "../../../lib/trust/switchboard";
import { canTransition } from "../../../lib/trust/switchboard";

const STATUS_MAP: Record<string, SwitchboardStatus> = {
  "transaction.success": "funds_held",
  "transfer.success": "released",
  "transfer.failed": "funds_held",
  "transfer.reversed": "funds_held",
};
const AUTO_ADVANCE: Record<string, SwitchboardStatus> = {
  "transaction.success": "inspection_window",
};

export const POST: APIRoute = async ({ request }) => {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");
  if (!signature) return new Response("Missing signature", { status: 401 });

  const provider = getPaymentProvider();
  if (!provider.verifyWebhookSignature(rawBody, signature)) return new Response("Invalid signature", { status: 401 });
  const event = provider.parseWebhookEvent(rawBody);
  if (!event) return new Response("OK", { status: 200 });

  // New marketplace order payment flow: verify success with Paystack before writing the webhook idempotency record.
  // This keeps a transient verification outage retryable instead of permanently deduped.
  if (event.type === "transaction.success" || event.type === "transaction.failed") {
    const [payment] = await db.select().from(orderPayment)
      .where(eq(orderPayment.providerRef, event.reference)).limit(1);
    if (payment) {
      if (event.type === "transaction.success") {
        try {
          const verification = await provider.verifyTransaction(event.reference);
          if (verification.status !== "success" || verification.amountKobo !== event.amountKobo || verification.currency !== "NGN") {
            return new Response("OK", { status: 200 });
          }
        } catch (error) {
          console.error("[WEBHOOK] Paystack verification failed", error);
          return new Response("Provider verification unavailable", { status: 503 });
        }
      }

      await markOrderPaymentStatus({
        paymentId: payment.id,
        status: event.type === "transaction.success" ? "paid" : "failed",
        providerPaymentId: event.providerId,
        metadata: event.rawPayload,
        externalReference: event.reference,
      });

      await recordWebhookEvent(event);
      return new Response("OK", { status: 200 });
    }
  }

  // Legacy Switchboard compatibility path.
  const dedupeKey = { provider: "paystack", eventType: event.type, reference: event.reference };
  const [existing] = await db.select().from(webhookEvent).where(and(
    eq(webhookEvent.provider, dedupeKey.provider),
    eq(webhookEvent.eventType, dedupeKey.eventType),
    eq(webhookEvent.reference, dedupeKey.reference),
  )).limit(1);
  if (existing) return new Response("OK", { status: 200 });
  await recordWebhookEvent(event);

  const targetStatus = STATUS_MAP[event.type];
  if (!targetStatus) return new Response("OK", { status: 200 });
  const [tx] = await db.select().from(switchboardTransaction)
    .where(eq(switchboardTransaction.providerRef, event.reference)).limit(1);
  if (!tx) return new Response("OK", { status: 200 });

  const check = canTransition(tx.status as SwitchboardStatus, targetStatus);
  if (!check.ok) return new Response("OK", { status: 200 });
  const updates: Record<string, unknown> = { status: targetStatus, providerMetadata: event.rawPayload };
  if (targetStatus === "released" || targetStatus === "refunded") updates.completedAt = new Date();
  await db.update(switchboardTransaction).set(updates).where(eq(switchboardTransaction.id, tx.id));

  const autoStatus = AUTO_ADVANCE[event.type];
  if (autoStatus && canTransition(targetStatus, autoStatus).ok) {
    await db.update(switchboardTransaction).set({ status: autoStatus }).where(eq(switchboardTransaction.id, tx.id));
  }
  return new Response("OK", { status: 200 });
};

async function recordWebhookEvent(event: { type: string; reference: string; providerId: string; rawPayload: Record<string, unknown> }) {
  try {
    await db.insert(webhookEvent).values({
      provider: "paystack",
      eventType: event.type,
      reference: event.reference,
      providerId: event.providerId,
      payload: event.rawPayload,
    });
  } catch (err) {
    if (isPgUniqueViolation(err)) return;
    throw err;
  }
}

function isPgUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505";
}
