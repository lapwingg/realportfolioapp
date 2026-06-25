# Import Allianz Transactions and Categorise by Source — Implementation Plan

## Overview

S-01 ships the first authenticated user action: a signed-in user uploads their Allianz PPK transaction CSV on a new `/setup` page, the server parses the semicolon-delimited, Polish-decimal-comma file, filters out non-contribution rows (`Zamiana` fund switches, non-`Zrealizowane` statuses), categorises each contribution as `own` / `employer` / `state` using a date-pair + amount-ratio heuristic, and persists rows via the F-01 `transactions` table with `ON CONFLICT DO NOTHING` against the natural-key UNIQUE constraint. The page re-renders showing per-source counts (rows + total PLN) so the user can immediately sanity-check the heuristic split.

## Current State Analysis

- **DB layer is done by F-01**: `transactions` table at `supabase/migrations/20260625101139_create_transactions.sql:1-14` has `user_id uuid not null default auth.uid()`, `UNIQUE (user_id, transaction_date, source, units, gross_amount)` for dedup, FORCE RLS, four per-operation policies, and the `contribution_source` ENUM `('own', 'employer', 'state')` (verified by the pgTAP test in `supabase/tests/rls_isolation.test.sql`). The parser inserts under the user's JWT and RLS guarantees no cross-account write.
- **Money columns arrive as `string`** in `src/lib/database.types.ts:68-86` (NUMERIC → string in supabase-js). The parser writes them as strings, never coerces via `Number()`. No decimal-library math is needed in S-01 (no arithmetic happens here; that's S-03).
- **App pattern is settled** by the auth slice: form `POST` → API route → `context.redirect(...)` on success or `context.redirect("?error=<msg>")` on failure (`src/pages/api/auth/signin.ts:1-20`, `src/components/auth/SignInForm.tsx:36-40`). No JSON fetch, no toast library. Progressive enhancement: `<form method="POST" action="..." onSubmit={...} noValidate>`.
- **Middleware enforces auth via a hardcoded list**: `src/middleware.ts:7` reads `PROTECTED_ROUTES = ["/dashboard"]`. `/setup` must be added there.
- **No file-upload UI primitive** in `src/components/ui/`. No toast component. New `<UploadForm>` lives in `src/components/setup/`.
- **No test framework configured** per `CLAUDE.md:40`; CI runs `npm run lint` + `npm run build` only. Adding vitest is friction the deadline can't absorb — a single Node assertion script (`tsx scripts/verify-parser.ts`) verifies the parser against a committed fixture.
- **No CSV / XLSX / PDF parser in `package.json`**. `papaparse` (12KB gzipped, zero Node deps, semicolon + decimal-comma support, BOM handling) is the natural pick.
- **The real sample file** (`Transaction_confirmation_20260625_141213.csv`, 106 rows) confirms: semicolon delimiter, decimal comma, UTF-8 with Polish chars, 12 columns. Two funds across history (`Allianz PPK 2055` → `Allianz Plan Emerytalny 2055` via `Zamiana` on 2024-11-07). No explicit source-of-contribution column. Default 4:3 ratio between employee (2%) and employer (1.5%) contributions visible across every same-date pair.
- **Deadline pressure**: 10 days remain until 2026-07-05 (PRD timeline tension flag, roadmap Open Question #1). S-02 and S-03 still need to ship. Scope discipline is a hard constraint, not a nicety.

## Desired End State

After this change, a signed-in user lands on `/setup`, uploads `Transaction_confirmation_*.csv`, and sees:

```
Imported 102 new, 0 already present.

Your contributions so far
    own        49 rows    13 745.62 zł
    employer   49 rows    10 309.22 zł
    state       4 rows       960.00 zł

Upload an updated statement →  [Choose file] [Import]
```

Re-uploading the same file shows `Imported 0 new, 102 already present.` Uploading a malformed file leaves the DB untouched and shows `Row 14: cannot parse "abc" as a number in column "Liczba jednostek (fundusz źródłowy)".` Two users cannot see each other's counts (RLS).

### Verification at end of plan

- `npx tsx scripts/verify-parser.ts` is green: synthetic fixture produces expected counts per source and Zamiana rows are filtered.
- `npm run build` succeeds; `astro check` produces no type errors.
- Local manual: sign up as user A, upload the real CSV → counts banner shows expected per-source totals; re-upload → `0 new, N already present`; upload a corrupted CSV → error banner, zero rows inserted. Sign in as user B → `/setup` shows zero counts.
- Hosted manual (after Cloudflare auto-deploy): same flow works against the linked Supabase project.

### Key Discoveries

- **`Wartość PLN (transakcji)` (col 7), not `Wartość zlecenia` (col 6)**, is the actual transaction amount in PLN — `Wartość zlecenia` is empty for `Zamiana` rows (lines 56–59 in the sample), `Wartość PLN (transakcji)` is always populated for executed contributions.
- **`Liczba jednostek (fundusz źródłowy)` (col 8)** is the right unit count for `Kolejne nabycie` / `Pierwsze nabycie` rows — for these orders `fundusz docelowy` is empty.
- **Pair detection uses `Data zlecenia` (order date)** to group employee+employer rows, but **the stored `transaction_date` is `Data wyceny` (valuation date)** — these can differ by 2–3 days. The natural-key dedup on `(user_id, transaction_date, source, units, gross_amount)` still distinguishes the pair because `units` and `gross_amount` differ per row.
- **`supabase-js` does ON CONFLICT DO NOTHING via `.upsert(rows, { onConflict: '...', ignoreDuplicates: true })`** — chained `.select()` returns only newly-inserted rows, so `imported_count = data.length` and `skipped_count = parsed.length - data.length`.
- **`auth.uid()` DEFAULT on `transactions.user_id`** lets the parser omit `user_id` from the insert payload entirely — the DB fills it under RLS. This is the load-bearing safety net that prevents a developer from accidentally inserting rows tagged with someone else's UUID.
- **The lessons-learned 10ms CPU limit** (`context/foundation/lessons.md:1-12`) is a S-03 concern, not S-01. Parsing 100 rows and one batch insert is well under budget.

## What We're NOT Doing

- **No price fetch from analizy.pl, no portfolio valuation, no withdrawal-scenario calculations, no dashboard rendering of computed amounts** — that's S-02 and S-03.
- **No `fund_name` column on `transactions`** — the F-01 schema is intentionally untouched. Multi-fund handling is re-evaluated in S-02 (the user has fully switched out of `Allianz PPK 2055`, so for current valuation only `Allianz Plan Emerytalny 2055` matters).
- **No `transfer` ENUM value or separate `fund_movements` table** — `Zamiana` rows are filtered at parse time and never persisted. If S-02 needs unit migration history later, it'll be a deliberate schema change at that point.
- **No manual transaction edit / delete UI** — PRD §Non-Goals.
- **No vitest / playwright / test framework adoption** — CLAUDE.md flags the project as test-framework-free; a single Node assertion script (`tsx scripts/verify-parser.ts`) is the parser gate. Wiring vitest is a follow-up if a future slice needs richer assertions.
- **No support for non-default PPK contribution rates** — the 4:3 heuristic assumes employee 2% / employer 1.5%. If the user's rates differ, per-source counts will look obviously wrong in the post-import banner and they can decide what to do next.
- **No multipart-body size guard beyond Cloudflare Workers' 100MB default** — Allianz CSVs are ≤50KB realistically; a custom limit would be guard-railing against a non-problem.
- **No service-role Supabase client** — anon key under user JWT only, matching the F-01 security posture.
- **No warnings UI** for ambiguous heuristic cases — uncategorisable rows default to `own` and surface via the counts-by-source summary (the heuristic-validation primitive). A separate warnings list is more UI for the same diagnostic.
- **No status-bar / progress indicator during upload** — files are tiny, redirects are fast, the existing `<SubmitButton>` disabled state is sufficient.

## Implementation Approach

Three phases, each independently shippable and behind a manual gate. Phase 1 ships pure modules (parser + categoriser) plus a Node assertion script that proves the heuristic on a committed synthetic fixture — no DB, no HTTP, no UI surface, so any correctness bug here is caught before phase 2 wires it to the world. Phase 2 adds the API route and the upsert call, verified by manually POSTing the real CSV against a local Supabase. Phase 3 adds the `/setup` page, the `<UploadForm>` React component, the middleware update, and the dashboard link. The phases match the three layers (pure logic → server route → user-visible UI) so a regression at any layer is locally diagnosable.

## Critical Implementation Details

- **Polish decimal comma**. The CSV uses `,` as the decimal separator (`1,5269`). Papaparse does not auto-convert this — the parser does `String(raw).replace(',', '.')` before validating as a finite number. Money/units stay as strings end-to-end (matching the `numeric → string` supabase-js typing); the insert payload uses the dot-normalised string directly.
- **Pair-detection precedence over singleton classification**. Group rows by `Data zlecenia` first, classify pairs (4:3 ratio → own/employer), and only fall through to singleton classification (240 PLN → state-annual; 250 PLN AND user's first-ever PPK month → state-welcome; else → own) for groups of size 1. Inverting the order would mis-tag a hypothetical 240 PLN pair as two state rows.
- **`supabase-js` `.upsert(..., { ignoreDuplicates: true })` + `.select()` returns ONLY the newly-inserted rows** (PostgREST `resolution=ignore-duplicates`). That's how we get `imported_count`; `skipped_count` is computed as `parsed.length - data.length`. Do NOT chain `.select('count')` — it returns the full table count, not the insert count.
- **`user_id` is omitted from the insert payload entirely**. The `DEFAULT auth.uid()` on the column and RLS' `WITH CHECK` enforce ownership at the DB layer — the parser never names a UUID. A regression that hard-codes `user_id` in the payload would be caught by the existing pgTAP isolation test, but the cleaner posture is to never write the column from app code.
- **Redirect status `303 See Other`** on POST → GET handoff, not `302`. Astro's `context.redirect(url, 303)` is the contract; `302` keeps the method as POST in some browsers and would re-POST the form on refresh.
- **Don't import the parser into the Astro page** — Phase 3's `setup.astro` reads counts from the DB, not the file. Parser/categoriser modules are imported only by the `/api/transactions/import.ts` handler, keeping the page render path free of CSV-parsing code.

---

## Phase 1: Parser + categoriser (pure modules + fixture)

### Overview

Add `papaparse` and `tsx` to `package.json`; write pure `parse.ts` and `categorise.ts` modules under `src/lib/allianz/`; commit a synthetic structural fixture under `tests/fixtures/`; write a Node assertion script that runs the parser+categoriser end-to-end against the fixture and asserts expected counts. End of phase: `npx tsx scripts/verify-parser.ts` exits 0, no HTTP or DB code touched.

### Changes Required:

#### 1. Dependencies

**File**: `package.json`

**Intent**: Pull in the CSV parser the rest of the slice consumes and the TypeScript runner the verification script needs. Both are tiny and well-maintained.

**Contract**:
- `dependencies`: add `papaparse@^5.4.1` (runtime — imported by the API route's parser module).
- `devDependencies`: add `@types/papaparse@^5.3.14` and `tsx@^4.7.0`.
- `scripts`: add `"verify-parser": "tsx scripts/verify-parser.ts"`.

#### 2. Shared types

**File**: `src/lib/allianz/types.ts`

**Intent**: Name the types the parser and categoriser pass between themselves, and the insert-row shape that the API route hands to supabase-js. One file so the type chain is grep-able.

**Contract**: Three named types — `ParsedRow` (post-parse, pre-categorise; contains `Data zlecenia` for pair detection, `Data wyceny` for storage, `Wartość PLN (transakcji)` as normalised string, `Liczba jednostek (fundusz źródłowy)` as normalised string), `CategorisedRow` (`ParsedRow` plus `source: Database['public']['Enums']['contribution_source']`), and `ParseResult` (discriminated union: `{ ok: true; rows: CategorisedRow[] }` | `{ ok: false; error: string }`). The `source` field's type is imported from `src/lib/database.types.ts` so a future ENUM change is a compile error here.

#### 3. Parser

**File**: `src/lib/allianz/parse.ts`

**Intent**: Convert raw CSV text into a `ParsedRow[]` or a single typed error. Filter out rows that aren't contributions (`Zamiana` and non-`Zrealizowane`). Normalise Polish decimal commas. Reject the whole file on the first malformed row that should have been parseable.

**Contract**:
- Exported function `parseAllianzCsv(csvText: string): { ok: true; rows: ParsedRow[] } | { ok: false; error: string }`.
- Uses `Papa.parse(csvText, { header: true, delimiter: ';', skipEmptyLines: true })`. Asserts the header row contains exactly the 12 expected column names (in any order) — missing/extra columns → `{ ok: false, error: "Unexpected CSV header. Expected columns: ..." }`.
- For each data row:
  - Skip silently if `Typ zlecenia === 'Zamiana'` (fund switch — not a contribution).
  - Skip silently if `Status zlecenia !== 'Zrealizowane'` (pending order — not yet money).
  - Reject the whole file (return `{ ok: false, error: "Row N: <reason>" }`, 1-based row index counting the header as row 1) if any of: `Typ zlecenia` not in `{'Kolejne nabycie', 'Pierwsze nabycie'}`, `Typ !== 'Kwota'`, `Data wyceny` doesn't match `/^\d{4}-\d{2}-\d{2}$/`, `Wartość PLN (transakcji)` or `Liczba jednostek (fundusz źródłowy)` cannot be parsed after `.replace(',', '.')` as a finite number > 0.
- Output `ParsedRow`s carry `order_date` (from `Data zlecenia`), `valuation_date` (from `Data wyceny`), `units` (dot-normalised string), `gross_amount` (dot-normalised string).

#### 4. Categoriser

**File**: `src/lib/allianz/categorise.ts`

**Intent**: Apply the 4:3 pair + singleton heuristic. Pure function, no IO. Groups by `order_date` (which is `Data zlecenia` — when the employee+employer pair was placed together) but emits rows that the API route stores under `valuation_date`.

**Contract**:
- Exported function `categoriseRows(rows: ParsedRow[]): CategorisedRow[]`.
- Group `rows` by `order_date`.
- For each group:
  - **2 rows**: parse both `gross_amount` to numbers; the row with the larger amount → `source = 'own'`, the smaller → `source = 'employer'`. (The 4:3 ratio is the heuristic's *origin*, not a runtime check — pairs that don't match exactly still get split larger/smaller; the post-import counts banner is the diagnostic.)
  - **1 row**: parse `gross_amount`; if `Math.abs(amount - 240) < 1` → `source = 'state'` (annual subsidy); else if `Math.abs(amount - 250) < 1` AND the row's `valuation_date` is the earliest in the file AND there exists no other row on the same `order_date` → `source = 'state'` (welcome bonus); else → `source = 'own'`.
  - **3+ rows**: sort by amount descending, pair off greedily (largest+next-largest as own/employer pairs); any leftover singleton classified by the 1-row rule. (Defensive — not seen in the sample but cheap to handle.)
- Output preserves input order (stable sort).

#### 5. Synthetic structural fixture

**File**: `tests/fixtures/allianz-sample.csv`

**Intent**: A committed, fully-synthetic CSV that exercises every structural case the parser/categoriser handles: a pair of contributions, a singleton state-annual row, a singleton state-welcome row, a Zamiana row (must be filtered), a non-`Zrealizowane` row (must be filtered), and a malformed row variant (kept in a separate sibling file). Synthetic so the real user CSV stays private.

**Contract**:
- File 1 — `tests/fixtures/allianz-sample.csv`: header row + 7 data rows: one pair (300 PLN + 225 PLN on the same `Data zlecenia`), one singleton 240 PLN, one singleton 250 PLN on the earliest date (for welcome bonus), one Zamiana row, one `W trakcie realizacji` row (pending — must skip), one normal pair from a different month. Total: 4 contributions expected after filter, plus 1 state-annual, plus 1 state-welcome = 6 rows imported, with counts `own=2, employer=2, state=2`. Comment headers in the file explain each row's role.
- File 2 — `tests/fixtures/allianz-malformed.csv`: same header + one valid row + one row with `Wartość PLN (transakcji) = "abc"`. Used by the verification script to confirm rejection on first bad row.

#### 6. Verification script

**File**: `scripts/verify-parser.ts`

**Intent**: A runnable script that asserts parser + categoriser behaviour against both fixtures. The project has no test framework; this is the contract that future parser edits don't silently regress.

**Contract**:
- Imports `parseAllianzCsv` and `categoriseRows` from `src/lib/allianz/`.
- Reads `tests/fixtures/allianz-sample.csv`, runs `parseAllianzCsv` → asserts `ok: true` and `rows.length === 4` (post-filter, pre-categorise). Runs `categoriseRows` → asserts `own/employer/state` counts and total gross_amount per source.
- Reads `tests/fixtures/allianz-malformed.csv`, runs `parseAllianzCsv` → asserts `ok: false` and `error.startsWith('Row 3:')`.
- Uses `node:assert/strict`. On any assertion failure, throws and exits non-zero.
- Logs a one-line summary on success: `verify-parser: 8 assertions passed`.

### Success Criteria:

#### Automated Verification:

- `cd /Users/kczajka/Desktop/realportfolioapp && npm install` succeeds with the new deps.
- `npm run verify-parser` exits 0 with the summary log line.
- `npm run lint` passes (no eslint errors on the new files).
- `npm run build` succeeds (astro can build with the new dependency imported by `src/lib/`).
- `npx astro check` passes (TypeScript types tie out, including the `Database['public']['Enums']['contribution_source']` import).

#### Manual Verification:

- Run the parser + categoriser against the user's real `Transaction_confirmation_20260625_141213.csv` in a one-off REPL (`npx tsx -e "..."`) and visually confirm per-source counts look right (~50 own, ~50 employer, ~4 state across the 4 years).
- Confirm Zamiana rows (lines 56–59 in the real file) are filtered out — total parsed count should be `total rows - 4`.

**Implementation Note**: After phase 1's automated checks pass, pause for manual confirmation that the real-CSV spot check looks correct before wiring up phase 2.

---

## Phase 2: API route + DB writes

### Overview

Add `src/pages/api/transactions/import.ts`: a POST handler that extracts the file from FormData, runs the parser+categoriser, batches into a single `.upsert(rows, { ignoreDuplicates: true }).select()` call against `transactions`, and redirects to `/setup` with imported/skipped counts or an error message.

### Changes Required:

#### 1. Import API route

**File**: `src/pages/api/transactions/import.ts`

**Intent**: The only server-side write path for contribution data. Validates auth, validates file presence, delegates parsing/categorising to phase-1 modules, performs one batched upsert under the user's JWT (RLS + `DEFAULT auth.uid()` enforce ownership), redirects with a status banner.

**Contract**:
- `export const prerender = false;` (SSR — not a static page).
- `export const POST: APIRoute = async (context) => { ... }`.
- Auth gate: if `!context.locals.user`, `return context.redirect('/auth/signin', 303)`.
- Read `const form = await context.request.formData();` and `const file = form.get('file');` — if `!(file instanceof File)` or `file.size === 0`, redirect 303 to `/setup?error=No+file+uploaded`.
- Read `const csvText = await file.text();`.
- Call `parseAllianzCsv(csvText)`; on `{ ok: false }`, redirect 303 to `/setup?error=${encodeURIComponent(result.error)}` — no DB call.
- Call `categoriseRows(result.rows)` → `categorised`.
- Build insert payload: `categorised.map(r => ({ transaction_date: r.valuation_date, source: r.source, units: r.units, gross_amount: r.gross_amount }))` — note no `user_id` field; the DB's `DEFAULT auth.uid()` handles it.
- Create the Supabase client via `createClient(context.request.headers, context.cookies)` (the existing factory pattern from `src/lib/supabase.ts`). If `null` (env vars missing), redirect 303 to `/setup?error=Server+not+configured`.
- Call `const { data, error } = await supabase.from('transactions').upsert(payload, { onConflict: 'user_id,transaction_date,source,units,gross_amount', ignoreDuplicates: true }).select('id');`
- On `error`: redirect 303 to `/setup?error=${encodeURIComponent('Database error: ' + error.message)}`.
- On success: `imported = data?.length ?? 0`, `skipped = payload.length - imported`, redirect 303 to `/setup?imported=${imported}&skipped=${skipped}`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes on the new route.
- `npx astro check` passes (the `.upsert(...).select('id')` chain types correctly against the `Database` type).
- `npm run build` succeeds — the route is included in the SSR bundle.

#### Manual Verification:

- `npx supabase start` and `npm run dev`; sign up a local user; via `curl -X POST -b cookies.txt -F "file=@tests/fixtures/allianz-sample.csv" http://localhost:4321/api/transactions/import -i` confirm the response is `303 See Other` with `Location: /setup?imported=6&skipped=0`.
- Re-run the same curl — confirm response is `303` with `Location: /setup?imported=0&skipped=6` (all duplicates).
- POST `tests/fixtures/allianz-malformed.csv` — confirm `303` with `Location: /setup?error=Row+3%3A...`; verify in Supabase Studio that NO rows from this attempt landed.
- Verify with Supabase Studio that `transactions` rows have non-null `user_id` matching the test user; per-source counts match the fixture expectations.

**Implementation Note**: After phase 2 passes, pause for manual confirmation that all three curl scenarios behaved correctly (insert, dedup, error rollback) and that Studio shows correctly tagged rows before wiring the UI.

---

## Phase 3: /setup page + middleware + dashboard link

### Overview

Add `src/pages/setup.astro` (server-rendered, reads counts under RLS), `src/components/setup/UploadForm.tsx` (React form matching the auth-form pattern), register `/setup` in the middleware's `PROTECTED_ROUTES`, and add an `Import statement` link from `/dashboard` to `/setup`. Update README with the import flow.

### Changes Required:

#### 1. /setup page

**File**: `src/pages/setup.astro`

**Intent**: The single page where the user first imports and later re-imports. Renders status banners from URL search params, shows a per-source counts table read from the DB under RLS, and embeds the upload form. Server-rendered so the page works without JS.

**Contract**:
- `export const prerender = false;`.
- Reads `Astro.locals.user` (middleware redirects unauth before this runs).
- Reads `Astro.url.searchParams` for `imported`, `skipped`, `error`.
- Creates a Supabase client via the existing `createClient` factory. Issues one query: `supabase.from('transactions').select('source, gross_amount')` — returns all rows the user owns under RLS. The page aggregates in JS into `{ own: { count, sum }, employer: { count, sum }, state: { count, sum } }` using string-decimal addition (template literal join is enough at this scale; no decimal library needed since we're only adding a few hundred values to display, not computing tax).
- Renders, in order: page heading, error banner (if `error` param), success banner (if `imported` param: "Imported N new, M already present"), per-source counts table (always), the `<UploadForm client:load />` island, an "Upload an updated statement" caption shown when total existing rows > 0.
- Layout: reuse `src/layouts/Layout.astro`.

#### 2. Upload form component

**File**: `src/components/setup/UploadForm.tsx`

**Intent**: A small React form that mirrors the auth-form progressive-enhancement pattern: native `<form method="POST" action="..." encType="multipart/form-data">` with a controlled file input and the existing `<SubmitButton />`. Client JS only disables the submit button while submitting; the actual upload is a native form POST that produces a server redirect.

**Contract**:
- `<form method="POST" action="/api/transactions/import" encType="multipart/form-data" onSubmit={handleSubmit} noValidate>`.
- One `<input type="file" name="file" accept=".csv,text/csv" required />` and the existing `<SubmitButton>` reused from `src/components/auth/SubmitButton.tsx`.
- `handleSubmit` only sets a local `isSubmitting` state to true and does NOT call `e.preventDefault()` — the browser handles the POST natively, the server returns a 303, and the resulting GET re-renders `/setup` with banners.
- Optional inline `<p>` showing the chosen file name when a file is selected (controlled state on the input's `onChange`).

#### 3. Middleware

**File**: `src/middleware.ts`

**Intent**: Add `/setup` to the auth-gated route list so the upload page and the API route under `/api/transactions/import` are both reachable only by signed-in users. The API route's own auth check (phase 2) is the defense-in-depth; this guarantees the GET `/setup` returns the page only to signed-in users.

**Contract**:
- Change `PROTECTED_ROUTES = ["/dashboard"]` to `PROTECTED_ROUTES = ["/dashboard", "/setup"]`. Optionally add `"/api/transactions"` to the same list so the API route 303s to signin even without the in-handler check (belt + suspenders is cheap here).

#### 4. Dashboard link to /setup

**File**: `src/pages/dashboard.astro`

**Intent**: A one-line link so the dashboard's first iteration (which is still placeholder-shaped until S-03 lands) at least points the user to the import surface.

**Contract**: Add `<a href="/setup">Import statement</a>` somewhere visible on the page (matching existing layout/styling — use a Button-as-link via the `asChild` Slot pattern from `src/components/ui/button.tsx` if it reads more naturally; a plain `<a>` is fine too).

#### 5. README

**File**: `README.md`

**Intent**: One short section explaining the import flow so a future contributor (or the user themselves a month from now) doesn't have to reverse-engineer it.

**Contract**: Add a `## Importing transactions` section after the existing `## Database` section: 3-5 sentences describing the user-visible flow (sign in → /setup → upload → counts banner), the fixture location (`tests/fixtures/allianz-sample.csv`), the parser verification command (`npm run verify-parser`), and the heuristic caveat ("assumes default PPK rates of employee 2% / employer 1.5%; if your rates differ the per-source split will be wrong — re-run after we add explicit rate config").

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes on all new files.
- `npx astro check` passes.
- `npm run build` succeeds — the new page is included.

#### Manual Verification:

- Local: sign in as user A → visit `/setup` → page renders with zero counts, upload form visible.
- Upload `tests/fixtures/allianz-sample.csv` → page re-renders with `Imported 6 new, 0 already present` banner and per-source counts (`own=2, employer=2, state=2`).
- Re-upload the same file → `Imported 0 new, 6 already present`; counts unchanged.
- Upload `tests/fixtures/allianz-malformed.csv` → error banner with `Row 3: ...`; DB unchanged (verified via Studio).
- Sign out → visit `/setup` directly → redirected to `/auth/signin`.
- Two-user RLS check: sign in as user B (incognito) → visit `/setup` → zero counts (user A's rows invisible).
- `/dashboard` shows the `Import statement` link; clicking it lands on `/setup`.
- Upload the real `Transaction_confirmation_20260625_141213.csv` against the local dev server → counts banner shows per-source totals; spot-check matches the manual expectations from phase 1.
- After Cloudflare auto-deploy on push to `master`, repeat the upload-once / re-upload / malformed cycle against the deployed app to confirm Worker + hosted Supabase behave identically.

**Implementation Note**: After phase 3 passes locally, pause for manual confirmation that all five local scenarios passed and the hosted-deploy spot check succeeded before marking the change ready for archive.

---

## Testing Strategy

### Unit Tests:

- The parser+categoriser is exercised end-to-end by `scripts/verify-parser.ts` against `tests/fixtures/allianz-sample.csv` (happy path + filter cases) and `tests/fixtures/allianz-malformed.csv` (rejection on first bad row). No test framework is added; the assertion script is the unit-test equivalent for this slice.

### Integration Tests:

- The phase-2 curl checks against a local Supabase+dev-server are the integration tests: they exercise the full stack (multipart parse → CSV parse → categorise → upsert under RLS → 303 redirect) and verify the dedup natural key behaves under re-upload.

### Manual Testing Steps:

1. `npm install && npm run verify-parser` — green.
2. `npx supabase start && npm run dev`; sign up a fresh user.
3. `curl -X POST -b cookies.txt -F file=@tests/fixtures/allianz-sample.csv http://localhost:4321/api/transactions/import -i` — expect `303` to `/setup?imported=6&skipped=0`.
4. Repeat the curl — expect `imported=0&skipped=6`.
5. Same with `allianz-malformed.csv` — expect `?error=Row+3%3A...` and no new rows in Studio.
6. Browser: visit `/setup` while signed in — counts visible, upload form works end-to-end with the real CSV.
7. Browser incognito as user B — `/setup` shows zero counts (RLS).
8. Push to `master`, wait for Cloudflare auto-deploy, repeat steps 6–7 against the deployed URL.

## Performance Considerations

- Parsing 100–500 CSV rows with papaparse and inserting in one batch is well under the Cloudflare Workers free-plan 10ms CPU budget — this is the same lessons-learned concern (`context/foundation/lessons.md:1-12`) that becomes load-bearing in S-03's calculation route, not here.
- One round-trip to Supabase per import (batched upsert with `.select('id')`) and one round-trip per page render (counts query) — well within any latency budget.
- No client-side JS work beyond a controlled file input; bundle size impact ≈ the React island in `<UploadForm>`.

## Migration Notes

- No DB migration in this slice — F-01 already shipped the schema. The natural-key UNIQUE constraint is the dedup primitive this slice depends on; verified live in F-01's archived plan (`context/archive/2026-06-25-supabase-schema-rls/plan.md:73-96`).
- Rollback: revert the application commits via `git revert`. The DB is unchanged by this slice, so there's nothing to undo at the schema layer. Any user data inserted by an imperfect parser can be `DELETE`d under RLS via Studio.

## References

- Roadmap entry: `context/foundation/roadmap.md` (S-01, import-allianz-transactions)
- PRD: `context/foundation/prd.md` (FR-003 upload, FR-004 parse+persist+dedupe, FR-005 categorise by source; Socrates notes; NFR "no cross-account data exposure")
- F-01 archived plan: `context/archive/2026-06-25-supabase-schema-rls/plan.md` (schema contract, RLS posture, UNIQUE dedup key, money column typing)
- Lessons: `context/foundation/lessons.md`
- Real CSV sample (NOT committed; for manual spot-check only): `~/Desktop/Transaction_confirmation_20260625_141213.csv`
- Auth flow as the form/redirect pattern reference: `src/pages/api/auth/signin.ts`, `src/components/auth/SignInForm.tsx`
- Supabase client factory: `src/lib/supabase.ts`
- Middleware: `src/middleware.ts:7`
- Generated DB types: `src/lib/database.types.ts`
- Transactions migration: `supabase/migrations/20260625101139_create_transactions.sql:1-14`
- RLS isolation test: `supabase/tests/rls_isolation.test.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Parser + categoriser (pure modules + fixture)

#### Automated

- [x] 1.1 `npm install` succeeds with the new deps
- [x] 1.2 `npm run verify-parser` exits 0 with the summary log line
- [x] 1.3 `npm run lint` passes on the new files
- [x] 1.4 `npm run build` succeeds with the new dependency imported by `src/lib/`
- [x] 1.5 `npx astro check` passes including the `contribution_source` enum import

#### Manual

- [x] 1.6 Parser + categoriser produce expected per-source counts on the real CSV via one-off REPL
- [x] 1.7 Zamiana rows (lines 56–59) confirmed filtered out — total parsed = total rows − 4

### Phase 2: API route + DB writes

#### Automated

- [ ] 2.1 `npm run lint` passes on the new route
- [ ] 2.2 `npx astro check` passes — `.upsert(...).select('id')` types tie out against `Database`
- [ ] 2.3 `npm run build` succeeds — route included in SSR bundle

#### Manual

- [ ] 2.4 curl POST of sample fixture → `303` to `/setup?imported=6&skipped=0`
- [ ] 2.5 Re-POST of same fixture → `303` to `/setup?imported=0&skipped=6` (all duplicates)
- [ ] 2.6 POST of malformed fixture → `303` to `/setup?error=Row+3%3A...`; zero rows landed in Studio
- [ ] 2.7 Studio shows correctly-tagged rows with non-null `user_id` matching the test user

### Phase 3: /setup page + middleware + dashboard link

#### Automated

- [ ] 3.1 `npm run lint` passes on all new files
- [ ] 3.2 `npx astro check` passes
- [ ] 3.3 `npm run build` succeeds with the new page included

#### Manual

- [ ] 3.4 Signed-in user A: `/setup` renders with zero counts and an upload form
- [ ] 3.5 Upload sample fixture → banner shows `Imported 6 new, 0 already present` + correct per-source counts
- [ ] 3.6 Re-upload sample fixture → banner shows `Imported 0 new, 6 already present`; counts unchanged
- [ ] 3.7 Upload malformed fixture → error banner with `Row 3: ...`; DB unchanged
- [ ] 3.8 Signed-out request to `/setup` → redirected to `/auth/signin`
- [ ] 3.9 Two-user RLS check: user B sees zero counts on `/setup` after user A imported
- [ ] 3.10 `/dashboard` shows the `Import statement` link and it lands on `/setup`
- [ ] 3.11 Real CSV upload locally → per-source counts spot-check passes
- [ ] 3.12 Hosted-deploy spot check: upload-once / re-upload / malformed cycle behaves identically on the deployed URL
