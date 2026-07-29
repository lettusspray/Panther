CREATE TYPE "public"."report_status" AS ENUM('pending', 'reviewed', 'dismissed');
--> statement-breakpoint
CREATE TABLE "listing_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"reporter_id" uuid,
	"reason" text NOT NULL,
	"description" text,
	"status" "report_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing_report" ADD CONSTRAINT "listing_report_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "report_listing_idx" ON "listing_report" USING btree ("listing_id");
--> statement-breakpoint
CREATE INDEX "report_status_idx" ON "listing_report" USING btree ("status");
