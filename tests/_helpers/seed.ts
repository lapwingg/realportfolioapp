import { readFile } from "node:fs/promises";
import type { TestUser } from "./session";

const DEFAULT_BASE_URL = "http://localhost:4321";

function baseUrl(): string {
  return process.env.TEST_BASE_URL ?? process.env.E2E_BASE_URL ?? DEFAULT_BASE_URL;
}

/**
 * Seed transactions for a user by POSTing a CSV fixture through
 * `/api/transactions/import` as that user — the same path real uploads use.
 * Project does not grant service_role DML on `public.transactions`, so the
 * authenticated route is the only practical seed path. Mirrors the pattern in
 * `tests/integration/risk-01-rls-route-leak.test.ts` and is reused by E2E.
 *
 * Throws on any non-3xx response (the import endpoint redirects on success).
 */
export async function seedTransactionsAs(user: TestUser, fixturePath: string): Promise<void> {
  const csv = await readFile(fixturePath, "utf8");
  const form = new FormData();
  const filename = fixturePath.split("/").pop() ?? "fixture.csv";
  form.append("file", new Blob([csv], { type: "text/csv" }), filename);

  const base = baseUrl();
  const res = await fetch(new URL("/api/transactions/import", base), {
    method: "POST",
    body: form,
    headers: {
      Cookie: user.cookie,
      Origin: base,
    },
    redirect: "manual",
  });
  if (![301, 302, 303].includes(res.status)) {
    const text = await res.text().catch(() => "");
    throw new Error(`seed via /api/transactions/import failed for ${user.email}: status ${String(res.status)} ${text}`);
  }
}
