<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Fetch Fund Unit Price

- **Plan**: `context/changes/fetch-fund-price/plan.md`
- **Scope**: Full plan review (all 3 phases)
- **Date**: 2026-06-25
- **Verdict**: APPROVED
- **Findings**: 0 critical · 0 warnings · 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Evidence Summary

- **Plan-vs-diff**: 9 planned files all present; 0 DRIFT; 0 MISSING.
- **Scope guards verified** (from plan's "What We're NOT Doing"): schema unchanged, no `fund_name` column, hardcoded `ALL88`, `/dashboard` GET side-effect-free, no service-role key path, no React island, no retries, no auto-fetch.
- **Documented adaptations confirmed at expected sites**:
  - `src/pages/api/prices/fetch.ts:66` — `parseFloat(String(latest.price))` (Supabase NUMERIC(20,4) string-at-runtime defense, matches `setup.astro:36` precedent and README.md:193-195 rule)
  - `src/pages/dashboard.astro:45` — dropped redundant `String()` wrapper on already-typed-string `fetched_at`
  - `src/lib/analizy/{types,parse}.ts` — selector `.productValueSumUp .productBigText` and `EXPECTED_PRICE = 206.29` chosen from fixture inspection (plan deliberately left these "TBD")
- **Automated success criteria re-run on HEAD**:
  - `npm run verify-price-parser` → 13 assertions passed
  - `npm run lint` → clean
  - `npm run build` → green in 5.2s
- **Manual success criteria**: all 17 Progress rows checked + SHA-bound across commits `0291ba8` / `d0bf032` / `cf54130`.

## Findings

### F1 — createClient check sits below outbound fetch

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/pages/api/prices/fetch.ts:53-56`
- **Detail**: `createClient()` runs only after the ~1s outbound analizy.pl fetch + HTML parse. If `SUPABASE_URL` / `SUPABASE_KEY` are missing the user waits a full network round-trip just to land on `?priceError=Server%20not%20configured`. Sibling reference `src/pages/api/transactions/import.ts:33-36` has the same deferred check (so this is established repo behavior, not a pattern violation) — but hoisting it above the fetch is cheap fail-fast hygiene.
- **Fix**: Move the `const supabase = createClient(...)` + null check to right after the auth guard at line 20, before the outbound fetch block at line 30.
- **Decision**: SKIPPED (chose "Save & finish" — apply later as a follow-up if desired)

### F2 — Empty-element defensive check beyond plan

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `src/lib/analizy/parse.ts:37-44`
- **Detail**: The plan's contract for `extractPriceText` only specified the null-selector failure. Implementation adds a second branch for the selector-matched-but-text-is-empty case. Pure defense, no new product capability, well-named error string. Not scope creep — surfacing for awareness.
- **Fix**: None needed. Optional: thin to one branch if you want to match the plan literally.
- **Decision**: SKIPPED (defensive code, no fix needed)

### F3 — dbError banner not in plan template

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `src/pages/dashboard.astro:18-19, 43, 102-108`
- **Detail**: The plan's template contract listed only the `priceError` banner. Implementation adds a separate red "Błąd bazy danych: ..." banner for Supabase read failures on the dashboard's own SELECTs (transactions + price_snapshots). Mirrors `src/pages/setup.astro:79-83`'s same defensive banner — pure consistency with sibling page, no new product behavior.
- **Fix**: None needed. Surfacing for awareness.
- **Decision**: SKIPPED (defensive code matching setup.astro precedent, no fix needed)
