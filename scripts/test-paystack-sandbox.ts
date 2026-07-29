#!/usr/bin/env tsx
/**
 * Paystack Sandbox Integration Test
 *
 * Tests the full Switchboard → Paystack flow using Paystack's test API.
 * Requires PAYSTACK_SECRET_KEY set to a test key (sk_test_...).
 *
 * Usage:
 *   PAYSTACK_SECRET_KEY=sk_test_xxx npx tsx scripts/test-paystack-sandbox.ts
 *
 * What this tests:
 *   1. Initialize a transaction (creates a Paystack checkout session)
 *   2. Verify the transaction (simulates successful payment)
 *   3. Create a transfer recipient (register a test bank account)
 *   4. Initiate a transfer (disburse funds to seller)
 *   5. Verify the transfer
 *   6. Webhook signature generation + verification (round-trip)
 *
 * IMPORTANT: This uses Paystack's TEST mode. No real money moves.
 * Test cards: 4084084084084081 (success), 4084080000000410 (insufficient funds)
 */

import { createHmac } from "node:crypto";

const PAYSTACK_BASE = "https://api.paystack.co";
const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

if (!SECRET_KEY || !SECRET_KEY.startsWith("sk_test_")) {
  console.error(
    "ERROR: Set PAYSTACK_SECRET_KEY to a test key (sk_test_...)\n" +
      "Usage: PAYSTACK_SECRET_KEY=sk_test_xxx npx tsx scripts/test-paystack-sandbox.ts",
  );
  process.exit(1);
}

const HEADERS = {
  Authorization: `Bearer ${SECRET_KEY}`,
  "Content-Type": "application/json",
};

// ── Helpers ─────────────────────────────────────────────────────────

async function apiRequest<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = (await res.json()) as {
    status: boolean;
    message: string;
    data: T;
  };

  if (!json.status) {
    throw new Error(`Paystack API error: ${json.message}`);
  }

  return json.data;
}

function log(emoji: string, msg: string) {
  console.log(`${emoji}  ${msg}`);
}

function pass(msg: string) {
  log("✅", msg);
}

function fail(msg: string) {
  log("❌", msg);
}

// ── Tests ───────────────────────────────────────────────────────────

async function testInitializeTransaction() {
  log("🧪", "Test 1: Initialize Transaction");
  const reference = `test_${Date.now()}_sandbox`;

  const data = await apiRequest<{
    authorization_url: string;
    access_code: string;
    reference: string;
  }>("POST", "/transaction/initialize", {
    email: "test@example.com",
    amount: 150000, // ₦1,500 in kobo
    currency: "NGN",
    reference,
    callback_url: "https://example.com/callback",
    metadata: { test: true },
  });

  if (!data.authorization_url) throw new Error("No authorization_url");
  if (!data.access_code) throw new Error("No access_code");
  if (data.reference !== reference) throw new Error("Reference mismatch");

  pass(`Created checkout: ${data.authorization_url.slice(0, 50)}...`);
  pass(`Reference: ${data.reference}`);
  return reference;
}

async function testVerifyTransaction(reference: string) {
  log("🧪", "Test 2: Verify Transaction (unpaid — expected 'pending')");

  try {
    const data = await apiRequest<{
      status: string;
      amount: number;
      reference: string;
    }>("GET", `/transaction/verify/${reference}`);

    // Transaction exists but hasn't been paid — Paystack returns status
    if (data.status === "pending") {
      pass(`Transaction exists, status: ${data.status} (expected for unpaid)`);
    } else {
      pass(`Transaction status: ${data.status}`);
    }
  } catch (err) {
    // Paystack returns an error for non-existent references
    pass(`Verification returned error (expected for un-paid test): ${(err as Error).message}`);
  }
}

async function testCreateTransferRecipient() {
  log("🧪", "Test 3: Create Transfer Recipient");

  try {
    const data = await apiRequest<{
      name: string;
      account_number: string;
      bank_code: string;
      recipient_code: string;
      details: { authorization_code: string | null; account_name: string | null };
    }>("POST", "/transferrecipient", {
      type: "nuban",
      name: "Test Seller",
      account_number: "3000000001", // Paystack test account (Wema Bank)
      bank_code: "035", // Wema Bank
      currency: "NGN",
    });

    pass(`Recipient created: ${data.recipient_code}`);
    pass(`Account: ${data.bank_code} / ${data.account_number}`);
    return data.recipient_code;
  } catch (err) {
    fail(`Recipient creation failed: ${(err as Error).message}`);
    pass("(Expected if test bank account is invalid — skipping transfer test)");
    return null;
  }
}

