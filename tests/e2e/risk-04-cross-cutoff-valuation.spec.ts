// Risk #4 (test-plan §2): "A user with fund-conversion history that crosses
// the 2024-11-07 OLD→NEW Zamiana cutoff sees an incorrect dashboard SUM
// because the server-side calculation drops or double-counts the carryover."
//
// Browser-level lock on the cross-cutoff valuation. The fixed primary E2E
// account A is one-shot seeded by `npm run seed:e2e` with
// `tests/fixtures/cross-cutoff-history.csv` and a known SEED_PRICE row in
// `price_snapshots`. The spec asserts the dashboard renders the
// hand-computed PLN valuation (SEED_PRICE × EXPECTED_UNITS_SUM) exactly.
//
// Oracle source: EXPECTED_UNITS_SUM comes from `tests/_shared/cross-cutoff-fixture.ts`,
// hand-computed from the fixture CSV and the documented carryover rules.
// It is NOT lifted from the dashboard's `computeValuation` output — that is
// the explicit anti-pattern called out in test-plan §2 Risk #4 guidance
// ("asserting against a snapshot whose expected value was lifted from the
// current implementation"). The unit test in the testing-tax-math-hardening
// change consumes the same constant; oracle drift is impossible.
//
// Mutation drill: replace `computeValuation` with a naive
// `rows.reduce((s, r) => s + Number(r.units), 0)` ignoring the cutoff.
// Expectation: the rendered PLN assertion below fires (naive SUM would be
// 10 + 100 + 4 + 1 = 115 units → 11 500 PLN, not the expected 10 500 PLN).
// The cutoff-aware sub-text regex assertion also fires because the
// dashboard suppresses that block when `cutoffDate` is null.

import { test, expect } from "@playwright/test";
import { EXPECTED_UNITS_SUM, SEED_PRICE } from "../_shared/cross-cutoff-fixture";

const PLN = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });

test.describe("Risk #4 — cross-cutoff dashboard valuation", () => {
  test("dashboard renders SEED_PRICE × EXPECTED_UNITS_SUM with cutoff sub-text", async ({ page }) => {
    const expectedPln = PLN.format(SEED_PRICE * EXPECTED_UNITS_SUM);

    await page.goto("/dashboard");

    await expect(page.getByText(expectedPln).first()).toBeVisible();
    await expect(page.getByText(/Wycena uwzględnia jednostki od konwersji z dnia .+/)).toBeVisible();
  });
});
