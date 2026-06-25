// Risk #1 (test-plan §2): "A signed-in user fetches or dashboards another
// user's PPK transactions or scenario amounts (RLS misconfig, wrong Supabase
// client wrapper, or middleware bypass on an API route)."
//
// Browser-level lock on top of tests/integration/risk-01-rls-route-leak.test.ts.
// The integration test proves the route returns the right SSR markers; this
// spec proves the full Astro SSR + workerd + browser pipeline renders them
// the same way an end-user would see.
//
// Load-bearing assertion shape (paraphrased from the integration test):
//   1. EMPTY_STATE_MARKER must be visible (state === "no_transactions").
//   2. PRICE_PROMPT_MARKER must NOT be visible. This is the negative signal
//      that catches an actual RLS leak — if B's rows leak to A, unitsSum > 0,
//      state flips to "no_price" (no price snapshot is seeded), and the
//      price-prompt marker would render. Presence-only assertions silent-pass
//      on a broken seed; the absence of the leak marker is what fails loudly.
//
// Mutation drill: change `transactions_select_own` USING from
// `auth.uid() = user_id` to `true` (or drop the policy) in Supabase Studio
// or via migration, re-run this spec. Expectation: the PRICE_PROMPT_MARKER
// .not.toBeVisible() assertion fires. Revert when done.

import { test, expect } from "@playwright/test";
import { EMPTY_STATE_MARKER, PRICE_PROMPT_MARKER } from "../../src/lib/dashboard/markers";
import { createSignedInUser, deleteUser, type TestUser } from "../_helpers/session";
import { seedTransactionsAs } from "../_helpers/seed";

test.describe("Risk #1 — cross-account dashboard isolation", () => {
  let userB: TestUser;

  test.beforeEach(async () => {
    userB = await createSignedInUser();
    await seedTransactionsAs(userB, "tests/fixtures/allianz-sample.csv");
  });

  test.afterEach(async () => {
    await deleteUser(userB.userId);
  });

  test("user A does not see user B's PPK transactions on the dashboard", async ({ page }) => {
    const runId = Date.now();
    test.info().annotations.push({ type: "run-id", description: String(runId) });
    test.info().annotations.push({ type: "ephemeral-user-b", description: userB.userId });

    await page.goto("/dashboard");

    await expect(page.getByText(EMPTY_STATE_MARKER)).toBeVisible();
    await expect(page.getByText(PRICE_PROMPT_MARKER)).not.toBeVisible();
  });
});
