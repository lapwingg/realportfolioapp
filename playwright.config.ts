import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:4321";
const STORAGE_STATE = "playwright/.auth/user.json";
const PORT = new URL(BASE_URL).port || "4321";

// Mirror the integration cookbook (test-plan §6.7) — `astro dev` + Astro 6.4.8
// + `@astrojs/cloudflare` has a persistent "module is not defined" reload bug,
// so the E2E webServer runs `wrangler dev` against the built `dist/` instead.
// Build is skipped when the entrypoint is already present so warm reuse stays
// near-zero overhead; cold start is ~30s.
const needsBuild = !existsSync(resolve("dist/server/entry.mjs"));
const WEB_SERVER_COMMAND = `${needsBuild ? "npm run build && " : ""}npx wrangler dev --port ${PORT} --ip 127.0.0.1`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: WEB_SERVER_COMMAND,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
