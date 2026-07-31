CREATE TABLE "dealer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"business_name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"banner_image" text,
	"about" text,
	"city" text,
	"state" text,
	"contact_phone" text,
	"whatsapp_number" text,
	"naddc_registration_id" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"inspection_available" boolean DEFAULT false NOT NULL,
	"delivery_available" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dealer_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "dealer_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "dealer_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"listing_id" uuid,
	"switchboard_tx_id" uuid,
	"rating" integer NOT NULL,
	"title" text,
	"body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing" ALTER COLUMN "trim_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "custom_make" text;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "custom_model" text;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "custom_trim" text;--> statement-breakpoint
ALTER TABLE "dealer" ADD CONSTRAINT "dealer_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_review" ADD CONSTRAINT "dealer_review_dealer_id_dealer_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_review" ADD CONSTRAINT "dealer_review_buyer_id_user_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_review" ADD CONSTRAINT "dealer_review_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_review" ADD CONSTRAINT "dealer_review_switchboard_tx_id_switchboard_transaction_id_fk" FOREIGN KEY ("switchboard_tx_id") REFERENCES "public"."switchboard_transaction"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dealer_user_idx" ON "dealer" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dealer_slug_idx" ON "dealer" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "review_dealer_idx" ON "dealer_review" USING btree ("dealer_id");--> statement-breakpoint
CREATE INDEX "review_buyer_idx" ON "dealer_review" USING btree ("buyer_id");--> statement-breakpoint
ALTER TABLE "gvo_make" DROP COLUMN "import_volume";