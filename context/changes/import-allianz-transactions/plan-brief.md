# Import Allianz Transactions — Plan Brief

> Full plan: `context/changes/import-allianz-transactions/plan.md`

## What & Why

A signed-in user uploads their Allianz PPK transaction CSV on a new `/setup` page; the server parses it, filters fund-switches and pending orders, categorises each contribution as `own` / `employer` / `state` via a 4:3 amount-ratio heuristic, and persists rows under RLS with `ON CONFLICT DO NOTHING` against the F-01 dedup key. The page re-renders showing per-source counts so the user can immediately sanity-check the heuristic split. Source categorisation is the foundation S-03 needs to compute the "after-tax gain/loss vs own contributions" the product exists to deliver.

## Starting Point

F-01 just shipped a typed `transactions` table with `DEFAULT auth.uid()`, FORCE RLS, four per-operation policies, and a `UNIQUE (user_id, transaction_date, source, units, gross_amount)` natural-key dedup constraint, all verified by a pgTAP isolation test. The app's auth slice has settled the form/redirect pattern (`POST` → `303` to `?error=` or success URL), the Supabase client is typed `<Database>`, and middleware enforces auth via a hardcoded `PROTECTED_ROUTES` list. `package.json` has no CSV parser and no test framework (CLAUDE.md flags this as intentional — CI gates on lint + build only). The real Allianz CSV is 106 rows, semicolon-delimited, decimal-comma, UTF-8 with Polish chars, two funds across the user's history.

## Desired End State

A signed-in user lands on `/setup`, uploads `Transaction_confirmation_*.csv`, and sees `Imported N new, 0 already present` plus a per-source counts table (own / employer / state, each with row count and total PLN). Re-uploading shows `Imported 0 new, N already present`. Malformed files leave the DB untouched and surface `Row N: <reason>`. Two users cannot see each other's counts (RLS). The DB now contains every executed contribution from the CSV, correctly source-tagged for S-03 to consume.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| File format | CSV (semicolon, decimal comma) via `papaparse` | The user's real Allianz export is CSV — confirmed by direct file inspection — and papaparse handles all the dialect quirks with zero Node deps. | Plan |
| Re-upload UX | Merge silently via `ON CONFLICT DO NOTHING`; report counts | DB-level dedup is the F-01 primitive; UI just reports `imported / already-present` counts. | Plan |
| Entry point | Dedicated `/setup` page for first-import and re-upload | One protected route owns the import surface; dashboard work belongs to S-03. | Plan |
| Source categorisation | Heuristic: pair-by-`Data zlecenia` at 4:3 ratio → larger=own, smaller=employer; singleton 240 PLN → state-annual; singleton 250 PLN on first month → state-welcome; else → own | The CSV has no source column; the 4:3 employee/employer rate is the PPK default and the sample confirms every pair fits it. | Plan |
| Zamiana (fund-switch) rows | Filter out at parse time; never persist | They aren't capital flow and don't fit the `contribution_source` ENUM; S-02 will revisit if it needs unit migration. | Plan |
| Date column for storage | `Data wyceny` (valuation/settlement date) | Matches how fund accounting actually values the position — natural primitive for S-02/S-03 math. | Plan |
| Multi-fund handling | Ignore fund identity; no `fund_name` column | Sums of `own` contributions are correct without it; S-02 can add the column later if unit accounting needs it. | Plan |
| Validation strictness | Reject the whole file on first malformed row, name the row | Honors FR-003's Socrates note (no silent corruption); skipping is the worse failure mode. | Plan |
| Post-import landing | Stay on `/setup`, show counts + per-source summary | Per-source counts ARE the heuristic-validation diagnostic — surfacing them on the same page lets the user spot a wrong split immediately. | Plan |
| Visibility | Counts-by-source summary only; no per-transaction table | Smallest UI to build; counts are sufficient diagnostic; per-row table is deferred. | Plan |
| Test approach | Single Node assertion script (`tsx scripts/verify-parser.ts`); no vitest | CLAUDE.md explicitly notes the project has no test framework — adopting one is more friction than the deadline can absorb. | Plan |

## Scope

**In scope:**
- `papaparse` + `tsx` deps; `@types/papaparse`
- `src/lib/allianz/{types,parse,categorise}.ts` (pure modules)
- `tests/fixtures/allianz-sample.csv` + `allianz-malformed.csv` (synthetic)
- `scripts/verify-parser.ts` (Node assertion runner) + `npm run verify-parser` script
- `src/pages/api/transactions/import.ts` (POST API route, multipart, upsert under RLS)
- `src/pages/setup.astro` (server-rendered page; counts query under RLS; status banners)
- `src/components/setup/UploadForm.tsx` (React form, progressive enhancement)
- `src/middleware.ts` updated to protect `/setup`
- `/dashboard` gets one `Import statement` link
- README "Importing transactions" section

