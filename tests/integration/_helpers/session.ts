import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export interface TestUser {
  userId: string;
  email: string;
  cookie: string;
  supabaseAdmin: ReturnType<typeof createAdminClient>;
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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  return { userId, email, cookie, supabaseAdmin };
}
