-- Make trim_id nullable, add custom vehicle text fields for listings
-- when the vehicle is not in the Global Vehicle Ontology.

ALTER TABLE "listing" ALTER COLUMN "trim_id" DROP NOT NULL;
ALTER TABLE "listing" ADD COLUMN "custom_make" text;
ALTER TABLE "listing" ADD COLUMN "custom_model" text;
ALTER TABLE "listing" ADD COLUMN "custom_trim" text;
