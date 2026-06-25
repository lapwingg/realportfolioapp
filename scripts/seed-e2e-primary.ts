// One-shot seed script for the fixed primary E2E account (Risk #4 spec).
// Idempotent: resets the primary user's transactions to the cross-cutoff
// fixture and upserts a known `price_snapshots` row so the dashboard
// valuation = SEED_PRICE × EXPECTED_UNITS_SUM is fully deterministic.
//
// Used by:
//   - developers locally before `npm run test:e2e`
//   - CI (.github/workflows/ci.yml) as a step preceding the e2e job
//
// Required env: E2E_TEST_EMAIL, E2E_TEST_PASSWORD.
// Optional env: SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY.
//   If any of the SUPABASE_* vars are missing, they're auto-populated from
//   `npx supabase status -o json` so a developer with the local stack
//   running only needs to set the two E2E_TEST_* vars.
// The primary user is auto-created on first run if it doesn't exist yet.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { TICKER } from "../src/lib/analizy/types";
import { FIXTURE_PATH, SEED_PRICE } from "../tests/_shared/cross-cutoff-fixture";
import { seedTransactionsAs } from "../tests/_helpers/seed";
import { accessTokenFromCookie, type TestUser } from "../tests/_helpers/session";

interface SupabaseStatus {
  API_URL: string;
  ANON_KEY: string;
  SERVICE_ROLE_KEY: string;
}

function ensureSupabaseEnv(): void {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return;
  }
  const res = spawnSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(
      `SUPABASE_URL / SUPABASE_KEY / SUPABASE_SERVICE_ROLE_KEY not set and "npx supabase status -o json" failed (exit ${String(res.status)}). Start the local stack with "npx supabase start" or export the vars manually.`,
    );
  }
  const status = JSON.parse(res.stdout) as SupabaseStatus;
  process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? status.API_URL;
  process.env.SUPABASE_KEY = process.env.SUPABASE_KEY ?? status.ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? status.SERVICE_ROLE_KEY;
}

function req(name: string): string {
  const v = process.env[name];
  if (!v) {
    if (name === "E2E_TEST_EMAIL" || name === "E2E_TEST_PASSWORD") {
      throw new Error(
        `${name} not set. Export both before running:\n` +
          `  export E2E_TEST_EMAIL="e2e-primary@example.com"\n` +
          `  export E2E_TEST_PASSWORD="$(uuidgen)"\n` +
          `(The account is auto-created on first run.)`,
      );
    }
    throw new Error(`${name} not set`);
  }
  return v;
}

function adminClient() {
  return createAdminClient(req("SUPABASE_URL"), req("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const admin = adminClient();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const match = data.users.find((u) => u.email === email);
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function ensurePrimaryUser(email: string, password: string): Promise<void> {
  const existing = await findUserIdByEmail(email);
  if (existing) return;
  const admin = adminClient();
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`admin createUser(${email}) failed: ${error.message}`);
  process.stdout.write(`created primary user ${email}\n`);
}

async function signInPrimary(): Promise<TestUser> {
  const email = req("E2E_TEST_EMAIL");
  const password = req("E2E_TEST_PASSWORD");
  const url = req("SUPABASE_URL");
  const key = req("SUPABASE_KEY");

  await ensurePrimaryUser(email, password);

  const userId = await findUserIdByEmail(email);
  if (!userId) throw new Error(`primary user vanished after create — race?`);

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
  if (signInErr) {
    throw new Error(
      `signInWithPassword(${email}) failed: ${signInErr.message}. If the account exists with a different password, reset it in Supabase Studio or run \`npx supabase auth admin update-user-by-email ${email} --password ...\`.`,
    );
  }
  if (captured.length === 0) throw new Error("sign-in produced no cookies");
  const cookie = captured.map(({ name, value }) => `${name}=${encodeURIComponent(value)}`).join("; ");
  return { userId, email, cookie };
}

async function resetPrimaryTransactions(user: TestUser): Promise<void> {
  // service_role has no DML grant on public.transactions (test-plan §6.7) —
  // only `authenticated` does (migration 20260625110531). Delete through the
  // PostgREST authenticated path with the user's own access token; RLS scopes
  // the delete to their own rows.
  const url = req("SUPABASE_URL");
  const key = req("SUPABASE_KEY");
  const token = await accessTokenFromCookie(user.cookie);
  // PostgREST requires an explicit filter on DELETE — use the always-true
  // `id=not.is.null` predicate; RLS still scopes to the caller's rows.
  const res = await fetch(`${url}/rest/v1/transactions?id=not.is.null`, {
    method: "DELETE",
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      Prefer: "return=minimal",
    },
  });
  if (!res.ok) {
    throw new Error(`delete transactions for ${user.userId} failed: ${String(res.status)} ${await res.text()}`);
  }
}

async function upsertSeedPrice(user: TestUser): Promise<void> {
  // Same service-role DML constraint as transactions — go through the
  // authenticated PostgREST path. Idempotent: clear prior rows for this
  // user/ticker, then insert one fresh. Dashboard reads `latest by fetched_at`.
  const url = req("SUPABASE_URL");
  const key = req("SUPABASE_KEY");
  const token = await accessTokenFromCookie(user.cookie);
  const headers = {
    apikey: key,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
  const delRes = await fetch(`${url}/rest/v1/price_snapshots?ticker=eq.${encodeURIComponent(TICKER)}`, {
    method: "DELETE",
    headers,
  });
  if (!delRes.ok) throw new Error(`clear price_snapshots failed: ${String(delRes.status)} ${await delRes.text()}`);

  const insRes = await fetch(`${url}/rest/v1/price_snapshots`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ticker: TICKER, price: SEED_PRICE }),
  });
  if (!insRes.ok) throw new Error(`insert price_snapshots failed: ${String(insRes.status)} ${await insRes.text()}`);
}

