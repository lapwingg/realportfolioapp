# Fund-conversion cutoff — Plan Brief

> Full plan: `context/changes/fund-conversion-cutoff/plan.md`
> Frame brief: `context/changes/fund-conversion-cutoff/frame.md`

## What & Why

`/dashboard`'s valuation `SUM(transactions.units) × ALL88 price` is fund-blind and conflates pre-conversion OLD-fund unit counts with post-conversion NEW-fund unit counts. Fix it at the valuation read path by deriving a cutoff date dynamically from a synthetic `source='carryover'` row written by the parser when it encounters a Zamiana — do NOT drop pre-cutoff rows from `transactions`, because S-03 needs that history for its own-capital, Belka-tax, and 60+ retirement calculations.

## Starting Point

The CSV parser at `src/lib/allianz/parse.ts:64` silently drops every Zamiana row outright. The `transactions` table has no fund attribution; `dashboard.astro:22-26, 44-46` does an unconditional `SELECT units` + `SUM × price`. Confirmed by the frame's hypothesis investigation (D1 STRONG, alternatives all ruled out) and by the README's own MVP-caveat at `README.md:215` documenting this exact failure mode. The user has observed the wrong number (≈+300% overstatement shape) and confirmed the date `2024-11-07` from the CSV's `Data wyceny` directly.

## Desired End State

