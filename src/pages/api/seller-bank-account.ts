/**
 * POST /api/seller-bank-account — Register seller's bank account
 *
 * Creates a Paystack transfer recipient so the seller can receive funds.
 * Requires: bank_code, account_number, account_name
 *
 * Paystack verifies the account details and returns a recipient_code
 * used for all future transfers to this seller.
 */

import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db";
import { sellerBankAccount } from "../../lib/db/schema";
import { getPaymentProvider } from "../../lib/payments";

export const POST: APIRoute = async ({ request, locals }) => {
  const user = (locals as { user: Record<string, unknown> | null }).user;
  if (!user?.id) {
    return json({ error: "Authentication required" }, 401);
  }

  const userId = user.id as string;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { bankCode, accountNumber, accountName } = body;

  if (!bankCode || typeof bankCode !== "string" || !/^\d{3}$/.test(bankCode)) {
    return json({ error: "bankCode must be a 3-digit string (e.g., '044' for Access Bank)" }, 400);
  }

  if (!accountNumber || typeof accountNumber !== "string" || !/^\d{10}$/.test(accountNumber)) {
    return json({ error: "accountNumber must be exactly 10 digits" }, 400);
  }

  if (!accountName || typeof accountName !== "string" || accountName.trim().length < 2) {
    return json({ error: "accountName is required (minimum 2 characters)" }, 400);
  }

  // ── Check if seller already has this account registered ─────────
  const [existing] = await db
    .select()
    .from(sellerBankAccount)
    .where(
      eq(sellerBankAccount.sellerId, userId) &&
        eq(sellerBankAccount.bankCode, bankCode) &&
        eq(sellerBankAccount.accountNumber, accountNumber),
    )
    .limit(1);

  if (existing) {
    return json({ ok: true, bankAccount: existing, message: "Already registered" });
  }

  // ── Create Paystack transfer recipient ─────────────────────────
  const provider = getPaymentProvider();
  let recipientResult;
  try {
    recipientResult = await provider.createTransferRecipient({
      bankCode,
      accountNumber,
      name: accountName,
    });
  } catch (err) {
    console.error("[SELLER-BANK] Paystack recipient creation failed:", err);
    return json(
      { error: "Failed to verify bank account. Please check your details." },
      502,
    );
  }

  // ── Store in DB ────────────────────────────────────────────────
  const [record] = await db
    .insert(sellerBankAccount)
    .values({
      sellerId: userId,
      bankCode,
      accountNumber,
      accountName,
      recipientCode: recipientResult.recipientCode,
      verified: recipientResult.verified,
    })
    .returning();

  return json({ ok: true, bankAccount: record }, 201);
};

// ── GET /api/seller-bank-account — List seller's registered accounts ──

export const GET: APIRoute = async ({ locals }) => {
  const user = (locals as { user: Record<string, unknown> | null }).user;
  if (!user?.id) {
    return json({ error: "Authentication required" }, 401);
  }

  const accounts = await db
    .select({
      id: sellerBankAccount.id,
      bankCode: sellerBankAccount.bankCode,
      accountNumber: sellerBankAccount.accountNumber,
      accountName: sellerBankAccount.accountName,
      verified: sellerBankAccount.verified,
      createdAt: sellerBankAccount.createdAt,
    })
    .from(sellerBankAccount)
    .where(eq(sellerBankAccount.sellerId, user.id as string));

  return json({ ok: true, accounts });
};

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
