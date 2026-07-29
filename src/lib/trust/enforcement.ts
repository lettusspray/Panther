import { eq } from "drizzle-orm";
import { db } from "../db";
import { user, listing } from "../db/schema";

export type DisclosureTier = "none" | "warning" | "suspended" | "deactivated";

export interface EnforcementStatus {
  tier: DisclosureTier;
  canCreateListing: boolean;
  canUseSwitchboard: boolean;
  canActivateListing: boolean;
  reason: string | null;
}

export async function getDisclosureTier(userId: string): Promise<DisclosureTier> {
  const [row] = await db
    .select({ tier: user.disclosureTier })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.tier ?? "none";
}

export async function getEnforcementStatus(userId: string): Promise<EnforcementStatus> {
  const tier = await getDisclosureTier(userId);

  switch (tier) {
    case "deactivated":
      return {
        tier,
        canCreateListing: false,
        canUseSwitchboard: false,
        canActivateListing: false,
        reason: "Account deactivated due to severe or repeated policy violations.",
      };
    case "suspended":
      return {
        tier,
        canCreateListing: true,
        canUseSwitchboard: false,
        canActivateListing: false,
        reason: "Switchboard privileges revoked. Existing listings are paused. Contact support to resolve.",
      };
    case "warning":
      return {
        tier,
        canCreateListing: true,
        canUseSwitchboard: true,
        canActivateListing: false,
        reason: "A disclosure issue has been flagged. Active listings are paused pending correction.",
      };
    default:
      return {
        tier: "none",
        canCreateListing: true,
        canUseSwitchboard: true,
        canActivateListing: true,
        reason: null,
      };
  }
}

export async function applySanction(
  userId: string,
  newTier: DisclosureTier,
  reason?: string,
): Promise<void> {
  await db
    .update(user)
    .set({
      disclosureTier: newTier,
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId));

  if (newTier === "warning" || newTier === "suspended") {
    await db
      .update(listing)
      .set({ status: "draft", updatedAt: new Date() })
      .where(eq(listing.sellerId, userId));
  }
}

export async function checkCanUseSwitchboard(
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const status = await getEnforcementStatus(userId);
  if (!status.canUseSwitchboard) {
    return { ok: false, error: status.reason ?? "Switchboard unavailable" };
  }
  return { ok: true };
}

export async function checkCanCreateListing(
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const status = await getEnforcementStatus(userId);
  if (!status.canCreateListing) {
    return { ok: false, error: status.reason ?? "Cannot create listings" };
  }
  return { ok: true };
}
