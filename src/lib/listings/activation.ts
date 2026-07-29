import { db } from "../db";
import { listing } from "../db/schema";
import { eq, and } from "drizzle-orm";

export interface ActivateListingResult {
  ok: boolean;
  error?: string;
  listingId?: string;
}

/**
 * Activate a draft listing → active.
 *
 * Constitution §IV.1 minimum viable listing:
 * - Domain + GVO identification (trim must exist) ✓ validated at creation
 * - Price > 0 ✓ validated at creation
 * - Condition report complete ✓ validated at creation
 * - ≥4 tagged images ← validated here (activation gate)
 *
 * Additional checks:
 * - Listing must be in draft status
 * - Current user must be the seller
 * - All data already validated at creation; this is the activation gate
 */
export async function activateListing(
  listingId: string,
  userId: string,
): Promise<ActivateListingResult> {
  const [row] = await db
    .select({
      id: listing.id,
      sellerId: listing.sellerId,
      status: listing.status,
      images: listing.images,
      askingPriceNgn: listing.askingPriceNgn,
      conditionReport: listing.conditionReport,
      trimId: listing.trimId,
      modelYear: listing.modelYear,
    })
    .from(listing)
    .where(eq(listing.id, listingId))
    .limit(1);

  if (!row) {
    return { ok: false, error: "Listing not found." };
  }

  if (row.sellerId !== userId) {
    return { ok: false, error: "You can only activate your own listings." };
  }

  if (row.status !== "draft") {
    return {
      ok: false,
      error: `Listing is already ${row.status}. Only draft listings can be activated.`,
    };
  }

  const images = (row.images as Array<{ tag: string; url?: string }> | null) ?? [];
  if (images.length < 4) {
    return {
      ok: false,
      error:
        "At least 4 tagged photos are required to activate. Each photo must identify which part/angle it shows (front, rear, side, interior, dashboard, engine bay).",
    };
  }

  const validTags = ["front", "rear", "side", "interior", "dashboard", "engine_bay"];
  for (const img of images) {
    if (!img.tag || !validTags.includes(img.tag)) {
      return {
        ok: false,
        error: `Each photo must be tagged with a valid angle: ${validTags.join(", ")}.`,
      };
    }
    if (!img.url) {
      return {
        ok: false,
        error: "Each photo must have an uploaded file. Please re-upload any missing images.",
      };
    }
  }

  if (!row.trimId || !row.modelYear) {
    return {
      ok: false,
      error: "Vehicle identification incomplete. Please re-select from the ontology.",
    };
  }

  if (!row.askingPriceNgn || Number(row.askingPriceNgn) <= 0) {
    return {
      ok: false,
      error: "A valid asking price is required before activation.",
    };
  }

  if (!row.conditionReport || Object.keys(row.conditionReport).length === 0) {
    return {
      ok: false,
      error: "A complete condition report is required before activation.",
    };
  }

  await db
    .update(listing)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(listing.id, listingId));

  return { ok: true, listingId };
}
