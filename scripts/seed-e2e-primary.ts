// One-shot seed script for the fixed primary E2E account (Risk #4 spec).
// Idempotent: resets the primary user's transactions to the cross-cutoff
// fixture and upserts a known `price_snapshots` row so the dashboard
// valuation = SEED_PRICE × EXPECTED_UNITS_SUM is fully deterministic.
//
// Used by:
//   - developers locally before `npm run test:e2e`
//   - CI (.github/workflows/ci.yml) as a step preceding the e2e job
//
// Reads: E2E_TEST_EMAIL, E2E_TEST_PASSWORD, SUPABASE_URL, SUPABASE_KEY,
//        SUPABASE_SERVICE_ROLE_KEY.

import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { TICKER } from "../src/lib/analizy/types";
import { FIXTURE_PATH, SEED_PRICE } from "../tests/_shared/cross-cutoff-fixture";
import { seedTransactionsAs } from "../tests/_helpers/seed";
import type { TestUser } from "../tests/_helpers/session";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not set`);
  return v;
}

async function signInPrimary(): Promise<TestUser> {
  const email = req("E2E_TEST_EMAIL");
  const password = req("E2E_TEST_PASSWORD");
  const url = req("SUPABASE_URL");
  const key = req("SUPABASE_KEY");
  const serviceRoleKey = req("SUPABASE_SERVICE_ROLE_KEY");

  const admin = createAdminClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Resolve userId — list pages until found. Test stack so size is tiny.
  let userId: string | null = null;
  for (let page = 1; page <= 50 && !userId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const match = data.users.find((u) => u.email === email);
    if (match) userId = match.id;
    if (data.users.length < 200) break;
  }
  if (!userId) throw new Error(`primary user not found for email=${email} — create the account first`);

  const captured: { name: string; value: string }[] = [];
  const signInClient = createServerClient(url, key, {
    cookies: {
      getAll: () => [],
      setAll: (toSet) => {
        for (const { name, value } of toSet) captured.push({ name, value });
      },
    },
  });
  const { error: signInErr } = await signInClient.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`signInWithPassword failed: ${signInErr.message}`);
  if (captured.length === 0) throw new Error("sign-in produced no cookies");
  const cookie = captured.map(({ name, value }) => `${name}=${encodeURIComponent(value)}`).join("; ");
  return { userId, email, cookie };
}

async function resetPrimaryTransactions(user: TestUser): Promise<void> {
  // service_role has bypassrls and DOES have DELETE grant on public.transactions
  // (per supabase/migrations/20260625110531_grant_authenticated_privileges.sql).
  const admin = createAdminClient(req("SUPABASE_URL"), req("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin.from("transactions").delete().eq("user_id", user.userId);
  if (error) throw new Error(`delete transactions for ${user.userId} failed: ${error.message}`);
}

async function upsertSeedPrice(user: TestUser): Promise<void> {
  const admin = createAdminClient(req("SUPABASE_URL"), req("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // Idempotent: clear prior rows for this user/ticker, then insert one fresh.
  // The dashboard reads `latest by fetched_at` so a single row is sufficient.
  const { error: delErr } = await admin
    .from("price_snapshots")
    .delete()
    .eq("user_id", user.userId)
    .eq("ticker", TICKER);
  if (delErr) throw new Error(`clear price_snapshots failed: ${delErr.message}`);
  const { error: insErr } = await admin
    .from("price_snapshots")
    .insert({ user_id: user.userId, ticker: TICKER, price: SEED_PRICE });
  if (insErr) throw new Error(`insert price_snapshots failed: ${insErr.message}`);
}

async function main(): Promise<void> {
  const user = await signInPrimary();
  await resetPrimaryTransactions(user);
  await seedTransactionsAs(user, FIXTURE_PATH);
  await upsertSeedPrice(user);
  process.stdout.write(`seeded primary user ${user.email} (${user.userId}) with ${FIXTURE_PATH}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`seed-e2e-primary failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
