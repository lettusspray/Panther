# Panther

## X. THE ARCHITECTURAL BLUEPRINT (The Stack & Topology)

The platform architecture is derived from the **Mobile-First Prerequisite (<200ms TTFB)** and the **Stale-Data Kill Switch**.
We maximize managed services for security and operational simplicity while keeping MVP cost minimal.

Split-brain infrastructure (frontend on one platform, API on another, DB somewhere else) is forbidden. The compute and data path must remain Edge-native and latency-aware.

### 1) Presentation & Edge Compute Layer
- **Framework:** Astro on Cloudflare Pages/Workers
  - Astro Islands keep static knowledge content at zero-JS by default for SEO/AEO and mobile performance.
  - Pricing Engine executes via Edge SSR endpoints, reading live config and rendering fast HTML/JSON-LD.
- **API & State Machine:** Hono on Cloudflare Workers
  - Handles Switchboard API, ingestion, and payment webhooks at the edge.
- **Background Ingestion:** Cloudflare Cron Triggers + Queues
  - Hourly workers ingest CBN and auction data.
  - Failures route to queue/DLQ with Sentry alerting; silent failure is disallowed.

### 2) Truth Layer (Database & ORM)
- **Database:** Neon Postgres (serverless, ACID, branching support)
- **Connection Acceleration:** Cloudflare Hyperdrive
  - All Worker→Postgres traffic must go through Hyperdrive to avoid cold TCP latency penalties.
- **ORM:** Drizzle ORM
  - Edge-safe, TypeScript-first, SQL-native; preferred over Prisma for Cloudflare Worker constraints.

### 3) Trust, Identity & Media Layer
- **Auth:** Better-Auth (Worker-native, TS-first, Drizzle-friendly)
- **Image Pipeline:** Cloudflare Images
  - Condition-report images must be processed and served via Cloudflare Images with optimized formats.

## XI. DATA FLOW & STATE MACHINES

### Flow 1: Pricing Engine (<100ms path)
1. User requests a specific model page.
2. Astro SSR receives request at Cloudflare edge.
3. Worker fetches live `System_Config` (exchange rate + duty bands) via Hyperdrive.
4. Stale-data kill switch checks freshness (`effective_timestamp` threshold).
5. Worker runs pure TypeScript 13-step pricing formula with spec + config snapshot.
6. Output includes floor/ceiling/breakdown and JSON-LD schema payload.
7. Edge responds by streaming HTML/JSON-LD.

### Flow 2: Switchboard Transaction State Machine
1. Initiation creates ledger entry in `PENDING` and payment link via gateway.
2. Gateway collects fiat.
3. Webhook hits Hono Worker.
4. Hono verifies signature and atomically moves ledger `PENDING -> FUNDED`.
5. Delivery/dispute transitions ledger to `RELEASED` or `DISPUTED`, then triggers payout/refund rails.

**Rule:** Frontend and payment gateway never own escrow state. Postgres ledger is source of truth.

### Flow 3: Data Harvest & Bayesian Blending
1. Transaction reaches `RELEASED`.
2. Worker checks truth anchor (`Escrow_Volume ~= Agreed_Listing_Price`, 2% tolerance).
3. If valid, strip PII, hash VIN, and write to anonymized analytics bucket; otherwise mark `INCOMPLETE` and drop.
4. Nightly cron updates Bayesian weighting from bucket variance and volume.

## XII. LEAN MVP ECONOMICS

Target MVP infrastructure cost: **~$6/month** (Cloudflare free tier + Neon free tier + Cloudflare Images + domain amortization).

## XIII. ANTI-GAMBIARRA ENFORCEMENT MATRIX

The following patterns are explicitly forbidden:
1. **PaaS split-brain** (Cloudflare frontend + non-Cloudflare API runtime).
2. **Raw object-store image serving** (must use Cloudflare Images pipeline).
3. **Prisma ORM** (Drizzle is mandated for edge compatibility goals).
4. **Direct Postgres connections from Workers** (must use Hyperdrive).
5. **Payment-gateway-owned escrow state** (ledger state remains in Postgres state machine).

## XIV. EXECUTION MANDATE

This repository follows a strict architecture constitution:
- Trust is the product.
- Math is the foundation.
- Elegance is the mandate.

When implementation conflicts with these constraints, re-derive from first principles and present a clear architectural alternative rather than introducing gambiarra or parallel paths.