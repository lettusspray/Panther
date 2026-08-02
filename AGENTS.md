# AGENTS.md

## First Principles

`docs/System Constitution & Architectural Masterplan.md` is the binding architectural document. If a spec instruction creates a wall — a broken assumption, an unworkable case — **stop and re-derive from first principles**. Duct-tape, flags, shims, or special cases are treated as sabotage. Diverging from a bad spec is a duty, not a mistake.

## User's Working Convention

Directions are approximate pointers toward the simplest/cleanest design. **That goal outranks literal instructions.** When a wall is hit, the design is wrong somewhere — do not patch; re-derive and present the divergence.

## Test & Dev Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Astro dev server (Edge SSR via `@astrojs/cloudflare`) |
| `npm run build` | Build for Cloudflare Pages |
| `npm run typecheck` | Uses `astro check` (not `tsc`) — validates `.astro` files too |
| `npm run lint` | ESLint with `typescript-eslint` |
| `npm run db:generate` | Drizzle Kit — generate migration from schema |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:push` | Push schema directly (dev only) |
| `npm run db:studio` | Drizzle Kit studio (DB inspection) |
| `npm run db:seed` | `tsx scripts/seed.ts` — seeds GVO + config |
| `npm run design:lint` | Enforces design-system rules PANTHER-01..06 (OKLCH token ranges, posture pairing) across `src/`; takes optional path arg |
| `npx vitest run` | Run all tests (vitest with globals, env stubs) |
| `npx vitest run test/foo.test.ts` | Single test file |

Tests live in `test/**/*.test.ts`. Env vars are stubbed in `test/setup.ts` via `vi.stubEnv`. Globals enabled (`describe`/`it`/`expect`/`vi` auto-imported).

## Architecture Map

- **Astro Pages** → `src/pages/` (`.astro` files + Hono API handlers in `src/pages/api/`)
- **Cron trigger** → `src/workers/cron.ts` (nightly 02:00 UTC: ontology, pricing, knowledge, crawl4ai)
- **Queue consumers** → `src/workers/queues/*.ts` (ontology, pricing, knowledge, dead-letter)
- **Ingestion pipelines** → `src/workers/ingestion/*.ts` (crawl4ai, knowledge, ontology, pricing)
- **Drizzle schema** → `src/lib/db/schema/index.ts` (single consolidated file, 19 tables)
- **Pricing engine** → `src/lib/pricing/engine.ts` (13-step landed-cost formula)
- **Auth** → `src/lib/auth/` (Better-Auth + WhatsApp inbound auth)
- **Path alias** → `@/*` maps to `src/*` (tsconfig + vitest + Vite config)
- **Env vars** → `process.env` via `src/lib/env.ts` `getEnv()` helper

## Forbidden Patterns (Non-Negotiable)

- No Prisma (use Drizzle ORM)
- No direct Postgres (use Cloudflare Hyperdrive)
- No split-brain infra (everything on Cloudflare Workers/Pages/Cron/Queues)
- No VIN-level pricing (cohort-level only: Year+Make+Model+Trim)
- No free-text vehicle ID (GVO cascading selectors only)
- No "Miscellaneous"/"Other" in GVO
- No AI vision/photo forensics (rigid UI toggles per category)
- No runtime LLM calls (Groq in Queues for offline ETL only)
- No hardcoded statutory/FX constants (live from `System_Config` table)
- No "Lagos default" (platform is nationally agnostic — no city or "774 LGAs" serves as marketing shorthand; plain "nationally available" language only)
- No heavy KYC at MVP (Switchboard utility revocation, not identity enforcement)
- No cancellation fees
- No raw S3 image serving (Cloudflare Images only)
- No hardcoded JSON-LD (dynamically generated from Pricing Engine)

## The 13-Step Landed-Cost Gotchas

Order of operations is statutory. Key pitfalls:
- Step 3: Naira conversion uses **NCS customs rate**, not CBN retail rate
- Step 6: Surcharge = 7% × **Import Duty**, NOT 7% of CIF
- Step 7: CISS = 1% × **FOB** in Naira, not CIF
- Step 9: VAT = 7.5% of (Steps 4–8 sum)
- Step 12: Non-statutory costs use real sourced ranges, not magic numbers
- NAC levy for used vehicles = **5%** (corrected May 2026 from 15% — see `docs/Intinal_Idea.md` §2.6)

## Data Freshness Kill Switch

Pricing Engine **must** check `effective_timestamp` on NCS/CBN rates. If stale: halt and output *"Live market data temporarily unavailable."* Silence is safer than a lie.

## Design System Constraints

`docs/Panther Design System.md` defines four postures. Key rules:
- 8px base unit, OKLCH colour space, locked per-posture tokens
- Serif (GT Alpina/Alike Angular/Prata) for Roaring/Resting postures only
- Sans (Inter) for Walking/Eyes-Forward only
- Serif never paired with Eyes-Forward colours; sans never with Resting colours
- Dark theme for marketing/hero (Roaring Calm) only — Resting invisible on dark

### CSS Modules & Client JS Gotcha

Astro 7 scopes every `*.module.css` class to `_name_hash` in the build. **Client `<script>` code can never reference module class names as literal strings** — `el.classList.toggle("stepActive")` silently matches nothing and the feature renders broken.

- From a processed `<script>` (no `define:vars`/`is:inline`), `import css from "./x.module.css"` and use `css.className` — the bundler injects the scoped names into the client chunk. Keep the script TS-processed; adding `define:vars` forces `is:inline` and breaks all TS syntax in the script.
- JS-only state that must toggle from a script is best modeled as `data-*` attributes + attribute selectors in the module CSS (e.g. `.toast[data-toast="success"]`), or read the scoped name via the `css` import above.
- Global utilities (`.is-loading`, `.icon-spin`, `.btn*`) live in `global.css` and are NOT scoped — literal classList toggles are correct there.
- VIN status classes `vinStatusPending`/`vinStatusWarn` in `listings/new.astro` are dead (no CSS exists) — left as-is, unstyled no-ops.

## MVP Scope

**Ships**: Pricing Engine, GVO cascading selectors, UI-toggle condition reports, Switchboard escrow, Knowledge Hub (offline Groq ETL), SEO/AEO pricing pages.

**Deferred**: Auctions, financing/loans, physical inspection network, historical records, inventory-holding model, reputation systems.

## Google Business Profile & Maps SEO

Every dealer storefront is wired for Google Local Maps indexing:
- **Schema**: `dealer.googleBusinessUrl` column stores the Google Business Profile URL
- **JSON-LD**: `AutoDealer + LocalBusiness` with `hasMap` (auto-generated Maps search URL from businessName + city + state + Nigeria), `openingHoursSpecification` (Mon-Sat 09:00-18:00/17:00), `sameAs` with GBP URL + WhatsApp
- **Storefront UI**: "Google Business" badge link (if GBP URL set), "View on Maps" link (auto-generated from city/state)
- **Dashboard**: GBP URL field in profile editor
- **Migration**: `drizzle/migrations/0007_google_business.sql`

## Wildcard Subdomain Routing

Each dealer gets `dealer.subdomain` (migration `drizzle/migrations/0008_subdomain.sql`, unique). `*.panther.ng` resolves to a dealer storefront via middleware — no route file for it:
- `src/middleware.ts:onRequest` extracts the subdomain (`src/lib/dealer/subdomain.ts:extractSubdomain`) and `context.rewrite("/dealers/${slug}")`; unknown subdomain/host → `/404`
- Requires Cloudflare wildcard DNS `*.panther.ng` pointing at this worker
- `getDealerCanonicalUrl()` in `src/lib/dealer/subdomain.ts` decides canonical URL: subdomain host if present, else `https://panther.ng/dealers/{slug}` — use it for SEO/JSON-LD to avoid duplicate content
- Middleware adds `context.locals.subdomainHost` (typed in `src/env.d.ts`) — pass to `getDealerCanonicalUrl()` from storefront pages
- `context.rewrite()` (Astro) preserves the original host; middleware pass-through paths (`/api/`, `/webhooks/`, static) never rewrite
- Tests: `test/dealer-subdomain.test.ts` (extraction, validation, canonical URL)

## Platform Fingerprint Rules

Panther branding must be visible on every surface:
- **Global footer** (BaseLayout): "Panther" with navigation links
- **Dealer storefront**: Fingerprint section at page bottom — "{businessName} sells on Panther"
- **Dealer listing cards**: "Panther" badge on each card image corner
- **Listing detail page**: "Listed on Panther"
- **WhatsApp share messages**: Include "on Panther" in the pre-filled text
- **Share button**: Includes business name + page URL (WhatsApp fallback when native share unavailable)

## Positioning (do not regress)

Panther is **Nigeria's auto marketplace** — buying/selling/escrow/condition-reports lead; pricing is a differentiator, not the identity.
- Never describe Panther as a "pricing platform", "vehicle pricing platform", or "pricing and transaction platform".
- Meta descriptions default to "Nigeria's auto marketplace."
- Copy must stay plain and direct: no unsourced multipliers ("5x", "2x"), no "trusted"/"seamless"/"transparent pricing" puffery, no "Pro tip", no "highest-ROI".
- No internal jargon in user-facing copy: never "Global Vehicle Ontology", "the ontology", "GVO", "domain" (for vehicle type), or "cohort" — use "catalog", "vehicle type", "this model", etc.

## Dealer Storefront Architecture

- `src/lib/dealer/index.ts` — All data access (`getDealerBySlug`, `getDealerBySubdomain`, `getDealerListings`, `getDealerReviews`, `getDealerStats`, `upsertDealerProfile`, `subdomainExists`, `slugExists`)
- `src/lib/dealer/json-ld.ts` — `generateDealerJsonLd()` produces `AutoDealer + LocalBusiness + BreadcrumbList` with NAP, hasMap, sameAs, openingHours, aggregateRating
- `src/pages/dealers/[slug].astro` — Public storefront (Resting posture) with banner/logo, AEO hero, badges (Verified/NADDC/Rating), contact bar (Call/WhatsApp/Share/GBP/Maps/Inspection/Delivery), inventory tabs (Active + Sold), reviews, platform fingerprint
- `src/pages/dashboard/profile.astro` — Profile editor with GBP URL field
- `src/pages/api/dealers/index.ts` — POST (create) + PATCH (update) handlers
- `src/pages/api/dealers/[slug]/index.ts` — GET public API
- Auto-profile creation in `src/lib/listings/activation.ts:ensureDealerProfile()` — creates dealer from user.name on first listing activation
- Tests: `test/dealer.test.ts` — 17 tests covering JSON-LD generation, upsert with googleBusinessUrl, edge cases

## Condition Reports

Category-specific schemas from a shared base:
- **Cars**: body/mechanical/electrical checks
- **Motorcycles/Tricycles**: + chain/belt, spoke integrity, cold-start smoke colour
- **Commercial vehicles**: + engine hours, chassis crossmembers, air brake pressure hold

## Copy Rules

- Must pass "Roaring Calm" test: read aloud; if it sounds like a nervous salesperson or AI blog, it fails.
- "Panther" is a noun only — never a verb or adjective in body copy.
