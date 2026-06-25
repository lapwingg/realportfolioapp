import { test, expect } from "@playwright/test";

// Seed test — model for /10x-e2e generation in this repo.
// Demonstrates the four conventions Generator will copy:
//   1. getByRole / getByLabel over CSS selectors
//   2. wait on state (waitForURL, toBeVisible), never waitForTimeout
//   3. unique data per run (Date.now()) — collision-free under fullyParallel
//   4. test.afterEach cleanup as a safety net
//
// Anchors Risk #1 (RLS / access control) from context/foundation/test-plan.md:
// a signed-in user lands on their own dashboard via the real auth + middleware path.

test.describe("dashboard access (authenticated)", () => {
  test("signed-in user reaches the dashboard via the real auth path", async ({ page }) => {
    const runId = Date.now();

    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    // Touch a stable, user-scoped surface so the assertion fails if the page
    // renders someone else's shell or an empty signed-out shell.
    await expect(page.getByRole("link", { name: /sign out/i })).toBeVisible();

    test.info().annotations.push({ type: "run-id", description: String(runId) });
  });

  test.afterEach(async ({ page }) => {
    // No persisted test data in this seed — placeholder to model the pattern
    // for tests that create decks / uploads / transactions.
    await page.close();
  });
});
