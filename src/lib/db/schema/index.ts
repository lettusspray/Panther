import {
  pgTable,
  uuid,
  text,
  integer,
  decimal,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ── Enums ──────────────────────────────────────────────────────────

export const vehicleDomainEnum = pgEnum("vehicle_domain", [
  "car",
  "motorcycle",
  "tricycle",
  "commercial",
]);

export const listingStatusEnum = pgEnum("listing_status", [
  "draft",
  "active",
  "sold",
  "removed",
]);

export const switchboardStatusEnum = pgEnum("switchboard_status", [
  "initiated",
  "funds_held",
  "inspection_window",
  "buyer_confirmed",
  "seller_confirmed",
  "disputed",
  "released",
  "refunded",
]);

export const disclosureTierEnum = pgEnum("disclosure_tier", [
  "none",
  "warning",
  "suspended",
  "deactivated",
]);

export const feePayerEnum = pgEnum("fee_payer", ["buyer", "seller", "split"]);

export const reportStatusEnum = pgEnum("report_status", [
  "pending",
  "reviewed",
  "dismissed",
]);

export const gvoRequestStatusEnum = pgEnum("gvo_request_status", [
  "pending",
  "approved",
  "rejected",
]);

// ── Global Vehicle Ontology (GVO) ──────────────────────────────────
// Hierarchical: Domain → Category → Make → Model → Trim → Powertrain
// No "Miscellaneous" or "Other" category. Ever.

export const gvoDomain = pgTable("gvo_domain", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(), // "car", "motorcycle", "tricycle", "commercial"
  slug: text("slug").notNull().unique(),
});

export const gvoCategory = pgTable(
  "gvo_category",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    domainId: uuid("domain_id")
      .notNull()
      .references(() => gvoDomain.id),
    name: text("name").notNull(), // "Sedan", "SUV", "Pickup Truck"
    slug: text("slug").notNull(),
    hsCode: text("hs_code"), // ECOWAS CET heading e.g. "8703"
    dutyBand: integer("duty_band"), // 0-4 per ECOWAS CET
  },
  (t) => [uniqueIndex("category_domain_slug").on(t.domainId, t.slug)],
);

export const gvoMake = pgTable(
  "gvo_make",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => gvoCategory.id),
    name: text("name").notNull(), // "Toyota", "Honda"
    slug: text("slug").notNull(),
    origin: text("origin"), // "US", "Japan", "Global"
  },
  (t) => [uniqueIndex("make_category_slug").on(t.categoryId, t.slug)],
);

export const gvoModel = pgTable(
  "gvo_model",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    makeId: uuid("make_id")
      .notNull()
      .references(() => gvoMake.id),
    name: text("name").notNull(), // "Camry", "Civic"
    slug: text("slug").notNull(),
    firstModelYear: integer("first_model_year"),
    lastModelYear: integer("last_model_year"),
  },
  (t) => [uniqueIndex("model_make_slug").on(t.makeId, t.slug)],
);

export const gvoTrim = pgTable(
  "gvo_trim",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelId: uuid("model_id")
      .notNull()
      .references(() => gvoModel.id),
    name: text("name").notNull(), // "LE", "SE", "XLE"
    slug: text("slug").notNull(),
    engine: text("engine"), // "2.5L 4-Cyl"
    transmission: text("transmission"), // "Automatic", "Manual"
  },
  (t) => [uniqueIndex("trim_model_slug").on(t.modelId, t.slug)],
);

// ── Cohort Pricing ─────────────────────────────────────────────────
// Macro wholesale averages per cohort (Year+Make+Model+Trim).
// NO VIN-level pricing. Ever.

export const cohortPricing = pgTable(
  "cohort_pricing",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trimId: uuid("trim_id")
      .notNull()
      .references(() => gvoTrim.id),
    modelYear: integer("model_year").notNull(),
    fobLowUsd: decimal("fob_low_usd", { precision: 10, scale: 2 }).notNull(),
    fobHighUsd: decimal("fob_high_usd", {
      precision: 10,
      scale: 2,
    }).notNull(),
    source: text("source"), // "auto.dev", "carsdataset"
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("cohort_trim_year").on(t.trimId, t.modelYear),
  ],
);

