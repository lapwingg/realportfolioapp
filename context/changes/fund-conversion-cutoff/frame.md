# Frame Brief: 2024-11-07 fund-conversion cutoff

> Framing step before /10x-plan. Captures what is *actually* at issue, separated from what was initially assumed.

## Reported Observation

Dashboard portfolio valuation on `/dashboard` is visibly wrong. The user has gone through a single fund-unit conversion (Zamiana) on 2024-11-07 — old fund (`Allianz PPK 2055`) units were swapped for new fund (`Allianz Plan Emerytalny 2055`) units. The displayed valuation is materially overstated.

## Initial Framing (preserved)

- **User's stated cause or approach**: pre-conversion units of the OLD fund are being summed alongside post-conversion units of the NEW fund, then multiplied by the NEW fund's price (`SUM(transactions.units) × ALL88 price`). Naive cross-fund sum.
- **User's proposed direction**: update `src/lib/allianz/parse.ts` to reject every CSV row dated before 2024-11-07 from the calculations, and use the 2024-11-07 Zamiana row's `Fundusz docelowy` data as the new fund's opening baseline.
- **Pre-dispatch narrowing**: bug is **observed** (not inferred from code), there is **exactly one** Zamiana in the user's CSV history, and the date `2024-11-07` was read **directly from `Data wyceny`** on the Zamiana row (ground truth, not memory).

## Dimension Map

The observation could originate at any of these dimensions:

1. **Naive cross-fund sum** — pre-cutoff OLD-fund units + post-cutoff NEW-fund units are stored without fund attribution and summed; the total is multiplied by the NEW fund's price. ← initial framing
2. **Fix LAYER (parser vs storage vs query)** — same root cause but the fix could land at the CSV parser (drop rows before persistence), in the DB schema (add `fund_id`), or at the dashboard's SUM query (date filter at read time). Each has different downstream consequences.
3. **Downstream data-loss** — dropping pre-cutoff rows from `transactions` would erase the contribution history (own/employer/state, gross_amount) that S-03 (FR-008/009/011 — withdrawal-scenarios + Belka tax + 60+ retirement) computes "własny kapitał" against. The fix scope, not the cause.
4. **Different root cause entirely** — duplicate inserts, RLS leak, parser off-by-N, or price snapshot pointing at the wrong fund. Worth ruling out cheaply.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| **D1 — Naive cross-fund sum (initial framing)** | `src/lib/allianz/parse.ts:64` drops `Zamiana` but keeps every other row regardless of date; `src/pages/api/transactions/import.ts:26-31` insert payload has no fund column; `supabase/migrations/20260625101139_create_transactions.sql:5-14` schema has no `fund_id`; `src/pages/dashboard.astro:22-26, 44-46` does unconditional `SUM(units) × ALL88 price`; `README.md:215` documents this exact "single-fund approximation" as known MVP debt. Worked example: 160 OLD units (5 PLN each = 800 PLN) → Zamiana → 30 NEW units (20 PLN each = 600 PLN) + 35 post-conversion NEW units → today's displayed 195 × 30 = 5850 PLN vs correct 65 × 30 = 1950 PLN. ≈ +300% overstatement shape, matches "visibly wrong". | **STRONG** |
| **D2 — Fix LAYER (storage vs query)** | Pure planning concern: which layer to fix at is solution-design, not cause-location. Moved to /10x-plan. | Solution layer — not framing |
| **D3 — Downstream data-loss from "drop at parser"** | `context/foundation/roadmap.md:95-103` S-03 outcome: "after-tax net amount + gain/loss vs **own capital** for all three withdrawal scenarios". `context/foundation/prd.md:53` "gain/loss... compares the after-tax amount against own contributions only". `prd.md:86` FR-008 "after-tax gain/loss compared to their **own invested capital**". `prd.md:111` business logic input: "transaction history categorised by contribution source: own, employer, state subsidy". `prd.md:91` FR-009 Belka tax = gain over lifetime basis. `prd.md:97` FR-011 60+ retirement-tax exemption rules need lifetime contribution categorisation. "Own invested capital" is a lifetime SUM independent of which fund the units currently sit in — dropping pre-2024-11-07 rows directly destroys the baseline. PRD `prd.md:126` §Non-Goals forbids manual transaction CRUD, so the loss is effectively irreversible inside the app. | **STRONG (reframes the scope)** |
| **D4 — Different root cause entirely** | Duplicate inserts ABSENT (natural-key UNIQUE on `(user_id, transaction_date, source, units, gross_amount)` + `import.ts` uses `.upsert(..., ignoreDuplicates: true)`); race condition ABSENT (single POST → single upsert); column-selection ABSENT (`parse.ts:106` reads `Liczba jednostek (fundusz źródłowy)` correctly); price fund identity ABSENT (`src/lib/analizy/types.ts:1-3` pins `TICKER="ALL88"`, FUND_LABEL = new fund); RLS leak ABSENT (per-user policy at migration + pgTAP coverage). | **NONE — all ruled out** |

## Narrowing Signals

Step 1.5 (pre-dispatch) collapsed three potential ambiguities cleanly:

- Bug is **observed**, not inferred → the wrongness is real, not a code-reading artifact; permission to proceed without first reproducing.
- **Exactly one Zamiana** in the user's CSV → cutoff is a single point in time; no need for "find the most recent Zamiana" event-based detection.
- Date `2024-11-07` came **directly from the CSV's `Data wyceny`** → trustworthy as ground truth; date-pinning is safe in this implementation (though see "What Changes" below for the durability tradeoff).

