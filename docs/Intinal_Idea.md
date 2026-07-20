# MVP Technical Specification
## Nigerian Auto Trust & Transaction Platform ("Edmunds, Glorified")

**Status:** Grounded working document — every claim below is either (a) confirmed via search with sourcing, (b) explicitly marked as an assumption requiring validation, or (c) explicitly marked as an open decision. Nothing is presented as settled unless it was actually settled in strategy discussion.

**Companion documents:** `BEHAVIORAL_RESEARCH.md` — living research log for UX/trust behavior, disclosure policy, vehicle-category parameters, and SEO/AEO. This spec references findings from it rather than duplicating them; check there for full sourcing and detail behind any §5 item marked "see BEHAVIORAL_RESEARCH.md."
System Constitution & Architectural Masterplan.mdcontains the mature plan for starting
---

## 1. Thesis (What This MVP Is Actually Testing)

The Nigerian used-car market has one root disease — **information asymmetry that middlemen monetize** — expressing as four symptoms:

| # | Symptom (as stated) | Root mechanism |
|---|---|---|
| 1 | No invested content / unstructured marketplaces (vs. Edmunds-quality sites) | No trusted, independent pricing reference exists |
| 2 | No financing infra for unbankable buyers | Out of scope for this MVP — not a problem this platform attempts to solve |
| 3 | No condition-trust layer (no Carfax equivalent) | Buyers can't verify condition remotely → forces reliance on a trusted middleman |
| 4 | Middlemen inflate prices | Middlemen profit *only because* asymmetry in (1) and (3) exists |

**Core MVP bet:** If (1) and (3) are solved cheaply and simultaneously, (4) weakens on its own — no separate "kill the middleman" mechanism is needed as a v1 feature. Auction mechanics and financing integration are **explicitly deferred**, not because they're unimportant, but because they depend on (1) and (3) already existing to function correctly (see §6, Sequencing).

**The chicken-and-egg resolution (as directed):** Nigerian listing prices are adversarially generated (sellers hide/misstate price deliberately — confirmed pattern, not assumption) and therefore unusable as a pricing foundation. The MVP does **not** attempt to reverse-engineer truth from Nigerian listings. Instead, it computes a **landed-cost-derived price range** from a trusted foreign source (US salvage auction sold-price data) forward through Nigeria's known, public import-cost formula. This is the "chicken" that lets the platform launch without pre-existing transaction data. Real Nigerian closed-price data (the "egg"), harvested as a byproduct of actual platform transactions, is the intended long-run replacement for this formula — not a separate initiative.

---

## 2. Pricing Engine — The Core MVP Deliverable

