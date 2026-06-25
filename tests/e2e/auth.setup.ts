import { test as setup, expect } from "@playwright/test";
import path from "node:path";

const STORAGE_STATE = path.join("playwright", ".auth", "user.json");

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;

setup("authenticate", async ({ page }) => {
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      "E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set before running E2E tests. " +
        "Use a dedicated Supabase test account, not your personal one.",
    );
  }

  await page.goto("/auth/signin");

  // Use role=textbox to disambiguate from the "Show password" toggle button,
  // which has aria-label="Show password" and would otherwise match getByLabel.
  await page.getByRole("textbox", { name: "Email" }).fill(EMAIL);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForURL("**/dashboard", { timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.context().storageState({ path: STORAGE_STATE });
});
