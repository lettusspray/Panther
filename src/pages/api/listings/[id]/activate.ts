import type { APIRoute } from "astro";
import { activateListing } from "@/lib/listings/activation";

/**
 * POST /api/listings/[id]/activate
 *
 * Transition a draft listing to active. Validates:
 * - Owner is current user
 * - Status is draft
 * - At least 1 image uploaded
 * - GVO path, price, condition report all present
 */
export const POST: APIRoute = async ({ params, locals }) => {
  const user = (locals as { user: Record<string, unknown> | null }).user;
  if (!user?.id) {
    return new Response(
      JSON.stringify({ error: "Authentication required" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const listingId = params.id;
  if (!listingId) {
    return new Response(
      JSON.stringify({ error: "Listing ID is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const result = await activateListing(listingId, user.id as string);

  if (!result.ok) {
    const status = result.error?.includes("not found")
      ? 404
      : result.error?.includes("Only draft")
        ? 409
        : 422;
    return new Response(
      JSON.stringify({ error: result.error }),
      { status, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      listingId: result.listingId,
      status: "active",
      dealerSlug: result.dealerSlug,
      dealerUrl: result.dealerSlug ? `/dealers/${result.dealerSlug}` : null,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
