import type { APIRoute } from "astro";
import { createDealerCareEvent, getDealerByUserId } from "../../../lib/dealer";
import { vehicleCareEventTypeEnum } from "../../../lib/db/schema";

export const POST: APIRoute = async ({ request, locals }) => {
  const user = (locals as { user: Record<string, unknown> | null }).user;
  if (!user?.id) return json({ error: "Authentication required" }, 401);
  if (!(await getDealerByUserId(user.id as string))) return json({ error: "Dealer profile required" }, 403);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const type = body.type as string;
  if (!vehicleCareEventTypeEnum.enumValues.includes(type as never)) return json({ error: "Invalid care event type" }, 400);
  if (!body.listingId || typeof body.listingId !== "string" || !body.title || typeof body.title !== "string" || !body.eventDate || typeof body.eventDate !== "string") {
    return json({ error: "listingId, type, title and eventDate are required" }, 400);
  }
  try {
    const event = await createDealerCareEvent(user.id as string, {
      listingId: body.listingId,
      type: type as (typeof vehicleCareEventTypeEnum.enumValues)[number],
      eventDate: new Date(body.eventDate),
      title: body.title,
      notes: typeof body.notes === "string" ? body.notes : undefined,
      provider: typeof body.provider === "string" ? body.provider : undefined,
      location: typeof body.location === "string" ? body.location : undefined,
      mileageKm: typeof body.mileageKm === "number" ? body.mileageKm : undefined,
      nextDueAt: typeof body.nextDueAt === "string" ? new Date(body.nextDueAt) : undefined,
      nextDueMileageKm: typeof body.nextDueMileageKm === "number" ? body.nextDueMileageKm : undefined,
      evidenceUrl: typeof body.evidenceUrl === "string" ? body.evidenceUrl : undefined,
      isPublic: body.isPublic !== false,
    });
    return json({ ok: true, event }, 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not record vehicle event" }, 422);
  }
};

function json(data: Record<string, unknown>, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
