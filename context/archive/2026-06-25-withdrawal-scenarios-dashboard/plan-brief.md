# Withdrawal Scenarios Dashboard — Plan Brief

> Full plan: `context/changes/withdrawal-scenarios-dashboard/plan.md`

## What & Why

Roadmap slice **S-03** (north star). Extend `/dashboard` so a signed-in user sees four after-tax withdrawal scenarios simultaneously (immediate closure / 25% illness / 100% housing loan / 60+ retirement), with per-scenario availability derived from a saved birth date, gain/loss vs own contributions where meaningful, and a `<details>` explanation per card. This is where the product's core hypothesis — "the app turns gross PPK balance into a number the holder can act on" — becomes visible to the user. Every earlier slice (F-01, S-01, S-02, S-04) was prerequisite plumbing for this one. The slice also tightens the landing experience: a successful sign-in lands directly on `/dashboard`, and both auth pages display a short Polish app description so first-time visitors know what they're signing up for.

## Starting Point

`/dashboard` (post S-02 + S-04) renders the existing valuation block: `unitsSum × current ALL88 price` with a fund-conversion cutoff footnote. `transactions` carries `source ∈ {own, employer, state, carryover}` + `gross_amount`. `price_snapshots` carries the latest fetched price. `/setup` has the file upload + a contributions summary table. There is no `profiles` table, no birth-date storage, no tax / withdrawal / scenario code anywhere under `src/`.

## Desired End State

A signed-in user with imported transactions, a fresh fetched price, and a stored birth date opens `/dashboard` and sees, below the existing valuation block, four stacked Polish-language scenario cards — each with the net PLN amount, a concrete availability label (`Dostępne od 12.04.2058 (za 32 lata)` etc.), gain/loss vs own contributions where meaningful, a one-line tax/rule breakdown, and a `<details><summary>Jak to działa?</summary>` explanation. A user without a birth date sees the same amounts; only the availability labels degrade to a yellow "Podaj datę urodzenia..." hint linking to a new form on `/setup`. `/setup` also gains a "Po co setup?" intro paragraph and two new entry points to `/dashboard` (header link + post-import CTA). A footer line documents the Allianz-only constraint.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Tax-rule sourcing | Hardcoded constants with `// source: TODO` slots; implementer fills citations from authoritative URLs (ISAP / mojeppk.pl) before merge | Plan stays unblocked while preserving the NFR's "no silent estimation" gate at merge | Plan |
| 25% rule meaning | 25% non-returnable withdrawal for poważne zachorowanie (NOT a loan) | Only statutory "25%" PPK rule; PRD's "loan" wording was imprecise | Plan |
| Housing loan added | 4th scenario: 100% of accumulated funds, repayable in 5 years, under-45 only | User request — first-time housing scenario alongside the other three | Plan |
| Birth date storage | New `profiles` table (RLS-protected, FORCE RLS); captured via form on `/setup` | Matches existing user-scoped data convention; extensible to future profile fields | Plan |
| No-birth-date UX | Amounts always shown; only availability labels degrade to "Podaj datę urodzenia..." hint | Doesn't gate the headline value; nudges completion | Plan |
| Gain attribution method | Proportional by `gross_amount` across sources | Only method computable from our data; carryover rows naturally bypass (gross = 0); explicit in code comments | Plan |
| Gain/loss line scope | Shown only for `immediate` + `retirement` (final withdrawals); omitted for `illness` + `housing` | Comparison is misleading for partial withdrawals and loans; documented as deliberate | Plan |
| Loss UX | Red minus delta + explicit "strata X,XX zł" label | Honest about losses without alarming | Plan |
| Carryover units | Included in valuation sum; attributed to sources via proportional gross weights | Reuses S-04 helper unchanged; correct in the math | Plan |
| Layout | Four stacked cards under the valuation block | Simultaneous (FR-008), mobile-friendly, reuses existing glass-panel style | Plan |
| Calc location | Pure helper at `src/lib/scenarios/compute.ts`, called from dashboard frontmatter | Mirrors S-04 precedent; no new API route; single render path | Plan |
| Rounding | Full float precision through helper; format at display via `Intl.NumberFormat` | Acceptable at PLN scale; verify-script uses 0.005 PLN tolerance | Plan |
| Testing | tsx + `node:assert/strict` verify script with 8-12 worked examples (cases × edges) | Matches S-04 / S-02 / S-01 pattern; no test framework adoption | Plan |
| CPU budget check | Manual step in Phase 4: 5-year synthetic CSV under `wrangler dev --remote`; upgrade to Workers Paid if >8ms | Honors `context/foundation/lessons.md:3-11` which names S-03 as the risk | Plan |
| Setup → Dashboard nav | Persistent `→ Dashboard` link in `/setup` header + prominent "Przejdź do Dashboard" CTA in import-success banner | Covers both first-import and returning-user journeys | Plan |
| Explanations UX | Inline `<details><summary>Jak to działa?</summary>` per card + Setup "Po co setup?" intro + dashboard footer disclaimer | Reuses existing `<details>` pattern from S-02; zero new components | Plan |
| Post-signin landing | Redirect target swap: `/` → `/dashboard` in `src/pages/api/auth/signin.ts` | Removes a useless extra click for every sign-in | Plan |
| Auth-page app description | Shared `AppIntro.astro` Astro component rendered on both `/auth/signin` and `/auth/signup` | Single source of truth; first-time visitors see what the app does before authenticating | Plan |

## Scope

