// Risk #3 (test-plan §2): "Re-uploading the same Allianz file, or two
// overlapping files, silently creates duplicate transactions or merges
// wrong, corrupting every downstream number."
//
// What would prove protection (test-plan §2 Risk Response Guidance):
// "Re-uploading a byte-identical file twice leaves row count unchanged;
//  uploading file B which overlaps A produces the union, not duplicates and
//  not missing rows."
//
// Dedupe is enforced by a composite UNIQUE constraint on
// (user_id, transaction_date, source, units, gross_amount) in
// supabase/migrations/20260625101139_create_transactions.sql, exercised by
// the upsert in src/pages/api/transactions/import.ts via
// onConflict + ignoreDuplicates. These tests drive the real route end-to-end
// and read counts back through the same authenticated REST path.

import { readFile } from "node:fs/promises";
import { describe, it, expect, beforeAll } from "vitest";
import { fetchRoute } from "./_helpers/server";
import { createSignedInUser, countOwnTransactions, type TestUser } from "./_helpers/session";

const FIXTURE_PATH = "tests/fixtures/allianz-sample.csv";

async function postImport(user: TestUser, csv: string, fileName = "allianz.csv"): Promise<Response> {
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), fileName);
  return fetchRoute("/api/transactions/import", { method: "POST", body: form, cookie: user.cookie });
}

describe("Risk #3 — Allianz import dedupe at the route layer", () => {
  let originalCsv: string;
  beforeAll(async () => {
    originalCsv = await readFile(FIXTURE_PATH, "utf8");
  });

  it("re-uploading a byte-identical file leaves the row count unchanged", async () => {
    const user = await createSignedInUser();

    const first = await postImport(user, originalCsv);
    expect([301, 302, 303]).toContain(first.status);
    const after1 = await countOwnTransactions(user);
    expect(after1, "first import must produce > 0 rows").toBeGreaterThan(0);

    const second = await postImport(user, originalCsv);
    expect([301, 302, 303]).toContain(second.status);
    const after2 = await countOwnTransactions(user);
    expect(after2, "byte-identical re-upload must not add rows").toBe(after1);
  });

  it("uploading an overlapping file produces the union, not duplicates", async () => {
    const user = await createSignedInUser();
    const lines = originalCsv.split(/\r?\n/);
    const header = lines[0];
    const dataLines = lines.slice(1).filter((l) => l.trim().length > 0);

    const keep = dataLines.slice(0, Math.ceil(dataLines.length / 2));
    const fresh =
      "2024-12-10;FIX-NEW;2024-12-15;Pierwsze nabycie;Kwota;111,11;111,11;7,7700;;Allianz Plan Emerytalny 2055;;Zrealizowane";
    const overlapCsv = [header, ...keep, fresh].join("\n") + "\n";

    const first = await postImport(user, originalCsv, "original.csv");
    expect([301, 302, 303]).toContain(first.status);
    const afterOriginal = await countOwnTransactions(user);

    const second = await postImport(user, overlapCsv, "overlap.csv");
    expect([301, 302, 303]).toContain(second.status);
    const afterOverlap = await countOwnTransactions(user);

    expect(afterOverlap - afterOriginal, "overlap import should add exactly one new row").toBe(1);
  });
});
