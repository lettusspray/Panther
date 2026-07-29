# AGENTS.md

## Project Status

Phase 1–5 infrastructure complete: 13-table DB schema, GVO hierarchy seeder, data ingestion workers (ontology/pricing/knowledge), WhatsApp auth, Hyperdrive connection, ScraperAPI client with multi-key rotation. **491 tests passing** (17 test files). Data pipeline: auto.dev (Growth plan) + CarsDataset for pricing/specs; NCS customs rate via ScraperAPI; Groq for knowledge ETL. CarAPI purged — not trustworthy. ZenRows replaced with ScraperAPI throughout.

## The Constitution

`docs/System Constitution & Architectural Masterplan.md` is the binding architectural document. Every code decision must trace back to it. If a literal spec instruction creates a wall — a broken assumption, a bad case, an unworkable design — **stop and re-derive from first principles**. Do not patch around the wall. Diverging from a literal spec that is architecturally wrong is a duty, not a mistake. Duct-tape, shims, special-case flags, and "gambiarra" are treated as sabotage — 100% rejection, regardless of cost already sunk.

## Forbidden Patterns (Non-Negotiable)

These are hard-ruled by the constitution. An agent implementing any of them is building on a broken foundation:

- **No Prisma.** Use Drizzle ORM. Prisma's binary wrappers exceed Cloudflare Worker limits.
- **No direct Postgres connections.** All DB traffic through Cloudflare Hyperdrive.
- **No split-brain infra.** Everything runs on Cloudflare (Workers, Pages, Cron, Queues). No Railway/Render/Fly.io.
- **No VIN-level pricing.** Cohort-level macro pricing only (Year+Make+Model+Trim).
- **No free-text vehicle identification.** GVO cascading selectors only.
- **No "Miscellaneous" or "Other" category** in the Global Vehicle Ontology.
- **No AI vision / photo forensics.** Condition reports are rigid UI toggles per category.
- **No runtime LLM calls.** Groq is walled inside Cloudflare Queues for offline ETL only.
- **No hardcoded statutory/FX constants.** Exchange rates, VAT, duty bands live in `System_Config` DB table, pulled live. Stale data kills the engine, not lies.
- **No "Lagos default."** Platform is nationally agnostic across 774+ LGAs. No hardcoded Lagos in copy, configs, prompts, or TCO.
- **No heavy KYC at MVP.** Enforcement is Switchboard utility revocation, not identity police state.
- **No cancellation fees.** Ever.
- **No raw S3 image serving.** All images through Cloudflare Images (on-the-fly WebP/AVIF).
- **No hardcoded JSON-LD.** Schema generated dynamically from Pricing Engine output.

## Tech Stack (Derived from Constitution, §VII)

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Astro (Cloudflare Pages/Workers) | Island architecture, zero-JS default, Edge SSR |
| API | Hono (Cloudflare Workers) | Fastest/lightest Edge framework |
| Database | Neon Postgres | ACID for Switchboard ledger, scales to zero, branching for migrations |
| Connection | Cloudflare Hyperdrive | Caches Postgres connections at Edge (~300ms → <50ms) |
| ORM | Drizzle ORM | Type-safe, compiles to SQL, Edge-compatible |
| Auth | Better-Auth | TS-first, runs on Workers, integrates with Drizzle |
| AI ETL | Groq (Llama-3.1-8B-Instant) via Cloudflare Queues | Offline-only, pre-computed "Human Knowledge" cached in DB |
| Images | Cloudflare Images | Storage + CDN + on-the-fly resize, $5/100k images |
| Scraping | ScraperAPI (multi-key rotation, managed web unlocker) | For NCS customs rate (JS-rendered, bot-protected) |
| Data APIs | NHTSA vPIC (US ontology), auto.dev (pricing/listings), CarsDataset (global specs) | Free/managed, structured JSON |
| FX | Open Access ExchangeRate-API (open.er-api.com) | No key required, pure JSON |
| Cron | Cloudflare Cron Triggers | Nightly ontology/pricing/FX ingestion |

