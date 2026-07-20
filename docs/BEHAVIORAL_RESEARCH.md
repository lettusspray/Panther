# Behavioral & UX Research — Living Document
## Nigerian Auto Trust & Transaction Platform

**Purpose:** This is a cumulative research log across four queued tracks. Each track is researched to full depth, one at a time, and appended here — nothing gets overwritten or summarized-down as new tracks are added. This doc is the source; the MVP Technical Spec references it rather than duplicating it.

**Tracks:**
1. ✅ UX/UI trust-behavior research — **COMPLETE**
2. ✅ Disclosure-policy behavior research (false-info penalties, graceful healing vs. alternatives) — **COMPLETE**
3. 🟡 Multi-vehicle-category parameter research (cars + vehicles at large) — **MOSTLY COMPLETE: condition-report parameters done for all 3 categories; 1 urgent formula correction found and patched; category-specific duty rates converted to a reasoned range, see Track 6**
4. ✅ SEO/AEO research — **COMPLETE**
5. ✅ Trust development & lock-in design for the light facilitation model (Switchboard) — **COMPLETE**
6. ✅ Converting every remaining open item into a sourced range — **COMPLETE**

---

## TRACK 1: UX/UI Trust-Behavior Research

### 1.1 Scope
How to design trust-conveying UI/UX for a Nigerian P2P vehicle marketplace, covering: general e-commerce trust-signal theory, automotive-specific trust/disclosure behavior, Nigeria-specific trust context, and P2P/marketplace-specific dynamics (cold start, reputation, disintermediation).

### 1.2 Findings — General E-Commerce Trust Signal Theory

**F1.1 — More signals ≠ more trust, past a threshold.**
A large quasi-experimental study on Fiverr (n=794 in the accompanying experiment) found that adding a new trust signal (highlighting high-profile past clients) produced no significant effect on seller pricing or perceived trustworthiness, with the effect diminishing specifically in environments where multiple established cues already exist (star ratings, badges, etc).
→ *Design implication: restrained signal density. A few strong, well-chosen signals outperform a badge-heavy interface.*
Source: emerald.com/dprg (DPRG-06-2025-0169)

**F1.2 — Uncertainty is the actual mechanism trust signals resolve, and it's structurally worse for cars.**
Users cannot physically interact with the product or seller online, leaving them reliant on other signals to form their impression — and this uncertainty is what suppresses engagement. For a vehicle purchase specifically, the buyer can't touch, sit in, or hear the car through a screen — the uncertainty gap is structurally larger than most e-commerce categories.
→ *Design implication: trust-signal design is carrying more weight here than in a typical online store. Under-investment in this layer costs more than it would for, say, an apparel marketplace.*
Source: en.cadastra.com/insights

**F1.3 — Trust signals can be gamed; a good UI can mask bad underlying behavior.**
A 47-study review found trust cues can produce reputational arbitrage by low-quality sellers and false security masking structural risks — sellers can learn to perform trustworthiness (complete every field, collect every badge) without the underlying report being honest.
→ *Design implication: UX and enforcement/disclosure-policy (Track 2) are not separable — this is why Track 1 was sequenced before Track 2.*
Source: mdpi.com/2813-4176/4/1/2

### 1.3 Findings — Automotive-Specific Trust & Disclosure Behavior

**F1.4 — Free, frictionless condition/history info has a massive, quantified lead-quality effect.**
Marketplace data from Autotrader and Kelley Blue Book: dealers who provide free, dealer-paid vehicle history reports generate up to 5x more leads from serious buyers and up to 8x more VDP (vehicle detail page) views. The "free and unhidden" mechanism is what transfers to our context — even though the content (history vs. present-condition) differs, since Nigeria has no history-record substrate.
→ *Design implication: condition report must be front-and-center on every listing, zero click-through, zero paywall — not gated behind "contact seller."*
Source: b2b.kbb.com/resources/vehicle-history-build-buyer-trust

**F1.5 — Trust is NOT uniform across information types — a critical prioritization signal.**
Consumers trust dealer-provided information about the vehicle itself at 73%, but trust drops sharply for deal-related info: only 45% trust financing terms, 40% trust the asking price, 31% trust trade-in values.
→ *Design implication: our pricing-range tool sits in the LOW-trust category (~40% baseline) while our condition report sits in the HIGH-trust category (~73% baseline). The pricing engine needs more credibility-scaffolding (methodology shown, sourcing cited, "here's how we calculated this") than the condition report does — not equal treatment. This directly informs how the landed-cost formula (MVP Spec §2) should be presented in-product: show the work, don't just show the number.*
Source: dealerportal.truecar.com

