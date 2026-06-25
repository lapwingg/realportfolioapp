import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export interface TestUser {
  userId: string;
  email: string;
  cookie: string;
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not set — globalSetup did not run?`);
  return v;
}

function adminClient() {
  return createAdminClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Create a confirmed user via the admin API, sign them in through the SAME
 * `@supabase/ssr` cookie path the production server uses, and return the
 * serialized Cookie header that subsequent `fetch` calls should send.
 *
 * Using `createServerClient` with a capturing cookie adapter guarantees the
 * cookie format matches whatever `@supabase/ssr` writes today — if it ever
 * changes shape across versions, this helper updates with the SDK, not behind
 * its back.
 */
export async function createSignedInUser(): Promise<TestUser> {
  const supabaseAdmin = adminClient();
  const email = `test-${randomUUID()}@example.com`;
  const password = randomUUID();

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) {
    throw new Error(`admin createUser failed: ${createErr.message}`);
  }
  const userId = created.user.id;

  const captured: { name: string; value: string }[] = [];
  const signInClient = createServerClient(env("SUPABASE_URL"), env("SUPABASE_KEY"), {
    cookies: {
      getAll: () => [],
      setAll: (toSet) => {
        for (const { name, value } of toSet) captured.push({ name, value });
      },
    },
  });
  const { error: signInErr } = await signInClient.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`signInWithPassword failed: ${signInErr.message}`);
  if (captured.length === 0) throw new Error("sign-in produced no cookies — @supabase/ssr contract broken?");

  const cookie = captured.map(({ name, value }) => `${name}=${encodeURIComponent(value)}`).join("; ");
  return { userId, email, cookie };
}

function parseCookieHeader(cookie: string): { name: string; value: string }[] {
  return cookie
    .split(";")
    .map((s) => s.trim())
    .filter((p) => p.length > 0)
    .map((p) => {
      const eq = p.indexOf("=");
      if (eq < 0) return { name: p, value: "" };
      return { name: p.slice(0, eq), value: decodeURIComponent(p.slice(eq + 1)) };
    });
}

/**
 * Pull the access_token out of an auth cookie by handing the cookies back
 * to `@supabase/ssr` and asking for the session — same SDK that wrote them.
 * Handles cookie chunking (`…auth-token.0`, `.1`) without us re-implementing
 * the chunk-reassembly logic. If the SDK ever changes its on-the-wire shape,
 * this stays correct because both write and read go through the SDK.
 */
export async function accessTokenFromCookie(cookie: string): Promise<string> {
  const cookies = parseCookieHeader(cookie);
  const readClient = createServerClient(env("SUPABASE_URL"), env("SUPABASE_KEY"), {
    cookies: {
      getAll: () => cookies,
      setAll: () => {
        /* no-op */
      },
    },
  });
  const { data, error } = await readClient.auth.getSession();
  if (error) throw new Error(`getSession failed: ${error.message}`);
  if (!data.session?.access_token) throw new Error("no access_token in session — sign-in incomplete?");
  return data.session.access_token;
}

/**
 * Count rows in `public.transactions` visible to this user via the real
 * authenticated REST path. RLS scopes the count to the caller's own rows —
 * by design, exactly what risk tests need.
 */
export async function countOwnTransactions(user: TestUser): Promise<number> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error("supabase env not set");
  const token = await accessTokenFromCookie(user.cookie);
  const res = await fetch(`${url}/rest/v1/transactions?select=id`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      Prefer: "count=exact",
      "Range-Unit": "items",
      Range: "0-0",
    },
  });
  if (!res.ok && res.status !== 206) {
    throw new Error(`count failed: ${String(res.status)} ${await res.text()}`);
  }
  const range = res.headers.get("content-range");
  if (!range) throw new Error(`no content-range header`);
  const total = Number(range.split("/")[1]);
  if (Number.isNaN(total)) throw new Error(`bad content-range: ${range}`);
  return total;
}
