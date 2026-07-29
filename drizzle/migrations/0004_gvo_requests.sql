CREATE TYPE "public"."gvo_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "gvo_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" uuid,
	"domain" text NOT NULL,
	"make_name" text NOT NULL,
	"model_name" text NOT NULL,
	"trim_name" text,
	"notes" text,
	"status" "gvo_request_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "gvo_request_status_idx" ON "gvo_request" USING btree ("status");