## Data Pipeline

| Source | Purpose | Status |
|--------|---------|--------|
| NHTSA vPIC | US/Tokunbo makes/models (195 car, 699 motorcycle) | ✅ Working, no auth |
| auto.dev | Cohort pricing via listings search (make/model/year) | ✅ Working, Growth plan |
| CarsDataset | Global/EV/Asian vehicle specs (preview API) | ✅ Working, no auth |
| ScraperAPI | NCS customs USD selling rate | ✅ Working, multi-key |
| Open Access FX | USD→NGN exchange rate | ✅ Working, no key |
| Groq | Knowledge ETL (offline, queue-walled) | ✅ Working, llama-3.1-8b-instant |

## The 13-Step Landed-Cost Formula

This is the mathematical core of the platform. Order of operations is statutory law — must be implemented exactly as specified in `docs/System Constitution & Architectural Masterplan.md` §II.1. Key gotchas:

- Step 3 (Naira conversion) uses the **live NCS customs rate**, not CBN retail rate
- Step 6 (Surcharge) is 7% × **Import Duty**, NOT 7% of CIF — most common calc error
- Step 7 (CISS) is 1% × **FOB** in Naira, not CIF
- Step 9 (VAT Base) sums Steps 4–8, then VAT is 7.5% of that base
- Step 12 (non-statutory) uses real sourced ranges, not magic numbers
- The NAC levy for used vehicles is **5%** (corrected May 2026 from 15%) — `docs/Intinal_Idea.md` §2.6

## Data Freshness Kill Switch

The Pricing Engine **must** check `effective_timestamp` on NCS/CBN rates. If stale beyond threshold, halt and output: *"Live market data temporarily unavailable."* Silence is structurally safer than a lie.

## Design System

`docs/Panther Design System.md` defines four Panther postures (Roaring Calm, Walking Forward, Eyes-Forward, Resting) that drive all UI/UX decisions. Key constraints:

- **8px base unit** for all spacing
- **OKLCH colour space** with specific per-posture tokens (locked values)
- **Dual-font**: serif (GT Alpina / Alike Angular / Prata) for Roaring/Resting, sans (Inter) for Walking/Eyes-Forward
- Serif must NEVER pair with Eyes-Forward colour; sans must NEVER pair with Resting colour
- Dark theme restricted to marketing/hero (Roaring Calm) only — Resting invisible on dark backgrounds

## Condition Reports by Category

Not one shared form. Category-specific schemas built from a shared base:

- **Cars**: standard body/mechanical/electrical checks
- **Motorcycles/Tricycles**: + chain/belt condition, spoke integrity, cold-start smoke colour
- **Commercial vehicles**: + engine hours (critical — mileage alone is misleading for high-idle trucks), chassis crossmember integrity, air brake pressure hold test

## What Ships in MVP vs. What Doesn't

**Ships**: Pricing Engine, GVO cascading selectors, UI-toggle condition reports, Switchboard (escrow), Knowledge Hub (offline Groq ETL), SEO/AEO-optimized pricing pages.

**Explicitly deferred**: Auctions, financing/loans, physical inspection network, historical records aggregation (structural non-goal in Nigeria), inventory-holding model, reputation systems.

## Open Questions to Verify Before Building

- CISS vs. FCS current status (both terms appear in recent sources; which is actually charged?)
- Base 20% car import duty may have also changed alongside the NAC levy — verify against NCS
- Vehicle age limit for import (sources diverge: 10/12/15 years)
- Category-specific duty bands for motorcycles/tricycles need NCS confirmation (reasoned range: 5–10%)

## Working Conventions

- The user's directions are **approximate pointers**, not precise specs. The goal is simplest/cleanest/most elegant design — literal instructions outranked by architectural correctness.
- When a wall is hit, treat it as design information, not a bug to work around.
- All copy must pass the "Roaring Calm" test: read aloud; if it sounds like a nervous salesperson or AI blog, it fails.
- The word "Panther" is a noun only, never a verb or adjective in body copy.