const APP_BASE_URL = process.env.TEST_BASE_URL ?? process.env.E2E_BASE_URL ?? "http://127.0.0.1:4321";

async function probeServer(): Promise<boolean> {
  try {
    const r = await fetch(`${APP_BASE_URL}/auth/signin`, { redirect: "manual" });
    return r.status < 500;
  } catch {
    return false;
  }
}

function ensureBuild(): void {
  if (existsSync(resolve("dist/server/entry.mjs"))) return;
  process.stdout.write("building dist/ …\n");
  const r = spawnSync("npm", ["run", "build"], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`npm run build exited ${String(r.status)}`);
}

async function bootWrangler(): Promise<ChildProcess> {
  ensureBuild();
  const port = new URL(APP_BASE_URL).port || "4321";
  process.stdout.write(`booting wrangler dev on 127.0.0.1:${port} …\n`);
  const child = spawn(
    "npx",
    [
      "wrangler",
      "dev",
      "--port",
      port,
      "--ip",
      "127.0.0.1",
      "--var",
      `SUPABASE_URL:${req("SUPABASE_URL")}`,
      "--var",
      `SUPABASE_KEY:${req("SUPABASE_KEY")}`,
    ],
    { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } },
  );
  child.stdout.on("data", () => {
    /* drain */
  });
  child.stderr.on("data", (chunk: Buffer) => {
    process.stderr.write(`[wrangler] ${chunk.toString()}`);
  });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await probeServer()) return child;
    await sleep(300);
  }
  child.kill("SIGTERM");
  throw new Error("wrangler dev never became healthy");
}

async function main(): Promise<void> {
  ensureSupabaseEnv();
  // Pin the seed helper to the same URL we probe / boot — avoids IPv4/IPv6
  // mismatches between 127.0.0.1 and localhost when astro dev is also running.
  process.env.TEST_BASE_URL = APP_BASE_URL;

  let wrangler: ChildProcess | null = null;
  if (!(await probeServer())) {
    wrangler = await bootWrangler();
  } else {
    process.stdout.write(`reusing existing server at ${APP_BASE_URL}\n`);
  }

  try {
    const user = await signInPrimary();
    await resetPrimaryTransactions(user);
    await seedTransactionsAs(user, FIXTURE_PATH);
    await upsertSeedPrice(user);
    process.stdout.write(`seeded primary user ${user.email} (${user.userId}) with ${FIXTURE_PATH}\n`);
  } finally {
    if (wrangler) {
      wrangler.kill("SIGTERM");
      await sleep(300);
    }
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`seed-e2e-primary failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
