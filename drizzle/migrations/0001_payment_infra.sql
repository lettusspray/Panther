-- Migration 0001: Payment Infrastructure
-- Adds: provider columns on switchboard_transaction, webhook_event, seller_bank_account

-- ── Switchboard Transaction: PSP reference columns ───────────────────
ALTER TABLE switchboard_transaction
  ADD COLUMN provider_ref text,
  ADD COLUMN provider_metadata jsonb;

-- ── Webhook Event Log (idempotency) ──────────────────────────────────
-- Constitution §X.4: Paystack retries live webhooks for 72 hours.
-- Without deduplication, a single transaction can trigger 20+ deliveries.
-- We dedupe on event_type + reference (the only reliable key Paystack gives us).

CREATE TABLE webhook_event (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      text NOT NULL,          -- "paystack"
  event_type    text NOT NULL,          -- "charge.success", "transfer.success"
  reference     text NOT NULL,          -- our reference or Paystack reference
  provider_id   text,                   -- PSP's internal event/transaction ID
  payload       jsonb NOT NULL,         -- full raw webhook payload for audit
  processed_at  timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (provider, event_type, reference)
);

-- ── Seller Bank Account (Paystack Transfer Recipient) ────────────────
-- Sellers must register a bank account before they can receive funds.
-- The recipient_code is Paystack's identifier for bank transfers.

CREATE TABLE seller_bank_account (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id       uuid NOT NULL REFERENCES "user"(id),
  bank_code       text NOT NULL,          -- e.g., "044" (Access Bank)
  account_number  text NOT NULL,          -- 10-digit Nigerian account number
  account_name    text,                   -- verified name from Paystack
  recipient_code  text NOT NULL,          -- Paystack transfer recipient code
  verified        boolean NOT NULL DEFAULT false,
  created_at      timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (seller_id, bank_code, account_number)
);

CREATE INDEX idx_seller_bank_seller ON seller_bank_account (seller_id);

-- ── Partial unique index: one active transaction per listing ─────────
-- Prevents double-spend: two buyers paying for the same vehicle simultaneously.
-- Only one transaction per listing can be in a non-terminal state at a time.

CREATE UNIQUE INDEX switchboard_active_listing_idx
  ON switchboard_transaction (listing_id)
  WHERE status IN ('initiated', 'funds_held', 'inspection_window', 'buyer_confirmed', 'seller_confirmed');
