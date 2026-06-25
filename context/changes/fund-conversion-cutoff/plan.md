# Fund-conversion cutoff: persist Zamiana as carryover row, exclude pre-cutoff units from valuation

## Overview

`/dashboard`'s valuation `SUM(transactions.units) × ALL88 price` is fund-blind and conflates pre-conversion OLD-fund units with post-conversion NEW-fund units. Fix it by (a) stopping the parser from silently dropping `Zamiana` rows — instead, persist each realized Zamiana as a synthetic `transactions` row with `source='carryover'`, `units = Liczba jednostek (fundusz docelowy)`, `gross_amount = 0`; (b) deriving the cutoff date dynamically from `MAX(transaction_date) WHERE source='carryover'`; (c) including only `transaction_date >= cutoff` rows in the dashboard's SUM. Pre-cutoff contribution rows stay in `transactions` untouched (S-03's FR-008/009/011 calculations consume them); the parser becomes lossless rather than lossy.

## Current State Analysis

- **Parser** (`src/lib/allianz/parse.ts:64`) drops every Zamiana row outright via `if (orderType === "Zamiana") continue;`. The target-side unit count (`Liczba jednostek (fundusz docelowy)`) is never read.
- **Schema** (`supabase/migrations/20260625101139_create_transactions.sql:1-14`): `contribution_source` is a Postgres enum with values `('own', 'employer', 'state')`. `gross_amount NUMERIC(20,4) NOT NULL` with **no CHECK constraint** — `0` is a legal value. Natural-key UNIQUE is `(user_id, transaction_date, source, units, gross_amount)`, so a synthetic carryover row dedupes idempotently on re-import.
- **Import route** (`src/pages/api/transactions/import.ts:25-44`) maps categorised rows to upsert payloads using `ignoreDuplicates: true` + the natural-key UNIQUE; extensible by appending more rows.
- **Dashboard** (`src/pages/dashboard.astro:22-26, 44-46`) does `SELECT units FROM transactions` (no `source` or `transaction_date` column selected) and computes `latestPrice × unitsSum` with no date filter, no fund attribution.
- **Categoriser** (`src/lib/allianz/categorise.ts`) is fund-agnostic and only ever sees the non-Zamiana rows the parser yields; carryover rows bypass it entirely.
- **Generated types** (`src/lib/database.types.ts:87,208`): `contribution_source` is `"own" | "employer" | "state"` in two places (TS type + runtime constants). Both need the `"carryover"` extension.
- **Verify-script convention** is `tsx` + `node:assert/strict` + manual assertion counter, no test framework — established by `scripts/verify-parser.ts` and `scripts/verify-price-parser.ts` and registered as `npm run verify-*`.

The frame brief at `context/changes/fund-conversion-cutoff/frame.md` settled the cause (naive cross-fund sum, confidence HIGH) and the scope reframe (fix at the read path, do NOT drop rows from storage). The narrowing answers settled the architecture: detect the cutoff at parse time from the Zamiana row itself, persist as a synthetic `source='carryover'` row in `transactions`, expose to the user via a subtle Polish footnote, regression-guard via a tsx verify-script on a pure helper.

## Desired End State

- A signed-in user whose Allianz CSV contains one or more `Zamiana` rows sees a `/dashboard` valuation computed from **only** post-most-recent-Zamiana units (`SUM(units WHERE transaction_date >= cutoff) × current price`), where `cutoff = MAX(transaction_date WHERE source='carryover')`. The 30 NEW carryover units issued by the Zamiana are included in that SUM naturally because the carryover row is itself dated on (or after) the cutoff.
- A signed-in user with **no** Zamiana in their history (no carryover row) sees `/dashboard` valuation = `SUM(all units) × price` — unchanged behavior, no regression.
- The dashboard displays a subtle Polish footnote under the "Pobrano" line when a cutoff applies: `Wycena uwzględnia jednostki od konwersji z dnia DD.MM.YYYY`.
- The `transactions` table is **lossless**: every realized Zrealizowane row from the CSV (contributions + Zamiana carryovers) lands in the table. Re-importing the same CSV is a no-op (natural-key UNIQUE deduplicates).
- `npm run verify-parser`, `npm run verify-valuation` (new), `npm run lint`, `npm run build` all pass.
- The hosted Supabase project has the new enum value.

### Key Discoveries

- `gross_amount NUMERIC(20,4) NOT NULL` has no CHECK > 0 — `0` for carryovers is legal (`supabase/migrations/20260625101139_create_transactions.sql:11`).
- Natural-key UNIQUE includes `source` (`...sql:13`), so a carryover row's `(user_id, '2024-11-07', 'carryover', 30.0000, 0)` tuple is uniquely keyed and idempotent on re-import.
- Money columns are string-at-runtime defense pattern: `parseFloat(String(...))` per `README.md:193-195` and S-02 precedent (`src/pages/api/prices/fetch.ts:66`, `src/pages/dashboard.astro:44`).
- Enum extensions in Postgres are forward-only: `ALTER TYPE public.contribution_source ADD VALUE IF NOT EXISTS 'carryover';` — no rollback within the same transaction.
- Astro 6 + Cloudflare Workers: file changes are picked up on dev reload; the dashboard.astro change is hot-reloadable.

## What We're NOT Doing

- **Not** adding `fund_id` to the `transactions` table or otherwise modelling per-row fund identity — that is PRD §Non-Goals v2 multi-fund work explicitly deferred.
- **Not** deleting or migrating any existing rows in `transactions`. The schema migration is enum-only.
- **Not** building a `profiles` or per-user `config` table for the cutoff date or carryover units — both values live in the `transactions` table, derived from the CSV.
- **Not** touching `src/lib/allianz/categorise.ts` — carryover rows bypass the categoriser entirely (the parser yields them in a separate bucket; `import.ts` writes them straight through with `source='carryover'` pre-set).
- **Not** changing `Typ='Kwota'` enforcement for regular rows; carryover-row handling skips that check because Zamiana rows naturally have `Typ='Saldo'`.
- **Not** adding a UI for editing the cutoff, listing carryover rows, or "explain my valuation" — Q4 picked the subtle footnote, not the `<details>` expansion.
- **Not** updating `/setup`'s post-import counts banner to split contributions vs. carryovers — minor UX detail, current "imported N" stays.
- **Not** building a multi-fund fixture / end-to-end verify script (Q3 testing answer was unit-test the helper, scope (c) was explicitly rejected).
- **Not** archiving the `fetch-fund-price` change or running `/10x-archive` on it — out of scope for this plan; the roadmap drift is acknowledged but not fixed here.

## Implementation Approach

Three phases mirroring the data flow: schema first (so types and migrations are stable before code references the new enum value), then parser + import wire-up (so the synthetic carryover row actually starts landing in `transactions`), then the dashboard read path (the user-visible fix). Each phase has its own manual-verification gate, but Phase 1 is mostly automated — schema and types are mechanical. Phase 2 introduces the new data; Phase 3 surfaces it.

The pure-helper extraction (`src/lib/valuation/compute.ts`) is the central testability win: the dashboard becomes a thin wrapper that does the Supabase SELECT, hands rows to the helper, and renders the result. The helper has no I/O and can be exercised entirely from a tsx verify-script.

## Critical Implementation Details

- **Deploy order**: the schema migration MUST land in the hosted Supabase project BEFORE the Cloudflare Worker is updated with the parser code. If the code deploys first and tries to INSERT `source='carryover'`, the INSERT fails with an enum-value error and the user sees a generic 500. Sequence: `supabase db push --include-all` → wait for CI/CD to redeploy the Worker.
- **`database.types.ts` regeneration**: prefer `npx supabase gen types typescript --linked > src/lib/database.types.ts` (uses the management API, works even when 5432 is firewalled per `README.md:177-180`). If `--linked` is unavailable, manual single-line patch in two places (`src/lib/database.types.ts:87` adds `| "carryover"`, `:208` adds `"carryover"` to the array) — both edits commit together with the migration.
- **Multiple Zamianas**: the cutoff is `MAX(transaction_date) WHERE source='carryover'`, so older Zamianas stay in the DB but are below the cutoff and excluded from the SUM. No special handling required; the math is correct because the latest Zamiana's NEW-fund units are themselves dated to that latest event.
- **No-Zamiana fallback**: when the user has no carryover rows, `cutoffDate` is `null` and the helper includes every row in the SUM — preserves existing behavior for any user (including the synthetic `allianz-sample.csv` fixture which DOES have a Zamiana, so this fallback is exercised only when carryover rows are absent in production).
- **Re-import idempotency**: the carryover row's natural-key tuple `(user_id, transaction_date, 'carryover', units, 0)` is unique. Re-uploading the same CSV produces the same tuple → upsert with `ignoreDuplicates: true` is a no-op.

---

## Phase 1: Schema + types

### Overview

Add `'carryover'` to the `contribution_source` Postgres enum and refresh the generated TypeScript types so Phase 2's parser changes compile.

### Changes Required:

#### 1. New migration file

**File**: `supabase/migrations/<timestamp>_add_carryover_source.sql`

**Intent**: extend the existing `public.contribution_source` enum with a `'carryover'` value so Zamiana fund-conversion events can be persisted as synthetic `transactions` rows in Phase 2.

**Contract**: a single forward-only DDL statement, no data changes.

```sql
alter type public.contribution_source add value if not exists 'carryover';
```

Use a timestamp newer than `20260625110531` (the most recent existing migration) so it applies after grants.

#### 2. Regenerate `database.types.ts`

**File**: `src/lib/database.types.ts`

**Intent**: surface the new enum value to the TypeScript compiler so Phase 2 can reference `source: 'carryover'` without an as-cast.

**Contract**: two locations need `'carryover'`:
- The TS union type for `contribution_source` (around line 87): `"own" | "employer" | "state"` → `"own" | "employer" | "state" | "carryover"`.
- The runtime constants array (around line 208): `["own", "employer", "state"]` → `["own", "employer", "state", "carryover"]`.

Prefer `npx supabase gen types typescript --linked > src/lib/database.types.ts` to do this mechanically; manual edit is acceptable if the linked project isn't reachable.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly locally: `npx supabase db reset` returns 0
- Type-check passes: `npm run lint` (lint task includes `tsc --noEmit`) is clean
- Build passes: `npm run build` is green

#### Manual Verification:

- Connect to local Supabase studio at `http://localhost:54323` and confirm `contribution_source` enum lists `own, employer, state, carryover`.
- Confirm `database.types.ts` diff shows exactly the two-line extension and nothing else.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to Phase 2.

---

## Phase 2: Parser captures Zamiana → import writes carryover row

### Overview

Stop dropping Zamiana rows in the parser. Capture each realized Zamiana into a new `carryovers` bucket alongside the regular `rows` bucket. Extend `import.ts` to upsert both buckets into `transactions`. Update `scripts/verify-parser.ts` to assert the new shape against the existing fixture (which contains FIX-004 as a Zamiana row).

### Changes Required:

#### 1. Parser types

**File**: `src/lib/allianz/types.ts`

**Intent**: introduce a `CarryoverRow` shape and extend `ParseResult` to carry both regular and carryover rows.

**Contract**:
- New interface `CarryoverRow` with two fields: `valuation_date: string` (ISO YYYY-MM-DD) and `units: string` (already-normalised number).
- `ParseResult` success variant gains a `carryovers: CarryoverRow[]` field. Failure variant unchanged.

#### 2. Parser

**File**: `src/lib/allianz/parse.ts`

**Intent**: when a `Zamiana` row has `Status='Zrealizowane'`, parse its `Data wyceny` and `Liczba jednostek (fundusz docelowy)` and push into a `carryovers` array; continue skipping non-realized Zamianas; keep all non-Zamiana logic identical.

**Contract**:
- Remove the unconditional `if (orderType === "Zamiana") continue;` at line 64.
- Replace with a branch: if `Zamiana` AND `Status='Zrealizowane'`, validate `Data wyceny` (reuse the existing `ISO_DATE` regex), `normaliseNumber` the `Liczba jednostek (fundusz docelowy)` column (note: this is a different column than the source-fund units the regular path reads), push into `carryovers`, `continue`. If `Zamiana` AND `Status !== 'Zrealizowane'`, `continue` (drop, matches existing non-Zamiana non-realized behavior).
- Do NOT enforce `Typ='Kwota'` for Zamiana rows — they naturally carry `Typ='Saldo'`.
- Return `{ ok: true, rows, carryovers }`.

#### 3. Import route

**File**: `src/pages/api/transactions/import.ts`

**Intent**: persist carryover rows alongside categorised contribution rows in a single upsert.

**Contract**:
- After `categoriseRows(parsed.rows)`, build the payload from BOTH `categorised` (mapped as today) AND `parsed.carryovers` (mapped to `{ transaction_date: c.valuation_date, source: 'carryover', units: Number(c.units), gross_amount: 0 }`).
- Single `.upsert()` call with the combined payload; `onConflict` and `ignoreDuplicates: true` are unchanged.
- `imported = data.length`, `skipped = payload.length - imported` — counts now include carryover rows but the banner copy stays generic ("imported N").

#### 4. Verify-parser assertions

**File**: `scripts/verify-parser.ts`

**Intent**: lock in the new parser contract — fixture's one Zamiana row (FIX-004) produces exactly one carryover row with the expected date + units; the regular rows bucket is unchanged in count.

**Contract**: extend the existing fixture-happy-path block with at least three new assertions:
- `result.carryovers.length === 1`
- `result.carryovers[0].valuation_date === '2024-03-05'`
- `result.carryovers[0].units === '30.0000'`
- `result.rows.length` unchanged from prior expected count (FIX-004 was already excluded under the old parser via the Zamiana drop; it remains excluded from `rows`, just now lands in `carryovers` instead).

Use the existing assertion-counter pattern.

### Success Criteria:

#### Automated Verification:

- `npm run verify-parser` passes with the new assertions (counter shows the expected total)
- `npm run lint` is clean
- `npm run build` is green

#### Manual Verification:

- Re-upload the user's actual production CSV via `/setup`. After the upload completes, query (via Supabase Studio or psql) `SELECT * FROM transactions WHERE source='carryover'` and confirm exactly one row exists with `transaction_date = 2024-11-07`, `units` matching the Zamiana row's `Liczba jednostek (fundusz docelowy)` value, `gross_amount = 0`.
- Re-upload the same CSV a second time. Confirm no duplicate carryover row is created (natural-key UNIQUE dedupes).
- Inspect `transactions` row count vs. CSV row count — should equal `(non-Zamiana Zrealizowane rows) + (Zrealizowane Zamiana rows)`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to Phase 3.

---

## Phase 3: Valuation helper + dashboard read + Polish footnote

### Overview

Extract the valuation math into a pure helper module; rewrite `dashboard.astro`'s data fetch to select `transaction_date`, `source`, `units` (not just `units`) and invoke the helper; add a Polish footnote naming the dynamic cutoff date; add a new `verify-valuation` tsx script with assertions for the cutoff-derivation, sum, and no-Zamiana fallback behavior; document the new behavior in README.

### Changes Required:

#### 1. Valuation helper

**File**: `src/lib/valuation/compute.ts` (new)

**Intent**: a pure function that takes raw `transactions` rows and returns `{ unitsSum, cutoffDate }`, where `cutoffDate` is `MAX(transaction_date WHERE source='carryover')` (or `null` if no carryover rows) and `unitsSum` is the SUM of units across rows with `transaction_date >= cutoffDate` (or all rows when cutoff is `null`).

**Contract**:
- Export a `ValuationInput` type with the three columns the helper needs: `units: string | number`, `source: string`, `transaction_date: string`.
- Export a `ValuationResult` type: `{ unitsSum: number; cutoffDate: string | null }`.
- Export `computeValuation(rows: ValuationInput[]): ValuationResult`. Use `parseFloat(String(r.units))` defensively per the README money-columns rule.
- Pure — no I/O, no `Date.now()` calls, no globals.

#### 2. Verify-valuation script

**File**: `scripts/verify-valuation.ts` (new)

**Intent**: assert the helper's behavior across the three scenarios that matter — no carryover (legacy user), single carryover (the bug being fixed), multiple carryovers (defensive).

**Contract**: tsx + `node:assert/strict` + assertion counter (mirror `scripts/verify-price-parser.ts` exactly). At least these cases:
- No carryover rows: `cutoffDate === null`, `unitsSum === sum of all units`.
- Single carryover row + pre-cutoff rows + post-cutoff rows: `cutoffDate` equals the carryover row's date; `unitsSum` equals `carryover.units + sum(post-cutoff units)`; pre-cutoff units are excluded.
- Pre-cutoff row dated exactly on the cutoff (boundary): included (`>=`, not `>`).
- Two carryover rows: `cutoffDate` is the LATER one; the earlier carryover row is below the cutoff and excluded.
- String `units` (Supabase NUMERIC-at-runtime defense): `parseFloat(String("3.5"))` works the same as `parseFloat("3.5")`.

#### 3. npm script registration

**File**: `package.json`

**Intent**: register `verify-valuation` alongside the existing `verify-parser` / `verify-price-parser` scripts.

**Contract**: add `"verify-valuation": "tsx scripts/verify-valuation.ts"` to the `scripts` block, in alphabetical order.

#### 4. Dashboard read + render

**File**: `src/pages/dashboard.astro`

**Intent**: select the three columns the helper needs (not just `units`); invoke the helper to derive `unitsSum` and `cutoffDate`; pass the result through the existing render logic; add a Polish footnote under the "Pobrano" line when `cutoffDate !== null`.

**Contract**:
- The `txResult = await supabase.from("transactions").select("units")` query (line 22) becomes `.select("transaction_date, source, units")`.
- Replace the inline `reduce` at line 26 with `const { unitsSum, cutoffDate } = computeValuation(txResult.data)`. Import the helper from `@/lib/valuation/compute`.
- Render-state derivation (lines 50-62) is unchanged: `state` keys off `unitsSum`, `latest`, `priceError`, `priced`.
- In the valuation section (lines 142-162), when `cutoffDate !== null`, render a new `<p>` immediately after the existing `Pobrano` line with class `mt-1 text-xs text-blue-100/50` (matches the existing ticker line styling). Copy: `Wycena uwzględnia jednostki od konwersji z dnia <formatted-cutoff>` where `<formatted-cutoff>` uses `new Date(cutoffDate).toLocaleDateString("pl-PL")` to render `DD.MM.YYYY` or similar Polish locale format.

#### 5. README documentation

**File**: `README.md`

**Intent**: extend the "Pobieranie cen (fetching fund prices)" section (lines 205-215) with a paragraph documenting the new cutoff behavior; update the "Single-fund approximation (MVP caveat)" wording to reflect that the cutoff now handles the single-conversion-point case.

**Contract**: append a short paragraph after line 213 (the parser/fixture description) covering: dynamic cutoff via `source='carryover'` rows, `MAX(transaction_date)` derivation, no-Zamiana fallback, Polish footnote. Edit line 215 to soften the "approximation" framing — the formula is now `SUM(units WHERE transaction_date >= MAX(carryover date)) × price`, exact for users with one or more Zamianas as long as no current fund splits.

### Success Criteria:

#### Automated Verification:

- `npm run verify-valuation` passes (all helper-scenario assertions green)
- `npm run verify-parser` still passes (Phase 2 regression guard)
- `npm run lint` is clean
- `npm run build` is green

#### Manual Verification:

- Load `/dashboard` (signed in, real user data, after Phase 2's CSV re-import landed the carryover row). The displayed valuation matches the user's known correct portfolio value — within a few PLN of the user's mental model. Specifically: the number is materially smaller than the pre-fix wrong number.
- The Polish footnote `Wycena uwzględnia jednostki od konwersji z dnia DD.MM.YYYY` appears under the "Pobrano …" line.
- Click "Pobierz cenę" — the page reloads, valuation updates, footnote still present.
- Sign out, sign in as a fresh user with no transactions — `/dashboard` shows the existing "no_transactions" state (no regression).
- Sign in as a user with transactions but no Zamiana (if available) — `/dashboard` shows the valuation with NO footnote (fallback path).
- README's "Pobieranie cen" section reads cleanly end-to-end and the MVP-caveat paragraph reflects the new behavior.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before the epilogue commit.

---

## Testing Strategy

### Unit Tests

- `scripts/verify-valuation.ts`: helper math (cutoff derivation, sum boundary, multi-carryover precedence, no-Zamiana fallback, string-units defense).
- `scripts/verify-parser.ts`: parser shape (Zamiana → one carryover row with correct date + units; regular rows unchanged).

### Integration Tests

None. The dashboard render path is exercised manually per Phase 3's Manual Verification.

### Manual Testing Steps

Sequenced across phases — see each phase's `#### Manual Verification:` block. The phase-end commit ritual gates each manual block with explicit human confirmation.

## Performance Considerations

Selecting three columns instead of one is a negligible bytes-on-wire increase (the user's `transactions` table is currently O(10²) rows max). The helper's filter+reduce is O(n) over the same set. No new query patterns; no new round-trips. Cloudflare Workers CPU-time budget (per `context/foundation/lessons.md` line 3-11) is not at risk for this slice — that lesson applies to S-03's tax-calculation routes, not the dashboard SELECT.

## Migration Notes

The enum extension is forward-only. To revert, drop the new code AND `ALTER TYPE` workarounds in Postgres are awkward — the standard advice is to leave the unused enum value in place. This is acceptable: an unused enum value costs nothing.

The Phase 2 deploy order is load-bearing (migration → code, not the reverse) — see Critical Implementation Details.

For pre-existing rows in `transactions` (Phase 2's first run against the production CSV): the migration does NOT backfill anything. The user's first re-import after Phase 2 lands writes their Zamiana(s) as carryover rows; the dashboard becomes correct on the next render after that import.

## References

- Frame brief (cause + reframed scope): `context/changes/fund-conversion-cutoff/frame.md`
- Roadmap entry: `context/foundation/roadmap.md:93-104` (S-04)
- Sibling change (S-02): `context/changes/fetch-fund-price/plan.md`
- Existing verify-script pattern: `scripts/verify-parser.ts`, `scripts/verify-price-parser.ts`
- README "Pobieranie cen" section (target for Phase 3 doc update): `README.md:205-215`
- Money-columns runtime defense rule: `README.md:193-195`
- Lessons (S-03 CPU-time caveat — not load-bearing for this slice): `context/foundation/lessons.md:3-11`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema + types

#### Automated

- [x] 1.1 Migration applies cleanly locally: `npx supabase db reset` returns 0 — a1c3f03
- [x] 1.2 Type-check passes: `npm run lint` is clean — a1c3f03
- [x] 1.3 Build passes: `npm run build` is green — a1c3f03

#### Manual

- [x] 1.4 Local Supabase studio shows `contribution_source` enum lists `own, employer, state, carryover` — a1c3f03
- [x] 1.5 `database.types.ts` diff is exactly the two-line extension and nothing else — a1c3f03

### Phase 2: Parser captures Zamiana → import writes carryover row

#### Automated

- [x] 2.1 `npm run verify-parser` passes with new assertions — 470ccfa
- [x] 2.2 `npm run lint` is clean — 470ccfa
- [x] 2.3 `npm run build` is green — 470ccfa

#### Manual

- [x] 2.4 Re-upload real CSV; `SELECT * FROM transactions WHERE source='carryover'` returns exactly one row with `transaction_date=2024-11-07`, expected units, `gross_amount=0` — 470ccfa
- [x] 2.5 Second upload of same CSV is a no-op (no duplicate carryover row created) — 470ccfa
- [x] 2.6 `transactions` row count = (non-Zamiana Zrealizowane) + (Zrealizowane Zamiana) — 470ccfa

### Phase 3: Valuation helper + dashboard read + Polish footnote

#### Automated

- [x] 3.1 `npm run verify-valuation` passes (all helper-scenario assertions green)
- [x] 3.2 `npm run verify-parser` still passes (Phase 2 regression guard)
- [x] 3.3 `npm run lint` is clean
- [x] 3.4 `npm run build` is green

#### Manual

- [x] 3.5 `/dashboard` valuation matches user's known correct portfolio value (materially smaller than pre-fix wrong number)
- [x] 3.6 Polish footnote `Wycena uwzględnia jednostki od konwersji z dnia DD.MM.YYYY` renders under the "Pobrano" line
- [x] 3.7 "Pobierz cenę" reload preserves the footnote and updates valuation
- [x] 3.8 Fresh user with no transactions: existing "no_transactions" state still shows (no regression)
- [x] 3.9 (If available) User with transactions but no Zamiana: dashboard shows valuation with NO footnote (fallback path)
- [x] 3.10 README "Pobieranie cen" reads cleanly end-to-end with the new paragraph
