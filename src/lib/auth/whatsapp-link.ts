/**
 * WhatsApp Deep Link Generator
 *
 * Constitution §VII.3: Generates WhatsApp deep links for auth flow.
 * Mobile: opens WhatsApp app directly.
 * Desktop: same URL rendered as scannable QR code.
 */

// ── Config ──────────────────────────────────────────────────────────

const WHATSAPP_BUSINESS_NUMBER = () =>
  import.meta.env.WHATSAPP_BUSINESS_NUMBER ?? "";

const COMMUNITY_LINK = () =>
  import.meta.env.WHATSAPP_COMMUNITY_LINK ?? "https://chat.whatsapp.com/panther";

// ── Deep Link Generation ────────────────────────────────────────────

/**
 * Generate a WhatsApp deep link for auth verification.
 *
 * Format: https://wa.me/<BUSINESS_NUMBER>?text=Verify%20<AUTH_TOKEN>
 *
 * On mobile: opens WhatsApp app with pre-filled message.
 * On desktop: opens WhatsApp Web with pre-filled message.
 */
export function generateAuthDeepLink(authToken: string): string {
  const number = WHATSAPP_BUSINESS_NUMBER();
  const text = `Verify ${authToken}`;
  const encodedText = encodeURIComponent(text);

  if (number) {
    return `https://wa.me/${number}?text=${encodedText}`;
  }

  // Fallback: no business number configured — return generic link
  return `https://wa.me/?text=${encodedText}`;
}

/**
 * Generate QR code data URL for desktop auth.
 * Returns the same deep link — the frontend renders it as a QR code.
 */
export function generateAuthQrData(authToken: string): string {
  return generateAuthDeepLink(authToken);
}

/**
 * Build the confirmation message sent after successful verification.
 * Constitution §VII.3: "Converts a transactional authentication event
 * into long-term community retention for $0.00."
 */
export function buildConfirmationMessage(): string {
  const communityLink = COMMUNITY_LINK();
  return (
    "Login verified! Welcome to Panther. " +
    "Join the team — connect with other members, get updates, " +
    "talk to us and share feedback directly in our community here: " +
    communityLink
  );
}

/**
 * Parse incoming WhatsApp message to extract auth token.
 * Returns the token if found, null otherwise.
 */
export function parseAuthTokenFromMessage(messageBody: string): string | null {
  // Expected format: "Verify AUTH_XXXXXXXX" or just "AUTH_XXXXXXXX"
  const tokenPattern = /auth_[0-9A-F]{16}/i;
  const match = messageBody.match(tokenPattern);
  return match ? match[0].toUpperCase() : null;
}
