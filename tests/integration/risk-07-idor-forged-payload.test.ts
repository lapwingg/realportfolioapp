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
// the form. The success-path redirect URL distinguishes "route ignored
// field" (returns `/setup?imported=N&skipped=M`) from "RLS rejected batch"
// (returns `/setup?error=...`) — both produce a 303, so the URL is the
// signal.
//
// Mutation drill (verified 2026-06-25): edit import.ts to copy
// `form.get("user_id")` into the payload's `user_id` field; rebuild; rerun.
// Expectation: the redirect URL becomes `/setup?error=...` (RLS denies the
// batch because forged `user_id !== auth.uid()`), the success-path
// assertion fires red. Without this assertion the test would still catch
// the regression — but via `countA > 0` failing for the wrong reason (RLS
// denial of the entire batch). Asserting the success URL keeps the
// route-layer vs DB-layer distinction visible.

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

    // Success-path redirect signature: `/setup?imported=N&skipped=M`. Any
    // other redirect (especially `/setup?error=...`) means the route
    // attempted to use the forged `user_id` and the DB layer rejected the
    // batch — a regression we want loud.
    const location = res.headers.get("Location") ?? "";
    expect(
      location,
      "route must produce success-path redirect; an error redirect means the route attempted to use the forged user_id",
    ).toMatch(/^\/setup\?imported=\d+(&skipped=\d+)?$/);

    // Each user counts their own rows via their own RLS-scoped session.
    // B should have zero (the forged payload was ignored); A should have > 0.
    const countB = await countOwnTransactions(userB);
    expect(countB, "no rows must land under B from A's forged request").toBe(0);
    const countA = await countOwnTransactions(userA);
    expect(countA, "A's rows must land under A").toBeGreaterThan(0);
  });
});
