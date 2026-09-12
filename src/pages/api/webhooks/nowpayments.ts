import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { db } from "../../../lib/db";
import { orderPayment, webhookEvent } from "../../../lib/db/schema";
import { verifyNowPaymentsSignature, getNowPaymentStatus } from "../../../lib/payments/nowpayments";

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }

export const POST: APIRoute = async ({ request }) => {
  const raw = await request.text();
  const signature = request.headers.get("x-nowpayments-sig");
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!signature || !verifyNowPaymentsSignature(payload, signature)) return json({ error: "Invalid signature" }, 401);

  const paymentId = String(payload.payment_id ?? "");
  const status = String(payload.payment_status ?? "");
  const orderId = String(payload.order_id ?? "");
  if (!paymentId || !orderId || !status) return json({ ok: true });

  const [payment] = await db.select().from(orderPayment)
    .where(and(eq(orderPayment.orderId, orderId), eq(orderPayment.providerPaymentId, paymentId))).limit(1);
  if (!payment) return json({ ok: true });

  let authoritative = payload;
  if (status === "finished") {
    try { authoritative = (await getNowPaymentStatus(paymentId)) as unknown as Record<string, unknown>; }
    catch { return json({ ok: false, error: "Provider verification unavailable" }, 503); }
    if (String(authoritative.payment_status ?? "") !== "finished") return json({ ok: true });
  }

  const expected = Number(payment.priceAmount);
  const reported = Number(authoritative.price_amount ?? payload.price_amount ?? 0);
  if (status === "finished" && (!Number.isFinite(reported) || Math.abs(reported - expected) > 0.01)) {
    await db.update(orderPayment).set({ providerMetadata: { payload: authoritative, amountMismatch: true }, updatedAt: new Date() })
      .where(eq(orderPayment.id, payment.id));
    return json({ ok: true });
  }

  const eventType = `payment.${status}`;
  try {
    await db.insert(webhookEvent).values({ provider: "nowpayments", eventType, reference: paymentId, providerId: paymentId, payload: authoritative });
  } catch (error) {
    if (isUniqueViolation(error)) return json({ ok: true });
    throw error;
  }

  const normalized = status === "finished" ? "paid" : status === "confirming" || status === "sending" ? "confirming" : status === "partially_paid" ? "partially_paid" : status === "refunded" ? "refunded" : status === "expired" ? "expired" : status === "failed" ? "failed" : "pending";
  const { markOrderPaymentStatus } = await import("../../../lib/orders");
  await markOrderPaymentStatus({
    paymentId: payment.id,
    status: normalized,
    metadata: authoritative,
    providerPaymentId: paymentId,
    payAmount: Number(authoritative.pay_amount ?? payload.pay_amount ?? 0) || undefined,
    payCurrency: String(authoritative.pay_currency ?? payload.pay_currency ?? "") || undefined,
    actuallyPaidAmount: Number(authoritative.actually_paid ?? payload.actually_paid ?? 0) || undefined,
    outcomeAmount: Number(authoritative.outcome_amount ?? payload.outcome_amount ?? 0) || undefined,
    outcomeCurrency: String(authoritative.outcome_currency ?? payload.outcome_currency ?? "") || undefined,
    externalReference: paymentId,
  });

  return json({ ok: true });
};

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
}
