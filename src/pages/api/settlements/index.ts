import type { APIRoute } from "astro";
import { getPendingSettlementQueue } from "../../../lib/orders";

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function isAdmin(user: { email?: string | null }) {
  const allowed = (import.meta.env.PANTHER_ADMIN_EMAILS ?? "")
    .split(",").map((x: string) => x.trim().toLowerCase()).filter(Boolean);
  return !!user.email && allowed.includes(user.email.toLowerCase());
}

export const GET: APIRoute = async ({ locals, request }) => {
  const user = (locals as { user: { email?: string | null } | null }).user;
  if (!user?.email) return json({ error: "Authentication required" }, 401);
  if (!isAdmin(user)) return json({ error: "Admin access required" }, 403);
  const limit = Math.min(500, Math.max(1, Number(new URL(request.url).searchParams.get("limit") ?? "100")));
  return json({ ok: true, settlements: await getPendingSettlementQueue(limit) });
};