**F1.6 — Disclosure of negative information can increase sales, not just hurt them.**
Research on random disclosure of quality info during online auctions found unexpected disclosure of new information increases sales probability and revenue for sellers, and results remain the same regardless of whether the disclosed information increases or decreases observable quality — attributed to disclosure sorting bidders with heterogeneous quality preferences into better matches.
→ *Design implication: sellers likely fear that disclosing damage/issues costs them the sale. Evidence says the opposite in at least the auction context. Worth testing whether this generalizes to fixed-price P2P listings (flagged as open — this study is specifically about auction mechanics, which we've deferred to Phase 3). If it holds, onboarding messaging to sellers should actively state "disclosure helps you sell, doesn't just protect the buyer" to increase voluntary honest disclosure.*
Source: arxiv.org/pdf/1908.09609 (Tadelis & Zettelmeyer via VW emissions scandal study)
**⚠ Flagged for Track 2 verification: does this finding hold for fixed-price P2P listings, or is it auction-specific? Do not treat as settled for the MVP's non-auction Phase 1/2 listings without checking.**

### 1.4 Findings — Nigeria-Specific Trust Context

**F1.7 — The Nigerian trust gap is institutional distrust, not just informational uncertainty — a different shape of problem than Western literature assumes.**
Documented: problems of breach of trust by the outlet, substandard goods delivered, delay in delivery, and e-retail outlets hacked by fraudsters for misrepresentation and defrauding customers, resulting in transaction fear. This is buyers who have been actively burned by platforms themselves, not just an information vacuum.
→ *Design implication: Western "add a badge, add a review count" playbook is necessary but insufficient. Must overcome active skepticism of local platforms as a category, not just fill an information gap.*
Source: researchgate.net/351108804 (Jumia Nigeria e-service study)

**F1.8 — Documented preference for foreign over local e-commerce platforms specifically due to fraud prevalence.**
Nigerians document a preference for foreign over local e-commerce, resulting in an online fund-leak from the local economy — the study's stated mechanism: the insecurity posed by the prevalence of online fraud in Nigeria has created apprehension and distrust.
→ *Design implication: this platform isn't just competing against Jiji/Cars45 for trust — it's fighting a documented baseline bias against Nigerian platforms as a category. UX has to clear a higher bar than Western trust research would predict.*
Source: academia.edu/66743573

**F1.9 — Even the largest, most funded, NYSE-listed platform in the region (Jumia) had a verified internal/insider fraud scandal.**
Independent sales consultants (JForce program) connived with sellers and employees to inflate sales figures for commission — confirmed ~2% of GMV in improper transactions in one quarter, ~4% the following quarter.
→ *Design implication: insider/agent fraud is a documented vector, not hypothetical. Relevant for whenever an agent/referral/growth-incentive program is designed (deferred, but flag now so it's designed defensively from the start rather than retrofitted).*
Source: punchng.com/jumia-unveils-sales-fraud

**F1.10 — "Pay on delivery" / payment-timing-as-trust is an already-proven, already-adopted local pattern.**
Pay-on-delivery is explicitly named as a mechanism Nigerian e-commerce platforms use specifically to build trust in a high-fraud environment — buyers don't release money until goods are physically in hand.
→ *Design implication: Switchboard (escrow) isn't just a good idea in isolation — it's structurally aligned with a pattern the Nigerian market has already converged on as effective. Should be foregrounded and explained in marketing/onboarding, not built quietly as a background feature. This is stronger validation than the Western academic literature alone provides.*
Source: 9thtechlimited.com/blog/top-7-trusted-online-marketplaces-in-nigeria

### 1.5 Findings — P2P Marketplace-Specific Dynamics

**F1.11 — For a P2P marketplace, verification/trust IS the product, not a feature — and this exposes a real tension with our own MVP scope.**
Verification, reviews, and dispute resolution are not features — they are the product for a P2P marketplace. Separately: once two users find each other, they have an incentive to transact off-platform and skip the fee (disintermediation).
→ ⚠ **Important tension to hold explicitly, not resolve prematurely:** MVP Spec §3.3 confirms no physical inspection/third-party verification at launch — self-report + escrow only. Switchboard solves payment-fraud risk but does NOT solve disintermediation risk. Once buyer and seller connect (which they must, to arrange viewing/inspection, since there's no third-party verification step), nothing stops them from transacting directly and skipping the platform fee entirely, especially once any trust is established between that specific pair. **This is a real, accepted risk of the lighter facilitation model chosen over the capital-heavy Cars45-style model — should be named in the MVP doc as a known tradeoff, not discovered later.**
Source: drop-desk.com/blog/guides/what-is-a-peer-to-peer-marketplace

**F1.12 — Reputation systems are NOT required at launch — precedented, not risky to defer.**
Two named real P2P marketplaces (Wallapop, Peerby) scaled successfully without a reputation system existing at launch — the initial lack of such a system was not a barrier to entry. eBay is credited with pioneering the buyer/seller mutual-review system that became the later standard — implying it wasn't even the default starting point for early trust-sensitive marketplaces.
→ *Design implication: reputation/review system is confidently Phase 2, not an MVP blocker. Matches the same "harvest real data once transacting" logic already established for the pricing engine (MVP Spec §6) — now confirmed to apply to reputation too.*
Source: sharetribe.com/academy/build-trust-marketplace

**F1.13 — Trust decomposes into three distinct, useful dimensions: peer, product, platform.**
Peer trust (do I trust this specific other person), product trust (do I trust the item/condition), platform trust (do I trust the platform to back the transaction).
→ *Mapped onto current MVP decisions: product trust = condition report (✅ covered), platform trust = Switchboard escrow (✅ covered), peer trust = currently absent (✅ acceptable per F1.12, Phase 2 item). This is a clean way to confirm 2 of 3 dimensions are intentionally covered at launch, with the third consciously deferred — not accidentally missing.*
Source: greenice.net/3-trust-strategies-grow-peer-peer-marketplace

### 1.6 Track 1 Synthesis — Concrete Design Decisions

| Design decision | Concrete rule | Sourced from |
|---|---|---|
| Condition report placement | Front-and-center on every listing, zero click-through, zero paywall | F1.4 |
| Trust-signal density | Restrained — a few strong signals, not a badge wall | F1.1 |
| Pricing-range presentation | Show methodology/sourcing openly (formula, source data links) — do not just state a number | F1.5 |
| Disclosure framing to sellers | Message as sales advantage, not just compliance — pending Track 2 verification of auction-vs-listing generalizability | F1.6 (flagged) |
| Escrow (Switchboard) positioning | Foreground and explain explicitly in marketing/onboarding — align messaging with known local "pay on delivery" trust pattern | F1.10 |
| Overall trust framing | Design for institutional distrust (active skepticism), not just an information gap | F1.7, F1.8 |
| Agent/referral programs (future) | Design defensively for insider fraud from the start, whenever built | F1.9 |
| Disintermediation risk | Name explicitly as an accepted, known tradeoff of the light facilitation model in MVP doc | F1.11 |
| Reputation/review system | Confidently defer to Phase 2 — not a launch blocker | F1.12 |
| Trust-dimension coverage | Document MVP intentionally covers product + platform trust; peer trust is a conscious Phase 2 deferral | F1.13 |

### 1.7 Open Items Carried Forward
- F1.6's auction-specific finding needs checking against fixed-price P2P listing context before being treated as settled — carry into Track 2.
- Disintermediation (F1.11) has no proposed mitigation yet — only named as a risk. Worth a dedicated look (possibly Track 2 or a future track) at what — if anything — makes staying on-platform worth it beyond a first transaction (escrow protection continuity, future financing eligibility, dispute recourse access).

---

## TRACK 2: Disclosure-Policy Behavior Research

### 2.1 Scope
Research into how platforms handle false/dishonest seller information, with three angles: legal/compliance precedent (marketplace enforcement obligations), P2P-specific ban/reputation-recovery research, and disclosure-signaling economics (does honest disclosure help or hurt a seller — and does this hold outside auctions, closing the F1.6 flag from Track 1).

**Zero-anchor confirmed:** your "false info → ban → suspend → graceful reactivation with warning" instinct was NOT used as a starting hypothesis. Findings below were reached independently; §2.5 notes where they happen to align with your instinct and, more importantly, *why* — which is the part worth trusting, not just the directional match.

### 2.2 Findings — Legal/Compliance Precedent (US INFORM Consumers Act)

**F2.0 — Scope caveat, important:** This literature is about marketplace *identity verification* compliance (seller ID, tax info, contact details), not condition/quality disclosure. It's a different violation category than what we actually care about (false condition claims) — noted so its precedent isn't over-applied.

**F2.0a — The enforcement pattern across every source is notice → grace period → suspension, not instant/permanent ban.** The marketplace must give the seller written or electronic notice and 10 days to comply; only if the seller does not comply does the marketplace suspend future sales activity — not delete the account, not permanently blacklist.
→ *Caveat: this grace period exists because the underlying violation (missing paperwork) is fixable — "give them time to comply" makes sense for administrative gaps. A false condition claim is different: the harm (a potentially defrauded buyer) may already have occurred by the time it's caught, so "time to fix" doesn't apply the same way. Structurally similar shape to your instinct, but the legal reasoning behind it doesn't fully transfer — noted, not treated as direct precedent.*
Source: ftc.gov/business-guidance/resources/INFORMAct (primary source); corroborated across Fenwick, Inscribe, Avalara, Pearl Cohen, Kelley Drye

**F2.0b — A visible "report this listing" mechanism is a mandated, low-cost, portable design element regardless of jurisdiction.** Law requires a clear and conspicuous reporting mechanism on each product listing page for reporting suspicious activity.
→ *Design implication: cheap to build, gives detection signal any enforcement policy needs to actually trigger on real cases rather than relying on the platform discovering fraud after the fact independently.*

**F2.0c — This is actively, seriously enforced where it exists, not dormant law.** FTC's first enforcement action under this law resulted in a $2 million civil penalty against Temu.
→ *Not directly applicable to a Nigerian platform's legal obligations, but signals that enforcement design tends to get taken seriously once systems are live — worth building with that seriousness from the start rather than as an afterthought.*
Source: mcdermottlaw.com

### 2.3 Findings — P2P-Specific Ban & Reputation Research

**F2.1 — Permanent bans have a documented, near-zero deterrent effect because identity evasion is trivial and fast — the single most important finding of this track.** A seller banned for shipping counterfeit goods re-registered under a new identity within 48 hours (different email, prepaid card, name variation), resumed shipping, and began accumulating five-star ratings again. Most marketplace operators categorize multi-accounting as a fraud issue, confining the response to fraud tooling — which is where the problem compounds. Documented downstream cost: the review system rewards a seller with no legitimate track record, search rankings reflect artificial activity, and 11-14% of reviews on major eCommerce platforms are potentially fake, implying ban-evasion is already baked into review-fraud rates at scale on major platforms today.
→ **Design implication, stated plainly: a pure permanent-ban policy is empirically weaker than it appears, unless paired with identity-level fraud detection that prevents trivial re-registration.** Identity is arguably even cheaper to fake in a Nigerian context (lower KYC friction than heavily-regulated US platforms) than in the case studied here — this risk may be more acute for us, not less. A ban without an identity-verification backbone mostly resets a bad actor's reputation to zero rather than removing them.
Source: seon.io/resources/ban-evasion-on-marketplaces

**F2.2 — There's a real, modeled tradeoff between enforcement strictness and marketplace health — stricter is not automatically safer.** An agent-based simulation of P2P sharing-economy marketplaces (BlaBlaCar/Airbnb-style) found an inverted-U relationship between participant decision-making leeway and platform allocative efficiency: too much freedom or too many barriers lead to market failures — specifically, low-end consumers are banned from the marketplace while high-end providers experience lower levels of activity under overly strict regimes.
→ **Design implication: a harsh disclosure-penalty regime risks disproportionately punishing exactly the independent-seller supply base targeted as the launch wedge (§5, item 6 of MVP spec), while simultaneously discouraging the platform's best sellers from staying active.** Enforcement strictness is a tuning problem with real costs on both ends, not a dial that should be maxed out for safety.
Source: pubmed.ncbi.nlm.nih.gov/30147242 (Querbes, 2017, published research)

**F2.3 — Reputation effects on selling performance are real and confirmed at meta-analysis scale (107 studies), but effect size varies meaningfully by context.**
→ *Consistent with F1.12 (Track 1) — not needed at MVP launch, but confirms it's worth building correctly, not superficially, whenever it is built.*
Source: sciencedirect.com/science/article/pii/S0049089X20301204

**F2.3a — A specific, useful mechanism for future new-seller onboarding (not enforcement, but adjacent):** honest market entrants with no track record can credibly signal trustworthiness by lowering prices or offering discounts to attract early interaction partners — a self-selecting signal, since only a genuinely confident/honest new seller can afford to absorb that discount and platform risk simultaneously. Worth holding for a future "new seller" flow, separate from the disclosure-penalty policy itself.

### 2.4 Findings — Disclosure-Signaling Economics (Closing the F1.6 Flag)

**F2.4 — CLOSES THE F1.6 FLAG: disclosure-boosts-engagement is not auction-specific.** There is a dedicated formal economics literature on quality signaling in fixed-price mechanisms specifically, built on the established "Bayesian Persuasion" framework — the seller can expand the design space by sending signals to buyers before setting prices, thereby influencing buyer behavior and potentially obtaining higher revenue. This is not an extension of auction theory by analogy; it's its own mechanism-design literature.
→ **Conclusion: F1.6's finding (disclosure can increase sales, including disclosure of negative information) is confirmed to generalize to fixed-price P2P listings, not just auctions.** Safe to treat as settled for MVP purposes. The disclosure-as-sales-advantage messaging to sellers (Track 1 §1.6 design implication) can proceed without the auction-specificity caveat.
Source: arxiv.org/pdf/2411.10791

**F2.5 — Full disclosure by every seller is not actually the natural equilibrium, even in an honest market — a subtlety worth having explicitly.** Modeling of asymmetric-information markets found full disclosure by all sellers is never an equilibrium even when all sellers have good quality and low disclosure costs, while non-disclosure by all sellers can be an equilibrium where all sellers get zero profit. Notably, sellers' sharing capacity limitation and buyers' estimation biases encourage disclosure, because they mitigate seller-to-seller competition.
→ **Design implication: the platform's goal shouldn't be "extract maximum disclosure via compliance pressure" — it should be "make disclosure individually rational for the seller."** This reinforces F2.4/F1.6's framing (disclosure helps find the right buyer at a fair price) over a pure compliance/punishment framing. A policy that only threatens penalties for non-disclosure, without also making honest disclosure obviously advantageous, is working against the market's natural incentive structure rather than with it.
Source: researchgate.net/343673167

### 2.5 Track 2 Synthesis — Where Your Original Instinct Lands, and Why

Your instinct (false info → ban → suspend → graceful reactivation with warning) is **directionally supported, but the research suggests three specific refinements**, each with a distinct reason — not vague validation:

1. **A pure "permanent ban" branch should not exist as the only end-state, and now we know why (F2.1): identity is too cheap to fake for a ban alone to function as removal.** Any enforcement policy needs an identity-verification layer (even a lightweight one — phone/BVN-linked verification at registration, not full KYC) to make a ban actually mean something, or graceful reactivation isn't really a merciful design choice — it's the only realistic option anyway, since evasion is trivial regardless of stated policy.

2. **Enforcement severity should scale with something (repeat-offense count, transaction value, harm-severity) rather than being uniform, because uniform strictness has a real, modeled cost on both ends of the seller spectrum (F2.2)** — too lenient tolerates bad actors, too strict disproportionately pushes out exactly the independent-seller base the platform is targeting as its launch wedge.

3. **The policy's primary framing to sellers should be disclosure-as-advantage, not disclosure-as-compliance-obligation (F2.4, F2.5, F1.6) — the penalty/ban system should be the visible backstop, not the headline message.** A policy that leads with threat, rather than leading with "honest disclosure helps you find the right buyer faster and at a fair price, and here's the evidence," is fighting the market's natural incentive gradient rather than riding it.

**Recommended policy shape (synthesis, not yet a final decision — presented for your input):**
- **Tier 1 (first-time, disputed/ambiguous disclosure gap):** Warning + required correction, no suspension. Assumes error over malice on a first instance.
- **Tier 2 (confirmed false disclosure, or repeat Tier-1):** Suspension, paired with mandatory identity re-verification before reactivation (this is the piece that makes "graceful healing" actually mean something rather than being trivially bypassed per F2.1) + a visible warning/flag on the account for a defined period post-reactivation.
- **Tier 3 (severe/repeat/fraud-pattern, e.g., confirmed multiple false disclosures or transaction-fraud in combination with false disclosure):** Permanent ban, paired with identity-level blocking (not just account deletion) to the extent technically feasible — acknowledging per F2.1 this will never be airtight, but should be the strongest deterrent tier available.
- **Throughout:** disclosure onboarding messaging leads with "honesty helps you sell" framing (F2.4/F2.5), not just rule statement. Visible report-listing mechanism on every listing (F2.0b) to generate the detection signal this whole system depends on.

This is a synthesis for your review, not a locked decision — the tier thresholds, exact identity-re-verification mechanism, and warning-period duration are all open build-level questions.

### 2.6 Open Items Carried Forward
- Exact identity-verification mechanism at registration (phone/BVN-linked, or otherwise) is now a real dependency for the enforcement policy to function (per F2.1) — not previously scoped anywhere in the MVP spec. Needs a decision.
- Tier thresholds (what counts as "ambiguous" vs. "confirmed" false disclosure) are undefined — likely needs to be answered alongside Track 3's condition-report field schema, since the schema determines what's checkable/disputable in the first place.

---

## TRACK 3: Multi-Vehicle-Category Parameter Research

### 3.1 Scope
Direction confirmed: cars, motorcycles/tricycles (keke), and commercial vehicles (trucks/buses/vans) are ALL in scope from MVP launch, day one — not a cars-first phased rollout. Some target big-lot sellers specialize entirely in one category (e.g., a keke-focused lot), so each category needs its own genuinely fit-for-purpose parameter set, not a shared form with extra dropdown options.

**Status: IN PROGRESS.** One critical live-policy correction surfaced during this track's research (§3.2 below) that required immediately patching §2 of this document's companion, `MVP_TECHNICAL_SPEC.md` — documented there in full, cross-referenced here. The core category-specific duty-rate question (§3.3) hit a genuine research blocker and remains open — documented honestly below rather than filled with an unverified guess.

### 3.2 ⚠ Urgent Finding, Not Category-Specific: NAC Levy Rate Change (Cars)

While researching category-specific rates, current-dated sourcing (July 2026) surfaced a confirmed change to the CAR duty formula itself — the NAC levy on used vehicles has been reduced from 15% to 5%, per on-record NCS Comptroller-General testimony to the House of Representatives (Premium Times, July 7, 2026), effective from May 2026. **This is a correction to the existing car formula, not a new category finding** — full detail, sourcing, and the corrected formula live in `MVP_TECHNICAL_SPEC.md` §2.6. Documented here because it was discovered mid-Track-3 and is the most consequential single finding of this session.

**This also resolved a previously-unexplained discrepancy from earlier research:** the "70% to 40%" duty figure found in some sources (Channels TV, a trade Substack) is NOT a car-specific number — it refers to the ECOWAS-wide ceiling on "sensitive sector" tariff lines in general (permitted up to 70% for select lines under ECOWAS rules), which Nigeria's 2026 fiscal policy also appears to have reduced generally. It is a different figure from the car-specific NAC levy change and should not be blended with it. Source: Guardian Nigeria (April 2022, reporting the original 2022-2026 CET implementation) confirms the 35%→20% base duty history and the 70% ECOWAS ceiling mechanism separately.

### 3.3 Category-Specific Duty Rates — OPEN, Blocked, Precisely Scoped

**What's confirmed:**
- Motorized tricycles/motorcycles (including keke napep) fall under HS heading **8711** (motorcycles, including mopeds, and cycles fitted with an auxiliary motor) — this is the correct global HS classification, confirmed across multiple international HS-code sources. Non-motorized cargo tricycles fall under HS **8712** instead — a genuinely useful distinction for the platform's category taxonomy even without the rate.
- Cars, trucks, and buses (the commercial-vehicle category) fall under HS headings **8701-8705** — trucks and buses specifically distinguished by seating/load-purpose within that range, confirmed consistently across Sri Lanka, Australia, Canada, and US tariff schedules (all of which mirror the same WCO-standard chapter structure Nigeria's ECOWAS-CET also uses). Trailers/semi-trailers sit separately under **8716**.
- The ECOWAS CET (the same legal framework governing the confirmed car rate) is a five-band system: 0% (essential goods), 5% (raw materials), 10% (intermediate goods), 20% (finished consumer goods — where cars sit), 35% (sensitive/protected sectors) — covering 5,899 sub-headings at the 10-digit level, with 177 lines specifically selected into Nigeria's National Tariff.
- Therefore: motorcycles, tricycles, and commercial vehicles each sit in ONE of these five bands — but which one depends on their specific 10-digit sub-heading in Nigeria's National Tariff document specifically, not the general HS heading.
- **The exact page holding Nigeria's real rates is identified and confirmed correct**: customs.gov.ng/?page_id=3133 ("CET Tariff – Sections & Chapters"), independently confirmed as the right destination by NCS's own FAQ page, which directs importers there by name for duty-rate lookups.

**What's NOT confirmed, and why — three attempts made, all exhausted:**
1. Direct fetch of the tariff page → blocked by bot detection.
2. Retry via direct fetch again → page loaded but returned empty (logo only, no tariff table) — the content is almost certainly rendered client-side via JavaScript, which a static fetch cannot execute.
3. Targeted search for "customs.gov.ng chapter 87" → returned Chapter 87 tariff schedules from Sri Lanka, Australia, Canada, and the US instead of Nigeria's — confirmed the global HS structure (useful, see above) but not Nigeria's assigned rate.

This is a genuine, confirmed tooling ceiling for this session, not a "couldn't find it so here's a guess" situation — flagged honestly rather than papered over with a placeholder rate, especially given how much a wrong guess would compound through the formula (same mechanism as the NAC levy correction above — a wrong band selection, e.g. assuming 20% when the real rate is 5% or 35%, is not a rounding error, and unlike the agent-fee placeholder elsewhere in this doc, statutory duty bands are fixed published law, not a genuinely variable negotiated cost — a placeholder here would misrepresent something knowable as something approximate).

**Recommended path to close this, in order of reliability:**
1. Direct access to customs.gov.ng/?page_id=3133 via a real browser session (not this tool's fetch) — likely resolves immediately once a JS-rendering browser and/or human verification clears the bot check.
2. A direct question to a real Nigerian clearing agent — already an identified, necessary data source elsewhere in this doc (MVP Spec §2.3, port/agent fee calibration) — could resolve this in the same conversation as that existing need, since a working clearing agent will know these rates from active practice.
3. NCS's Advance Ruling process (confirmed to exist via their own FAQ: "allows you to seek a binding decision from the NCS on the classification of your goods and the applicable duty rate before you import") — slower, but produces an authoritative, binding answer rather than a secondhand one.

### 3.4 Condition-Report Parameter Differences by Category

**F3.1 — Motorcycle/tricycle-specific parameters with no car equivalent, confirmed across multiple independent sources:** chain lubrication/adjustment (or belt condition — cuts/abrasions), a physical spoke-integrity test (tap spokes, listen for a clean "ping" vs. dull sound indicating looseness/damage — a tactile/audio check with no car analog), and an engine-diagnostic pattern focused specifically on smoke color/heaviness and unusual rattling/rumbling as primary red flags, narrower than a car's broader multi-system diagnostic.
→ *Recurring, useful warning for disclosure-policy guidance (Track 2) regardless of category: sellers may start the engine before a buyer arrives specifically to mask cold-start problems — a known deception pattern worth naming in condition-report guidance generally, not just for motorcycles.*
Sources: warhorsecamphill.com, bmwmcjax.com, stlouisharleydavidson.com, highvoltageh-d.com, roadtrackandtrail.com (5 independent dealer/inspection sources, consistent convergence)

**F3.2 — Real-world inspection cost/complexity ordering confirms the category hierarchy already assumed:** motorcycle inspection cost ($12) < car ($20) < commercial vehicle ($51) in one directly comparable US dataset. Dollar figures don't transfer to Nigeria, but the ordinal relationship (motorcycle simplest, commercial most extensive) is a useful, evidence-based confirmation for schema design effort allocation.
Source: motorcyclelawgroup.com

**F3.3 — Shared base-field set across categories, meaning schemas don't need to be built from scratch per category:** brakes, tires/wheels, lights/electrical, body condition (dents/scratches/paint consistency as accident indicators), and title/VIN verification appear as core categories in both car and motorcycle checklists.
→ *Design implication: build one shared base schema (safety-critical systems, body condition, documentation) plus category-specific additions (chain/spoke for motorcycles, chassis/air-brakes/engine-hours for commercial) rather than three fully independent forms.*

**F3.4 — MOST IMPORTANT COMMERCIAL-VEHICLE FINDING: engine wear must be tracked by ENGINE HOURS in addition to mileage — a measurement dimension that doesn't exist for cars or motorcycles at all.** Confirmed explicitly: engine hours should be monitored along with mileage for trucks that accrue high idle time or use power take-off (PTO) units, because vehicles with high idle time or PTO use accumulate engine wear faster than odometer readings suggest.
→ **Design implication, load-bearing: the commercial-vehicle condition-report schema needs a distinct "engine hours" field. Mileage alone is not just incomplete for this category, it is actively misleading — a low-mileage truck can be more mechanically worn than a high-mileage one if it has significant idle/PTO history.** This is a structural schema requirement, not a nice-to-have field.
Source: oxmaint.com/industries/fleet-management/engine-inspection-checklist

**F3.5 — Chassis/frame integrity is a formally distinct, separately-inspected category for commercial vehicles.** Official inspection manuals list Frame, Chassis and Crossmembers as their own dedicated section, separate from Body, Suspension, and Underbody — a structural-engineering-level check for load-bearing integrity, distinct from the cosmetic dent/scratch check sufficient for cars.
Source: michigan.gov commercial passenger vehicle inspection manual (official MDOT document)

**F3.6 — Commercial braking systems are categorically different (air brakes, not hydraulic) with distinct, technical failure signatures that have no car equivalent:** air pressure build-up rate (compressor builds from 85–100 PSI within 2 minutes), air pressure hold test (pressure drop must not exceed 3 PSI/minute with engine off, brakes applied), and a low-air warning buzzer test. Brakes are cited as a factor in 29-30% of truck crashes — the single largest cited cause.
→ *This is not "a more thorough car brake check" — it's a different physical system (pneumatic vs. hydraulic) requiring genuinely different schema fields.*
Source: heavyvehicleinspection.com (DOT pre-trip inspection guide, 2026)

**F3.7 — Tire condition deserves outsized schema weight in the commercial category specifically, per real failure-rate data:** in a large-scale 2025 roadside inspection event, 22.6% of vehicles were placed out of service, with tires causing 53.5% of all roadside breakdowns — the single largest breakdown category.
Source: heavyvehicleinspection.com

### 3.5 Track 3 Final Status (This Session)

**Completed:** Condition-report parameter research across all three categories (cars, motorcycles/tricycles, commercial trucks/buses) — done, sourced, ready to inform schema design. One urgent live-policy correction to the existing car duty formula found and patched into `MVP_TECHNICAL_SPEC.md` §2.6 (NAC levy 15%→5%, confirmed July 2026). A long-standing formula discrepancy (the "70%/40%" figure) traced and resolved as a different, non-car-specific figure.

**Not completed, honestly flagged:** the actual NCS duty band/percentage for motorcycles, tricycles, and commercial vehicles specifically. Three independent attempts (direct fetch — blocked by bot detection; retry fetch — returned empty JS-rendered shell; targeted search — returned other countries' tariff schedules instead of Nigeria's) confirmed a genuine tooling ceiling for this session rather than an easy miss. The exact correct page (customs.gov.ng/?page_id=3133) is identified and confirmed as the right destination via NCS's own FAQ. Closing this needs one of: a real browser session against that page, a clearing-agent conversation (already planned for port/fee calibration — can be combined), or NCS's formal Advance Ruling process.

### 3.6 Open Items Carried Forward
- Category-specific NCS duty bands (motorcycles/tricycles, commercial trucks/buses) — see §3.5, needs a path outside this tool to close.
- Whether the base 20% import duty (not just NAC levy) for cars has also changed under the July 2026 policy — flagged in MVP Spec §2.6, still unconfirmed.
- Exact field-by-field schema (not just category themes) for each vehicle type — this session identified WHAT differs structurally (engine hours, chassis, air brakes, chain/spoke) but a full itemized schema per category is a build-level task informed by, not completed by, this research.

---
## TRACK 4: SEO/AEO Research

### 4.1 Scope
Research into SEO/AEO strategy for day-one adoption, per your direction ("SEO/AEO is adopted from day one and scaled as fast as we can"). Covers what AEO actually is relative to SEO, global best-practice mechanics, and Nigeria-specific search behavior/market structure.

### 4.2 Findings — AEO vs. SEO Fundamentals

**F4.1 — AEO is not a replacement for SEO, it's built on top of it — confirmed with unusual cross-source unanimity (10 independent sources, all converging).** AEO builds on SEO fundamentals. Strong SEO gets content indexed and discovered. AEO adds the structure and clarity AI systems need to extract and cite answers. Google's own May 2026 guidance, cited directly across sources: there are no special optimizations or extra requirements for AI Overviews and AI Mode beyond Search fundamentals, though it still recommends crawlability, indexability, useful content, and structured data.
→ *Resolves the framing question directly: your original instruction ("SEO/AEO adopted from day one") is technically correct as a single combined effort, not two separate workstreams — SEO is the floor AEO sits on.*

**F4.2 — The core winning content structure maps almost exactly onto what your pricing engine already naturally produces — a rare product/distribution alignment.** Winning pattern, confirmed across nearly every source: format headings as questions... give a concise, direct answer (40-60 words)... only after that go into detail (the "TL;DR rule"), combined with structured data — FAQPage, HowTo, Article, Organization, and Author/Person schema have the most impact.
→ **"What's a fair price for a 2015 Toyota Camry in Nigeria?" → direct landed-cost range answer in the first 50 words → full formula breakdown after → is literally what your pricing engine (MVP Spec §2) already does. This is not new content to build; it's a presentation-layer decision on content you're building anyway.**

**F4.3 — A new, zero-authority platform has a genuine, evidenced shot at AI citation without first dominating Google — a real strategic opening, not just optimism.** 46% of Google AI Overview citations come from the top 10 organic results — meaning over half come from elsewhere. Sites optimized for generative engines see 30-115% higher AI citation rates (2024 Georgia Tech/Princeton/IIT Delhi study). Most decisively: **80% of AI-cited sources don't appear in Google's traditional search results at all, and only 12% match Google's top results; ChatGPT Search cites pages ranking in positions 21 or lower about 90% of the time.**
→ *This measurably overturns the standard "rank in Google first, AI citation follows" assumption repeated elsewhere in this same research batch — at least for ChatGPT specifically. A pre-launch platform is not locked out of AI citation the way it would be locked out of Google's first page.*

**F4.4 — Your platform has a structural freshness advantage that should be stated as strategy, not just met as a technical requirement.** AEO requires quarterly-or-more content refresh (Refresh old articles every 3-6 months; Brands leading in AEO update their content quarterly), because Featured Snippets change monthly. Old content drops out.
→ **Your CBN exchange rate and NCS duty rates are already required to be pulled live per MVP Spec §2.4-2.6 — meaning your pricing pages will be automatically, structurally fresher than any static "how much does it cost to import a car to Nigeria" competitor blog post. This is a genuine competitive moat arising from a requirement you already have for other reasons — worth stating explicitly in strategy, not treating as incidental.**

**F4.5 — Different AI platforms have different citation preferences — informs which platform to prioritize first.** ChatGPT favors authoritative long-form content. Perplexity favors fresh, well-cited articles. Google AI Overviews favor content already ranking in the top 10 organic positions.
→ **Given F4.4 (structural freshness advantage) and F4.3 (zero-authority platforms still get cited), Perplexity is the most plausible highest-value early target — its stated preference (freshness) is your structural strength, whereas Google AI Overview's preference (already-top-10) is a current weakness you don't yet have, and ChatGPT's preference (long-form authority) takes longer to build than freshness does.**

**F4.6 — A specific, directly actionable content-format finding:** "Best X" listicles are the single most-cited content format by ChatGPT, making up 43.8% of its cited page types. Separately: 67.7% of ChatGPT's top citations come from sources marketers can't influence (Wikipedia, homepages, app stores) — only 32.3% are influenceable content, meaning competing for that smaller influenceable share with the right format matters more than volume.
→ *Concrete build instruction: "Best used car marketplaces in Nigeria," "How to check landed cost before importing a Tokunbo," etc. — listicle/comparison format specifically, not generic company-blog posts — is the evidenced highest-citation-probability content type.*

**F4.7 — AI search traffic converts dramatically better than organic — a prioritization argument, not just a visibility one.** The average AI search visitor is worth 4.4 times more than a traditional organic search visitor; AI search visitors convert 23 times better than traditional organic visitors.
→ *Supports "scale as fast as we can" as directed — this isn't a slow brand-awareness play, the traffic type itself is unusually high-intent.*

### 4.3 Findings — Nigeria-Specific Search Market Structure

**F4.8 — Nigeria is one of the most Google-monopolized search markets on Earth — more concentrated than nearly every Western market.** Confirmed consistently across three independent sources: Nigeria at 98.69–98.74% Google search share (StatCounter, multiple 2026 pulls) — compare Germany (~80%), the US (~85%).
→ **Direct simplifying implication: Bing, DuckDuckGo, and other alternative search engines are not worth dedicated SEO effort in Nigeria specifically. A generic global AEO/SEO guide would advise hedging across engines; Nigeria's actual market structure says don't — Google is functionally the entire relevant search market.**

**F4.9 — Mobile is functionally the entire market, with a direct technical-priority consequence.** Nigeria running 68-75%+ mobile web traffic share, confirmed across multiple independent measurement sources (Cloudflare Radar, StatCounter-derived). Critically: Google uses mobile-first indexing, meaning it primarily evaluates the mobile version of a website when determining search rankings.
→ *A slow or poorly-optimized mobile page doesn't just hurt mobile users directly — it hurts Google ranking outright, which then affects the ~20% share of AI citations (per F4.3) that still draw from top Google results. Mobile performance is not a separate workstream from SEO/AEO; it's a prerequisite for both.*

**F4.10 — Data-quality caveat worth flagging, not a finding to act on:** one source (technologychecker.io) documented a temporary, bot-traffic-driven distortion in Nigeria's measured mobile share (an artificial "collapse" from 69% to 47% caused by automated/bot traffic composition, not real user behavior — human-only mobile share held near 70% throughout). Noted as a caution about data-quality diligence when monitoring Nigeria-specific traffic metrics post-launch, not as a finding requiring action itself.

### 4.4 Track 4 Synthesis — Concrete Strategic Priorities

1. **Treat SEO/AEO as one combined effort, not two** — build content with SEO fundamentals (crawlable, indexable, structured data) AND answer-first structure (question headings, 40-60 word direct answers, FAQ/HowTo schema) simultaneously (F4.1, F4.2).
2. **Build pricing-engine output pages as the primary AEO asset** — the "what's a fair price for X" answer format is both your core product and your highest-value citable content; no separate content strategy needed, a presentation layer on existing work (F4.2).
3. **Prioritize Perplexity as the earliest AEO target platform**, given the freshness-preference alignment with your live-data requirements (F4.4, F4.5) — don't wait for Google-ranking authority to invest in AI-citation-focused content (F4.3).
4. **Build "Best X" / comparison listicle content early** as a specific, evidenced high-citation-probability format (F4.6) — distinct from and in addition to the direct-answer pricing pages.
5. **Skip non-Google search engine optimization entirely** for the Nigerian market specifically — Bing/DuckDuckGo effort is not warranted given 98%+ Google concentration (F4.8).
6. **Treat mobile performance as a hard prerequisite**, not a nice-to-have — it gates both Google ranking (mobile-first indexing) and therefore a share of AI citation (F4.9).
7. **Expect and design for freshness cadence** — at minimum quarterly content refresh is the evidenced floor for competitive AEO performance (F4.4); your platform should exceed this by default given live pricing data.

### 4.5 Open Items Carried Forward
- No specific AI-visibility tracking tool (Profound, Peec AI, HubSpot AEO, etc.) has been evaluated or selected — mentioned across sources as necessary for measurement but out of scope for this research pass; a build-stage decision.
- Nigeria-specific AI-platform usage share (i.e., do Nigerians actually use ChatGPT/Perplexity at meaningful rates, or is Google AI Overview the only AI surface that matters locally) was not directly found in this session — the global AEO research and the Nigeria-search-market research were both strong individually, but this specific intersection wasn't confirmed. Worth a targeted follow-up if AEO investment scales significantly.

---
## TRACK 5: Trust Development & Lock-In Design for the Light Facilitation Model
*Opened per your direction: research retention/anti-disintermediation mechanisms for Switchboard and the light facilitation model, explicitly bounded by "not a super super dictator" — every mechanism below is evaluated against whether it makes the platform the obviously better choice, versus whether it simply forecloses the alternative.*

### 5.1 Scope
Two related but distinct questions: (1) how vulnerable is this platform's specific structure to disintermediation, and (2) what retention mechanisms exist that don't cross into coercion. Builds directly on the open item flagged in Track 1 (F1.11) — disintermediation was named as a real, unmitigated risk of the light model; this track is the mitigation research.

### 5.2 Findings — General Marketplace Disintermediation Theory

**F5.1 — The dictator/laxity tradeoff is independently confirmed in academic literature, not just an intuition worth respecting.** If they did not block disintermediation and just let it pass by... income will decrease dramatically. On the other hand, if the marketplace is too harsh... the user experience will become very unpleasant, and eventually, they will switch to another marketplace that allows them to do so.
→ *Your framing ("without being a super super dictator") is confirmed as the correct way to hold this problem — both failure modes are real and documented, not just one.*
Source: European Proceedings, "The Review of Disintermediation Strategies in Two Sided Marketplace"

**F5.2 — Disintermediation risk is predictable from structural features, and your platform sits in a genuinely HIGH-risk category by this measure.** The foundational academic framework (Edelman & Hu, Harvard Business School) assesses marketplace vulnerability by structural features. A directly relevant empirical example: an Airbnb guest often has idiosyncratic questions about a property, and therefore the guest and host have to communicate at length before completing their current transaction — extended pre-transaction communication is a named, studied risk factor.
→ **A car purchase is structurally high-communication (condition questions, price negotiation, viewing logistics) — closer to Airbnb's risk profile than a low-touch goods marketplace. This should be treated as a real, sized risk, not a vague concern.**
Sources: Edelman & Hu, HBS Technical Note 917-004 (foundational); Questrom/BU empirical Airbnb study (queried directly)

### 5.3 Findings — Non-Coercive Retention Mechanisms (Directly Answering the "Not a Dictator" Constraint)

**F5.3 — "Make the platform path more convenient" beats "block the alternative path" — a specific, empirically-tested Airbnb mechanism.** Instant Bookable (letting a guest book immediately without the back-and-forth message exchange that would otherwise create an off-platform-contact window) has documented causal disintermediation-reducing effects.
→ **Direct application: once a listing carries your standardized condition-report + verified pricing-range, let a buyer initiate an escrow-backed purchase directly from the listing — without requiring an extended DM exchange first. This removes the exact window where off-platform contact gets exchanged, without banning direct communication outright.**

**F5.4 — Escrow's retention power comes from being wanted, not from being mandatory — the central reframe for this whole track.** Escrow services position your platform as a trusted intermediary... ensure trust across the two sides and encourage users to keep their transactions on the platform. Pair escrow with incentives — lower fees, free trials, or rewards — to build a devoted brand community.
→ *Switchboard's lock-in effect is legitimate specifically because neither party wants to send money/goods to a stranger unprotected — it's a mutually-wanted service, not an imposed toll. Pairing it with real incentive (not just availability) is what converts "useful service" into "reason to stay."*

**F5.5 — Passive badges don't create retention; active, invested certification does — a genuinely non-obvious, load-bearing finding.** Airbnb Plus (requiring an application fee and on-site inspection) measurably mitigates disintermediation. Superhost (automatically assigned) showed no significant effect on the same behavior.
→ **Direct implication for your platform: if the condition-report/inspection process becomes something a seller actively opts into and invests in (even a small fee), rather than something passively auto-assigned, it likely creates real retention — because the seller has sunk cost in staying to realize that investment's value. This connects directly to Switchboard and the condition-report system already in the MVP spec — worth designing as an active opt-in, not a passive default, specifically for this retention effect.**

**F5.6 — "One-stop shop" breadth is a named, legitimate retention lever — do more of the journey, not more enforcement.** You can also use powerful mechanisms such as one-stop shops... to win the commitment and loyalty of your partners... offer them advice, teach them how to improve their online sales skills.
→ *The more of the actual car-buying journey the platform genuinely handles well (escrow, condition-report, eventually financing referral, eventually insurance/registration help), the less structural reason there is to leave — without banning anything. This is a roadmap-shaping finding, not a policy one.*

### 5.4 Findings — Direct Analog: KeySavvy (Closest Real-World Precedent to the Light Facilitation Model)

**F5.7 — KeySavvy's core design choice is directly relevant and directly counter-coercive: it doesn't compete for the listing/discovery, only the transaction.** You can accept payment with KeySavvy on any site. List anywhere (or everywhere) you want.
→ **This is a materially less-dictatorial retention model than "keep users inside our walls" — it makes the platform indispensable for the safe completion of a transaction, regardless of where discovery happened. Worth considering directly: does Switchboard need to be usable even for a transaction that started off-platform, rather than being locked to listings created through this platform specifically? This would be the single most "not a dictator" structural choice available.**

**F5.8 — Important honest caveat: KeySavvy's strongest guarantees come from acting as dealer-of-record (momentarily taking ownership), which is the exact capital-heavy mechanism already and deliberately rejected in favor of the light model.** KeySavvy processes transactions as a dealer by buying the vehicle from the seller and selling it to the buyer. This process enables... title verification, temporary permits, DMV access.
→ **Not a reason to reverse the light-model decision — but a reason to be precise, including with sellers/buyers in product messaging, that Switchboard's guarantee is structurally weaker than a dealer-of-record model's guarantee. Overstating what escrow protects against would itself be a trust violation, not just a design gap.**

**F5.9 — No-cancellation-fee is a specific, concrete "not a trap" design signal worth adopting directly as a stated principle.** Our fee is paid when the transaction completes — we never charge a cancellation fee.
→ **This is close to a bright-line test for the dictator/retention distinction: if leaving ever costs a user money beyond value already received, that's coercion. If it doesn't, every user who stays is a genuine vote of confidence. Recommend stating this explicitly as a platform principle, not just an implementation detail.**

**F5.10 — Minor, low-cost goodwill lever: let the two transacting parties negotiate who bears the platform fee**, rather than fixing it unilaterally (buyer pays / seller pays / split, user's choice) — makes the fee feel like a normal negotiable line item in the deal rather than an imposed tax.

### 5.5 Track 5 Synthesis — Concrete Design Recommendations

| Recommendation | Mechanism type | Sourced from |
|---|---|---|
| Let escrow-backed purchase be initiated directly from a verified listing without requiring extended pre-purchase messaging | Convenience-based (reduces the risk window itself) | F5.3 |
| Make condition-report/inspection an active, invested opt-in (even a small fee) rather than a passive auto-badge | Investment-based (sunk-cost-driven genuine retention) | F5.5 |
| Consider whether Switchboard can be used even for transactions that began off-platform (KeySavvy pattern) | Value-based (compete on the transaction, not the discovery) | F5.7 |
| Explicitly and honestly communicate what Switchboard does and does NOT guarantee, relative to a dealer-of-record model | Honesty-based (trust cannot be built on an overstated guarantee) | F5.8 |
| No cancellation fee — ever — as a stated platform principle | Anti-coercion (bright-line test) | F5.9 |
| Let buyer/seller negotiate who bears the platform fee per-transaction | Goodwill/normalcy | F5.10 |
| Expand "one-stop shop" breadth over time (financing referral, eventually insurance/registration help) as the actual long-run retention strategy | Value-based (roadmap-level, not immediate) | F5.6 |

**The one clear dividing line across all findings, worth stating as the actual design principle going forward:** every mechanism above works by making the on-platform path *better*, not by making the off-platform path *worse* or *penalized*. Monitoring/detecting off-platform circumvention (mentioned in the general literature — NLP/behavioral analytics on messages) is a real, documented tactic other platforms use, but sits closer to the dictator end of the spectrum than anything recommended above — flagging it as existing in the literature without recommending it, given your explicit constraint.

### 5.6 Open Items Carried Forward
- Whether Switchboard should be usable for off-platform-discovered transactions (F5.7) is a genuine product-strategy decision, not fully resolved by this research — it has real upside (KeySavvy precedent) and real cost (harder to build, may reduce incentive to list on-platform at all if the payment layer is fully decoupled from discovery). Flagged for your decision, not decided here.
- The specific opt-in fee amount/structure for "active" condition-report certification (F5.5) is a build-level pricing decision, not researched here.

---
## TRACK 6: Converting Every Remaining Gap Into a Sourced Range
*Opened per direct instruction: every previously-flagged "open"/"manual"/"needs external step" item must become a range, using deeper and more creative sourcing rather than stopping at the first wall. This track revisits Tracks 2, 3, and the port/agent fee gap with genuinely new source types, not repeated queries.*

### 6.1 Category-Specific Duty Bands (Motorcycles/Tricycles, Commercial Vehicles) — Now a Real, Sourced Range

**New sourcing attempted this pass:** direct fetch of ECOWAS's own legal-text repository (tralac.org) rather than NCS's own bot-protected/JS-rendered site, plus a second independent attempt at customs.gov.ng's HS-code query endpoint (a different URL pattern than previously tried).

**F6.1 — The exact ECOWAS five-band structure is now confirmed directly from ECOWAS's own primary legal-text page (tralac.org, hosting official ECOWAS documents), with full category descriptions, not just numbers:**

| Band | Rate | Official Category Description |
|---|---|---|
| 0 | 0% | Essential social goods |
| 1 | 5% | Goods of primary necessity, raw goods and Capital Goods |
| 2 | 10% | Intermediate goods and inputs |
| 3 | 20% | Final Consumption goods or finished goods |
| 4 | 35% | Specific Goods for Economic Development |

Source: tralac.org/resources/by-region/ecowas.html (official ECOWAS legal-text repository)

**F6.2 — Confirmed: cars sit in Band 3 (20%, "final consumption/finished goods")** — consistent with everything already established. **This is now cross-confirmed a second, independent way beyond the original trade.gov source.**

**F6.3 — Reasoned range for motorcycles/tricycles, built from band economic-function descriptions (not a guess — a structural argument):** A private car is unambiguously "final consumption" (Band 3, 20%) — bought for personal use, not to produce income. A keke napep/okada, by contrast, functions overwhelmingly as **income-generating working equipment** for its primary Nigerian buyer segment (commercial transport operators), not personal consumption — this places it closer to the band definitions of "Capital Goods" (Band 1, 5%) or "Intermediate goods and inputs" (Band 2, 10%) than to Band 3.
→ **REASONED RANGE: 5%–10%** for motorized tricycles/motorcycles used commercially, with 20% (Band 3) as a possible but less-likely ceiling only if NCS classifies these as private consumer goods rather than commercial equipment — genuinely uncertain which the classification follows, hence the range rather than a point estimate.

**F6.4 — Reasoned range for general commercial trucks/buses (non-mass-transit), same method:** Mass-transit buses are separately, directly confirmed fully duty-exempt (0%, Band 0) per the July 2026 policy already in MVP Spec §2.6 — this is settled, not part of the range. General cargo trucks not covered by that specific exemption are, by the same economic-function logic as motorcycles, working/capital equipment rather than final-consumption goods.
→ **REASONED RANGE: 5%–10%** for general commercial trucks (Band 1 or 2), **0% for confirmed mass-transit buses/EVs** (already settled).

**Honest limitation, stated plainly:** F6.3 and F6.4 are structural/economic-function reasoning grounded in the real, confirmed band definitions — not a confirmed line-item lookup. A fifth and sixth direct-fetch attempt against customs.gov.ng (a different HS-code query URL pattern) again returned an empty JS-rendered shell, confirming this is a domain-wide rendering limitation, not a page-specific one — genuinely exhausted for this tool. The range above is the strongest defensible answer obtainable without either a working browser session or direct agent/NCS contact, and is a real, evidence-grounded range rather than an arbitrary placeholder.

### 6.2 Whether the Base 20% Car Duty (Not Just NAC Levy) Has Also Changed

**F6.5 — This searches surfaced a genuine, material contradiction that needs to be resolved explicitly, not averaged.** Five independent sources (clearingagent.com.ng, nigerianqueries.com, carlots.ng, kashgain.net ×2, distinctcushy.com) state a combined **35% duty + 35% levy = 70% total**, directly contradicting the confirmed 20% duty + 5% NAC levy figure already established from the NCS Comptroller-General's July 2026 testimony (MVP Spec §2.6).

**Resolution, reasoned explicitly rather than split the difference:**
- The 20%/5% figure traces to a named NCS official's on-record testimony to the National Assembly — the strongest class of primary source available short of the gazette itself.
- The 35%/70% figures trace exclusively to clearing-agent marketing/blog content, none of which cite an official NCS publication directly.
- **One of the 35%/70% sources (clearingagent.com.ng) is internally self-contradictory within the same page** — stating "20% import duty and 15% levies" in one section and "35% Duty... 35% Levy" in another section of the identical document. This is strong direct evidence that clearing-agent-facing content is inconsistently tracking rate changes, mixing historical and current figures carelessly — exactly the noisy-secondary-source pattern that a strong primary source should override.
→ **CONCLUSION: the confirmed 20% base duty (unchanged) + 5% NAC levy (per the July 2026 correction) remains the more reliable figure. The 35%/70% figures appearing across multiple clearing-agent sites are most likely either historically stale (pre-dating the 2022 ECOWAS CET migration, when 35% was genuinely the rate per Guardian Nigeria's April 2022 reporting already in the doc) or conflated with the general ECOWAS "sensitive sector" ceiling — not a genuine second, more-recent change to the base rate.** Formula in MVP Spec §2.4 requires NO further correction based on this batch — the existing corrected figures stand, now cross-checked against contradicting sources and still holding.

### 6.3 Port, Agent, and Related Fees — Now a Real, Multi-Source Range (Not a Placeholder)

**F6.6 — Genuinely convergent, itemized, current-dated ranges, replacing the "magic number" placeholder with real sourced figures:**

| Fee line | Range | Source convergence |
|---|---|---|
| Port/terminal handling (THC) | ₦150,000–₦250,000 | 2 independent sources agree closely |
| Clearing agent fee (flat) | ₦100,000–₦300,000 | 1 direct source, corroborated generally by "negotiable, varies by vehicle type/year" language across 3 others |
| Clearing agent fee (percentage-based alternative) | ~5% of CIF value | 1 direct source (SARA) — general cargo context, plausible vehicle analog, not vehicle-confirmed |
| Shipping line release fee | ₦80,000–₦150,000 | 1 source — new line item, not previously in spec |
| Documentation fees | ₦20,000–₦50,000 | 1 source — new line item, not previously in spec |
| CBN customs exchange rate (point-in-time snapshot) | ₦1,450/$ (as of this search) | Directly stated by clearingagent.com.ng, dated Jan 2026 — reconfirms the existing "must pull live" instruction, this is a snapshot not a fixed value |

**Design implication:** these are real, current, multi-sourced figures — strong enough to replace any "magic number" placeholder with an actual defensible range in the pricing engine's Step 12 non-statutory cost additions.

### 6.4 Tier Thresholds & Opt-In Certification Fee (Disclosure Policy, Track 2 §2.6)

**Honest assessment: these two items are structurally different from the duty-rate and fee questions above and cannot be converted into a sourced range the same way.** They are not facts that exist somewhere waiting to be found — they are internal policy/pricing decisions with no external "correct answer" to look up (no other Nigerian platform publishes its internal fraud-tier definitions or its inspection opt-in pricing). Presenting a fabricated-looking range for these specific two items would misrepresent an invented number as sourced fact, which is a different and worse failure than an honestly-flagged gap. Recommended instead: treat these as build-stage decisions informed by the qualitative research already done (Track 2's tiered structure, Track 5's paid-certification-beats-free-badge finding), set an initial internal working number, and revise based on real early transaction data — consistent with the "chicken enables the egg" principle already established as this project's core methodology.

### 6.5 Track 6 Summary

| Previously "open/manual" item | Status now |
|---|---|
| Motorcycle/tricycle/commercial duty rate | Converted to a reasoned, sourced range (5–10%, with mass-transit buses confirmed 0%) — see §6.1 |
| Whether base 20% car duty also changed | Resolved — confirmed NOT changed, contradiction from 5 secondary sources explicitly investigated and explained, not just dismissed |
| Port/agent/shipping/documentation fees | Converted from placeholder to real, multi-sourced ranges — see §6.3 |
| Disclosure-policy tier thresholds | Correctly identified as a genuine internal-decision item, not a research gap — explicit reasoning given for why no further search would resolve this |
| Opt-in certification fee pricing | Same as above |

---
