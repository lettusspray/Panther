import type { APIRoute } from "astro";
import { createListing } from "../../../lib/listings/creation";
import { checkCanCreateListing } from "../../../lib/trust/enforcement";

/**
 * POST /api/listings
 *
 * Create a new vehicle listing. Requires authentication.
 *
 * Body: { trimId, modelYear, mileageKm, askingPriceNgn, conditionReport, images? }
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const user = (locals as { user: Record<string, unknown> | null }).user;
  if (!user?.id) {
    return new Response(
      JSON.stringify({ error: "Authentication required" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const enforcement = await checkCanCreateListing(user.id as string);
  if (!enforcement.ok) {
    return new Response(
      JSON.stringify({ error: enforcement.error ?? "Cannot create listings" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { trimId, modelYear, mileageKm, askingPriceNgn, conditionReport, images, videos, customMake, customModel, customTrim } = body;

  if (!trimId && (!customMake || !customModel)) {
    return new Response(
      JSON.stringify({ error: "Either trimId or customMake + customModel is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!modelYear || typeof modelYear !== "number") {
    return new Response(
      JSON.stringify({ error: "modelYear is required (number)" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (mileageKm == null || typeof mileageKm !== "number") {
    return new Response(
      JSON.stringify({ error: "mileageKm is required (number)" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!askingPriceNgn || typeof askingPriceNgn !== "number") {
    return new Response(
      JSON.stringify({ error: "askingPriceNgn is required (number)" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!conditionReport || typeof conditionReport !== "object") {
    return new Response(
      JSON.stringify({ error: "conditionReport is required (object)" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const conditionReportObj = conditionReport as Record<string, unknown>;

  const result = await createListing({
    sellerId: user.id as string,
    trimId: trimId as string | undefined,
    modelYear,
    mileageKm,
    askingPriceNgn,
    conditionReport: conditionReportObj,
    images: Array.isArray(images) ? (images as Array<{ tag: string; url: string }>) : undefined,
    videos: Array.isArray(videos) ? (videos as Array<{ tag: string; url: string }>) : undefined,
    customMake: customMake as string | undefined,
    customModel: customModel as string | undefined,
    customTrim: customTrim as string | undefined,
  });

  if (!result.ok) {
    return new Response(
      JSON.stringify({ error: result.error }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ ok: true, listingId: result.listingId }),
    { status: 201, headers: { "Content-Type": "application/json" } },
  );
};