**In scope:**
- New `profiles` table (RLS) + `birth_date` form + save API route + middleware gate
- Pure `computeScenarios` + `computeAvailability` helpers + tax/age constants module
- 8-12-case verify script (regression net for tax math)
- Four scenario cards on `/dashboard` with availability labels, gain/loss (immediate + retirement only), breakdown, `<details>` explanation
- Setup-page "Po co setup?" intro paragraph
- Setup → Dashboard nav (header link + import-success CTA)
- Dashboard Allianz-only footer disclaimer
- README "Scenariusze wypłat" section + CPU-check snippet
- Manual CPU verification step against synthetic 5-year CSV
- Post-signin redirect target swap (`/` → `/dashboard`) in `src/pages/api/auth/signin.ts`
- Shared `AppIntro.astro` panel rendered on both `/auth/signin` and `/auth/signup` (Polish app description + 4-scenario bullet list + Allianz constraint line)

**Out of scope:**
- Scenario history / persistence of computed scenarios (no `scenario_snapshots` table)
- Per-user tax-rate overrides (every user gets the same constants)
- Rewriting the root `/` page or building a public landing page (the auth-page intro is the landing surface for now)
- Marketing copy, SEO content, screenshots, or product imagery on the auth pages
- All v2 items per PRD §Non-Goals: PDF export, price auto-refresh, historical chart, multiple fund support, IKE/IKZE, mobile app, paid tier

## Architecture / Approach

`/dashboard` frontmatter composes three pure helpers from Supabase reads:
- `computeValuation(transactions)` → existing S-04 helper, gives `unitsSum + cutoffDate`.
- `computeScenarios(transactions, currentPrice)` → new, gives `{ currentValuation, ownInvested, scenarios: [immediate, illness, housing, retirement] }`.
- `computeAvailability(birthDate, today)` → new, gives per-scenario `{ available, availableFrom, availableUntil }`.

Three Supabase reads (`transactions`, `price_snapshots`, `profiles`) — all RLS-scoped to the current user. No new API route for scenarios (they recompute every render). One new POST route (`/api/profile/save-birth-date`) for the birth-date form. All UI uses native `<details>` (no React island). Tax/age constants live in `src/lib/scenarios/tax-constants.ts` with TODO-citation comments the implementer replaces before merge.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. `profiles` table + RLS + types | Storage contract for birth date | RLS misconfiguration → cross-user leak (mitigated by FORCE RLS + Studio cross-user spot check) |
| 2. Pure scenarios + availability helpers + tax constants + verify script | Tax math + availability logic; full regression net | Tax constants land with placeholder citations — implementer MUST verify against authoritative sources before merge |
| 3. Setup birth-date form + intro + Dashboard nav + save API | User can store/update birth date; nav between Setup and Dashboard | Polish-locale date validation (input format, future-date rejection) |
| 4. Dashboard scenario cards + `<details>` explanations + Allianz disclaimer + CPU check | The user-visible payoff | Worker CPU budget on multi-year transaction histories (mitigated by the synthetic-CSV CPU check; escape hatch = Workers Paid $5/mo per lessons.md) |
| 5. Post-signin redirect + shared `AppIntro` on `/auth/signin` and `/auth/signup` | Tightened landing experience (direct-to-dashboard sign-in + Polish app description on auth pages) | Layout-integrity check on small viewports (the intro panel doesn't push the form below the fold) |

**Prerequisites:** S-01 (done), S-02 (done), S-04 (done), F-01 (done). Local Supabase + hosted Supabase access; Cloudflare Pages deploy access; an authoritative source for each tax/age constant (implementer verifies in Phase 2).
**Estimated effort:** ~3-4 sessions across 5 phases; the heavyweight phase is 2 (math + verify-script worked examples) and 4 (UI + CPU check); Phase 5 is small (~30-60 min — one redirect line, one shared Astro component, two file imports).

## Open Risks & Assumptions

- **Tax constants are placeholders until merge.** The implementer is the gate. If any constant can't be cited to ISAP / mojeppk.pl with a retrieved-on date, the phase doesn't merge.
- **The under-45 boundary on housing loan and the inclusive/exclusive semantics on availability dates** need source confirmation in Phase 2.
- **The "60+ default rule = 25% lump + 75%/120 instalments, all tax-free"** matches my training-data understanding; if the rule has changed in 2025/2026, the verify script's expected values shift accordingly.
- **CPU budget on 5+-year histories** is the operational risk per lessons.md. The Phase 4 manual check is the gate; the $5/mo Workers Paid upgrade is the documented escape hatch.
- **Polish-locale year-grammar imprecision** in availability labels ("za 1 lat" vs "za 2 lata" vs "za 5 lat") — accepted as MVP; a future slice could add proper Polish plural handling if it grates.
- **Bulk Polish translation of existing English setup-page strings** ("Setup", "Your contributions so far", etc.) is in-scope-ish; if it's deferred, each string gets a `// TODO: PL-translate (S-03 follow-up)` marker and the NEW strings (birth-date form, intro, banners, cards) MUST land Polish.

## Success Criteria (Summary)

- A signed-in user with full data sees four scenario cards rendering correct after-tax amounts (Belka + ZUS + 25% + 100% + retirement rules), correct availability labels (derived from birth date), and per-scenario explanations — all without leaving `/dashboard`.
- A user without a birth date still sees amounts; availability labels degrade gracefully to a "Podaj datę urodzenia..." hint linking to the form on `/setup`.
- All four `verify-*` scripts + lint + build are green; the synthetic 5-year CSV renders the dashboard under ~50ms wall on `wrangler dev --remote` (or the upgrade-to-Workers-Paid decision is documented).