A signed-in user with a 2024-11-07 (or any) Zamiana in their history sees a correct portfolio valuation on `/dashboard` — the SUM includes only `transaction_date >= MAX(carryover date)` units, with the Zamiana-issued NEW units present in that SUM naturally because the carryover row is itself dated on the cutoff. A subtle Polish footnote names the cutoff date. Users with no Zamiana see unchanged behavior (no regression). The `transactions` table stays lossless — every Zrealizowane row from the CSV lands, contributions and carryovers alike.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Cause of the wrong valuation | Naive cross-fund sum (pre-cutoff OLD-fund units + post-cutoff NEW-fund units summed, multiplied by NEW fund's price) | All four alternative root causes ruled out with file:line evidence | Frame |
| Fix layer | Dashboard read path — NOT parser/storage | Pre-cutoff rows are load-bearing for S-03 (FR-008/009/011) own-capital + tax calculations | Frame |
| Cutoff date source | Detect dynamically at parse time from the Zamiana row's `Data wyceny`; persist via synthetic `transactions` row | Removes magic-date hardcoding; auto-adapts to different users or different conversion dates | Plan |
| Carryover units representation | Synthetic `transactions` row with `source='carryover'`, `units=Liczba jednostek (fundusz docelowy)`, `gross_amount=0` | Single source of truth; idempotent via existing natural-key UNIQUE; cutoff derivable from `MAX(transaction_date) WHERE source='carryover'` | Plan |
| Schema change | `ALTER TYPE public.contribution_source ADD VALUE 'carryover'` (one new migration) | No CHECK constraint blocks `gross_amount=0`; natural-key UNIQUE already includes `source` | Plan |
| Cutoff visibility in UI | Subtle Polish footnote under "Pobrano" line: `Wycena uwzględnia jednostki od konwersji z dnia DD.MM.YYYY` | Matches FR-007 "honest UX" precedent (never display a number that has an invisible exclusion); low visual cost | Plan |
| Testing strategy | Pure helper module + tsx verify-script with assertion counter (mirrors `verify-price-parser`) | Matches existing convention exactly; fast; isolated; regression guard on the math | Plan |
| Parser return shape | Extend `ParseResult` success variant with a `carryovers: CarryoverRow[]` field alongside existing `rows` | Keeps the categoriser fund-agnostic (it never sees carryovers); import.ts merges both buckets in one upsert | Plan |

## Scope

**In scope:**
- New migration adding `'carryover'` to `contribution_source` enum
- `database.types.ts` regeneration
- Parser change: stop dropping Zamiana, capture target-side units into a new bucket
- Import route: write both contribution rows + carryover rows in one upsert
- New pure helper `src/lib/valuation/compute.ts` for cutoff derivation + SUM
- New `scripts/verify-valuation.ts` (registered as `npm run verify-valuation`)
- `dashboard.astro`: select three columns instead of one, invoke helper, render Polish footnote when cutoff applies
- README extension to document new cutoff behavior
- `verify-parser.ts` assertions for the new shape

**Out of scope:**
- Adding `fund_id` to `transactions` (v2 multi-fund deferral per PRD §Non-Goals)
- Per-user `profiles` table or `user_config` table (no value beyond what `transactions` already gives us)
- Modifying or deleting any existing rows in `transactions`
- Changing the categoriser (carryover rows bypass it)
- UI for editing the cutoff, listing carryover rows, or "explain my valuation"
- Splitting `/setup`'s "imported N" banner by contributions-vs-carryovers
- Multi-fund fixture / end-to-end pipeline verify script
- Running `/10x-archive fetch-fund-price` or fixing the roadmap status drift

## Architecture / Approach

```
CSV → parser → { rows: ContributionRow[], carryovers: CarryoverRow[] }
                ↓                            ↓
            categoriser                    (passthrough)
                ↓                            ↓
                └─────→ import.ts upsert ←──┘
                            ↓
                        transactions
                        (source ∈ {own, employer, state, carryover})
                            ↓
                     dashboard.astro
                        SELECT transaction_date, source, units
                            ↓
                   computeValuation(rows)
                        ↓                ↓
                   unitsSum         cutoffDate
                        ↓                ↓
                  × latestPrice    → Polish footnote
                        ↓
                    valuation
```

Pure helper has no I/O; SELECT is a single round-trip; the carryover row is one extra row in `transactions` per Zamiana (typically zero or one per user).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema + types | `'carryover'` enum value added; `database.types.ts` regenerated | Enum extensions are forward-only — no rollback inside same migration |
| 2. Parser + import wire-up | Zamiana rows persist as synthetic carryover rows in `transactions` | Migration must land in hosted Supabase BEFORE code deploys (else INSERT fails) |
| 3. Valuation helper + dashboard read + Polish footnote | `/dashboard` shows correct valuation with cutoff footnote; verify-valuation script + helper unit tests | Helper is pure but the SQL `WHERE`-equivalent (filter in JS) isn't directly exercised — relies on integration trust |

**Prerequisites:** S-02 (`fetch-fund-price`) is shipped (provides the `latestPrice` the valuation formula multiplies against); local Supabase running for Phase 1 verification; access to the user's real production CSV for Phase 2's manual verification.

**Estimated effort:** ~1-2 sessions across 3 phases. Phase 1 is mostly mechanical (1 SQL line + types regen); Phase 2 is the meaty change (parser + import + verify-parser updates); Phase 3 is the user-visible payoff with helper extraction + dashboard rewrite + footnote + new verify script.

## Open Risks & Assumptions

- Assumes the hosted Supabase project is reachable via `supabase db push --include-all` for the enum migration; if 5432 is blocked, fallback is pasting into the Dashboard SQL Editor + manual `schema_migrations` row insert per `README.md:178`.
- Assumes the user re-imports their CSV at least once after Phase 2 lands (the migration does NOT backfill existing rows — the carryover row materialises on next import).
- Assumes the user's CSV has consistent Zamiana semantics: `Status='Zrealizowane'` paired with valid `Data wyceny` + non-empty `Liczba jednostek (fundusz docelowy)`. The malformed-CSV fixture (`tests/fixtures/allianz-malformed.csv`) is unchanged in scope — it doesn't currently exercise Zamiana edge cases and is not extended in this slice.
- Assumes `npx supabase gen types --linked` works in the user's environment; fallback is a manual two-line edit to `database.types.ts`.

## Success Criteria (Summary)

- `/dashboard` valuation shown to the user matches their known correct portfolio value (materially smaller than the pre-fix wrong number).
- The Polish footnote `Wycena uwzględnia jednostki od konwersji z dnia DD.MM.YYYY` appears under the "Pobrano" line for the user.
- All three verify scripts pass (`verify-parser`, `verify-price-parser`, `verify-valuation`); lint and build are green.
