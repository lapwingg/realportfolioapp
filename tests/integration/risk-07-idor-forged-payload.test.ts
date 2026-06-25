// Risk #7 (test-plan §2): "An API write route trusts a client-supplied
// `user_id` on insert/update (IDOR-style) — RLS does not protect against
// rows whose user_id is forged into a payload sent by an authenticated user."
//
// What would prove protection (test-plan §2 Risk Response Guidance):
// "API route handler ignores any `user_id` field on the request body and
//  derives identity from the server session; a forged-payload request from
//  user A's session never produces a row owned by user B."
//
// src/pages/api/transactions/import.ts derives identity from the
// @supabase/ssr server client (A's cookie) and does not read `user_id` from
// the form. This test is the regression lock — if a future change starts
// trusting form `user_id`, B's own-row count goes from 0 to non-zero and
// this fails.

import { readFile } from "node:fs/promises";
import { describe, it, expect } from "vitest";
import { fetchRoute } from "./_helpers/server";
import { createSignedInUser, countOwnTransactions } from "./_helpers/session";

describe("Risk #7 — IDOR via forged user_id in request payload", () => {
  it("forged user_id is ignored; rows land under the session user, not the forged one", async () => {
    const [userA, userB] = await Promise.all([createSignedInUser(), createSignedInUser()]);
    const csv = await readFile("tests/fixtures/allianz-sample.csv", "utf8");

    const form = new FormData();
    form.append("file", new Blob([csv], { type: "text/csv" }), "allianz.csv");
    // The attack: A is the authenticated user but tries to land rows under B.
    form.append("user_id", userB.userId);

    const res = await fetchRoute("/api/transactions/import", {
      method: "POST",
      body: form,
      cookie: userA.cookie,
    });
    expect([301, 302, 303]).toContain(res.status);

    // Each user counts their own rows via their own RLS-scoped session.
    // B should have zero (the forged payload was ignored); A should have > 0.
    const countB = await countOwnTransactions(userB);
    expect(countB, "no rows must land under B from A's forged request").toBe(0);
    const countA = await countOwnTransactions(userA);
    expect(countA, "A's rows must land under A").toBeGreaterThan(0);
  });
});
