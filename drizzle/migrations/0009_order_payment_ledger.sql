-- Migration 0009: Marketplace orders, provider payments and settlement ledger

ALTER TYPE listing_status ADD VALUE IF NOT EXISTS 'reserved';

CREATE TYPE order_status AS ENUM ('pending_payment','paid','verification','ready_for_settlement','partially_settled','settled','disputed','cancelled','refunded');
CREATE TYPE payment_method AS ENUM ('paystack','nowpayments');
CREATE TYPE payment_status AS ENUM ('pending','confirming','paid','partially_paid','failed','refunded','expired');
CREATE TYPE settlement_status AS ENUM ('pending','processing','settled','failed','reversed');
CREATE TYPE settlement_method AS ENUM ('paystack_transfer','manual_fiat');
CREATE TYPE ledger_entry_type AS ENUM ('collection','platform_fee','seller_payable','manual_settlement','refund','reversal','adjustment');
CREATE TYPE ledger_direction AS ENUM ('credit','debit');

CREATE TABLE "order" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  status order_status NOT NULL DEFAULT 'pending_payment',
  payment_method payment_method NOT NULL,
  total_ngn DECIMAL(16,2) NOT NULL,
  platform_fee_ngn DECIMAL(16,2) NOT NULL,
  payment_currency TEXT NOT NULL,
  payment_amount DECIMAL(18,8) NOT NULL,
  fx_rate_ngn_per_unit DECIMAL(18,8) NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_buyer_idx ON "order" (buyer_id);
CREATE INDEX order_status_idx ON "order" (status);
CREATE INDEX order_created_idx ON "order" (created_at);

CREATE TABLE order_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES listing(id) ON DELETE RESTRICT,
  seller_id UUID NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  agreed_price_ngn DECIMAL(16,2) NOT NULL,
  platform_fee_ngn DECIMAL(16,2) NOT NULL,
  seller_receivable_ngn DECIMAL(16,2) NOT NULL,
  listing_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, listing_id)
);
CREATE INDEX order_item_order_idx ON order_item (order_id);
CREATE INDEX order_item_seller_idx ON order_item (seller_id);
CREATE INDEX order_item_listing_idx ON order_item (listing_id);

CREATE TABLE order_payment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  method payment_method NOT NULL,
  status payment_status NOT NULL DEFAULT 'pending',
  provider_ref TEXT NOT NULL UNIQUE,
  provider_payment_id TEXT,
  price_amount DECIMAL(18,8) NOT NULL,
  price_currency TEXT NOT NULL,
  pay_amount DECIMAL(30,12),
  pay_currency TEXT,
  actually_paid_amount DECIMAL(30,12),
  outcome_amount DECIMAL(30,12),
  outcome_currency TEXT,
  provider_metadata JSONB,
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_payment_order_idx ON order_payment (order_id);
CREATE INDEX order_payment_provider_payment_idx ON order_payment (provider_payment_id);
CREATE INDEX order_payment_status_idx ON order_payment (status);

CREATE TABLE order_settlement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES order_item(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  amount_ngn DECIMAL(16,2) NOT NULL,
  status settlement_status NOT NULL DEFAULT 'pending',
  method settlement_method NOT NULL DEFAULT 'manual_fiat',
  paystack_transfer_ref TEXT,
  manual_fiat_reference TEXT,
  manual_settled_at TIMESTAMPTZ,
  manual_settled_by UUID REFERENCES "user"(id) ON DELETE SET NULL,
  destination_snapshot JSONB,
  evidence JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_item_id)
);
CREATE INDEX order_settlement_order_idx ON order_settlement (order_id);
CREATE INDEX order_settlement_seller_idx ON order_settlement (seller_id);
CREATE INDEX order_settlement_status_idx ON order_settlement (status);

CREATE TABLE ledger_entry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES "order"(id) ON DELETE RESTRICT,
  order_item_id UUID REFERENCES order_item(id) ON DELETE SET NULL,
  type ledger_entry_type NOT NULL,
  direction ledger_direction NOT NULL,
  currency TEXT NOT NULL,
  amount DECIMAL(30,12) NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  external_reference TEXT,
  created_by UUID REFERENCES "user"(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ledger_order_idx ON ledger_entry (order_id);
CREATE INDEX ledger_order_item_idx ON ledger_entry (order_item_id);
CREATE INDEX ledger_created_idx ON ledger_entry (created_at);
