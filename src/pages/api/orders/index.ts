import type { APIRoute } from "astro";
import {
  createMarketplaceOrder,
  getOrderForBuyer,
  listCryptoCurrencies,
} from "../../../lib/orders";

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

export const GET: APIRoute = async ({ request, locals }) => {
  const user = (locals as { user: { id?: string } | null }).user;
  if (!user?.id) return json({ error: "Authentication required" }, 401);
  const url = new URL(request.url);
  const orderId = url.searchParams.get("id");
  if (url.searchParams.get("resource") === "crypto-currencies") {
    try { return json({ ok: true, currencies: await listCryptoCurrencies() }); }
    catch { return json({ error: "Crypto currencies are temporarily unavailable." }, 502); }
  }
  if (!orderId) return json({ error: "id is required" }, 400);
  const record = await getOrderForBuyer(orderId, user.id);
  if (!record) return json({ error: "Order not found" }, 404);
  return json({ ok: true, order: record });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = (locals as { user: { id?: string; email?: string } | null }).user;
  if (!user?.id) return json({ error: "Authentication required" }, 401);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const listingIds = Array.isArray(body.listingIds) ? body.listingIds.filter((x): x is string => typeof x === "string") : [];
  const paymentMethod = body.paymentMethod;
  const idempotencyKey = body.idempotencyKey;
  const payCurrency = typeof body.payCurrency === "string" ? body.payCurrency : undefined;
  if (!listingIds.length) return json({ error: "listingIds must contain at least one listing ID" }, 400);
  if (paymentMethod !== "paystack" && paymentMethod !== "nowpayments") return json({ error: "paymentMethod must be paystack or nowpayments" }, 400);
  if (typeof idempotencyKey !== "string" || idempotencyKey.length < 16 || idempotencyKey.length > 120) {
    return json({ error: "idempotencyKey must be 16-120 characters" }, 400);
  }
  try {
    const result = await createMarketplaceOrder({
      buyerId: user.id,
      buyerEmail: user.email ?? "",
      listingIds,
      paymentMethod,
      payCurrency,
      idempotencyKey,
      callbackBaseUrl: new URL(request.url).origin,
    });
    return json({ ok: true, ...result }, result.reused ? 200 : 201);
  } catch (error) {
    console.error("[ORDERS] create failed", error);
    return json({ error: error instanceof Error ? error.message : "Unable to create order." }, 422);
  }
};