### 2.1 What this is NOT
- Not a Carfax equivalent (no historical records aggregation — that data substrate doesn't exist in Nigeria in structured digital form; this is a confirmed structural gap, not a temporary one)
- Not a scrape-and-average of Nigerian listing sites (source data is adversarial/unreliable by design)
- Not a point-estimate valuation tool — output is always a **range**, by design, per direction given

### 2.2 What this IS
A calculator that takes (make, model, year, trim, mileage, damage/condition category) and returns a **landed-cost price range** for that vehicle profile in Nigeria, computed as:

```
FLOOR   = [Auction sold price, low comparable] → full import formula, low-end variables
CEILING = [Auction sold price, high comparable] → full import formula, high-end variables
```

### 2.3 Data Sources (all near-zero-cost, confirmed via search)

| Input | Source | Cost | Notes |
|---|---|---|---|
| Auction sold price (FOB basis) | bidhistory.org | Free, no login | VIN-searchable Copart/IAAI sold prices, bid history, final sale price |
| Auction sold price (backup/cross-check) | bidfax.info | Free | Copart/IAAI data since 2018, updates every 2–24hrs |
| Auction sold price (bulk/export) | Copart's own CSV sales data download | Free | Direct from Copart, official |
| Auction sold price (programmatic, if scale requires) | apiauctions.io, auctionsapi.com | Paid, low per-lot cost | Only needed once manual/scraped free sources don't cover volume |
| CBN customs exchange rate | Central Bank of Nigeria, published rate | Free | **Must be pulled live** — confirmed volatile (₦1,440–₦1,588 range observed across recent sources); never hardcode |
| Duty/levy percentages | ECOWAS Common External Tariff (2022–2026 edition) + Nigeria National Automotive Policy | Free (public/statutory) | Stable law — encode once, monitor for policy changes |
| Port/agent/documentation fee bands | Direct outreach to 2–3 real clearing agents | Free (time cost only) | The one line with no public rate — calibrate manually at launch, revisit periodically |

**Note on source selection:** Auction sold-price (not Edmunds TMV, not any US retail index) is the correct anchor because Tokunbo supply is overwhelmingly sourced from US salvage/insurance auctions, not clean-title retail. Using retail data would systematically overstate the true cost basis of the actual vehicles being imported.

### 2.4 The Formula (confirmed, sequential — order matters and is a common error source)

```
Step 1 — FOB = Auction sold price + US-side pickup/title/export prep (if any)

Step 2 — CIF = FOB + Freight + Insurance
          Freight: $800–$2,500 typical range (varies by route/vehicle size)
          Insurance: ~0.75% of FOB (commonly used default)

Step 3 — Convert CIF to Naira using LIVE CBN customs exchange rate
          ⚠ This is the single load-bearing uncertainty in the entire formula.
          NCS assesses duty using its own internal VIN/make/model/year valuation
          database, which can be 20–50% above actual invoice value. Steps 4
          onward are fully mechanical once this base is set — the range in
          this one step is what should propagate into Floor/Ceiling, not
          uncertainty sprinkled across every line.

Step 4 — Import Duty = 20% × CIF (Naira)
Step 5 — NAC Levy    = 5% × CIF (Naira)   ⚠ CORRECTED July 2026 — was 15%, see §2.6 below
Step 6 — Surcharge   = 7% × Import Duty   [NOT 7% of CIF — most common calc error found]
Step 7 — CISS        = 1% × FOB (Naira)   [Note: FCS has largely replaced CISS in current
                                            assessments per multiple sources — confirm which
                                            is currently charged before hardcoding]
Step 8 — ETLS        = 0.5% × CIF (Naira)

Step 9  — VAT Base = CIF + Import Duty + NAC Levy + Surcharge + CISS + ETLS
Step 10 — VAT       = 7.5% × VAT Base

Step 11 — Total Statutory Charges = Import Duty + NAC Levy + Surcharge + CISS + ETLS + VAT
           (Net effect across confirmed worked examples: ~42–72% of CIF/FOB depending on
           which specific variables land where in their range — this spread IS the range,
           not an error bar to apologize for)

Step 12 — Non-statutory real-world additions (NOT customs, but real cost):
           + Port/terminal handling (THC): ₦150,000–₦250,000 (2 independent current sources, tight agreement — see BEHAVIORAL_RESEARCH.md §6.3)
           + Clearing agent fee: ₦100,000–₦300,000 flat, OR ~5% of CIF if percentage-based (some agents use one model, some the other — build as a toggle, not a single fixed number)
           + Shipping line release fee: ₦80,000–₦150,000 (new line item, previously missing from this formula — see BEHAVIORAL_RESEARCH.md §6.3)
           + Documentation/processing fees: ₦20,000–₦50,000 (revised range, see BEHAVIORAL_RESEARCH.md §6.3)
           + Local transport, port → point of sale (not yet ranged — city/distance-dependent, genuinely variable rather than a lookup gap)

Step 13 — LANDED COST FLOOR   = Steps 1–11 at low-end variables + Step 12 low end
           LANDED COST CEILING = Steps 1–11 at high-end variables + Step 12 high end
```

### 2.5 Known Constraints Requiring Live Verification (not blockers, but must not be hardcoded)
- **Vehicle age limit for import:** Sources diverge between 10, 12, and 15 years from manufacture across different calculator tools published in the same period. This must be verified against NCS's own current published policy before the platform states an age limit anywhere in-product — do not average or guess between conflicting secondary sources on a rule this binary.
- **CISS vs. FCS:** Some sources describe FCS as having replaced CISS in modern assessments; treat as an open verification item, not a settled fact, since both terms still appear in recent-dated sources.
- **VAT rate stability:** Currently 7.5%, with cited ongoing discussion of potential increase to 10–15%. Build the VAT rate as a config variable, not a constant.

---

### 2.6 ⚠ CONFIRMED POLICY CORRECTION (July 2026) — Read Before Building

**The NAC levy rate in this formula has changed since the formula was first built earlier in this document's history.** Confirmed directly from NCS Comptroller-General Adewale Adeniyi's on-record testimony to the House of Representatives Committee on Customs and Excise (Premium Times, July 7, 2026, primary quote): *"For used vehicles, the tariff has been reduced from 15 per cent to 5 per cent, and for brand-new vehicles, from 20 per cent to 10 per cent."* Implementation commenced in May 2026, under the 2026 Fiscal Policy Measures. Corroborated independently by Legit.ng, Channels TV, and a trade-focused Substack, all reporting the same NCS announcement within the same week.

**This is a genuine rate change, not a discovery of a prior research error** — earlier sourcing in this document (SGK Global, clearingagent.com.ng, trade.gov) reflected the 15% NAC levy that was accurate at the time those pages were written/crawled, but has since been superseded. This is exactly the kind of live-policy risk flagged as a general concern back when the formula was first built — now realized in practice, one week before this correction was made, underscoring that this formula needs periodic re-verification against NCS's own current statements, not a one-time build.

**Net effect on the formula:** Total statutory charges (Step 11) are now meaningfully lower than the ~42–72% of CIF range calculated under the old 15% NAC levy — the entire Floor/Ceiling range in Step 13 needs recalculation, not just Step 5 in isolation, since Steps 9–10 (VAT) are calculated on a base that includes NAC levy, so the reduction compounds forward through the rest of the stack.

**What's still unconfirmed and needs the same level of verification before building:**
- Whether the base 20% import duty (Step 4) itself has also changed — this July 2026 source only confirms the NAC levy change, not the underlying duty rate. Do not assume Step 4 is stable just because this source didn't mention it changing; verify directly.
- The "70% to 40%" and "50% or more on over 80 tariff lines" figures found in other sources during initial research almost certainly refer to a different, older aggregate-effective-duty framing (possibly pre-dating the 2022 ECOWAS CET migration) rather than a line-item match to this formula's Step 4 — flagged as a discrepancy, not resolved, and should not be blended with the confirmed May 2026 NAC figure above.
- Rates for vehicle categories outside standard passenger cars (motorcycles/tricycles, commercial trucks/buses) are NOT covered by this correction and are being researched separately — see Track 3, `BEHAVIORAL_RESEARCH.md`. Do not assume the 5%/10% NAC figures above apply to those categories without direct confirmation.



### 3.1 Explicit scope boundary
This is a **present-condition snapshot**, not a historical-records product. No attempt is made to replicate Carfax's accident-history/title-history function, because the structured digital records substrate (DMV-equivalent, insurance total-loss databases, service history networks) that Carfax depends on does not exist in accessible form in Nigeria. This is treated as a permanent structural fact for MVP purposes, not a gap to be solved by more scraping.

### 3.2 What ships in MVP
A standardized condition-report format, filled at point of listing, covering (exact field list is a build-phase decision, not specified here — placeholder categories below pending your input):
- Exterior/body condition
- Engine/mechanical condition  
- Interior condition
- Documented mileage
- Damage/accident disclosure (self-reported at MVP stage — verification mechanism is explicitly **not yet decided**, see §5 Open Decisions)

### 3.3 Explicit non-goal for MVP
No physical inspector network, no fixed inspection centers, no mobile-dispatch inspection model. This is a deliberate scope cut based on the Cars45 precedent (13 centers at Series A, ~60 at scale, $5M raised, later folded into an acquirer) — physical inspection infrastructure is capital-intensive in a way inconsistent with a zero-capital, lean MVP. **This means the MVP's trust layer is standardized self-reporting, not third-party verification, at launch.** This is a real and named limitation, not a hidden one.

**Important distinction (per behavioral research F1.11, see `BEHAVIORAL_RESEARCH.md`):** Switchboard (§7) addresses *payment-trust* — it does not address *condition-trust*. A car can be exactly as poorly-conditioned as (dishonestly) described and Switchboard will still release funds correctly on a completed transaction. These are two separate trust problems solved by two separate mechanisms; condition-trust remains self-report-only at MVP stage, and this gap is not closed by escrow's existence.

---

## 4. What The MVP Explicitly Does NOT Include

Stated plainly so scope doesn't silently creep during build:

- ❌ Auction mechanics (deferred — depends on pricing + trust layers existing first to function as intended, per sequencing logic in strategy discussion)
- ❌ Financing/loan integration (deferred — explicitly stated as "not solving problems banks can't already solve"; bolt-on once transaction volume exists to justify bank partnership conversations, which take months to establish)
- ❌ Physical inspection network (deferred/possibly never, per §3.3)
- ❌ Historical vehicle records aggregation (structurally not viable in Nigeria — permanent non-goal, not a phase-2 item)
- ❌ Inventory-holding / C2B buy-resell model (explicitly rejected in favor of the lighter facilitation model — this is a considered decision, not an oversight)

---

## 5. Decisions — Status Update

1. **Condition-report exact field schema** — DEFERRED TO RESEARCH. Direction set: standing behind UX/UI as the core trust and growth mechanism. Full behavioral research now underway — see `BEHAVIORAL_RESEARCH.md`, Track 1 (complete) and Track 3 (vehicle-category-specific parameters, queued). Exact field schema to be finalized once Track 3 completes.
2. **Damage/accident self-disclosure verification** — RESOLVED (synthesis, pending your final sign-off). `BEHAVIORAL_RESEARCH.md` Track 2 complete. Zero-anchor research independently converged toward a tiered warn → suspend-with-reverification → permanent-ban structure — directionally similar to your original instinct, but for specific, sourced reasons (see Track 2 §2.5): notably, identity-level fraud detection is now a confirmed hard dependency for any suspension/reactivation policy to actually function, since permanent bans alone are documented to be trivially evadable via re-registration. F1.6's flag is also resolved — disclosure-as-sales-advantage messaging is confirmed to hold for fixed-price P2P listings, not just auctions (F2.4), so this is safe to build into onboarding copy now. See Track 2 §2.6 for two items this resolution surfaces as new open dependencies (identity-verification mechanism, tier thresholds).
3. **CISS vs FCS current status** — still genuinely open. Track 6 (BEHAVIORAL_RESEARCH.md) resolved several other gaps this session but did not surface a direct resolution to this specific question — flagged honestly as still needing direct confirmation against current NCS practice before the formula is finalized in code, distinct from the vehicle-category rate question below, which now has a reasoned range.
4. **Vehicle age limit** — RESOLVED. 10 years, per your direction. Confirmed as not materially affecting the cost formula; its function is as a signal that the vehicle has been in Nigeria longer than a year, not a cost-stack input. Formula in §2.4 requires no changes.
5. **Geographic launch scope** — RESOLVED, with a flag. National from day one; expansion to other African countries at Month 3, regardless of growth performance to that point.
   ⚠ **Flag, not an objection — logged for visibility:** national launch multiplies every physical/local-variance unknown that's still open in this doc (clearing-agent fee calibration, §2.3; port/terminal handling variance by city/port, §2.4 Step 12; condition-disclosure trust at scale with zero verification infrastructure, §3). This is your call to make — flagging so it's a visible tradeoff, not a silent one. Separately: the reasoning behind the fixed Month 3 date (raise timeline, competitive window, seasonal import cycle, or otherwise) isn't yet captured anywhere in this document — worth adding once known, so the date reads as deliberate to anyone reviewing this later rather than arbitrary.
6. **Supply-side onboarding sequencing** — RESOLVED. Independent sellers targeted first (largest available early inventory), platform open to all seller types from day one — this is a launch-marketing/outreach emphasis, not an access restriction.
7. **Motorcycle/tricycle/commercial vehicle duty rates** — CONVERTED TO A REASONED RANGE, not left as a bare "blocked" item. Six independent attempts to retrieve an exact NCS-confirmed line-item rate all hit the same domain-wide JS-rendering wall on customs.gov.ng — a genuine, confirmed tooling ceiling, not a search-effort gap. In its place: a structural range built from the confirmed ECOWAS five-band definitions and each vehicle type's real economic function (commercial/working equipment vs. private consumption) — **5–10% for motorcycles/tricycles and general commercial trucks, 0% confirmed for mass-transit buses/EVs** (already settled separately). See `BEHAVIORAL_RESEARCH.md` Track 6 §6.1 for the full reasoning chain. This is an evidence-grounded range, not a placeholder — treat as the working figure until a clearing-agent conversation or working browser session against customs.gov.ng closes it to a point estimate.

---

## 7. Switchboard — Escrow Layer

**What it is:** A pre-built escrow system (ported from a prior project) held in trust until verifications are finalized. Named Switchboard for this platform.

**What it solves:** Payment-fraud risk specifically — seller receives payment without delivering, or buyer disputes after receiving goods with no neutral party holding funds. This is distinct from and does not solve condition-trust (see §3.3 distinction above).

**Why this is a strong fit, not just a convenient reuse (per behavioral research F1.10):** "Pay on delivery" / payment-timing-as-trust-mechanism is confirmed as an already-adopted, effective pattern specifically within Nigerian e-commerce, used explicitly to counter the high-fraud environment. Switchboard should be foregrounded and explained in marketing/onboarding copy — positioned as an extension of a trust pattern Nigerian users already recognize and trust, not introduced as an unfamiliar novel mechanism.

**Known limitation, named explicitly (per behavioral research F1.11):** Escrow does not solve disintermediation risk. Once a buyer and seller connect on-platform (necessary, since there's no third-party physical verification step requiring platform mediation), nothing structurally prevents them from completing the transaction off-platform and skipping the fee entirely — particularly once any trust is established between that specific pair. This is an accepted, known tradeoff of the lighter facilitation model (vs. the capital-heavy inventory-holding model explicitly rejected in §4), not an oversight.

**Mitigation research complete — see `BEHAVIORAL_RESEARCH.md` Track 5.** Seven concrete, non-coercive retention mechanisms identified, all evaluated against an explicit "not a dictator" constraint — the shared principle across all of them is making the on-platform path better, not making the off-platform path worse or penalized. Highlights: allow escrow-backed purchase directly from a verified listing without requiring extended pre-purchase messaging (closes the exact window where off-platform contact typically gets exchanged); make condition-report certification an active, invested opt-in rather than a passive auto-badge (genuine retention comes from the seller's own sunk investment, not from a badge alone — Airbnb Plus vs. Superhost is the direct evidence for this); consider whether Switchboard should be usable even for transactions that began off-platform, following the KeySavvy precedent, which competes on the safety of the transaction rather than on owning the discovery/listing step; and adopt "no cancellation fee, ever" as a stated platform principle — a concrete bright-line test for the coercion/retention distinction. Full synthesis table and sourcing in Track 5 §5.5.

---

## 8. SEO/AEO & Revenue Strategy — Scope Note

**SEO/AEO:** RESOLVED. `BEHAVIORAL_RESEARCH.md` Track 4 complete. Key strategic findings: (1) SEO and AEO should be built as one combined effort, not separate workstreams — AEO sits on top of SEO fundamentals, not instead of them; (2) the pricing engine's natural output (direct answer + formula breakdown) is already the winning AEO content shape — this is a presentation decision on existing work, not new content; (3) Nigeria's ~98.7% Google search concentration means non-Google SEO effort is not warranted; (4) mobile-first performance is a hard prerequisite, gating both Google ranking and AI citation share; (5) Perplexity is the most plausible highest-value early AI-citation target given the platform's structural freshness advantage from live pricing data. See Track 4 §4.4 for the full seven-point synthesis.

**Revenue tactics:** Core MVP monetization logic remains as sequenced in §6 below (pricing/trust layer first, transaction-driven revenue following). Additional revenue channels — direct manufacturer/assembly-plant partnerships, large-lot/dealer advertisement placements — are confirmed as **later-stage additions**, not MVP-phase requirements. Documented here to preserve the direction without expanding MVP build scope.

---

## 9. Sequencing (As Directed)

```
PHASE 1 (this document's scope) — Pricing engine + standardized condition self-report.
         No transactions required to validate; content/data-quality driven.

PHASE 2 — Once real transactions begin occurring on the back of Phase 1's trust signal,
          begin harvesting genuine closed-price data from actual platform transactions.
          This is the mechanism that starts retiring reliance on the landed-cost formula
          over time, replacing "chicken" (imported logic) with "egg" (real local data).

PHASE 3 — Auction mechanics, once both a trusted pricing baseline and condition-verified
          listings exist to attach to auction lots (auction without these two
          pre-conditions just reintroduces buyer distrust of a stranger, defeating its
          own purpose).

PHASE 4 — Bank/financing partnerships, bolted onto proven transaction volume as a
          monetization multiplier — not a launch dependency.
```

---

## 10. Sourcing Note

All customs/duty figures above are cross-referenced across multiple independently published sources as of mid-2026, with the used-vehicle-specific duty/NAC rate (20% duty + 15% NAC levy) corroborated by a US government trade-guide source (trade.gov) as the strongest single anchor, in agreement with three independent calculator-tool sources. Where sources diverged (age limit, CISS/FCS status), this document flags the divergence explicitly rather than averaging or guessing — those items remain open per §5.
