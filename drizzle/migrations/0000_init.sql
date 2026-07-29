CREATE TYPE "public"."disclosure_tier" AS ENUM('none', 'warning', 'suspended', 'deactivated');--> statement-breakpoint
CREATE TYPE "public"."fee_payer" AS ENUM('buyer', 'seller', 'split');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('draft', 'active', 'sold', 'removed');--> statement-breakpoint
CREATE TYPE "public"."switchboard_status" AS ENUM('initiated', 'funds_held', 'inspection_window', 'buyer_confirmed', 'seller_confirmed', 'disputed', 'released', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."vehicle_domain" AS ENUM('car', 'motorcycle', 'tricycle', 'commercial');--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text
);
--> statement-breakpoint
CREATE TABLE "cohort_pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trim_id" uuid NOT NULL,
	"model_year" integer NOT NULL,
	"fob_low_usd" numeric(10, 2) NOT NULL,
	"fob_high_usd" numeric(10, 2) NOT NULL,
	"source" text,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gvo_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"hs_code" text,
	"duty_band" integer
);
--> statement-breakpoint
CREATE TABLE "gvo_domain" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	CONSTRAINT "gvo_domain_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "gvo_make" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"origin" text
);
--> statement-breakpoint
CREATE TABLE "gvo_model" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"make_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"first_model_year" integer,
	"last_model_year" integer
);
--> statement-breakpoint
CREATE TABLE "gvo_trim" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"engine" text,
	"transmission" text
);
--> statement-breakpoint
CREATE TABLE "knowledge_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trim_id" uuid NOT NULL,
	"warnings" jsonb NOT NULL,
	"specs" jsonb,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"trim_id" uuid NOT NULL,
	"model_year" integer NOT NULL,
	"mileage_km" integer,
	"status" "listing_status" DEFAULT 'draft' NOT NULL,
	"asking_price_ngn" numeric(14, 2),
	"condition_report" jsonb,
	"images" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "switchboard_transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"status" "switchboard_status" DEFAULT 'initiated' NOT NULL,
	"agreed_price_ngn" numeric(14, 2) NOT NULL,
	"platform_fee_ngn" numeric(14, 2),
	"fee_payer" "fee_payer" DEFAULT 'seller' NOT NULL,
	"initiated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "system_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"effective_timestamp" timestamp with time zone NOT NULL,
	"source" text,
	CONSTRAINT "system_config_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text,
	"phone" text,
	"email_verified" timestamp with time zone,
	"phone_verified" timestamp with time zone,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disclosure_tier" "disclosure_tier" DEFAULT 'none' NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_pricing" ADD CONSTRAINT "cohort_pricing_trim_id_gvo_trim_id_fk" FOREIGN KEY ("trim_id") REFERENCES "public"."gvo_trim"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gvo_category" ADD CONSTRAINT "gvo_category_domain_id_gvo_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."gvo_domain"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gvo_make" ADD CONSTRAINT "gvo_make_category_id_gvo_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."gvo_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gvo_model" ADD CONSTRAINT "gvo_model_make_id_gvo_make_id_fk" FOREIGN KEY ("make_id") REFERENCES "public"."gvo_make"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gvo_trim" ADD CONSTRAINT "gvo_trim_model_id_gvo_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."gvo_model"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_entry" ADD CONSTRAINT "knowledge_entry_trim_id_gvo_trim_id_fk" FOREIGN KEY ("trim_id") REFERENCES "public"."gvo_trim"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_seller_id_user_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_trim_id_gvo_trim_id_fk" FOREIGN KEY ("trim_id") REFERENCES "public"."gvo_trim"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "switchboard_transaction" ADD CONSTRAINT "switchboard_transaction_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "switchboard_transaction" ADD CONSTRAINT "switchboard_transaction_buyer_id_user_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "switchboard_transaction" ADD CONSTRAINT "switchboard_transaction_seller_id_user_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cohort_trim_year" ON "cohort_pricing" USING btree ("trim_id","model_year");--> statement-breakpoint
CREATE UNIQUE INDEX "category_domain_slug" ON "gvo_category" USING btree ("domain_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "make_category_slug" ON "gvo_make" USING btree ("category_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "model_make_slug" ON "gvo_model" USING btree ("make_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "trim_model_slug" ON "gvo_trim" USING btree ("model_id","slug");--> statement-breakpoint
CREATE INDEX "knowledge_trim_idx" ON "knowledge_entry" USING btree ("trim_id");--> statement-breakpoint
CREATE INDEX "listing_seller_idx" ON "listing" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "listing_status_idx" ON "listing" USING btree ("status");--> statement-breakpoint
CREATE INDEX "listing_trim_idx" ON "listing" USING btree ("trim_id");--> statement-breakpoint
CREATE INDEX "switchboard_listing_idx" ON "switchboard_transaction" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "switchboard_buyer_idx" ON "switchboard_transaction" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "switchboard_seller_idx" ON "switchboard_transaction" USING btree ("seller_id");