# Withdrawal scenarios dashboard: 4 scenarios + birth-date availability + explanations + Setup nav

## Overview

Roadmap slice **S-03** — the product's north-star slice. Extend `/dashboard` so a signed-in user sees, simultaneously, four after-tax scenario cards (immediate closure, 25% illness withdrawal, 100% housing loan, 60+ retirement) under the existing valuation block. Each card shows the scenario name, the computed PLN amount, a per-scenario availability label derived from the user's birth date (e.g. "Dostępne od 12.04.2058" or "Dostępne do 12.04.2043"), gain/loss vs. own contributions where meaningful, a one-line tax/rule breakdown, and a `<details><summary>Jak to działa?</summary>` explanation. Add a `profiles` table (one row per user, RLS) for per-user `birth_date` persistence captured via a new form on `/setup`. Add `Setup → Dashboard` navigation (header link + post-import CTA). Add a Setup-page "Po co setup?" intro paragraph. Add a footer disclaimer `Aplikacja obsługuje wyłącznie plan Allianz PPK 2055.` Add a manual CPU-budget verification step against a synthetic 5-year CSV under `wrangler dev --remote` (lessons.md rule). **Land the user directly on `/dashboard` after successful sign-in** (instead of the current `/` redirect) and **add a Polish app-description panel to both `/auth/signin` and `/auth/signup`** so first-time visitors understand what the app does before authenticating.

## Current State Analysis

- **`/dashboard` after S-02 + S-04** (`src/pages/dashboard.astro:1-200`) reads `transactions.select("transaction_date, source, units")` at line 24 (does NOT currently fetch `gross_amount` — S-03 needs it). Renders the valuation block at lines 148-172. Has a `RenderState` literal at lines 54-66 covering `fresh | stale | no_price | no_transactions | idle`. Two action buttons + sign-out at lines 174-197.
- **`/setup`** (`src/pages/setup.astro:1-110`) — glass-panel layout, error/success/dbError banners at lines 63-85, "Your contributions" table at lines 87-102, `UploadForm` island at lines 104-107. No birth-date input, no Dashboard navigation today.
- **Pure helper precedent** (`src/lib/valuation/compute.ts:1-32`) exports `ValuationInput`, `ValuationResult`, `computeValuation`. Takes `rows: { units, source, transaction_date }[]`, returns `{ unitsSum, cutoffDate }`. S-03's helper reuses this internally for the units sum (per-source attribution math sits on top).
- **Verify-script precedent** (`scripts/verify-valuation.ts:1-55`) uses `tsx` + `node:assert/strict` + an `assertions` counter + a `check()` wrapper. Registered as `"verify-valuation": "tsx scripts/verify-valuation.ts"` in `package.json:16`.
- **`transactions` row** (`src/lib/database.types.ts:53-82`) carries `gross_amount: number`, `source: contribution_source ('own'|'employer'|'state'|'carryover')`, `transaction_date: string`, `units: number`. All four are RLS-protected per F-01.
- **`profiles` table does NOT exist.** No prior migration creates it. F-01 established the RLS-with-FORCE pattern on `transactions` (`supabase/migrations/20260625101139_create_transactions.sql`) and `price_snapshots` (`supabase/migrations/20260625101140_create_price_snapshots.sql`); the new migration mirrors that pattern exactly.
- **No tax / scenario / withdrawal code exists** under `src/`. Grep for `scenario|withdrawal|tax|belka` returns nothing. Clean slate.
- **Polish UI strings convention** — `AGENTS.md` requires Polish UI; existing files (`dashboard.astro`, `setup.astro`) follow this consistently. New strings must be Polish.
- **Money-columns runtime defense** — `README.md:193-195`: Supabase NUMERIC arrives as `string` at runtime; always `parseFloat(String(x))` defensively. S-04 helper at `src/lib/valuation/compute.ts` follows this.
- **Cloudflare Workers CPU budget** — `context/foundation/lessons.md:3-11`: free plan kills requests over 10ms CPU; the lesson explicitly flags S-03's calculation loop as the risk that requires synthetic-large-file verification before launch.
- **Workers env** — `wrangler.jsonc` with `nodejs_compat`; existing Supabase client is the server-side `createClient(headers, cookies)` from `@/lib/supabase` (AGENTS.md hard rule).
- **Decision history** — the sibling plans (S-02 at `context/changes/fetch-fund-price/plan.md`, S-04 at `context/changes/fund-conversion-cutoff/plan.md`) confirm: no test framework; tsx verify scripts; Polish strings hardcoded; no service-role client; query-param-driven UI state; native `<details>` for collapsible UI (no React island).

## Desired End State