// ── System Config (LIVE DATA — never hardcoded) ────────────────────
// Exchange rates, VAT, duty bands. Stale data kills the engine, not lies.

export const systemConfig = pgTable(
  "system_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull().unique(), // "ncs_customs_rate", "cbn_rate", "vat_rate"
    value: text("value").notNull(),
    effectiveTimestamp: timestamp("effective_timestamp", {
      withTimezone: true,
    }).notNull(),
    source: text("source"), // "exchange-rate-api", "scraperapi-ncs", "statutory"
  },
);

// ── Users ──────────────────────────────────────────────────────────

export const user = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").unique(),
  phone: text("phone").unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  phoneVerified: timestamp("phone_verified", { withTimezone: true }),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  disclosureTier: disclosureTierEnum("disclosure_tier")
    .notNull()
    .default("none"),
});

export const session = pgTable("session", {
  id: uuid("id").primaryKey().defaultRandom(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),
  scope: text("scope"),
});

// ── Listings ───────────────────────────────────────────────────────

export const listing = pgTable(
  "listing",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    trimId: uuid("trim_id")
      .references(() => gvoTrim.id),
    modelYear: integer("model_year").notNull(),
    customMake: text("custom_make"),
    customModel: text("custom_model"),
    customTrim: text("custom_trim"),
    mileageKm: integer("mileage_km"),
    status: listingStatusEnum("status").notNull().default("draft"),
    askingPriceNgn: decimal("asking_price_ngn", {
      precision: 14,
      scale: 2,
    }),
    conditionReport: jsonb("condition_report"), // category-specific toggles
    images: jsonb("images"), // tagged photos Array<{ tag: string }>
    videos: jsonb("videos"), // tagged videos Array<{ tag: string }>
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("listing_seller_idx").on(t.sellerId),
    index("listing_status_idx").on(t.status),
    index("listing_trim_idx").on(t.trimId),
  ],
);

// ── Switchboard (Escrow) ──────────────────────────────────────────
// The financial ledger. Strict ACID. No cancellation fees. Ever.

export const switchboardTransaction = pgTable(
  "switchboard_transaction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "restrict" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    status: switchboardStatusEnum("status").notNull().default("initiated"),
    agreedPriceNgn: decimal("agreed_price_ngn", {
      precision: 14,
      scale: 2,
    }).notNull(),
    platformFeeNgn: decimal("platform_fee_ngn", {
      precision: 14,
      scale: 2,
    }),
    feePayer: feePayerEnum("fee_payer").notNull().default("seller"),
    providerRef: text("provider_ref"), // PSP's reference ID (e.g., Paystack transaction reference)
    providerMetadata: jsonb("provider_metadata"), // raw webhook payload for audit trail
    initiatedAt: timestamp("initiated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("switchboard_listing_idx").on(t.listingId),
    index("switchboard_buyer_idx").on(t.buyerId),
    index("switchboard_seller_idx").on(t.sellerId),
  ],
);

// ── Knowledge Hub (pre-computed Groq ETL output) ───────────────────

export const knowledgeEntry = pgTable(
  "knowledge_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trimId: uuid("trim_id")
      .notNull()
      .references(() => gvoTrim.id),
    warnings: jsonb("warnings").notNull(), // pre-computed human-readable warnings
    specs: jsonb("specs"), // raw specs from NHTSA/auto.dev
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("knowledge_trim_idx").on(t.trimId)],
);

// ── Webhook Event Log (idempotency) ──────────────────────────────────
// Paystack retries live webhooks for 72 hours. Without deduplication,
// a single transaction can trigger 20+ deliveries.
// Dedupe on (provider, event_type, reference).

