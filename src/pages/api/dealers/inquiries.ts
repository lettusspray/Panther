import type { APIRoute } from "astro";
import {
  createDealerInquiry,
  getDealerInquiries,
  getDealerInquirySummary,
  markDealerInquiryResponded,
} from "../../../lib/dealer/inquiries";
import { getDealerByUserId } from "../../../lib/dealer";

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const channels = new Set(["whatsapp", "phone", "platform"]);

export const GET: APIRoute = async ({ locals }) => {
  const user = (locals as { user?: { id?: string } | null }).user;
  if (!user?.id) return json({ error: "Authentication required" }, 401);
  const dealer = await getDealerByUserId(user.id);
  if (!dealer) return json({ error: "Dealer profile required" }, 403);

  const [summary, inquiries] = await Promise.all([
    getDealerInquirySummary(dealer.id),
    getDealerInquiries(dealer.id),
  ]);
  return json({ ok: true, summary, inquiries });
};

export const POST: APIRoute = async ({ request, locals }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const dealerSlug = typeof body.dealerSlug === "string" ? body.dealerSlug.trim() : "";
  const channel = typeof body.channel === "string" ? body.channel : "";
  const listingId = typeof body.listingId === "string" ? body.listingId : null;
  if (!dealerSlug || !channels.has(channel)) {
    return json({ error: "dealerSlug and a supported channel are required" }, 400);
  }

  const user = (locals as { user?: { id?: string } | null }).user;
  try {
    const inquiry = await createDealerInquiry({
      dealerSlug,
      channel: channel as "whatsapp" | "phone" | "platform",
      listingId,
      buyerId: user?.id ?? null,
    });
    if (!inquiry) return json({ error: "Dealer not found" }, 404);
    return json({ ok: true, inquiryId: String(inquiry.id) }, 201);
  } catch (error) {
    console.error("[DEALER INQUIRY] create failed", error);
    return json({ error: "Could not record contact initiation" }, 422);
  }
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  const user = (locals as { user?: { id?: string } | null }).user;
  if (!user?.id) return json({ error: "Authentication required" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const inquiryId = typeof body.inquiryId === "string" ? body.inquiryId : "";
  if (!inquiryId) return json({ error: "inquiryId is required" }, 400);

  const result = await markDealerInquiryResponded(user.id, inquiryId);
  if (!result) return json({ error: "Inquiry not found" }, 404);
  return json({ ok: true, inquiry: result });
};
