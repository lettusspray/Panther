import type { APIRoute } from "astro";
import { db } from "../../../../../lib/db";
import { orderSettlement, user } from "../../../../../lib/db/schema";
import { and, eq } from "drizzle-orm";
import { isAdmin } from "../../../../../lib/admin";
import { notifySlack } from "../../../../../lib/notifications/slack";
import { settleOrderItemManually } from "../../../../../lib/orders";

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ request, locals, params }) => {
  const currentUser = (locals as { user?: { id?: string; email?: string | null } }).user;
  if (!isAdmin(currentUser)) return json({ error: "Admin access required" }, 403);
  const orderId = params.id;
  const settlementId = params.settlementId;
  if (!orderId || !settlementId) return json({ error: "Order and settlement are required" }, 400);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const amountNgn = Number(body.amountNgn);
  const fiatReference = typeof body.manualFiatReference === "string" ? body.manualFiatReference.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : undefined;
  if (!Number.isFinite(amountNgn) || amountNgn <= 0 || !fiatReference) return json({ error: "A positive amount and fiat reference are required" }, 422);

  const [existing] = await db.select({ settlement: orderSettlement, sellerName: user.name })
    .from(orderSettlement)
    .innerJoin(user, eq(orderSettlement.sellerId, user.id))
    .where(and(eq(orderSettlement.id, settlementId), eq(orderSettlement.orderId, orderId)))
    .limit(1);
  if (!existing) return json({ error: "Settlement not found" }, 404);

  const result = await settleOrderItemManually({
    settlementId,
    adminUserId: currentUser?.id as string,
    fiatReference,
    amountNgn,
    notes,
  });
  await notifySlack({
    type: "settlement.completed",
    title: "Seller settlement completed",
    summary: `${existing.sellerName ?? "Seller"} settlement was recorded against order ${orderId.slice(0, 8)}.`,
    fields: [
      { label: "Amount", value: `₦${amountNgn.toLocaleString("en-NG", { maximumFractionDigits: 2 })}` },
      { label: "Reference", value: fiatReference },
      { label: "Settlement", value: settlementId.slice(0, 8) },
      { label: "Operator", value: currentUser?.email ?? "admin" },
    ],
    url: `${(import.meta.env.PUBLIC_SITE_URL ?? "https://panther.ng").replace(/\/$/, "")}/admin/reconciliation`,
  });

  return json({ ok: true, settlement: result });
};
