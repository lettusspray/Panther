/**
 * WhatsApp Auth Webhook
 *
 * Constitution §VII.3: Zero-Cost Inbound WhatsApp Authentication
 *
 * Handles:
 *   GET  — Meta verification challenge (hub.challenge)
 *   POST — Incoming WhatsApp messages with auth tokens
 *
 * Flow:
 *   1. User sends "Verify AUTH_XXXXXXXX" to business WhatsApp
 *   2. Meta delivers message to this webhook
 *   3. We extract token, verify against transient store
 *   4. On success: associate phone with user, send confirmation
 *   5. Confirmation closes the auth loop AND captures community retention
 */

import type { APIRoute } from "astro";
import {
  verifyAuthToken,
  verifyPhone,
  verifyWebhookSignature,
} from "../../../../lib/auth/whatsapp";
import { parseAuthTokenFromMessage } from "../../../../lib/auth/whatsapp-link";
import { buildConfirmationMessage } from "../../../../lib/auth/whatsapp-link";

// ── Meta WhatsApp Cloud API Types ────────────────────────────────────

interface MetaMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
}

interface MetaEntry {
  changes: {
    value: {
      messaging_product: string;
      metadata: { display_phone_number: string; phone_number_id: string };
      messages?: MetaMessage[];
    };
  }[];
}

interface MetaWebhookBody {
  object: string;
  entry: MetaEntry[];
}

// ── Meta Cloud API: Send Message ─────────────────────────────────────

async function sendWhatsAppMessage(
  to: string,
  text: string,
): Promise<boolean> {
  const phoneNumberId = import.meta.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = import.meta.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.error("[WHATSAPP] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN");
    return false;
  }

  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error(`[WHATSAPP] Send failed: ${res.status} ${error}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[WHATSAPP] Send error: ${err}`);
    return false;
  }
}

// ── Webhook Handler ──────────────────────────────────────────────────

export const GET: APIRoute = async ({ url }) => {
  // Meta verification challenge
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe") {
    const verifyToken = import.meta.env.WHATSAPP_VERIFY_TOKEN;

    if (token === verifyToken && challenge) {
      console.log("[WHATSAPP] Webhook verified");
      return new Response(challenge, { status: 200 });
    }

    console.warn("[WHATSAPP] Verification failed — token mismatch");
    return new Response("Forbidden", { status: 403 });
  }

  return new Response("Bad Request", { status: 400 });
};

export const POST: APIRoute = async ({ request }) => {
  // Verify signature if secret is configured
  const appSecret = import.meta.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    const signature = request.headers.get("x-hub-signature-256");
    if (!signature) {
      return new Response("Missing signature", { status: 401 });
    }

    const body = await request.text();
    if (!verifyWebhookSignature(body, signature.replace("sha256=", ""), appSecret)) {
      return new Response("Invalid signature", { status: 401 });
    }

    // Re-parse after signature verification
    const webhookBody = JSON.parse(body) as MetaWebhookBody;
    return processWebhookBody(webhookBody);
  }

  // No signature verification (dev mode)
  const webhookBody = await request.json() as MetaWebhookBody;
  return processWebhookBody(webhookBody);
};

async function processWebhookBody(body: MetaWebhookBody): Promise<Response> {
  if (body.object !== "whatsapp_business_account") {
    return new Response("OK", { status: 200 });
  }

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const messages = change.value?.messages ?? [];

      for (const message of messages) {
        if (message.type !== "text") continue;

        const textBody = message.text?.body;
        if (!textBody) continue;

        // Extract auth token from message
        const token = parseAuthTokenFromMessage(textBody);
        if (!token) {
          // Not an auth message — ignore silently per constitution
          continue;
        }

        // Verify token
        const userId = await verifyAuthToken(token);
        if (!userId) {
          // Invalid/expired token — silently drop per constitution
          console.log(`[WHATSAPP] Invalid/expired token from ${message.from}`);
          continue;
        }

        // Associate phone with user
        const phoneVerified = await verifyPhone(userId, message.from);
        if (!phoneVerified) {
          console.error(`[WHATSAPP] Failed to verify phone for user ${userId}`);
          continue;
        }

        // Send confirmation message — closes the auth loop
        // and captures community retention for $0.00
        const confirmationText = buildConfirmationMessage();
        const sent = await sendWhatsAppMessage(message.from, confirmationText);

        if (sent) {
          console.log(`[WHATSAPP] Auth verified for user ${userId}, phone ${message.from}`);
        } else {
          console.error(`[WHATSAPP] Failed to send confirmation to ${message.from}`);
        }
      }
    }
  }

  return new Response("OK", { status: 200 });
}
