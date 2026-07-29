/**
 * WhatsApp Auth Token Management
 *
 * Constitution §VII.3: Zero-Cost Inbound WhatsApp Authentication
 *
 * Flow:
 *   1. User initiates login → backend generates auth_XXXXXXXX token
 *   2. Token stored in system_config with 5-min TTL
 *   3. WhatsApp deep link sent to user: wa.me/<NUMBER>?text=Verify%20<TOKEN>
 *   4. User sends message → webhook extracts token → verifies → associates phone
 *   5. Confirmation message sent back within Meta's 24hr service window
 */

import { db } from "../db";
import { systemConfig, user } from "../db/schema";
import { eq } from "drizzle-orm";
import { createHmac, randomBytes } from "crypto";

// ── Config ──────────────────────────────────────────────────────────

const TOKEN_PREFIX = "auth_";
const TOKEN_LENGTH = 8; // 8 hex chars → 16 bytes entropy
const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── Token Generation ────────────────────────────────────────────────

function generateToken(): string {
  const bytes = randomBytes(TOKEN_LENGTH);
  return TOKEN_PREFIX + bytes.toString("hex").toUpperCase();
}

/**
 * Create an auth token for WhatsApp verification.
 * Stored in system_config with prefix "whatsapp_auth:" for fast lookup.
 */
export async function createAuthToken(userId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  // Delete any existing tokens for this user
  await db
    .delete(systemConfig)
    .where(eq(systemConfig.key, `whatsapp_auth:${userId}`));

  // Store token with user ID and expiry
  await db.insert(systemConfig).values({
    key: `whatsapp_auth:${userId}`,
    value: JSON.stringify({ token, userId, expiresAt: expiresAt.toISOString() }),
    effectiveTimestamp: new Date(),
    source: "whatsapp-auth",
  });

  return { token, expiresAt };
}

/**
 * Verify a WhatsApp auth token.
 * Returns the associated userId if valid, null otherwise.
 */
export async function verifyAuthToken(token: string): Promise<string | null> {
  // Scan for matching token (tokens are ephemeral, low volume)
  const rows = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.source, "whatsapp-auth"));

  for (const row of rows) {
    try {
      const data = JSON.parse(row.value) as {
        token: string;
        userId: string;
        expiresAt: string;
      };

      if (data.token !== token) continue;

      // Check expiry
      if (new Date(data.expiresAt) < new Date()) {
        // Token expired — clean up
        await db.delete(systemConfig).where(eq(systemConfig.key, row.key));
        continue;
      }

      // Valid token — clean up and return userId
      await db.delete(systemConfig).where(eq(systemConfig.key, row.key));
      return data.userId;
    } catch {
      // Malformed entry — skip
      continue;
    }
  }

  return null;
}

/**
 * Mark a user's phone number as verified after WhatsApp auth.
 */
export async function verifyPhone(userId: string, phone: string): Promise<boolean> {
  try {
    await db
      .update(user)
      .set({
        phone,
        phoneVerified: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId));
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate HMAC signature for webhook verification.
 * Used to verify incoming Meta webhook requests.
 */
export function generateWebhookSignature(
  payload: string,
  secret: string,
): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Verify Meta webhook signature.
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected = generateWebhookSignature(payload, secret);
  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}