export const webhookEvent = pgTable(
  "webhook_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(), // "paystack"
    eventType: text("event_type").notNull(), // "charge.success", "transfer.success"
    reference: text("reference").notNull(), // our reference or Paystack reference
    providerId: text("provider_id"), // PSP's internal event/transaction ID
    payload: jsonb("payload").notNull(), // full raw webhook payload for audit
    processedAt: timestamp("processed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("webhook_event_dedupe").on(
      t.provider,
      t.eventType,
      t.reference,
    ),
  ],
);

// ── Seller Bank Account (Paystack Transfer Recipient) ────────────────
// Sellers must register a bank account before receiving funds.
// The recipient_code is Paystack's identifier for bank transfers.

export const sellerBankAccount = pgTable(
  "seller_bank_account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    bankCode: text("bank_code").notNull(), // e.g., "044" (Access Bank)
    accountNumber: text("account_number").notNull(), // 10-digit Nigerian account number
    accountName: text("account_name"), // verified name from Paystack
    recipientCode: text("recipient_code").notNull(), // Paystack transfer recipient code
    verified: boolean("verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("seller_bank_seller_idx").on(t.sellerId),
    uniqueIndex("seller_bank_account_unique").on(
      t.sellerId,
      t.bankCode,
      t.accountNumber,
    ),
  ],
);

// ── Dealer Profile (Storefront) ─────────────────────────────────────
// 1:1 with user. Every seller can have a dealer profile for their
// public-facing storefront page.

export const dealer = pgTable(
  "dealer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    businessName: text("business_name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"), // Cloudflare Images ID
    bannerImage: text("banner_image"), // Cloudflare Images ID
    about: text("about"),
    city: text("city"),
    state: text("state"),
    contactPhone: text("contact_phone"),
    whatsappNumber: text("whatsapp_number"),
    naddcRegistrationId: text("naddc_registration_id"),
    isVerified: boolean("is_verified").notNull().default(false),
    inspectionAvailable: boolean("inspection_available").notNull().default(false),
    deliveryAvailable: boolean("delivery_available").notNull().default(false),
    googleBusinessUrl: text("google_business_url"),
    subdomain: text("subdomain").unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("dealer_user_idx").on(t.userId),
    uniqueIndex("dealer_slug_idx").on(t.slug),
  ],
);

// ── Dealer Reviews ─────────────────────────────────────────────────

export const dealerReview = pgTable(
  "dealer_review",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id")
      .notNull()
      .references(() => dealer.id, { onDelete: "cascade" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    listingId: uuid("listing_id")
      .references(() => listing.id, { onDelete: "set null" }),
    switchboardTxId: uuid("switchboard_tx_id")
      .references(() => switchboardTransaction.id, { onDelete: "set null" }),
    rating: integer("rating").notNull(), // 1-5
    title: text("title"),
    body: text("body"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("review_dealer_idx").on(t.dealerId),
    index("review_buyer_idx").on(t.buyerId),
  ],
);

// ── Listing Reports ─────────────────────────────────────────────────
// Visible "report this listing" mechanism per constitution §IV.3/F2.0b.

export const listingReport = pgTable(
  "listing_report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "cascade" }),
    reporterId: uuid("reporter_id"),
    reason: text("reason").notNull(),
    description: text("description"),
    status: reportStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("report_listing_idx").on(t.listingId),
    index("report_status_idx").on(t.status),
  ],
);

// ── GVO Addition Requests ──────────────────────────────────────────
// Constitution §III.1: if vehicle doesn't exist in GVO, listing is
// paused and queued for admin addition.

export const gvoRequest = pgTable(
  "gvo_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requesterId: uuid("requester_id"),
    domain: text("domain").notNull(),
    makeName: text("make_name").notNull(),
    modelName: text("model_name").notNull(),
    trimName: text("trim_name"),
    notes: text("notes"),
    status: gvoRequestStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("gvo_request_status_idx").on(t.status)],
);
