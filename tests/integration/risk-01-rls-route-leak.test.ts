// Risk #1 (test-plan §2): "A signed-in user fetches or dashboards another
// user's PPK transactions or scenario amounts (RLS misconfig, wrong Supabase
// client wrapper, or middleware bypass on an API route)."
//
// What would prove protection (test-plan §2 Risk Response Guidance):
// "Signed in as user A, every read endpoint and dashboard SSR returns zero
//  rows when only user B's data exists; a direct API call from A's session
//  against B-scoped resources returns nothing."
//
// This test seeds B's rows via B's own authenticated route call (the project
// has not granted service_role direct DML on `public.transactions`, so the
// admin client is not a usable seed path — we instead pose as user B for the
// seed, which is also a more realistic shape: the data got there through the
// same path real users use).
//
// We then assert TWO independent signals on A's dashboard:
//   1. The empty-state marker is present (state === "no_transactions").
//   2. The price-prompt marker is ABSENT (state === "no_price" would render
//      it). This is the load-bearing negative signal — if RLS leaks B's
//      rows to A, dashboard.astro:73 computes unitsSum > 0, state flips to
//      "no_price" (no price snapshot is seeded), and the price-prompt
//      marker appears. The presence-only assertion alone would silent-pass
//      on a broken seed or a queryError; the absence of the leak marker
//      catches the actual failure mode.
//
// Preconditions are asserted before the dashboard fetch to prove the test's
// premise (B has rows, A is empty) instead of trusting the seed silently.
//
// Mutation drill: change `transactions_select_own` USING from
// `auth.uid() = user_id` to `true` (or drop the policy). Re-run.
// Expectation: PRICE_PROMPT_MARKER absence assertion fires.

import { readFile } from "node:fs/promises";
import { describe, it, expect } from "vitest";
import { fetchRoute } from "./_helpers/server";
import { createSignedInUser, countOwnTransactions, type TestUser } from "./_helpers/session";

const EMPTY_STATE_MARKER = "zaimportuj plik transakcji";
const PRICE_PROMPT_MARKER = "Pobierz cenę, aby zobaczyć wycenę portfela.";

async function seedTransactionsAs(user: TestUser): Promise<void> {
  const csv = await readFile("tests/fixtures/allianz-sample.csv", "utf8");
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), "allianz.csv");
  const res = await fetchRoute("/api/transactions/import", { method: "POST", body: form, cookie: user.cookie });
  if (![301, 302, 303].includes(res.status)) {
    throw new Error(`seed via /api/transactions/import failed for ${user.email}: status ${String(res.status)}`);
  }
}

describe("Risk #1 — RLS leak at the route layer", () => {
  it("user A with no own rows sees the empty state and never B's leak markers", async () => {
    const [userA, userB] = await Promise.all([createSignedInUser(), createSignedInUser()]);
    await seedTransactionsAs(userB);

    // Preconditions — without these, the test could silent-pass on a broken
    // seed (B has 0 rows → A trivially sees empty state, regardless of RLS).
    const bRowCount = await countOwnTransactions(userB);
    expect(bRowCount, "seed precondition: B must have rows for this test to be meaningful").toBeGreaterThan(0);
    const aRowCount = await countOwnTransactions(userA);
    expect(aRowCount, "isolation precondition: A must start empty").toBe(0);

    const res = await fetchRoute("/dashboard", { cookie: userA.cookie });
    expect(res.status).toBe(200);
    const body = await res.text();

    expect(body, "A's dashboard must render the empty-state marker").toContain(EMPTY_STATE_MARKER);
    expect(
      body,
      "A's dashboard must NOT render the price-prompt marker — its presence means dashboard saw rows (RLS leak)",
    ).not.toContain(PRICE_PROMPT_MARKER);
  });
});