**Out of scope:**
- Price fetch from analizy.pl, portfolio valuation, withdrawal-scenario math, dashboard rendering of computed amounts (S-02/S-03)
- Schema changes (no `fund_name`, no new ENUM values, no separate `fund_movements` table)
- Manual transaction edit/delete UI (PRD §Non-Goals)
- vitest / playwright / test framework adoption
- Per-row warnings UI for ambiguous heuristic cases
- Non-default PPK rates (employee 2% / employer 1.5% is hard-coded)
- Multipart-body size guard beyond the Worker's 100MB default
- Service-role Supabase client

## Architecture / Approach

Three independently shippable phases mapping to three layers: **pure logic** (parser + categoriser as standalone modules, verified by a Node assertion script against committed synthetic fixtures); **server route** (one API endpoint that delegates to the pure modules and does one batched upsert under the user's JWT, with `DEFAULT auth.uid()` and RLS enforcing ownership at the DB); **user-visible UI** (`/setup` Astro page reading counts under RLS, React upload form matching the existing auth-form progressive-enhancement pattern, middleware gating, dashboard link). Each phase has a manual gate; layer-by-layer separation means a regression at any level is locally diagnosable.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Parser + categoriser (pure modules + fixture) | papaparse install, pure `parse.ts` + `categorise.ts`, synthetic CSV fixtures, `npm run verify-parser` Node assertion script | Heuristic edge cases not in the fixture (3+ rows on same date, non-default rates) — defended by sorted-pair-off fallback + manual spot-check on the real CSV |
| 2. API route + DB writes | `/api/transactions/import` POST handler with multipart parse, parse+categorise call, single batched `.upsert(..., { ignoreDuplicates: true }).select('id')`, 303 redirect with imported/skipped/error params | Mis-counting imported vs skipped if `.select()` semantics differ from expectation — defended by curl spot-check that asserts both the success and re-upload responses against fixture row counts |
| 3. /setup page + middleware + dashboard link | Server-rendered `/setup` page with status banners and per-source counts table, React `<UploadForm>`, `/setup` added to `PROTECTED_ROUTES`, dashboard link, README section | Forgetting to add `/setup` to `PROTECTED_ROUTES` would leak the page (not the data — RLS still gates) — defended by an explicit manual signed-out check |

**Prerequisites:** F-01 shipped (`transactions` table with FORCE RLS, `DEFAULT auth.uid()`, UNIQUE dedup). Local Docker + `supabase start` running. Hosted Supabase project linked (already done in F-01 phase 3).
**Estimated effort:** ~2–3 after-hours sessions across 3 phases.

## Open Risks & Assumptions

- The 4:3 ratio heuristic assumes the user's PPK contribution rates are the defaults (employee 2% / employer 1.5%). The sample CSV confirms this. If the user later changes their rate, the per-source counts banner will show a visibly wrong split — that's the planned escape valve, not a silent corruption.
- The "250 PLN on first month" welcome-bonus detection won't fire for users who joined PPK before the welcome bonus was introduced or whose first month's 250 PLN row is paired with another (in which case the heuristic correctly treats it as a regular employee contribution).
- Multi-fund unit accounting is deferred. The user is currently fully switched out of `Allianz PPK 2055` into `Allianz Plan Emerytalny 2055`, so for S-02's "current valuation" query the missing `fund_name` column doesn't matter — but S-02's plan must reconsider this for users still split across funds.
- Cloudflare Workers' default 100MB body limit is way more than any real Allianz CSV will hit (~50KB). No custom limit is set.
- Cloudflare Workers' 10ms CPU-time limit (`context/foundation/lessons.md`) is a S-03 concern, not S-01 — parsing 100 rows and one batched insert is microseconds.

## Success Criteria (Summary)

- A signed-in user can upload the real `Transaction_confirmation_*.csv` on `/setup` and see correctly-tagged per-source counts (~50 own / ~50 employer / ~4 state for a 4-year history with default rates).
- Re-uploading the same file produces `Imported 0 new, N already present` and does not duplicate or mutate any row.
- A malformed file leaves the DB untouched and surfaces `Row N: <reason>`.
- Two distinct users cannot see each other's counts on `/setup` (RLS verified both locally and on the deployed Worker).
