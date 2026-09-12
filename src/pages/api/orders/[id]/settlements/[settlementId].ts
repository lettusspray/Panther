import type { APIRoute } from "astro";
import { settleOrderItemManually } from "../../../../../../lib/orders";

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function isAdmin(user: { email?: string | null }) {
  const allowed = (import.meta.env.PANTHER_ADMIN_EMAILS ?? "")
    .split(",").map((x: string) => x.trim().toLowerCase()).filter(Boolean);
  return !!user.email && allowed.includes(user.email.toLowerCase());
}

export const PATCH: APIRoute = async ({ request, locals, params }) => {
  const user = (locals as { user: { id?: string; email?: string | null } | null }).user;
  if (!user?.id) return json({ error: "Authentication required" }, 401);
  if (!isAdmin(user)) return json({ error: "Admin access required" }, 403);
  if (!params.settlementId) return json({ error: "settlementId is required" }, 400);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const fiatReference = typeof body.fiatReference === "string" ? body.fiatReference.trim() : "";
  const amountNgn = typeof body.amountNgn === "number" ? body.amountNgn : Number(body.amountNgn);
  if (!fiatReference) return json({ error: "fiatReference is required" }, 400);
  if (!Number.isFinite(amountNgn) || amountNgn <= 0) return json({ error: "amountNgn must be positive" }, 400);

  try {
    const result = await settleOrderItemManually({
      settlementId: params.settlementId,
      adminUserId: user.id,
      fiatReference,
      amountNgn,
      notes: typeof body.notes === "string" ? body.notes.slice(0, 1000) : undefined,
    });
    return json({ ok: true, ...result });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to settle seller." }, 422);
  }
};