Step 4 narrowing was **skipped** — Step 3 evidence was conclusive in both directions: D1 with STRONG evidence and no plausible alternatives (per D4 rule-out), D3 with STRONG evidence that the user's *proposed scope* destroys data S-03 will need within weeks. The reframe writes itself.

## Cross-System Convention

The README at `README.md:215` already documents this as a known approximation tied to a v2 deferral, not a parser bug:

> Single-fund approximation (MVP caveat): the dashboard valuation is computed as `SUM(transactions.units) × ALL88 unit price`. This is mathematically exact for users fully invested in a single fund... For a user still split across multiple funds, the number would be inaccurate — a future slice would need to extend `transactions` with a per-row fund identifier and the price-fetch route with a per-ticker lookup. The PRD §Non-Goals explicitly defers multi-fund support to v2.

Convention this implies: keep `transactions` faithful to the source CSV (append-only, idempotent, lossless); when valuation logic needs a fund-aware narrowing, do it at the *read* path, not at the *write* path. This is what S-03 already does conceptually for the own/employer/state split.

Additionally surfaced by investigation: the Zamiana row itself carries **no `gross_amount` contribution** (`tests/fixtures/allianz-sample.csv:5` shows `Wartość PLN (transakcji)=500,00` paired with `Wartość zlecenia=` empty + `Typ=Saldo`, not `Kwota`) — it's a fund swap, not a deposit. So the user's "use the 2024-11-07 row itself as the new fund's opening baseline" intent cannot land as a `transactions` row of the existing shape. The 30 NEW carryover units from the Zamiana target side are real and need accounting for, but the only natural-key fields the current schema offers don't accommodate a unit-balance-with-no-deposit event.

## Reframed Problem Statement

> **The actual problem to plan around is**: `/dashboard`'s valuation `SUM(transactions.units) × ALL88 price` is fund-blind and conflates pre-conversion OLD-fund unit counts with post-conversion NEW-fund unit counts. **Fix it at the valuation read path** (filter `transactions` by `transaction_date >= 2024-11-07` for the SUM only, and add the 30 NEW carryover units from the Zamiana's target side as an opening baseline) — **do not drop pre-cutoff rows from `transactions`**, because S-03 needs that history for its own-capital, Belka-tax, and 60+ retirement calculations.

The original cause-hypothesis was **correct**. The proposed scope was **wrong**: it pushed a valuation-layer filter down into the storage layer, which is lossy and (per `prd.md:126`) effectively irreversible inside the running app. A read-time filter fixes the bug equally well while preserving the lifetime contribution history that the next vertical slice depends on. The Zamiana row's target-side unit count needs to surface as an opening baseline somehow — schema and mechanism are open questions for /10x-plan.

## Confidence

**HIGH** — the cause is established by complete data-flow tracing (CSV → parser → categoriser → import → schema → dashboard); all four alternative root causes were independently ruled out with file:line citations; the scope reframe is grounded in the PRD's own FR-008/009/011 wording for the next slice; the cross-system convention (keep storage faithful, filter at read time) is already documented in the README; and the reframe was reached by an agent that started from the inverse question ("does downstream need this data?") rather than from the framing itself — independent corroboration in the sense Step 5 requires.

## What Changes for /10x-plan

The plan should be scoped to the **valuation read path** (`src/pages/dashboard.astro`), not to the parser or storage. Two concrete decisions /10x-plan needs to make:

1. **Cutoff source**: hardcode `2024-11-07` (simplest; durable as long as the user re-imports cleanly), or store the cutoff in a small config table / user profile column (more flexible, supports future users with different conversion dates without code change). User confirmed the date is fixed for their own holdings; first-user-only context makes hardcode defensible.
2. **Zamiana carryover units**: the 30 NEW units issued on 2024-11-07 need to be in the dashboard sum somewhere. Cleanest options: (a) extend the parser to capture the Zamiana row's target-side units as a synthetic `source='carryover'` row (would require a new enum value + non-zero units with `gross_amount=0`); (b) hardcode them as a constant in the dashboard query; (c) model an `opening_balances` side table keyed to user + fund + date. Each touches a different surface.

**Out of scope for this change** (per the reframe): touching `src/lib/allianz/parse.ts` to drop rows, adding `fund_id` to the `transactions` table (that's the v2 multi-fund deferral the PRD §Non-Goals already names), or migrating existing rows.

## References

- Source files inspected: `src/lib/allianz/parse.ts:64,106`, `src/lib/allianz/categorise.ts`, `src/pages/api/transactions/import.ts:26-31`, `src/pages/dashboard.astro:22-26,44-46`, `src/pages/api/prices/fetch.ts`, `src/lib/analizy/types.ts:1-3`, `supabase/migrations/20260625101139_create_transactions.sql:5-14`, `tests/fixtures/allianz-sample.csv`
- Project context: `README.md:199,215`, `context/foundation/prd.md:53,86,91,94,97,111,126`, `context/foundation/roadmap.md:95-103`, `context/foundation/lessons.md`
- Sibling change: `context/changes/fetch-fund-price/plan-brief.md:76-79`
- Investigation tasks: Task #5
