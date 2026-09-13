CREATE TABLE "dealer_inquiry" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dealer_id" uuid NOT NULL REFERENCES "dealer"("id") ON DELETE CASCADE,
  "listing_id" uuid REFERENCES "listing"("id") ON DELETE SET NULL,
  "buyer_id" uuid REFERENCES "user"("id") ON DELETE SET NULL,
  "channel" text NOT NULL CHECK ("channel" IN ('whatsapp', 'phone', 'platform')),
  "status" text NOT NULL DEFAULT 'new' CHECK ("status" IN ('new', 'responded')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "first_response_at" timestamptz
);
CREATE INDEX "dealer_inquiry_dealer_idx" ON "dealer_inquiry" ("dealer_id", "created_at");
CREATE INDEX "dealer_inquiry_status_idx" ON "dealer_inquiry" ("status", "created_at");
CREATE INDEX "dealer_inquiry_listing_idx" ON "dealer_inquiry" ("listing_id", "created_at");
