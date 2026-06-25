import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

interface SupabaseStatus {
  API_URL: string;
  ANON_KEY: string;
  SERVICE_ROLE_KEY: string;
  DB_URL: string;
  JWT_SECRET: string;
}

async function readSupabaseStatus(): Promise<SupabaseStatus> {
  const res = await new Promise<{ stdout: string; code: number }>((resolveStatus, rejectStatus) => {
    const child = spawn("npx", ["supabase", "status", "-o", "json"], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (c: Buffer) => {
      stdout += c.toString();
    });
    child.on("error", rejectStatus);
    child.on("close", (code) => {
      resolveStatus({ stdout, code: code ?? 1 });
    });
  });
  if (res.code !== 0) throw new Error(`supabase status failed (code ${String(res.code)})`);
  return JSON.parse(res.stdout) as SupabaseStatus;
}

async function ensureSupabaseRunning(): Promise<SupabaseStatus> {
  const status = await readSupabaseStatus();
  const probe = await fetch(`${status.API_URL}/auth/v1/health`).catch(() => null);
  if (probe?.ok) return status;

  await new Promise<void>((resolveStart, rejectStart) => {
    const child = spawn("npx", ["supabase", "start"], { stdio: "inherit" });
    child.on("error", rejectStart);
    child.on("close", (code) => {
      if (code === 0) resolveStart();
      else rejectStart(new Error(`supabase start exited ${String(code)}`));
    });
  });
  const fresh = await readSupabaseStatus();
  for (let i = 0; i < 30; i++) {
    const r = await fetch(`${fresh.API_URL}/auth/v1/health`).catch(() => null);
    if (r?.ok) return fresh;
    await sleep(1000);
  }
  throw new Error("Supabase auth never became healthy after start");
}

async function buildIfMissing(): Promise<void> {
  if (existsSync(resolve("dist/server/entry.mjs"))) return;
  await new Promise<void>((resolveBuild, rejectBuild) => {
    const child = spawn("npm", ["run", "build"], { stdio: "inherit" });
    child.on("error", rejectBuild);
    child.on("close", (code) => {
      if (code === 0) resolveBuild();
      else rejectBuild(new Error(`build exited ${String(code)}`));
    });
  });
}

async function waitForServer(url: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await fetch(url, { redirect: "manual" }).catch(() => null);
    if (r && r.status < 500) return;
    await sleep(300);
  }
  throw new Error(`server never became healthy at ${url}`);
}

const PORT = 4321;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default async function setup() {
  const status = await ensureSupabaseRunning();
  await buildIfMissing();

  process.env.SUPABASE_URL = status.API_URL;
  process.env.SUPABASE_KEY = status.ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY;
  process.env.TEST_BASE_URL = BASE_URL;

  // wrangler dev runs the same workerd runtime production uses; --var overrides
  // anything in .dev.vars so tests target the local Supabase, not the hosted one.
  const wrangler = spawn(
    "npx",
    [
      "wrangler",
      "dev",
      "--port",
      String(PORT),
      "--ip",
      "127.0.0.1",
      "--var",
      `SUPABASE_URL:${status.API_URL}`,
      "--var",
      `SUPABASE_KEY:${status.ANON_KEY}`,
    ],
    { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } },
  );
  // Consume stdout so the OS pipe never fills (~64KB) and blocks wrangler.
  // We don't echo it (too noisy) but the bytes must be read.
  wrangler.stdout.on("data", () => {
    /* drain */
  });
  // Forward stderr unconditionally with a prefix — regex filtering on
  // "error" loses useful diagnostics (warnings, "Address in use") and
  // echoes benign substrings.
  wrangler.stderr.on("data", (chunk: Buffer) => {
    process.stderr.write(`[wrangler] ${chunk.toString()}`);
  });

  try {
    await waitForServer(`${BASE_URL}/auth/signin`);
  } catch (e) {
    wrangler.kill("SIGTERM");
    throw e;
  }

  return async () => {
    wrangler.kill("SIGTERM");
    await sleep(300);
  };
}
