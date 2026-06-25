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
// same path real users use). Then we ask for /dashboard as user A and assert
// the dashboard shows the "no transactions" empty-state marker rendered by
// src/pages/dashboard.astro. If RLS leaks, A would see B's data and the
// marker would be replaced by scenario rendering.

import { readFile } from "node:fs/promises";
import { describe, it, expect } from "vitest";
import { fetchRoute } from "./_helpers/server";
import { createSignedInUser, type TestUser } from "./_helpers/session";

const EMPTY_STATE_MARKER = "zaimportuj plik transakcji";

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
  it("user A with no own rows sees the empty state, even when user B has data", async () => {
    const [userA, userB] = await Promise.all([createSignedInUser(), createSignedInUser()]);
    await seedTransactionsAs(userB);

    const res = await fetchRoute("/dashboard", { cookie: userA.cookie });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body, "dashboard for A must show empty-state marker, not B's data").toContain(EMPTY_STATE_MARKER);
  });
});