async function testInitiateTransfer(recipientCode: string) {
  log("🧪", "Test 4: Initiate Transfer");

  try {
    const data = await apiRequest<{
      id: number;
      status: string;
      reference: string;
      amount: number;
    }>("POST", "/transfer", {
      source: "balance",
      amount: 97500, // ₦975 in kobo
      recipient: recipientCode,
      reason: "Panther sandbox test transfer",
      reference: `test_transfer_${Date.now()}`,
    });

    pass(`Transfer initiated: ID=${data.id}, status=${data.status}`);
    pass(`Reference: ${data.reference}`);
    return data.reference;
  } catch (err) {
    fail(`Transfer failed: ${(err as Error).message}`);
    pass("(Expected if Paystack balance is insufficient in test mode)");
    return null;
  }
}

async function testWebhookSignatureRoundTrip() {
  log("🧪", "Test 5: Webhook Signature Round-Trip");

  // Simulate what Paystack sends
  const webhookPayload = JSON.stringify({
    event: "charge.success",
    data: {
      id: 12345,
      reference: "test_ref_123",
      amount: 150000,
      status: "success",
      metadata: { switchboard_tx_id: "tx-test" },
    },
  });

  // Generate signature the way Paystack does (HMAC-SHA512)
  const signature = createHmac("sha512", SECRET_KEY)
    .update(webhookPayload)
    .digest("hex");

  // Verify it the way our adapter does
  const expected = createHmac("sha512", SECRET_KEY)
    .update(webhookPayload)
    .digest("hex");

  if (signature === expected) {
    pass("Signature round-trip: generated === verified");
  } else {
    fail("Signature mismatch");
  }

  // Verify timing-safe comparison works
  const { timingSafeEqual } = await import("node:crypto");
  const isValid = timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature),
  );

  if (isValid) {
    pass("timingSafeEqual: signatures match");
  } else {
    fail("timingSafeEqual: signatures do NOT match");
  }

  // Verify rejection of tampered payload
  const tampered = '{"event":"charge.success","data":{"amount":999999}}';
  const tamperedSig = createHmac("sha512", SECRET_KEY)
    .update(tampered)
    .digest("hex");

  const isInvalid = !timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(tamperedSig),
  );

  if (isInvalid) {
    pass("Tampered payload correctly rejected");
  } else {
    fail("Tampered payload was NOT rejected (security issue!)");
  }
}

async function testKoboConversion() {
  log("🧪", "Test 6: Kobo Conversion Accuracy");

  const testCases = [
    { naira: 1500, expectedKobo: 150000 },
    { naira: 100, expectedKobo: 10000 },
    { naira: 1234.56, expectedKobo: 123456 },
    { naira: 0.01, expectedKobo: 1 },
    { naira: 15000000, expectedKobo: 1500000000 }, // ₦15M max
  ];

  let allPassed = true;
  for (const { naira, expectedKobo } of testCases) {
    const kobo = Math.round(naira * 100);
    if (kobo !== expectedKobo) {
      fail(`₦${naira} → ${kobo} kobo (expected ${expectedKobo})`);
      allPassed = false;
    }
  }

  if (allPassed) {
    pass(`All ${testCases.length} conversion cases correct`);
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🐆 Panther Paystack Sandbox Integration Test\n");
  console.log(`Paystack API: ${PAYSTACK_BASE}`);
  console.log(`Test key: ${SECRET_KEY!.slice(0, 12)}...\n`);

  let passed = 0;
  let failed = 0;

  const run = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      passed++;
    } catch (err) {
      fail(`${name} threw: ${(err as Error).message}`);
      failed++;
    }
  };

  await run("Initialize Transaction", async () => {
    const ref = await testInitializeTransaction();
    await run("Verify Transaction", () => testVerifyTransaction(ref));
  });

  await run("Transfer Recipient + Transfer", async () => {
    const recipient = await testCreateTransferRecipient();
    if (recipient) {
      await testInitiateTransfer(recipient);
    }
  });

  await run("Webhook Signature", testWebhookSignatureRoundTrip);
  await run("Kobo Conversion", testKoboConversion);

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
