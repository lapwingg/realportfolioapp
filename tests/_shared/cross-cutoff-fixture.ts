// Worked example for Risk #4 (test-plan §2): cross-cutoff fund-conversion
// valuation. The hand-computed EXPECTED_UNITS_SUM below is derived directly
// from `tests/fixtures/cross-cutoff-history.csv` by applying the documented
// rules — it is NOT lifted from `src/lib/valuation/compute.ts` output, which
// is the explicit anti-pattern called out in test-plan §2 Risk #4 guidance.
//
// Hand computation against tests/fixtures/cross-cutoff-history.csv:
//
//   Parser/categoriser produces these public.transactions rows:
//     a) 2024-01-15, source='own',       units=10  (Pierwsze nabycie singleton)
//     b) 2024-11-07, source='carryover', units=100 (Zamiana → carryover row,
//                                                   target units 100; the
//                                                   Zamiana itself contributes
//                                                   no `own`/`employer` row.)
//     c) 2024-12-15, source='own',       units=4   (Kolejne nabycie, larger of pair)
//     d) 2024-12-15, source='employer',  units=1   (Kolejne nabycie, smaller)
//
//   computeValuation contract: cutoffDate = max(carryover.transaction_date)
//     → cutoffDate = "2024-11-07".
//   unitsSum: every row with transaction_date >= cutoffDate.
//     → (b) 100 + (c) 4 + (d) 1 = 105.
//
//   The 2024-01-15 row is correctly excluded — it predates the conversion
//   and its value has been rolled into the 2024-11-07 carryover.
//
// SEED_PRICE is the value `scripts/seed-e2e-primary.ts` upserts into
// `price_snapshots` for TICKER, so the dashboard's valuation = SEED_PRICE
// × EXPECTED_UNITS_SUM and the rendered PLN string is fully deterministic.

export const FIXTURE_PATH = "tests/fixtures/cross-cutoff-history.csv";

export const EXPECTED_UNITS_SUM = 105;

export const SEED_PRICE = 100.0;

export const EXPECTED_CUTOFF_DATE = "2024-11-07";