- A signed-in user with imported transactions, a fresh fetched price, and a stored birth date sees on `/dashboard`, below the existing valuation block: **four scenario cards**, stacked vertically, each showing:
  - **Scenario name** in Polish (e.g. "Zamknięcie konta (zwrot)", "Wypłata 25% (poważne zachorowanie)", "Pożyczka 100% (cele mieszkaniowe)", "Wypłata 60+").
  - **Net PLN amount** in the same bold tabular-num style as the valuation total.
  - **Availability label** derived from the user's birth date (e.g. "Dostępne od 12.04.2058 (za 32 lata)" for retirement, "Dostępne do 12.04.2043 (za 17 lat)" for the under-45-only housing loan, "Dostępne od razu" for immediate closure / illness).
  - **Gain/loss vs own contributions** as a small line — shown for **immediate closure** and **60+ retirement** only (where the comparison is meaningful); omitted for **illness** (partial withdrawal, comparison misleading) and **housing loan** (it's a loan, not a withdrawal — comparison meaningless).
  - **One-line breakdown** of how the amount was computed (e.g. "100% wpłat własnych + 70% wpłat pracodawcy − Belka 19% od zysku").
  - **`<details><summary>Jak to działa?</summary>` block** with a 3-5 sentence Polish explanation of the rule, cited statute reference, and the simplifications used.
- A user **without a stored birth date** sees the same four cards with amounts visible (amounts don't depend on birth date), but each availability label is replaced by a soft yellow hint: `Podaj datę urodzenia, aby zobaczyć daty dostępności` linking to `/setup#birth-date`.
- `/setup` has:
  - A **"Po co setup?"** intro paragraph above the form explaining (in Polish) why import + birth-date are needed.
  - A **birth-date form** (`<form method="POST" action="/api/profile/save-birth-date">`) with a single `<input type="date">`, current value pre-filled if previously saved, save-button.
  - A small **"→ Dashboard"** persistent link in the top-right of the panel header.
  - A prominent **"Przejdź do Dashboard"** CTA inside the green post-import success banner.
- A **footer line** on `/dashboard`: `Aplikacja obsługuje wyłącznie plan Allianz PPK 2055.` in low-contrast small text.
- A **manual CPU verification step** is documented in the plan and README: generate a synthetic 5-year CSV, import it, time the `/dashboard` render under `wrangler dev --remote`; if any phase of the helper chain exceeds ~8ms CPU, upgrade to Workers Paid before public launch (per lessons.md).
- `npm run verify-scenarios` (new), `npm run verify-valuation`, `npm run verify-parser`, `npm run verify-price-parser`, `npm run lint`, `npm run build` all pass.
- Two users never see each other's scenarios, profile rows, or amounts (RLS — same F-01 guarantee, exercised end-to-end through the new `profiles` table + the dashboard query).

### Key Discoveries

- The dashboard's existing `transactions.select(...)` at `src/pages/dashboard.astro:24` does NOT include `gross_amount` — the S-03 helper needs it for per-source attribution AND for the `ownInvested` baseline. Single-line edit, plus the helper's input type extends `ValuationInput` with `gross_amount`.
- `gain/loss vs own capital` from FR-008 makes sense for **final-withdrawal** scenarios (immediate closure, 60+) and is misleading for **partial / loan** scenarios (illness, housing). The plan shows the line only for the two final scenarios; the omission is documented as a deliberate design decision in code comments + per-card `<details>` text.
- The 4 scenarios have asymmetric availability:
  - **Immediate closure** — always available (no age gate).
  - **25% illness** — always available (no statutory age gate; the right to withdraw 25% in case of "poważne zachorowanie" doesn't depend on age).
  - **100% housing loan** — available only if `today_age < HOUSING_LOAN_MAX_AGE` (45 per current rules); `availableUntil = birthDate + 45 years`.
  - **60+ retirement** — available if `today_age >= RETIREMENT_AGE` (60); `availableFrom = birthDate + 60 years`.
- Birth date can be stored as a Postgres `date` column (no time, no timezone). Display formatting via `Intl.DateTimeFormat("pl-PL")`. Age computation via `Math.floor((today - birthDate) / yearMs)` is sufficient — the cutoffs are date-granular, not hour-granular.
- **Tax constants ship with `// source: TODO` slots.** Implementer verifies against authoritative sources (ISAP for Ustawa o PPK; mojeppk.pl for plain-language explainer) before merge — full audit trail before the constants land in production code. The TODO comment names the article number my training data suggests (e.g. `// source: TODO (Ustawa o PPK art. 105) — retrieved YYYY-MM-DD`); implementer confirms or corrects.

## What We're NOT Doing

The plan ships a focused scope. The two items most likely to creep in mid-implementation:

- **No scenario history** — `scenarios_snapshots` or similar persistence of each rendered result. Scenarios are recomputed on every dashboard render from the current `transactions` + latest `price_snapshots` + stored `birth_date`. (Future-work pointer in README if it becomes useful.)
- **No per-user tax-rate overrides** — every user sees the same constants. No "my marginal Belka rate is 18% because of X" UI or column. The PRD §Non-Goals flavor; out of MVP scope.
- **No public landing page rewrite at `/`** — Phase 5 changes the post-signin redirect from `/` to `/dashboard` and adds intro copy to the auth pages, but the root `/` page itself is left untouched. A real public landing page is a separate slice.
- **No marketing site, no SEO copy, no screenshots on auth pages** — the auth-page intro is a short Polish paragraph + bullet list, not a marketing pitch. Visual marketing is out of scope.

## Implementation Approach

Five phases mirroring the dependency order (schema first, then pure logic, then user-input UI, then user-output UI, then auth surface polish):

1. **`profiles` table migration + RLS + types regeneration** — schema-only phase, mostly mechanical, gated by `supabase db reset` + a Supabase Studio enum check. Lands the storage contract before any code references it.
2. **Pure `computeScenarios` + `computeAvailability` helpers + tax/age constants + `scripts/verify-scenarios.ts`** — all logic in `src/lib/scenarios/`, pure functions, no I/O. Verify script covers 8-12 worked examples (each scenario × profit/loss/no-own/carryover/under-45/over-60 boundaries). Phase 2 is the technical-correctness gate; if the verify script is green, the math is locked.
3. **Setup-page birth-date form + intro paragraph + Setup→Dashboard nav links + birth-date save API route** — user-input UI plus its persistence backend. After this phase, the user can store / update / view their birth date.
4. **Dashboard scenario cards + per-card `<details>` explanations + Allianz disclaimer + CPU verification step** — the user-visible payoff. Renders the four cards using helpers from Phase 2 + birth-date from Phase 3. The CPU verification step is a manual gate documented in the README, NOT a code change.
5. **Auth surface polish — post-signin redirect to `/dashboard` + shared `AppIntro` panel on `/auth/signin` and `/auth/signup`** — landing-experience tightening. After this phase, a successful sign-in lands directly on `/dashboard`, and first-time visitors see a short Polish app description on both auth pages before they fill in credentials.

The pure-helper extraction in Phase 2 is the central testability win, identical to S-04's pattern. The dashboard becomes a thin composition layer: read rows, read price, read birth date, call helpers, render cards. Phase 5 is intentionally last because it touches the auth-page surface only after the dashboard it lands on is fully built and verified — a user who lands on a half-finished dashboard is worse than one who has to click once more from `/`.

## Critical Implementation Details

- **Tax constants are TODO-cited.** Phase 2 lands `src/lib/scenarios/tax-constants.ts` with each constant carrying a `// source: TODO (<article reference>) — retrieved YYYY-MM-DD` comment. **Before merging Phase 2**, the implementer MUST verify each constant against an authoritative source (ISAP for Ustawa o PPK, mojeppk.pl for plain-language explainer) and replace TODO with the actual URL + retrieval date. The NFR's "no silent estimation" gate sits here — if the implementer can't find an authoritative source for a constant, that constant is wrong and the phase doesn't merge.
- **Gain attribution uses proportional gross weights.** For immediate closure's Belka math: `gain_for_source = total_gain × (gross_source / total_gross_all_sources)`. This is the only method computable from our data (per-source unit attribution breaks with S-04's carryover rows). Documented in code with a comment naming it explicitly so it's not "silent."
- **Gain/loss line is shown only for `immediate` and `retirement` scenarios.** For `illness` (partial withdrawal) and `housing` (loan, not withdrawal), the comparison is misleading — the card shows the amount + availability + explanation but no gain/loss line. The omission is deliberate; a code comment on the helper output documents why.
- **Birth date is optional for amount computation.** `computeScenarios` does NOT take birth date. `computeAvailability` does. The dashboard composes them; missing birth date means missing availability labels only, not missing amounts. This split means the heavyweight math runs even before the user fills the birth-date form.
- **Float precision.** All helper math stays in `number`. Display formatting happens at the UI layer via `Intl.NumberFormat`. The verify script uses `Math.abs(actual - expected) < 0.005` (half-cent tolerance) for currency assertions. A decimal library would be overkill at PLN-scale balances (~10⁴-10⁵ PLN, float precision ~10⁻¹⁰).
- **Zero-own-contributions edge.** When `ownGross === 0`, `gain/loss vs own` is undefined. The helper returns `gainLoss: null, gainLossPercent: null`; the UI renders the literal Polish string `brak własnych wpłat — brak porównania` instead of the gain/loss line.
- **Carryover units bypass `gross_amount` denominators naturally.** Carryover rows have `gross_amount = 0` (per S-04), so they contribute zero to `total_gross_all_sources` denominators. Their unit value flows through `total_valuation` correctly. No special handling; the verify script has a case demonstrating it.
- **Deploy order for Phase 1.** The `profiles` migration MUST land in the hosted Supabase project BEFORE the Worker code that reads it. Same pattern as S-04's enum migration — `supabase db push --include-all` → wait for CI/CD to redeploy → Phase 3 code merges.
- **CPU budget verification is non-negotiable before public launch.** Per `context/foundation/lessons.md` line 9: a 5+-year synthetic CSV through the calculation route under `wrangler dev --remote`; if hot loop exceeds ~8ms, upgrade to Workers Paid ($5/mo). This slice is the one the lesson explicitly names as the risk.

---

## Phase 1: `profiles` table migration + RLS + types regen

### Overview

Add a per-user `profiles` table with a `birth_date date` column under FORCE RLS, mirroring the F-01 pattern. Regenerate `src/lib/database.types.ts` so Phase 3 can reference `profiles.Row` without type drift.

### Changes Required:

#### 1. Migration file

**File**: `supabase/migrations/<timestamp>_create_profiles.sql`

**Intent**: Create a single-row-per-user `profiles` table with `birth_date` (nullable so a user can sign up before setting it), enforce RLS so users only ever read/write their own row, and align defaults / grants with the F-01 precedent on `transactions` and `price_snapshots`.

**Contract**:
- Schema: `id uuid primary key default gen_random_uuid()`, `user_id uuid not null default auth.uid() references auth.users on delete cascade`, `birth_date date null`, `inserted_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`.
- UNIQUE `(user_id)` — one profile row per user.
- `alter table public.profiles enable row level security; alter table public.profiles force row level security;`
- Four per-operation RLS policies: `select`, `insert`, `update`, `delete`, all gated by `auth.uid() = user_id`. Mirror the policy names and shape from `supabase/migrations/20260625101139_create_transactions.sql`.
- Grants: `grant select, insert, update, delete on public.profiles to authenticated;` (mirror existing pattern).
- No CHECK constraint on `birth_date` — a birth_date in the future is implausible but not data-integrity-breaking; the form-side validation catches it.

Timestamp must be newer than the most recent existing migration so it applies in order.

#### 2. Regenerate `database.types.ts`

**File**: `src/lib/database.types.ts`

**Intent**: Surface the new `profiles` table to TypeScript so Phase 3's save-birth-date route and the dashboard read can type-check cleanly.

**Contract**: Prefer `npx supabase gen types typescript --linked > src/lib/database.types.ts` (uses the management API, works even when 5432 is firewalled per `README.md:177-180`). If `--linked` is unavailable, manual addition of a `profiles` block to the `Tables` interface following the existing `transactions` / `price_snapshots` shape: `Row`, `Insert`, `Update`, `Relationships`. The implementer commits the regenerated file as a single diff alongside the migration.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly locally: `npx supabase db reset` returns 0
- Type-check passes: `npm run lint` (lint task includes `tsc --noEmit`) is clean
- Build passes: `npm run build` is green

#### Manual Verification:

- Connect to local Supabase Studio at `http://localhost:54323` and confirm: `public.profiles` table exists with columns `id, user_id, birth_date, inserted_at, updated_at`; "Force RLS" is on; four policies are listed (select/insert/update/delete), each filtered by `auth.uid() = user_id`.
- Manual RLS spot check: in SQL editor, insert a profile row for a test user; query as a different user impersonation — must return zero rows.
- Confirm `database.types.ts` diff shows the `profiles` block added with the expected shape and no incidental changes to `transactions` / `price_snapshots`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to Phase 2.

---

## Phase 2: Pure `computeScenarios` + `computeAvailability` helpers + tax constants + verify script

### Overview

Land four new files under `src/lib/scenarios/`: types, tax constants (with TODO-citation slots), the pure scenarios helper (amounts + gain/loss attribution), and the pure availability helper (date-derived labels per scenario). Mirror the S-04 helper structure exactly. Add `scripts/verify-scenarios.ts` covering 8-12 worked examples, register the npm script, and run all verify scripts green.

### Changes Required:

#### 1. Scenario types

**File**: `src/lib/scenarios/types.ts` (new)

**Intent**: Pin the contract between the math, the availability logic, and the dashboard render in one place — so a future reader sees the full helper surface without jumping files.

**Contract**:
- `export type ScenarioId = "immediate" | "illness" | "housing" | "retirement"`.
- `export interface ScenarioInput { units: string | number; source: string; transaction_date: string; gross_amount: string | number }` — the row shape consumed by `computeScenarios`. Extends `ValuationInput` from `@/lib/valuation/compute` with `gross_amount`.
- `export interface ScenarioAmount { id: ScenarioId; netAmount: number; gainLoss: number | null; gainLossPercent: number | null; breakdown: Record<string, number> }` — `gainLoss/gainLossPercent` are `null` for `illness` and `housing` (deliberately omitted), and `null` for any scenario when `ownInvested === 0` (no comparison possible).
- `export interface ScenarioAvailability { id: ScenarioId; available: boolean; availableFrom: string | null; availableUntil: string | null }` — ISO `YYYY-MM-DD` dates; `available === true` iff today is between (inclusive) `availableFrom` and `availableUntil` (either may be `null` meaning "unbounded that side").
- `export interface ScenariosResult { currentValuation: number; ownInvested: number; cutoffDate: string | null; scenarios: ScenarioAmount[] }` — `cutoffDate` is re-surfaced for the dashboard's existing footnote.

#### 2. Tax + age constants

**File**: `src/lib/scenarios/tax-constants.ts` (new)

**Intent**: Single source of truth for every numeric constant the scenario math uses. Each constant carries a `// source: TODO` slot the implementer MUST replace with an authoritative URL + retrieval date before merging Phase 2.

**Contract**: Exported `const`s with named, documented values:
- `BELKA_TAX_RATE = 0.19` — Polish capital gains tax. `// source: TODO (ISAP — ustawa o podatku dochodowym od osób fizycznych, art. 30a) — retrieved YYYY-MM-DD`.
- `EMPLOYER_RETAINED_FRACTION = 0.70`, `EMPLOYER_TO_ZUS_FRACTION = 0.30` — split of employer contributions at zwrot. `// source: TODO (Ustawa o PPK art. 105) — retrieved YYYY-MM-DD`.
- `STATE_FORFEITED = true` — state subsidies (welcome 250 PLN + annual 240 PLN) are returned to the state on zwrot. `// source: TODO (Ustawa o PPK art. 105) — retrieved YYYY-MM-DD`.
- `ILLNESS_WITHDRAWAL_FRACTION = 0.25` — fraction of accumulated funds available tax-free in case of poważne zachorowanie. `// source: TODO (Ustawa o PPK art. 101) — retrieved YYYY-MM-DD`.
- `HOUSING_LOAN_MAX_FRACTION = 1.0` — fraction of accumulated funds available as housing loan. `// source: TODO (Ustawa o PPK art. 98) — retrieved YYYY-MM-DD`.
- `HOUSING_LOAN_MAX_AGE = 45` — upper age cap (inclusive? exclusive? — IMPLEMENTER MUST VERIFY). `// source: TODO`.
- `HOUSING_LOAN_REPAYMENT_YEARS = 5` — repayment deadline (years from withdrawal). `// source: TODO`.
- `RETIREMENT_AGE = 60` — age at which 60+ withdrawal becomes available. `// source: TODO (Ustawa o PPK art. 99) — retrieved YYYY-MM-DD`.
- `RETIREMENT_LUMP_SUM_FRACTION = 0.25`, `RETIREMENT_INSTALMENT_FRACTION = 0.75`, `RETIREMENT_INSTALMENT_MONTHS = 120` — default 60+ split, all tax-free. `// source: TODO (Ustawa o PPK art. 99) — retrieved YYYY-MM-DD`.

Each constant is `as const`. The file's top docstring (5-10 lines) names the verification protocol: "Before merge, every TODO must be replaced with a real authoritative URL + retrieval date. If a source cannot be found for a constant, the constant is wrong and this phase does not merge."

#### 3. `computeScenarios` helper

**File**: `src/lib/scenarios/compute.ts` (new)

**Intent**: Pure function that takes `transactions` rows + current unit price and returns the four after-tax amounts, gain/loss for the two final scenarios, and a per-scenario breakdown.

**Contract**:
- Import `computeValuation` from `@/lib/valuation/compute` to derive `unitsSum` and `cutoffDate` consistently with the existing valuation block.
- Use `parseFloat(String(r.gross_amount))` and `parseFloat(String(r.units))` defensively per the README money-columns rule.
- Compute aggregates: `ownGross = SUM(gross WHERE source='own')`, `employerGross = SUM(gross WHERE source='employer')`, `stateGross = SUM(gross WHERE source='state')` — `carryover` rows naturally contribute 0 (gross is 0). `totalGross = ownGross + employerGross + stateGross`. `currentValuation = unitsSum × currentPrice` (using S-04's cutoff-aware unitsSum).
- Per-source valuation share via proportional gross weights: `ownValShare = currentValuation × (ownGross / totalGross)`, same for `employer`. (When `totalGross === 0`, all shares default to 0 — guard the divide-by-zero.)
- **Scenario `immediate`**: `ownGainPart = ownValShare - ownGross`; `employerKept = employerValShare × EMPLOYER_RETAINED_FRACTION`; `employerGainKept = (employerValShare - employerGross) × EMPLOYER_RETAINED_FRACTION`; Belka on positive gains only: `belkaOwn = Math.max(0, ownGainPart) × BELKA_TAX_RATE`; `belkaEmployer = Math.max(0, employerGainKept) × BELKA_TAX_RATE`; `netAmount = ownValShare + employerKept - belkaOwn - belkaEmployer`. `gainLoss = netAmount - ownGross` (FR-008 reading); `gainLossPercent = ownGross > 0 ? gainLoss / ownGross : null`. `breakdown` records `{ ownValShare, employerKept, belkaOwn, belkaEmployer, stateForfeit: stateGross }`.
- **Scenario `illness`**: `netAmount = currentValuation × ILLNESS_WITHDRAWAL_FRACTION`. `gainLoss = null` (partial withdrawal — comparison misleading per Critical Implementation Details). `breakdown = { fraction: ILLNESS_WITHDRAWAL_FRACTION, base: currentValuation }`.
- **Scenario `housing`**: `netAmount = currentValuation × HOUSING_LOAN_MAX_FRACTION`. `gainLoss = null` (it's a loan, not a withdrawal). `breakdown = { fraction: HOUSING_LOAN_MAX_FRACTION, base: currentValuation, repaymentYears: HOUSING_LOAN_REPAYMENT_YEARS }`.
- **Scenario `retirement`**: `netAmount = currentValuation` (all of it, tax-free under default rule); `gainLoss = netAmount - ownGross`; `gainLossPercent = ownGross > 0 ? gainLoss / ownGross : null`. `breakdown = { lumpSum: currentValuation × RETIREMENT_LUMP_SUM_FRACTION, instalmentMonthly: (currentValuation × RETIREMENT_INSTALMENT_FRACTION) / RETIREMENT_INSTALMENT_MONTHS, instalmentMonths: RETIREMENT_INSTALMENT_MONTHS }`.
- Return `{ currentValuation, ownInvested: ownGross, cutoffDate, scenarios: [immediate, illness, housing, retirement] }` — array order matches UI card order.
- Pure: no `Date.now()`, no I/O, no globals.

#### 4. `computeAvailability` helper

**File**: `src/lib/scenarios/availability.ts` (new)

**Intent**: Pure function that takes a birth date and "today" and returns per-scenario availability metadata (boolean + bounding dates). Separated from `compute.ts` so the heavyweight scenarios math doesn't take a time parameter — `today` is only relevant for availability.

**Contract**:
- `export function computeAvailability(birthDate: string | null, today: Date): ScenarioAvailability[]`.
- When `birthDate === null`: return four rows with `available: false, availableFrom: null, availableUntil: null` and a documented sentinel — the dashboard renders the "Podaj datę urodzenia..." hint on every card.
- When `birthDate` is set:
  - **`immediate`**: `available: true, availableFrom: null, availableUntil: null` (always available).
  - **`illness`**: `available: true, availableFrom: null, availableUntil: null` (always available).
  - **`housing`**: `availableUntil = birthDate + HOUSING_LOAN_MAX_AGE years` (ISO date, computed by setting year on the birth-date `Date`). `available = today < availableUntil`. `availableFrom: null`.
  - **`retirement`**: `availableFrom = birthDate + RETIREMENT_AGE years`. `available = today >= availableFrom`. `availableUntil: null`.
- Pure — no `Date.now()` calls (today comes in via parameter); no globals; no I/O.

#### 5. Verify script

**File**: `scripts/verify-scenarios.ts` (new)

**Intent**: Mirror `scripts/verify-valuation.ts` exactly. Lock in the scenarios math + availability logic across 8-12 worked examples, with each assertion's expected value computed by hand and recorded in a code comment.

**Contract**: tsx + `node:assert/strict` + `assertions` counter + `check()` wrapper, exact same shape as `scripts/verify-valuation.ts:1-8, 54`. Use a `checkApprox(actual, expected, tolerance, label)` helper for currency comparisons (`Math.abs(a-e) < 0.005`).

Cases (each with a hand-calculated expected value in a `// expected: ... because ...` comment):
1. **Immediate, profit, all sources** — own 1000, employer 500, state 240, valuation 2000. Expected `netAmount`, `gainLoss`, breakdown values calculated by hand.
2. **Immediate, loss** — own 1000, valuation 800 → `gainLoss = -200`, no Belka tax applied (gain < 0).
3. **Immediate, no own contributions** — own 0, employer 1000 → `gainLoss = null`, `netAmount` still computed.
4. **Illness, profit** — valuation 2000 → `netAmount = 500`, `gainLoss = null`.
5. **Housing** — valuation 2000 → `netAmount = 2000`, `gainLoss = null`.
6. **Retirement, profit** — valuation 2000, own 1000 → `netAmount = 2000`, `gainLoss = 1000`, breakdown lumpSum=500, instalmentMonthly=12.50, instalmentMonths=120.
7. **Carryover handled** — input has a `source='carryover'` row with `gross=0`; helper must include its units in `currentValuation` but its gross stays out of denominators.
8. **Availability, no birth date** — all four `available: false`.
9. **Availability, age 30** — housing `available: true`, retirement `available: false`, etc.
10. **Availability, age 50** — housing `available: false`, retirement `available: false`.
11. **Availability, age 65** — housing `available: false`, retirement `available: true`.
12. **Availability boundary, exact 45th birthday** — `today === availableUntil` → IMPLEMENTER decides inclusive/exclusive per the verified source; assertion mirrors the decision and code comment documents it.

The final `console.log` line: `console.log(\`verify-scenarios: \${String(assertions)} assertions passed\`);`.

#### 6. npm script registration

**File**: `package.json`

**Intent**: Register `verify-scenarios` alongside the existing verify scripts.

**Contract**: Add `"verify-scenarios": "tsx scripts/verify-scenarios.ts"` to the `scripts` block, alphabetically ordered next to the other `verify-*` entries.

### Success Criteria:

#### Automated Verification:

- All TODO-citation comments in `src/lib/scenarios/tax-constants.ts` are replaced with real URLs + retrieval dates (grep `grep -n "TODO" src/lib/scenarios/tax-constants.ts` returns empty)
- `npm run verify-scenarios` passes (all 8-12 assertions green)
- `npm run verify-valuation` still passes (regression guard)
- `npm run verify-parser` still passes (regression guard)
- `npm run verify-price-parser` still passes (regression guard)
- `npm run lint` is clean
- `npm run build` is green

#### Manual Verification:

- Each tax/age constant in `tax-constants.ts` has been cross-checked against at least one authoritative source (ISAP for the Ustawa o PPK, or a mojeppk.pl explainer for plain-language confirmation), URL + retrieval date documented in the inline comment. Implementer confirms.
- Verify-script's hand-calculated expectations match a quick external re-calculation (pull out a calculator, walk through Case 1 by hand, confirm the assertion's expected value).
- **CPU budget probe (preliminary)** — `tsx scripts/verify-scenarios.ts` runs in well under 1 second on local hardware; this is the dev-machine baseline. The full Workers CPU check lands in Phase 4.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that every constant is sourced before proceeding to Phase 3.

---

## Phase 3: Setup-page birth-date form + intro paragraph + Setup→Dashboard nav + save-birth-date API

### Overview

Add a birth-date input + save flow to `/setup` (form + API route), an explanatory intro paragraph above the upload form, and two navigation entry points to `/dashboard` (small persistent header link + prominent post-import CTA). After this phase the user can store / update their birth date and navigate between Setup and Dashboard with ease.

### Changes Required:

#### 1. Save-birth-date API route

**File**: `src/pages/api/profile/save-birth-date.ts` (new)

**Intent**: A POST handler that authenticates the user, validates the submitted date, upserts a `profiles` row under RLS, and 303-redirects back to `/setup` with named query params (`?birthSaved=1` or `?birthError=...`). Mirrors `src/pages/api/transactions/import.ts:6-53` structurally.

**Contract**:
- `export const prerender = false`.
- `export const POST: APIRoute = async (context) => { ... }`.
- Auth guard: `if (!context.locals.user) return context.redirect('/auth/signin', 303);`.
- Read `birth_date` from the submitted form data (`await context.request.formData()`).
- Validate: must be a string matching `/^\d{4}-\d{2}-\d{2}$/`, must parse as a valid `Date`, must be in the past, must be after `1900-01-01` (defensive lower bound). On failure → redirect with `?birthError=<encoded reason>`.
- Supabase client: `const supabase = createClient(context.request.headers, context.cookies)`; on null → redirect with `?birthError=Server%20not%20configured`.
- Upsert: `supabase.from('profiles').upsert({ user_id: context.locals.user.id, birth_date: validatedDate, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })`. On error → redirect with `?birthError=` + `error.message`.
- Success: redirect with `?birthSaved=1`.

#### 2. Middleware gate update

**File**: `src/middleware.ts`

**Intent**: Add `/api/profile` to the `PROTECTED_ROUTES` list so the save-birth-date route requires auth at the middleware layer (defence in depth on top of the in-handler check).

**Contract**: Extend the `PROTECTED_ROUTES` array (currently `["/dashboard", "/setup", "/api/prices", "/api/transactions"]` after S-02) to include `"/api/profile"`. Single line, alphabetically inserted.

#### 3. Birth-date read in Setup page frontmatter

**File**: `src/pages/setup.astro` (frontmatter section)

**Intent**: Read the existing `profiles` row (if any) for the signed-in user so the form pre-fills with the current value, and surface the `birthSaved` / `birthError` query params for the new banners.

**Contract**:
- After the existing `transactions` query, add: `let storedBirthDate: string | null = null;` plus a `profiles` select: `const { data: profileRow } = await supabase.from('profiles').select('birth_date').maybeSingle();` (RLS auto-scopes to the current user); set `storedBirthDate = profileRow?.birth_date ?? null`.
- Read `Astro.url.searchParams.get('birthSaved')` and `.get('birthError')` for banner rendering.

#### 4. Setup page template extensions

**File**: `src/pages/setup.astro` (template section)

**Intent**: Add (a) a small "→ Dashboard" persistent link in the panel header, (b) a "Po co setup?" intro paragraph above all banners and the form, (c) a `birthSaved`/`birthError` banner pair mirroring the existing import banners, (d) the birth-date form (with an `id="birth-date"` anchor target so the dashboard's "Podaj datę urodzenia..." link scrolls here), and (e) a "Przejdź do Dashboard" CTA inside the green import-success banner.

**Contract**:
- **Header link**: inside the `<div class="w-full max-w-xl ...">` at line 58, replace the bare `<h1>Setup</h1>` with a flex container: heading on the left, `<a href="/dashboard">→ Dashboard</a>` on the right (small text, low contrast, glass-panel styling). Single block, no new component.
- **"Po co setup?" intro**: a `<section class="mb-6 text-sm text-blue-100/80">` directly under the heading, containing one short Polish paragraph: "Setup pozwala zaimportować historię transakcji z Allianz oraz zapisać Twoją datę urodzenia. Te dane są potrzebne, aby Dashboard pokazał Ci dokładne kwoty wypłat netto po podatku dla wszystkich scenariuszy."
- **`birthSaved` / `birthError` banners**: mirror the existing `errorMsg` / `showSuccess` banner blocks at lines 63-77, with Polish copy: success — "Zapisano datę urodzenia.", error — "Nie zapisano: {birthError}".
- **Import-success CTA**: extend the `showSuccess` banner at lines 71-77 to include a prominent `<a href="/dashboard" class="mt-2 inline-block rounded-lg border border-green-400/40 bg-green-500/20 px-4 py-2 text-sm">Przejdź do Dashboard →</a>` after the existing "Imported N new, M already present." line.
- **Birth-date form**: a new `<section id="birth-date" class="mb-6">` between the contributions table (line 102) and the upload section (line 104). Contains a heading "Data urodzenia", a one-line explanation "Potrzebna do obliczania dat dostępności wypłat (60+, pożyczka mieszkaniowa).", and `<form method="POST" action="/api/profile/save-birth-date" class="flex items-end gap-3"><label class="flex-1"><input type="date" name="birth_date" value={storedBirthDate ?? ''} required min="1900-01-01" max={new Date().toISOString().slice(0,10)} class="..." /></label><button type="submit" class="...">Zapisz</button></form>`. Use the same border/bg styling as the existing input controls; tabular-num where appropriate.

#### 5. Polish copy review

**File**: `src/pages/setup.astro` (any user-visible strings)

**Intent**: Confirm all new strings are Polish (per AGENTS.md). Existing "Setup", "Your contributions so far", "{count} rows", "Upload an updated statement →", "Imported N new, M already present." are English-leaning; per the AGENTS.md rule these should ALSO be Polish-localized as part of this slice's setup-page touch.

**Contract**: Translate the existing user-visible strings:
- `Setup` → `Konfiguracja` (or keep `Setup` — implementer's call; document choice).
- `Your contributions so far` → `Twoje wpłaty`.
- `{count} rows` → `{count} pozycji`.
- `Upload an updated statement →` → `Zaktualizuj plik transakcji →`.
- `Imported N new, M already present.` → `Zaimportowano N nowych, M już istniało.`
- `Could not read existing transactions: {dbError}` → `Nie udało się odczytać transakcji: {dbError}`.

If the implementer prefers to defer the bulk Polish translation to a separate slice, mark each English string with a `// TODO: PL-translate (S-03 follow-up)` comment and proceed — but the NEW strings (birth-date form, "Po co setup?", banners) MUST be Polish at landing.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes
- Signed-out POST to `/api/profile/save-birth-date`: `curl -i -X POST http://localhost:4321/api/profile/save-birth-date -d 'birth_date=1990-01-01'` returns 302/303 to `/auth/signin` (middleware gate working)

#### Manual Verification:

- Sign in, navigate to `/setup` — the panel header now shows the "→ Dashboard" link on the right; clicking it lands on `/dashboard`.
- The "Po co setup?" paragraph is visible above all banners and reads cleanly in Polish.
- The birth-date form is present below the contributions table. The `<input type="date">` is empty for a user who has never saved.
- Enter a valid date (e.g. 1990-01-01) and submit. Page reloads with the green `Zapisano datę urodzenia.` banner; the form's pre-fill now shows that date.
- In Supabase Studio, `select * from profiles` shows exactly one row for the test user with the saved `birth_date` and a `user_id` matching `auth.uid()`.
- Submit a malformed value (use browser devtools to POST `birth_date=invalid`) → page reloads with the red `Nie zapisano: ...` banner; no row created / updated.
- Submit a future date (e.g. 2099-01-01) → red banner; rejected by the validator.
- Import a CSV — the green import-success banner now includes the "Przejdź do Dashboard →" CTA. Clicking it lands on `/dashboard`.
- Two-user RLS spot check: user A saves a birth date; user B signs in fresh, opens `/setup` — the form is empty (user B can't see user A's birth date via the Supabase read).

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Dashboard scenario cards + `<details>` explanations + Allianz disclaimer + CPU check

### Overview

The user-visible payoff. Extend `transactions.select` to include `gross_amount`, read `profiles.birth_date`, call `computeScenarios` + `computeAvailability`, render four scenario cards below the existing valuation block, add per-card `<details>` explanations, add the Allianz footer disclaimer, and document + execute the synthetic-large-CSV CPU verification step.

### Changes Required:

#### 1. Dashboard frontmatter — fetch + helper invocation

**File**: `src/pages/dashboard.astro` (frontmatter section)

**Intent**: Extend the existing `transactions` SELECT to include `gross_amount`, add a `profiles` read for `birth_date`, call both helpers, and pass results through to the template.

**Contract**:
- `src/pages/dashboard.astro:24`: change `select("transaction_date, source, units")` to `select("transaction_date, source, units, gross_amount")`.
- After the existing `price_snapshots` block (around line 44), add: `let birthDate: string | null = null;` plus a `profiles` read: `const profileResult = await supabase.from('profiles').select('birth_date').maybeSingle();` → set `birthDate = profileResult.data?.birth_date ?? null`; push any error into `dbErrors`.
- After the existing `valuation` derivation (around line 50), add: `import { computeScenarios } from "@/lib/scenarios/compute"; import { computeAvailability } from "@/lib/scenarios/availability";` at the top, then in frontmatter: `const scenariosResult = latestPrice !== null && unitsSum > 0 ? computeScenarios(txResult.data ?? [], latestPrice) : null;` and `const availability = computeAvailability(birthDate, new Date());`.
- Pass `scenariosResult`, `availability`, `birthDate` to the template.

#### 2. Dashboard template — scenario cards section

**File**: `src/pages/dashboard.astro` (template section)

**Intent**: Render four stacked glass-panel cards under the existing valuation block (insert after line 172, before the button row at line 174). Each card shows scenario name, amount, availability label, gain/loss line (immediate + retirement only), one-line breakdown, and `<details>` explanation.

**Contract**:
- Wrap in a single `<section class="mb-6 flex flex-col gap-4">` directly after `</section>` at line 172.
- One card per scenario, rendered only when `scenariosResult !== null` (i.e. the valuation block is also rendering). Card shape: `<article class="rounded-xl border border-white/10 bg-white/5 p-5">` with:
  - **Heading** `<h2 class="text-sm font-semibold text-blue-100/80">{label}</h2>` where `label` per scenario id:
    - `immediate` → `Zamknięcie konta (zwrot)`
    - `illness` → `Wypłata 25% (poważne zachorowanie)`
    - `housing` → `Pożyczka 100% (cele mieszkaniowe)`
    - `retirement` → `Wypłata 60+`
  - **Amount** `<p class="mt-2 text-2xl font-bold tabular-nums">{currencyFmt.format(scenario.netAmount)}</p>`.
  - **Availability label** — a small line directly below the amount:
    - `birthDate === null` → `<p class="text-xs text-yellow-200/80">Podaj <a href="/setup#birth-date" class="underline">datę urodzenia</a>, aby zobaczyć daty dostępności.</p>`
    - `available && availableUntil !== null` → `Dostępne do {formatPl(availableUntil)} ({yearsTo(availableUntil)})` (e.g. "Dostępne do 12.04.2043 (za 17 lat)").
    - `available && availableFrom === null && availableUntil === null` → `Dostępne od razu`.
    - `!available && availableFrom !== null` → `Dostępne od {formatPl(availableFrom)} ({yearsTo(availableFrom)})` (e.g. "Dostępne od 12.04.2058 (za 32 lata)").
    - `!available && availableUntil !== null` → `Niedostępne (po {formatPl(availableUntil)})`.
  - **Gain/loss line** (immediate + retirement only, when `gainLoss !== null`):
    - Positive: `<p class="text-xs text-green-200/80 tabular-nums">+ {currencyFmt.format(gainLoss)} ({(gainLossPercent * 100).toFixed(1)}%) zysk vs. własny kapitał</p>`.
    - Negative: `<p class="text-xs text-red-300/80 tabular-nums">− {currencyFmt.format(Math.abs(gainLoss))} ({(gainLossPercent * 100).toFixed(1)}%) strata vs. własny kapitał</p>` (explicit minus sign, "strata" label, red text).
    - `gainLoss === null && (id === 'immediate' || id === 'retirement')` → `<p class="text-xs text-blue-100/60">brak własnych wpłat — brak porównania</p>`.
    - For `illness` / `housing`: no gain/loss line rendered.
  - **One-line breakdown** in low-contrast small text:
    - `immediate` → `100% wpłat własnych + 70% wpłat pracodawcy − Belka 19% od zysku · {currencyFmt.format(breakdown.stateForfeit)} przepada (subsydium państwa)`.
    - `illness` → `25% wartości portfela, bez podatku, nie wymaga zwrotu`.
    - `housing` → `100% wartości portfela, zwrot w ciągu {breakdown.repaymentYears} lat, pierwszy zakup mieszkania`.
    - `retirement` → `Domyślnie: {currencyFmt.format(breakdown.lumpSum)} jednorazowo + {currencyFmt.format(breakdown.instalmentMonthly)} miesięcznie przez {breakdown.instalmentMonths} miesięcy, bez podatku`.
  - **`<details>` explanation** at the bottom: `<details class="mt-3"><summary class="cursor-pointer text-xs text-blue-100/60">Jak to działa?</summary><div class="mt-2 text-xs text-blue-100/70">{explanation per scenario, 3-5 sentences in Polish}</div></details>`. The explanation copy (per scenario):
    - `immediate`: "Zwrot z PPK przed 60. rokiem życia. Otrzymujesz 100% swoich wpłat i 70% wpłat pracodawcy; pozostałe 30% wpłat pracodawcy trafia do ZUS. Wpłaty od państwa (subsydia) przepadają. Od zysku kapitałowego pobierany jest podatek Belki (19%). Podstawa: Ustawa o PPK art. 105."
    - `illness`: "Wypłata 25% środków zgromadzonych w PPK w przypadku poważnego zachorowania uczestnika lub jego najbliższych. Środki są wolne od podatku i nie wymagają zwrotu. Możesz wnioskować w każdym wieku. Podstawa: Ustawa o PPK art. 101."
    - `housing`: "Pożyczka do 100% środków zgromadzonych w PPK na pokrycie wkładu własnego przy zakupie pierwszego mieszkania lub domu. Dostępna tylko dla uczestników poniżej 45. roku życia. Środki należy zwrócić w ciągu 5 lat. Podstawa: Ustawa o PPK art. 98."
    - `retirement`: "Wypłata po osiągnięciu 60. roku życia. Domyślnie: 25% jednorazowo + 75% w 120 miesięcznych ratach, całość bez podatku. Możesz też wybrać wypłatę 100% jednorazowo, ale wtedy 75% środków zostanie objętych podatkiem Belki — ten wariant nie jest tu pokazany. Podstawa: Ustawa o PPK art. 99."
- Two small helpers in the frontmatter (inline, no separate module): `formatPl(iso: string): string` → `new Date(iso).toLocaleDateString("pl-PL")`. `yearsTo(iso: string): string` → computes whole years between `iso` and today, formats as `za N lat` (future) or `N lat temu` (past); uses abbreviated form for grammatical safety (`za 1 lat` vs `za 2 lata` — accept the slight Polish-grammar imprecision rather than burying real localization in this card line).

#### 3. Allianz disclaimer footer

**File**: `src/pages/dashboard.astro` (template, near the bottom)

**Intent**: Add a single line below the button row stating the Allianz-only constraint, in low-contrast small text.

**Contract**: A new `<p class="mt-6 text-xs text-blue-100/40 text-center">Aplikacja obsługuje wyłącznie plan Allianz PPK 2055.</p>` after the closing `</div>` of the button row (around line 197) but inside the outer panel `<div>`.

#### 4. README documentation

**File**: `README.md`

**Intent**: Document the four scenarios, the birth-date input, the Allianz-only constraint, and the CPU verification step.

**Contract**: Add an H2 section near the existing "Pobieranie cen" section. Cover:
- The four scenarios (name, source article, one-line summary, one-line caveat).
- The birth-date form on `/setup` + what it controls (availability labels only — amounts work without it).
- The proportional gain-attribution method as a known approximation (the only method computable from our data).
- The Allianz-only single-fund constraint (PRD §Non-Goals v2 — multi-fund deferred).
- The synthetic-large-CSV CPU verification step:
  ```bash
  # Generate a 5-year synthetic CSV (one row per month × 60 months = 60 rows + several Zamiana rows).
  # Import via /setup. Then time the dashboard render:
  npx wrangler dev --remote
  # In a separate terminal:
  time curl -s -b "<auth-cookie>" http://127.0.0.1:8787/dashboard > /dev/null
  # If wall-time exceeds ~50ms repeatedly, profile under wrangler --inspect; if CPU exceeds 8ms, upgrade to Workers Paid.
  ```
- `npm run verify-scenarios` as the local regression-net for math changes.

### Success Criteria:

#### Automated Verification:

- `npm run verify-scenarios` still passes (regression guard)
- `npm run verify-valuation` still passes (regression guard)
- `npm run lint` is clean
- `npm run build` is green
- Signed-out request to `/dashboard` redirects to `/auth/signin` (middleware unchanged but regression check)

#### Manual Verification:

- Sign in as a user with imported transactions, a fresh fetched price, and a saved birth date. Navigate to `/dashboard`:
  - The existing valuation block renders unchanged.
  - Four cards render below it in the documented order (immediate / illness / housing / retirement).
  - Each card shows: scenario name, amount, availability label with concrete dates derived from the birth date, gain/loss line (immediate + retirement only) with correct sign + colour, one-line breakdown, `<details>` explanation collapsed by default.
- Sign in as a user with imported transactions but NO saved birth date — all four cards show amounts; each availability label is the yellow "Podaj datę urodzenia..." hint with a link to `/setup#birth-date` that scrolls to the birth-date form.
- Sign in as a user under 45 — housing card shows `Dostępne do {birthDate+45y} (za N lat)` and `available: true`.
- Sign in as a user over 60 — retirement card shows `Dostępne od razu` (date in the past, omitted) OR `Dostępne od {birthDate+60y} (N lat temu)` depending on implementer's choice; housing card shows `Niedostępne (po {birthDate+45y})`.
- Click each `<details>` summary in turn — explanation expands; copy reads cleanly in Polish; explanation links / references statute article.
- Force a loss state by setting a low `latestPrice` (in Studio: insert a tiny price snapshot or temporarily edit the helper to return a low valuation) — gain/loss lines on `immediate` + `retirement` show red `− {amount} ({pct}%) strata vs. własny kapitał`. (Revert before next checks.)
- The footer line `Aplikacja obsługuje wyłącznie plan Allianz PPK 2055.` is visible at the bottom of the dashboard panel.
- Two-user end-to-end: user A's scenarios are computed from user A's transactions + price + birth date; user B (fresh) sees the no-transactions hint, NEVER user A's amounts or dates.
- **CPU budget verification** (the lessons.md gate):
  - Generate a synthetic 5-year CSV: 60 monthly contribution rows × 3 sources = 180 rows, plus 2-3 Zamiana rows. Import via `/setup`.
  - Run `npx wrangler dev --remote` and time the dashboard render with `time curl -s -b "<auth-cookie>" http://127.0.0.1:8787/dashboard > /dev/null` 5-10 times consecutively.
  - Record the median wall-time. If under ~50ms wall (which implies CPU well under 10ms), the slice is launch-safe on the free plan.
  - If over 50ms wall: run under `npx wrangler dev --inspect`, attach Chrome DevTools, profile the dashboard render, and either (a) optimize the helper (e.g. memoize aggregate sums) or (b) upgrade to Workers Paid ($5/mo) before public launch per lessons.md.
- README's new "Scenariusze wypłat" section reads cleanly end-to-end and the CPU-check snippet is copy-pasteable.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that the CPU budget check passed (under ~50ms median wall on the 5-year synthetic) — or, if it failed, that the upgrade-to-Workers-Paid decision has been made and documented — before proceeding to Phase 5.

---

## Phase 5: Post-signin redirect to `/dashboard` + shared `AppIntro` panel on `/auth/signin` and `/auth/signup`

### Overview

Two small landing-experience changes. First: a one-line redirect target swap so a successful sign-in lands on `/dashboard` instead of `/`. Second: a shared Polish app-description panel above the sign-in / sign-up forms so a first-time visitor understands what the app does before authenticating. Both auth pages get the same panel via a single shared Astro component (DRY); the copy explains in 3-4 lines that the app calculates the real after-tax value of a PPK account under several withdrawal scenarios.

### Changes Required:

#### 1. Redirect successful sign-in to `/dashboard`

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Land the user on the page that matters (`/dashboard`) instead of the current homepage redirect — removes a useless extra click for every sign-in.

**Contract**: Change the success-path redirect at line 19 from `return context.redirect("/");` to `return context.redirect("/dashboard");`. Error-path redirects (lines 11, 16) stay on `/auth/signin?error=...` — unchanged. Single-line edit.

#### 2. Shared `AppIntro` Astro component

**File**: `src/components/auth/AppIntro.astro` (new)

**Intent**: A single source of truth for the "what is this app" copy that renders identically on both auth pages. Astro component (not React) — no client-side hydration needed; pure markup.

**Contract**: Self-contained `.astro` file, no props, no script section needed. Renders a `<section>` block matching the auth-panel's existing glass-panel aesthetic (low-contrast text on the existing card background — DO NOT add a nested card; the section sits inside the existing card panel). Content structure:
- A one-line lead in slightly emphasised text: `Oblicz realną wartość swojego PPK po opodatkowaniu.`
- A 1-2 sentence Polish paragraph (low-contrast small text): `Aplikacja pobiera Twoją historię wpłat z Allianz oraz aktualną cenę jednostki funduszu i pokazuje, ile naprawdę dostaniesz w czterech scenariuszach wypłaty — z uwzględnieniem podatku Belki, składek ZUS oraz reguł PPK.`
- A compact bullet list (4 items, one per scenario, low-contrast small text):
  - `Zamknięcie konta (zwrot przed 60. rokiem życia)`
  - `Wypłata 25% w przypadku poważnego zachorowania`
  - `Pożyczka 100% na cele mieszkaniowe (do 45. roku życia)`
  - `Wypłata po osiągnięciu 60. roku życia`
- A small footer line: `Wspiera wyłącznie plan Allianz PPK 2055.` (matches the dashboard-footer disclaimer copy so the user sees the same constraint pre- and post-login.)
- Tailwind classes mirror the existing auth-page typography: heading-line `mb-3 text-sm font-semibold text-blue-100/90`, paragraph `mb-3 text-xs text-blue-100/70 leading-relaxed`, bullet list `mb-3 list-disc list-inside text-xs text-blue-100/70 space-y-1`, footer `text-xs text-blue-100/50`. Wrap the whole block in `<section class="mb-6 border-b border-white/10 pb-5">` so it visually separates from the form below.

#### 3. Wire `AppIntro` into `/auth/signin`

**File**: `src/pages/auth/signin.astro`

**Intent**: Render the shared app-description above the existing sign-in form.

**Contract**:
- Add the import alongside the existing `SignInForm` import: `import AppIntro from "@/components/auth/AppIntro.astro";`.
- Insert `<AppIntro />` directly after the existing `<h1>Sign in</h1>` block (around line 15) and before `<SignInForm ... />` (around line 16).
- No other changes; the existing "Don't have an account? Sign up" footer link stays as-is.
- Consider Polish-translating the heading `Sign in` → `Zaloguj się` per the AGENTS.md Polish-strings convention; defer to a follow-up if the implementer wants to keep this slice focused on the new copy only — mark with `// TODO: PL-translate (S-03 follow-up)` if deferred.

#### 4. Wire `AppIntro` into `/auth/signup`

**File**: `src/pages/auth/signup.astro`

**Intent**: Same treatment as the sign-in page — a first-time visitor likely lands on signup before signin, so the description must appear here too.

**Contract**:
- Add the import alongside the existing `SignUpForm` import: `import AppIntro from "@/components/auth/AppIntro.astro";`.
- Insert `<AppIntro />` directly after the existing `<h1>Sign up</h1>` block (around line 15) and before `<SignUpForm ... />` (around line 16).
- No other changes; the existing "Already have an account? Sign in" footer link stays as-is.
- Same optional Polish-translate of `Sign up` → `Zarejestruj się` as in §3, with the same `// TODO` deferral option.

### Success Criteria:

#### Automated Verification:

- `npm run lint` is clean
- `npm run build` is green
- `grep -n "redirect(\"/\")" src/pages/api/auth/signin.ts` returns NO matches (the redirect change actually landed)
- `grep -n "AppIntro" src/pages/auth/signin.astro src/pages/auth/signup.astro` returns matches in BOTH files (component wired into both)

#### Manual Verification:

- **Successful sign-in lands on `/dashboard`**: sign out, navigate to `/auth/signin`, enter valid credentials, submit — browser lands directly on `/dashboard` (NOT on `/`). URL bar shows `/dashboard`.
- **Failed sign-in stays on `/auth/signin`**: enter an invalid password, submit — page reloads on `/auth/signin?error=...` (error-path behavior unchanged).
- **Sign-up still flows through `/auth/confirm-email`**: existing signup flow unchanged — the redirect change is on `signin.ts` only.
- **`/auth/signin` shows the `AppIntro` panel**: visit signed-out, see the lead line + paragraph + 4-item bullet list + Allianz footer ABOVE the email/password form; the form still works.
- **`/auth/signup` shows the `AppIntro` panel**: same as above on the signup page.
- **Both pages render identical intro copy**: open both pages side-by-side, the intro section is byte-identical (the shared component is doing its job).
- **Polish copy reads cleanly**: lead, paragraph, bullet items, and footer disclaimer all read as natural Polish; no grammar issues; consistent with the dashboard-footer disclaimer wording.
- **Layout integrity**: the auth card's width and padding stay reasonable; the intro doesn't push the form below the fold on a typical 1280×720 viewport.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that a sign-in round-trip lands on `/dashboard` AND the intro copy renders on both auth pages before considering the slice done.

---

## Testing Strategy

### Unit-level (verify scripts)

- `scripts/verify-scenarios.ts`: 8-12 worked examples covering scenarios × profit/loss/no-own/carryover/availability boundaries, per Phase 2.
- `scripts/verify-valuation.ts` (existing): regression guard from S-04.
- `scripts/verify-parser.ts` (existing): regression guard from S-01.
- `scripts/verify-price-parser.ts` (existing): regression guard from S-02.

### Integration (manual via Supabase Studio + curl)

- `profiles` RLS end-to-end: user A saves a birth date; user B's `/setup` shows an empty form (the read is auto-scoped by RLS).
- `/api/profile/save-birth-date`: signed-out POST → 303 to `/auth/signin`; signed-in valid POST → 303 with `?birthSaved=1` + row appears; signed-in invalid POST → 303 with `?birthError=...` + no row written.

### End-to-end (manual via browser)

- All 5 dashboard states cross-multiplied with birth-date present/absent.
- Each scenario card's availability label matches a hand-calculated expectation based on the saved birth date.
- The Setup→Dashboard nav links both work (header link + import-success CTA).
- `<details>` explanations expand and read cleanly.
- The Allianz disclaimer is visible at the dashboard bottom.
- Sign-in round-trip lands on `/dashboard` directly (no `/` interstitial).
- Both `/auth/signin` and `/auth/signup` render the shared `AppIntro` panel above the form.

### Pre-launch (manual, gated)

- The synthetic 5-year CSV CPU check per Phase 4 Manual Verification.

## Performance Considerations

- **Helper hot path**: a single O(n) loop over `transactions` rows (n = O(100-1000) for a long-tenured user) computes per-source aggregates; a constant amount of arithmetic per scenario follows. On dev hardware this runs in well under 1ms.
- **Worker CPU budget**: the lessons.md rule explicitly names this slice as the risk for the 10ms free-plan budget. The Phase 4 CPU verification step is the gate; if it trips, $5/mo Workers Paid lifts the limit to 50ms CPU.
- **New Supabase query**: one `profiles` SELECT (single-row, indexed by `user_id` UNIQUE) per dashboard render. Negligible.
- **Three Supabase queries per dashboard render**: `transactions`, `price_snapshots`, `profiles`. All indexed, all user-scoped via RLS, all small. The two existing queries (S-02 + S-04) already establish this pattern; the third doesn't change the budget envelope.

## Migration Notes

- The `profiles` migration is forward-only. To revert, drop the new code AND `drop table public.profiles cascade;` in Postgres — acceptable because no data depends on it outside of this slice.
- Phase 1 deploy order is load-bearing: migration → code, never the reverse. Same pattern as S-04. `supabase db push --include-all` → wait for CI/CD to redeploy → Phase 3 code merges.
- For pre-existing users (zero in production at MVP time), the migration does NOT backfill `profiles` rows. Users get a `profiles` row written the first time they submit the birth-date form. Until then, `profileResult.data` is `null` and the dashboard renders the "Podaj datę urodzenia..." hints — graceful degrade.

## References

- Roadmap: `context/foundation/roadmap.md` — S-03 entry (`At a glance` table + Slices section).
- PRD: `context/foundation/prd.md` — US-01, FR-008, FR-009, FR-010, FR-011, NFR (tax correctness, RLS isolation).
- Lessons: `context/foundation/lessons.md:3-11` — Cloudflare CPU-time check before public launch.
- Sibling change (S-02): `context/changes/fetch-fund-price/plan.md` — dashboard pattern, API-route convention, error UX with `<details>`.
- Sibling change (S-04): `context/changes/fund-conversion-cutoff/plan.md` — helper extraction precedent, schema-first sequencing, regenerated types.
- Archived F-01: `context/archive/2026-06-25-supabase-schema-rls/` — RLS policy shape, FORCE RLS pattern.
- Archived S-01: `context/archive/2026-06-25-import-allianz-transactions/` — categoriser, source enum.
- Existing helper precedent: `src/lib/valuation/compute.ts:1-32`.
- Existing verify-script precedent: `scripts/verify-valuation.ts:1-55`, `scripts/verify-parser.ts:1-50`.
- Existing dashboard render path: `src/pages/dashboard.astro:1-200`.
- Existing setup render path: `src/pages/setup.astro:1-110`.
- Money-columns runtime defense: `README.md:193-195`.
- Polish UI string convention: `AGENTS.md`.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: `profiles` table migration + RLS + types regen

#### Automated

- [ ] 1.1 Migration applies cleanly locally: `npx supabase db reset` returns 0
- [x] 1.2 Type-check passes: `npm run lint` is clean
- [x] 1.3 Build passes: `npm run build` is green

#### Manual

- [ ] 1.4 Local Supabase Studio shows `public.profiles` with columns + FORCE RLS + four policies
- [ ] 1.5 Manual cross-user RLS spot check returns zero rows for the impersonated other user
- [ ] 1.6 `database.types.ts` diff shows `profiles` block added, no incidental changes to `transactions` / `price_snapshots`

### Phase 2: Pure `computeScenarios` + `computeAvailability` + tax constants + verify script

#### Automated

- [ ] 2.1 All TODO citations in `tax-constants.ts` replaced with real URLs + retrieval dates (grep returns empty)
- [ ] 2.2 `npm run verify-scenarios` passes (all 8-12 assertions green)
- [ ] 2.3 `npm run verify-valuation` still passes (regression guard)
- [ ] 2.4 `npm run verify-parser` still passes (regression guard)
- [ ] 2.5 `npm run verify-price-parser` still passes (regression guard)
- [ ] 2.6 `npm run lint` is clean
- [ ] 2.7 `npm run build` is green

#### Manual

- [ ] 2.8 Each constant in `tax-constants.ts` cross-checked against ISAP / mojeppk.pl; URL + retrieval date documented inline
- [ ] 2.9 Verify-script's hand-calculated expectation for Case 1 matches a fresh external re-calculation

### Phase 3: Setup-page birth-date form + intro + Setup→Dashboard nav + save-birth-date API

#### Automated

- [ ] 3.1 `npm run lint` is clean
- [ ] 3.2 `npm run build` is green
- [ ] 3.3 Signed-out POST to `/api/profile/save-birth-date` returns 302/303 to `/auth/signin`

#### Manual

- [ ] 3.4 `/setup` panel header shows `→ Dashboard` link; clicking it lands on `/dashboard`
- [ ] 3.5 "Po co setup?" intro paragraph is visible and reads cleanly in Polish
- [ ] 3.6 Birth-date form present below contributions table; empty for a fresh user
- [ ] 3.7 Submitting a valid date → green "Zapisano datę urodzenia." banner; form pre-fills on reload
- [ ] 3.8 Supabase Studio shows the saved row in `profiles` with correct `user_id`
- [ ] 3.9 Malformed value (e.g. `invalid`) → red `Nie zapisano: ...` banner; no row written
- [ ] 3.10 Future date (e.g. 2099-01-01) → red banner; rejected
- [ ] 3.11 Post-import success banner now includes "Przejdź do Dashboard →" CTA; link works
- [ ] 3.12 Two-user RLS spot check: user B's `/setup` form is empty (user A's birth date not visible)

### Phase 4: Dashboard scenario cards + `<details>` explanations + Allianz disclaimer + CPU check

#### Automated

- [ ] 4.1 `npm run verify-scenarios` still passes (regression guard)
- [ ] 4.2 `npm run verify-valuation` still passes (regression guard)
- [ ] 4.3 `npm run lint` is clean
- [ ] 4.4 `npm run build` is green
- [ ] 4.5 Signed-out request to `/dashboard` redirects to `/auth/signin`

#### Manual

- [ ] 4.6 User with transactions + price + birth date: four scenario cards render below valuation in documented order, each with name + amount + availability + gain/loss (where applicable) + breakdown + `<details>`
- [ ] 4.7 User without birth date: cards show amounts; availability labels are the yellow "Podaj datę urodzenia..." hints linking to `/setup#birth-date` (and the link scrolls to the form)
- [ ] 4.8 User under 45: housing card shows `Dostępne do {date} (za N lat)`, `available: true`
- [ ] 4.9 User over 60: retirement card shows `Dostępne od razu` (or equivalent), housing shows `Niedostępne (po {date})`
- [ ] 4.10 Each `<details>` "Jak to działa?" expands and reads cleanly in Polish
- [ ] 4.11 Forced loss state: gain/loss lines on `immediate` + `retirement` render red `− {amount} ({pct}%) strata vs. własny kapitał`
- [ ] 4.12 Footer `Aplikacja obsługuje wyłącznie plan Allianz PPK 2055.` is visible at dashboard bottom
- [ ] 4.13 Two-user end-to-end: user B sees no-transactions hint, never user A's scenario data
- [ ] 4.14 CPU budget check: 5-year synthetic CSV imported; `time curl` of `/dashboard` median under ~50ms wall over 5-10 runs — OR the upgrade-to-Workers-Paid decision is documented
- [ ] 4.15 README "Scenariusze wypłat" section reads cleanly end-to-end with the CPU-check snippet copy-pasteable

### Phase 5: Post-signin redirect to `/dashboard` + shared `AppIntro` on `/auth/signin` and `/auth/signup`

#### Automated

- [ ] 5.1 `npm run lint` is clean
- [ ] 5.2 `npm run build` is green
- [ ] 5.3 `grep -n "redirect(\"/\")" src/pages/api/auth/signin.ts` returns no matches (signin redirect change landed)
- [ ] 5.4 `grep -n "AppIntro" src/pages/auth/signin.astro src/pages/auth/signup.astro` returns matches in both files

#### Manual

- [ ] 5.5 Successful sign-in lands directly on `/dashboard` (URL bar shows `/dashboard`, not `/`)
- [ ] 5.6 Failed sign-in stays on `/auth/signin?error=...` (error path unchanged)
- [ ] 5.7 Sign-up flow still routes through `/auth/confirm-email` (signup unchanged)
- [ ] 5.8 `/auth/signin` renders `AppIntro` panel ABOVE the email/password form; copy reads cleanly in Polish
- [ ] 5.9 `/auth/signup` renders the same `AppIntro` panel ABOVE the email/password form
- [ ] 5.10 The intro copy is byte-identical on both pages (shared component)
- [ ] 5.11 Layout integrity check: on a typical 1280×720 viewport, the auth form is not pushed below the fold
