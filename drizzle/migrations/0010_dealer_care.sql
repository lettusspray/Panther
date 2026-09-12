CREATE TYPE "public"."vehicle_care_event_type" AS ENUM('inspection','service','warranty','import_clearance','shipment','ownership');

CREATE TABLE "dealer_commitment" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dealer_id" uuid NOT NULL UNIQUE REFERENCES "dealer"("id") ON DELETE CASCADE,
  "warranty_months" integer DEFAULT 0 NOT NULL,
  "warranty_mileage_km" integer,
  "complimentary_service_months" integer DEFAULT 0 NOT NULL,
  "annual_inspection_included" boolean DEFAULT false NOT NULL,
  "import_documentation_available" boolean DEFAULT false NOT NULL,
  "bulk_sales_available" boolean DEFAULT false NOT NULL,
  "service_notes" text,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "dealer_commitment_dealer_idx" ON "dealer_commitment" ("dealer_id");

CREATE TABLE "vehicle_care_event" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "listing_id" uuid NOT NULL REFERENCES "listing"("id") ON DELETE CASCADE,
  "dealer_id" uuid NOT NULL REFERENCES "dealer"("id") ON DELETE CASCADE,
  "order_item_id" uuid REFERENCES "order_item"("id") ON DELETE SET NULL,
  "owner_id" uuid REFERENCES "user"("id") ON DELETE SET NULL,
  "type" "vehicle_care_event_type" NOT NULL,
  "event_date" timestamptz NOT NULL,
  "title" text NOT NULL,
  "notes" text,
  "provider" text,
  "location" text,
  "mileage_km" integer,
  "next_due_at" timestamptz,
  "next_due_mileage_km" integer,
  "evidence_url" text,
  "is_public" boolean DEFAULT true NOT NULL,
  "created_by" uuid REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "vehicle_care_listing_idx" ON "vehicle_care_event" ("listing_id", "event_date");
CREATE INDEX "vehicle_care_dealer_idx" ON "vehicle_care_event" ("dealer_id", "event_date");
CREATE INDEX "vehicle_care_due_idx" ON "vehicle_care_event" ("next_due_at");
