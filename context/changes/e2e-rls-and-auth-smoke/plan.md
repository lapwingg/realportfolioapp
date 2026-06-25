# E2E smoke for auth boundary and RLS isolation — Implementation Plan

## Overview

Add two Playwright E2E specs (`risk-01-cross-account.spec.ts`, `risk-04-cross-cutoff-valuation.spec.ts`) that lock the two highest-impact browser-level risks from `context/foundation/test-plan.md` § 2 — cross-account data exposure (#1) and cross-cutoff fund-conversion valuation (#4). The work also pivots the existing E2E webServer config to match the integration-test setup (`wrangler dev` against built `dist/`), extracts the load-bearing dashboard marker strings into a single source of truth shared with the integration test, and wires the suite into CI as a required gate. This closes `test-plan.md` § 3 Phase 4 (Quality-gates wiring + e2e smoke) for the two named risks.

## Current State Analysis

- **Playwright scaffolding exists and is correct in shape.** `playwright.config.ts:1-33` defines a `setup` project plus a `chromium` project consuming `storageState: playwright/.auth/user.json`; `tests/e2e/auth.setup.ts:9-27` drives a real signin via `getByLabel("Email")` / `getByLabel("Password")` / `getByRole("button", { name: "Sign in" })`, waits for `**/dashboard`, and persists state. `tests/e2e/seed.spec.ts:14-27` is the conventions reference (getByRole, state-waits, unique IDs, afterEach cleanup). `npm run test:e2e` exists in `package.json:17`. Playwright 1.61.1 is already in devDependencies.
- **webServer is currently `npm run dev` (`astro dev`)** at `playwright.config.ts:28`. The integration cookbook recorded a hard pivot away from `astro dev` for the same Astro 6.4.8 + `@astrojs/cloudflare` combo because of a persistent "module is not defined" reload error (`test-plan.md:179`). The E2E config has not yet absorbed that lesson; the same failure mode is expected for browser-driven runs.
- **Risk #1 is already covered at the integration layer** at `tests/integration/risk-01-rls-route-leak.test.ts:51-72`. The assertion shape is two markers: positive `"zaimportuj plik transakcji"` (no_transactions state, `dashboard.astro:184`) AND negative `"Pobierz cenę, aby zobaczyć wycenę portfela."` (price-prompt absence, `dashboard.astro:196`). The negative signal is what makes the test catch a real RLS leak — if B's rows leak to A, `unitsSum > 0` (`dashboard.astro:72`), state flips to `no_price`, and the price-prompt renders. The header comment documents a mutation drill (flip `transactions_select_own` USING to `true`) that proves the test fails for the right reason.
- **The integration session helper is reusable but currently lives under `tests/integration/_helpers/session.ts`** — `createSignedInUser()`, `accessTokenFromCookie()`, and `countOwnTransactions()`. The same helper (admin-create user + sign in via `@supabase/ssr` capturing-cookie adapter + return Cookie header) is the foundation E2E needs for ephemeral user B.
- **Risk #1 seed pattern is proven**: `seedTransactionsAs()` in the integration test POSTs `tests/fixtures/allianz-sample.csv` to `/api/transactions/import` with the user's cookie and expects a 301/302/303 redirect. E2E will reuse the fixture and the pattern verbatim.
- **Risk #4 dashboard surfaces** for assertion: `dashboard.astro:206` renders `{currencyFmt.format(valuation)}` (a `pl-PL` PLN currency format), `dashboard.astro:208` renders `{unitsFmt.format(unitsSum)} szt. × {priceFmt.format(latestPrice)} PLN`, and `dashboard.astro:219-223` renders `"Wycena uwzględnia jednostki od konwersji z dnia <date>."` when `cutoffDate !== null`. The cutoff-aware text is the perfect E2E hook for cross-cutoff regressions; it only appears when the cross-cutoff code path is alive.
- **Valuation = `latestPrice * unitsSum`** (`dashboard.astro:66`). To assert a deterministic PLN value the test must control both inputs: the transactions (Phase 2 fixture) and the price (pre-seeded `price_snapshots` row). The dashboard reads `price_snapshots` directly on SSR (`dashboard.astro:42-53`), so a Playwright `page.route()` interception of `/api/prices/fetch` would not affect the initial render — DB seed is the only correct layer.
- **Test-plan Phase 2 (`testing-tax-math-hardening`)** is producing the cross-cutoff worked-example fixture and the hand-computed expected valuation as the unit-test oracle for `computeValuation`. Per § 2 Risk #4 anti-pattern, deriving a second oracle from `computeValuation` itself is forbidden ("asserting against a snapshot whose expected value was lifted from the current implementation"). The E2E test depends on the Phase 2 fixture + value as its single source of truth.
- **CI integration baseline**: `test-plan.md:120-123` lists the E2E gate as currently `optional, deferred to §3 Phase 4`. Phase 1 of the rollout already wires the local Supabase stack into CI (`test-plan.md:146` notes "CI does it in `.github/workflows/ci.yml`"), so the E2E job can reuse the same stack-startup path — no new infrastructure question.
- **Service-role DML constraint** (`test-plan.md:180`): the project does not grant `service_role` DML on `public.transactions`. This rules out direct admin inserts for user-scoped transaction data and forces the seed-via-authenticated-POST pattern (already accepted via Q3). `price_snapshots` is reference data, not user-scoped, so admin insert there is fine.

## Desired End State

- `tests/e2e/risk-01-cross-account.spec.ts` and `tests/e2e/risk-04-cross-cutoff-valuation.spec.ts` exist, pass locally against `npm run test:e2e`, and both fail correctly under the documented mutation drills (RLS policy flip for #1; naive SUM substitution for #4).
- `playwright.config.ts` `webServer` runs `wrangler dev` against `dist/` (with a `npm run build` precondition baked into the command), aligning with the integration setup.
- Dashboard marker strings used by both integration and E2E live in a single module under `src/lib/` (or a `tests/_shared/` analogue) and are imported by both suites — copy-edit drift on one suite is impossible.
- The reusable admin/session helper is accessible from both `tests/integration/` and `tests/e2e/` (single source of truth — extracted to `tests/_helpers/` or equivalent shared location).
- `.env.example` documents the five env vars the E2E suite needs: `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`, `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- `scripts/seed-e2e-primary.ts` (or equivalent npm script) idempotently loads the Phase 2 cross-cutoff fixture into the fixed primary E2E account and inserts a known `price_snapshots` row; safe to re-run.
- `.github/workflows/ci.yml` runs `npx playwright install --with-deps chromium` and `npm run test:e2e` after the integration job. The job consumes GH Actions secrets for the five env vars. The gate is **required** (not `continue-on-error`), updating `test-plan.md` § 5 from `optional` → `required` for Phase 4.

### Verification

- `npm run test:e2e` exits 0 on a clean checkout with env vars set and `supabase start` running.
- Manually editing the `transactions_select_own` policy USING clause to `true` causes `risk-01-cross-account.spec.ts` to fail with a `not.toContain` mismatch on the price-prompt marker.
- Manually changing `computeValuation` to ignore the cutoff (naive SUM) causes `risk-04-cross-cutoff-valuation.spec.ts` to fail with a `toHaveText` mismatch on the rendered PLN value.
- A PR opened against `main` runs the e2e job and blocks merge on failure.

## What We're NOT Doing

- **Risk #2 (tax math correctness)** — covered by Phase 2 unit tests against external worked-example oracles. E2E would lie about correctness here.
- **Risk #5 (analizy.pl scraper)** — covered by the nightly shape probe per test-plan § 5. The Risk #4 spec deliberately pre-seeds `price_snapshots` instead of clicking "Pobierz cenę" so it never touches the live scraper.
- **Risk #6 (Workers 10ms CPU limit)** — only observable under `wrangler dev --remote` with realistic synthetic history; outside the browser-E2E concern.
- **The "optional happy-path smoke" mentioned in test-plan § 3 Phase 4** ("sign-in → upload → dashboard renders all three scenarios"). Out of scope per the change.md; open a separate change folder if/when desired.
- **Visual / pixel-diff or vision-model checks.** Repo guidance is deterministic assertions over text/role markers; no `--caps=vision` work here.
- **A new migration granting `service_role` DML on `public.transactions`.** The seed-via-authenticated-POST pattern already proven by the integration test makes this unnecessary for E2E.
- **Browser projects other than chromium.** Matches existing config; multi-browser sweep is not a stated risk.
- **Cleanup of `auth.users` rows for ephemeral B accounts beyond `afterEach` admin-delete.** No global sweep job is added; if delete fails the row remains, but UUID emails prevent collisions on re-runs.

## Implementation Approach

The plan ships in four phases. Phase 1 puts shared infrastructure in place (webServer pivot, shared markers, shared helper, env contract) so Phases 2 and 3 can each be a single focused spec. Phase 2 is Risk #1 — ephemeral B per test, mirror the integration assertion shape. Phase 3 is Risk #4 — depends on the test-plan Phase 2 fixture/oracle landing first; the spec asserts a hand-computed PLN value against the deterministic `pre-seeded price × Phase-2 unitsSum`. Phase 4 wires the suite into CI as a required gate (deferred until 2 and 3 are green locally so we don't gate PRs on a still-flaky suite).

Each spec is paired with a documented mutation drill in its header comment — the same convention the integration test uses (`risk-01-rls-route-leak.test.ts:30-31`). Reviewers can flip the named code path and prove the test fails for the right reason.

## Critical Implementation Details

### Timing & lifecycle

- The `wrangler dev` webServer needs the built `dist/` to exist. Playwright's `webServer.command` must therefore run build-then-serve (e.g. `npm run build && wrangler dev`) or rely on a `predev` script; the integration global-setup already proves this works (`test-plan.md:148`: "`globalSetup` runs `npm run build` if `dist/server/entry.mjs` is missing"). Mirror that check rather than re-building unconditionally — first run is ~30s, subsequent reuse is near-zero.
- `auth.setup.ts` runs once per Playwright invocation (the `setup` project is a dependency of `chromium`) and writes `storageState`. The fixed primary account A is signed in there; ephemeral B is created **inside** each Risk #1 spec via `beforeEach` and never gets a storageState entry — B's cookie is used only for the seed POST, not for browser-driven navigation.

### State sequencing

- **Phase 4 must not flip the CI gate to required until Phases 2 and 3 are both passing locally for at least one full run.** Gating PRs on a still-flaky suite damages trust in the gate. Land Phase 4 as `continue-on-error: true` first, observe one or two CI runs, then remove the flag in a follow-up commit.
- Phase 3 is **blocked on Phase 2 of the test-plan rollout** (`testing-tax-math-hardening`) producing the cross-cutoff fixture + hand-computed expected valuation. If that change is not yet at "implementing" or later, Phase 3 of this plan pauses and the spec file is not created; Phases 1, 2, and 4-without-Risk-#4 can proceed.

### Debug & observability

- Each spec header comment names: (1) the test-plan risk it anchors, (2) the load-bearing assertion(s) and why, (3) the mutation drill that proves the test fails for the right reason. Reviewers should be able to read the header and reproduce the mutation drill without reading the test body.
- On CI failure, Playwright traces are configured `on-first-retry` (`playwright.config.ts:14`); retries are 2 on CI (`playwright.config.ts:10`). The `github` reporter (`playwright.config.ts:11`) surfaces failures in the PR check annotations directly.

## Phase 1: Test infrastructure (webServer pivot + shared helpers + env contract)

### Overview

Align E2E with the integration setup so the suite actually runs reliably. Extract the load-bearing pieces (marker strings, admin/session helpers) so they live in exactly one place and stay in lockstep across integration + E2E.

### Changes Required:

#### 1. Pivot Playwright webServer to `wrangler dev` against `dist/`

**File**: `playwright.config.ts`

**Intent**: Replace the `astro dev` webServer with the same `wrangler dev` against built `dist/` pattern the integration cookbook adopted (`test-plan.md:179`). Avoid the documented Astro 6.4.8 + `@astrojs/cloudflare` reload bug; bring E2E closer to production (real workerd).

**Contract**: The `webServer.command` builds `dist/` if missing then starts `wrangler dev`, listens on the same `BASE_URL` (`http://localhost:4321` by default), exits cleanly under `reuseExistingServer`. `webServer.url` and `BASE_URL` semantics unchanged. No change to the `projects` array, `storageState`, `setup` dependency, or `chromium` config.

#### 2. Extract load-bearing dashboard marker strings to a shared module

**File**: `src/lib/dashboard/markers.ts` (new) — imported by `tests/integration/risk-01-rls-route-leak.test.ts` AND the new `tests/e2e/risk-01-cross-account.spec.ts`.

**Intent**: Single source of truth for the two load-bearing Polish copy strings (`EMPTY_STATE_MARKER`, `PRICE_PROMPT_MARKER`). Any copy-edit to `dashboard.astro:184` or `:196` must update this module, which both test layers consume — drift between integration and E2E becomes impossible.

**Contract**: Module exports two `const` strings whose values match `dashboard.astro:184` (`"zaimportuj plik transakcji"`) and `dashboard.astro:196` (`"Pobierz cenę, aby zobaczyć wycenę portfela."`). Existing integration test refactored to import from this module instead of redefining locals.

#### 3. Extract the admin/session helper to a shared `tests/_helpers/` location

**File**: `tests/_helpers/session.ts` (new path; or symlink/move from `tests/integration/_helpers/session.ts`). The integration test imports update to the new path; new E2E specs import from the same module.

**Intent**: One implementation of `createSignedInUser()`, `accessTokenFromCookie()`, `countOwnTransactions()`, and a new `deleteUser(userId)` for `afterEach` cleanup. Reusing the integration helper guarantees E2E and integration go through the same `@supabase/ssr` capturing-cookie path; cookie shape drift is impossible.

**Contract**: Same public API as today plus a new `deleteUser(userId: string): Promise<void>` that uses the admin client to `auth.admin.deleteUser(userId)`. Throws on failure. Caller is responsible for invoking it (typically `test.afterEach`).

#### 4. Seed helper for posting a CSV as a given user

**File**: `tests/_helpers/seed.ts` (new). Used by Risk #1 spec.

**Intent**: Reusable wrapper around the seed pattern in `risk-01-rls-route-leak.test.ts:41-49` — read a fixture CSV, POST to `/api/transactions/import` with the user's cookie, assert redirect status.

**Contract**: `seedTransactionsAs(user: TestUser, fixturePath: string): Promise<void>`. Throws on non-3xx response.

#### 5. Document the env contract in `.env.example`

**File**: `.env.example`

**Intent**: Make the required E2E env vars discoverable without reading the test code. Distinguish the long-lived primary account vars (`E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`) from the admin/test-Supabase plumbing (`SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).

**Contract**: Add five commented entries with one-line descriptions and a note that all five must be set before `npm run test:e2e`. No real values committed.

### Success Criteria:

#### Automated Verification:

- `npm run build` succeeds
- `npx playwright test --list` enumerates the existing `seed.spec.ts` against the new wrangler webServer without startup error
- `npm run test:integration` still passes after the marker + helper refactor (no regression at the integration layer)
- `npm run lint` passes
- `npm run test` (Vitest unit project) passes — confirms `src/lib/dashboard/markers.ts` doesn't break the unit project glob

#### Manual Verification:

- A single `npx playwright test seed.spec.ts` run with env vars set completes against `wrangler dev`, not `astro dev`, and exits 0
- `.env.example` lists all 5 E2E env vars with descriptions
- `tests/integration/risk-01-rls-route-leak.test.ts` imports `EMPTY_STATE_MARKER` and `PRICE_PROMPT_MARKER` from the new shared module (no local re-declaration)

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Risk #1 spec — cross-account dashboard isolation

### Overview

Add the browser-level lock for Risk #1. Primary account A (storageState) navigates to `/dashboard`; per-test ephemeral B is admin-created and seeded with the existing Allianz fixture. The two-marker assertion shape from the integration test is mirrored verbatim.

### Changes Required:

#### 1. Risk #1 E2E spec

**File**: `tests/e2e/risk-01-cross-account.spec.ts` (new)

**Intent**: Browser-level proof that a signed-in user does not see another user's PPK transactions on the dashboard. The spec is the lock on top of the integration test — it asserts the same RLS protection holds through the full Astro SSR + browser pipeline, not just the route-level fetch.

**Contract**:
- Single `test.describe("Risk #1 — cross-account dashboard isolation", ...)` with one `test()` body.
- `beforeEach`: call `createSignedInUser()` → user B; call `seedTransactionsAs(userB, "tests/fixtures/allianz-sample.csv")`. Capture B's `userId` on the test context for cleanup.
- Body: `await page.goto("/dashboard")`; assert `page.getByText(EMPTY_STATE_MARKER)` is visible AND `page.getByText(PRICE_PROMPT_MARKER)` is NOT visible (use `await expect(...).not.toBeVisible()` with the documented intent that the absence is the load-bearing signal). Annotate the test with the run UUID and B's userId for traceability.
- `afterEach`: call `deleteUser(userB.userId)`.
- Header comment naming: (a) the test-plan Risk #1 line, (b) why the negative marker assertion is load-bearing (paraphrase `risk-01-rls-route-leak.test.ts:19-24`), (c) mutation drill: change `transactions_select_own` USING to `true`, expect price-prompt-absent assertion fires.

### Success Criteria:

#### Automated Verification:

- `npm run test:e2e -- risk-01-cross-account.spec.ts` exits 0 locally with env vars set
- `npm run lint` passes
- Test does not call `page.waitForTimeout()` anywhere (grep guard)
- Test uses `getByText` / `getByRole` only — no CSS selectors or XPath
- The new spec exists at `tests/e2e/risk-01-cross-account.spec.ts`

#### Manual Verification:

- Mutation drill: temporarily edit the `transactions_select_own` RLS policy USING clause to `true` (or drop the policy), re-run the spec, confirm it fails on the price-prompt-absent assertion (NOT on the positive empty-state assertion — that would be a different bug). Revert.
- After successful drill, verify `tests/integration/risk-01-rls-route-leak.test.ts` still passes (RLS policy reverted correctly)
- Ephemeral B users are deleted after the test (spot-check Supabase auth.users — count stable across 3 runs)

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that the mutation drill behaved as documented before proceeding to Phase 3.

---

## Phase 3: Risk #4 spec — cross-cutoff dashboard valuation

### Overview

Add the browser-level lock for Risk #4. The fixed primary account A is one-shot seeded with the cross-cutoff fixture (from test-plan Phase 2 — `testing-tax-math-hardening`) and a known price snapshot. The spec asserts the dashboard renders the hand-computed PLN valuation exactly.

**Blocked on**: test-plan rollout Phase 2 producing `tests/fixtures/cross-cutoff-history.csv` (or equivalent) and an exported hand-computed `EXPECTED_UNITS_SUM` constant.

### Changes Required:

#### 1. One-shot E2E primary-account seed script

**File**: `scripts/seed-e2e-primary.ts` (new). Wired as `npm run seed:e2e` in `package.json`.

**Intent**: Idempotently load the cross-cutoff fixture into the fixed primary E2E account's transactions and insert a known `price_snapshots` row. Safe to re-run before any `npm run test:e2e` invocation. Used both by developers locally and by CI Phase 4.

**Contract**:
- Reads env: `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`, `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Resolves the primary user's `userId` via admin client.
- Truncates the primary user's `public.transactions` rows (scoped by `user_id` via the authenticated REST path — service-role has no DML grant per `test-plan.md:180`), then POSTs the cross-cutoff fixture via `/api/transactions/import` with the primary's cookie (reuse `seedTransactionsAs`).
- Upserts a single `price_snapshots` row for `TICKER` with a known fixed price (e.g. `100.0000`) — admin client OK here, reference-data table.
- Idempotent: re-running produces identical DB state.
- Exits non-zero on failure.

#### 2. Cross-cutoff valuation constants module (shared with Phase 2 unit test)

**File**: `tests/_shared/cross-cutoff-fixture.ts` (new — or import from wherever test-plan Phase 2 places it; coordinate with that change).

**Intent**: Single export of the hand-computed `EXPECTED_UNITS_SUM` and the fixture file path. The Phase 2 unit test and this E2E spec both import from here — oracle drift impossible.

**Contract**: `export const EXPECTED_UNITS_SUM: number` (hand-computed, with a code comment citing the source worked example), `export const FIXTURE_PATH: string`, `export const SEED_PRICE: number` (the fixed price used by `seed-e2e-primary.ts`). E2E spec computes its expected PLN value as `SEED_PRICE * EXPECTED_UNITS_SUM` formatted via `pl-PL` currency.

#### 3. Risk #4 E2E spec

**File**: `tests/e2e/risk-04-cross-cutoff-valuation.spec.ts` (new)

**Intent**: Browser-level proof that the dashboard correctly computes and renders the valuation for a holder whose history crosses the 2024-11-07 OLD→NEW Zamiana cutoff. Locks the Phase 2 unit-test oracle into the rendered UI surface.

**Contract**:
- Pre-test (in `beforeAll` or via documented prerequisite): `npm run seed:e2e` has been run; this resets the primary user's transactions to the cross-cutoff fixture and sets the known price.
- Single `test()` body: `await page.goto("/dashboard")`; assert the main valuation surface contains the hand-computed PLN value formatted via `Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" })`. Use a locator scoped to the valuation `<p>` (it's a unique `.text-3xl.font-bold.tabular-nums` inside the valuation `<section>` — prefer `getByText(expectedPln)` with `.first()` since the rendered formatted PLN string is unique on the page).
- Also assert the cutoff-aware sub-text matches the regex `/Wycena uwzględnia jednostki od konwersji z dnia .+/` (proves the cross-cutoff code path is alive, not a naive SUM that happens to coincide).
- Header comment naming: (a) test-plan Risk #4 line, (b) explicit citation that the expected value comes from the Phase 2 unit-test oracle (NEVER lifted from `computeValuation` itself — anti-pattern per test-plan § 2), (c) mutation drill: change `computeValuation` to a naive SUM ignoring cutoff, expect the `toHaveText` assertion fires (and the cutoff sub-text assertion also fires if `cutoffDate` becomes null).

### Success Criteria:

#### Automated Verification:

- `npm run seed:e2e` exits 0 on a clean primary account
- `npm run seed:e2e && npm run test:e2e -- risk-04-cross-cutoff-valuation.spec.ts` exits 0 locally
- `npm run lint` passes
- Re-running `npm run seed:e2e` twice in a row produces the same DB state (idempotency check via a small query script or manual SQL)
- The spec does not import from `src/lib/valuation/compute.ts` (grep guard — proves the oracle is NOT lifted from the implementation)

#### Manual Verification:

- Mutation drill: temporarily edit `computeValuation` to a naive SUM (ignore the cutoff), re-run `npm run test:e2e -- risk-04-cross-cutoff-valuation.spec.ts`, confirm it fails on the `toHaveText` assertion. Revert.
- Confirm the expected PLN value in the spec was computed by hand from the Phase 2 worked example and not pasted from a `console.log` of `computeValuation` output
- Visually open `/dashboard` as the primary E2E user post-seed and verify the rendered numbers match what the spec asserts

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that the mutation drill behaved as documented before proceeding to Phase 4.

---

## Phase 4: CI gating

### Overview

Wire the E2E suite into `.github/workflows/ci.yml` so the two risk specs run on every PR. Land first as `continue-on-error: true`, observe one or two runs, then flip to required.

### Changes Required:

#### 1. New CI job: E2E

**File**: `.github/workflows/ci.yml`

**Intent**: Run `npm run test:e2e` after unit + integration succeed. Reuse the existing Supabase-stack startup the integration job already performs (per `test-plan.md:146` / `:148`). Configure as a separate job (parallel where possible — only dependency is integration's stack/migrations being healthy) or as an additional step on the integration job; pick whichever fits the existing workflow shape with the least surface change.

**Contract**:
- Step 1: install Chromium for Playwright (`npx playwright install --with-deps chromium`).
- Step 2: ensure built `dist/` (the webServer command will build if missing, but explicit `npm run build` first is faster and surfaces build errors before the browser starts).
- Step 3: run `npm run seed:e2e` (Phase 3 prereq; harmless idempotent operation for Phase 1+2-only runs).
- Step 4: run `npm run test:e2e`.
- Env block: pulls all 5 vars from GitHub Actions secrets (`E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`, `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) plus whatever `SUPABASE_KEY` shape the local stack exposes — reuse the integration job's env block as the source pattern.
- Upload Playwright report on failure (artifact) for triage.
- Initially `continue-on-error: true`; remove in follow-up commit after 2 green CI runs.

#### 2. Secrets documentation (README or CI doc)

**File**: `README.md` (or whichever CI doc the repo uses; check before writing — if no CI doc exists, add a brief "### CI secrets" section to `README.md`).

**Intent**: A future maintainer setting up a fork or new CI environment can find what secrets the E2E job needs without grepping the workflow file.

**Contract**: A short list of the 5 secrets with one-line descriptions and a pointer to the seed script + test plan. No values, just names and purpose.

### Success Criteria:

#### Automated Verification:

- A PR opened against `main` (or `develop`, whichever is the integration target) triggers the e2e job and it completes
- The e2e job artifacts include the Playwright HTML report (visible on failure for triage)
- `actionlint` (if used) reports no errors on the new workflow steps
- Running `npm run test:e2e` locally with the documented env vars + a running `supabase start` matches the CI invocation exactly

#### Manual Verification:

- One CI run completes with the e2e job green
- The e2e job is observable in the PR's checks list with a clear job name
- After 2 green runs, flip `continue-on-error: false` (or remove the line) and confirm the next PR's merge is blocked when the e2e job fails (intentionally break a spec to verify)
- README / CI doc lists all 5 required secrets with descriptions

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before declaring the change complete and moving to `/10x-archive`.

---

## Testing Strategy

### Unit Tests

- N/A for this change. New code is test infrastructure (helpers, seed script, markers module). The markers module is trivially exercised by both integration and E2E suites; the seed script is exercised by Phase 3 and Phase 4 verification.

### Integration Tests

- `tests/integration/risk-01-rls-route-leak.test.ts` must continue to pass after Phase 1's marker + helper refactor. This is the regression guard for the refactor.

### E2E Tests (this change)

- `tests/e2e/risk-01-cross-account.spec.ts` — Risk #1, ephemeral B, two-marker assertion.
- `tests/e2e/risk-04-cross-cutoff-valuation.spec.ts` — Risk #4, fixed-primary seeded fixture, deterministic PLN valuation assertion.

### Manual Testing Steps

1. Phase 1: open `/dashboard` in a real browser after the wrangler dev pivot, confirm signin + dashboard render unchanged from the user perspective.
2. Phase 2 mutation drill: flip the `transactions_select_own` RLS USING to `true`, re-run the Risk #1 spec, confirm failure on the price-prompt-absent assertion.
3. Phase 3 mutation drill: replace `computeValuation` with a naive SUM, re-run the Risk #4 spec, confirm failure on the `toHaveText` assertion.
4. Phase 4: intentionally break a spec locally, push, confirm the CI e2e job fails the PR check.

## Performance Considerations

- The wrangler-dev startup with build adds ~30s to the first CI run; subsequent in-job invocations reuse the same server (Playwright's `webServer.reuseExistingServer`). Total e2e job runtime target: ≤ 2 min on cold cache, ≤ 1 min on warm.
- Per-test ephemeral B creation adds ~1–2s per Risk #1 spec invocation (admin createUser + signin + POST seed). Acceptable for a single-spec risk; consider batching if more cross-account specs are added later.

## Migration Notes

- No schema changes. No data migration. No rollback risk on the application code path.
- The Phase 1 marker extraction is a refactor — if it's reverted, both integration and E2E continue to work as long as the local marker strings are re-introduced in `risk-01-rls-route-leak.test.ts`.
- Reverting Phase 4 (CI gating) is a single workflow-file edit; the specs continue to be runnable locally with `npm run test:e2e`.

## References

- Change: `context/changes/e2e-rls-and-auth-smoke/change.md`
- Anchor: `context/foundation/test-plan.md` § 2 Risk #1 + § 2 Risk #4 + § 3 Phase 4 + § 5 e2e gate row + § 6.7 Phase 1 webServer pivot lesson (line 179)
- Reference integration test: `tests/integration/risk-01-rls-route-leak.test.ts:51-72` (assertion shape + seed pattern)
- Reference helper: `tests/integration/_helpers/session.ts:33-63` (admin-create + sign-in via `@supabase/ssr`)
- Reference seed pattern: `tests/integration/risk-01-rls-route-leak.test.ts:41-49`
- Dashboard markers in code: `src/pages/dashboard.astro:184` (empty state), `:196` (price prompt), `:206` (valuation render), `:219-223` (cutoff sub-text)
- Conventions reference E2E: `tests/e2e/seed.spec.ts:14-27`
- Auth setup: `tests/e2e/auth.setup.ts:9-27`
- Playwright config: `playwright.config.ts:1-33`
- Cross-phase dependency: test-plan rollout Phase 2 (`testing-tax-math-hardening`) — provides cross-cutoff fixture + hand-computed `EXPECTED_UNITS_SUM`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Test infrastructure

#### Automated

- [x] 1.1 `npm run build` succeeds
- [x] 1.2 `npx playwright test --list` enumerates `seed.spec.ts` against wrangler webServer without startup error
- [x] 1.3 `npm run test:integration` passes after marker + helper refactor
- [x] 1.4 `npm run lint` passes
- [x] 1.5 `npm run test` (Vitest unit project) passes

#### Manual

- [x] 1.6 `npx playwright test seed.spec.ts` completes against `wrangler dev` and exits 0
- [x] 1.7 `.env.example` lists all 5 E2E env vars with descriptions
- [x] 1.8 `tests/integration/risk-01-rls-route-leak.test.ts` imports markers from shared module

### Phase 2: Risk #1 spec — cross-account dashboard isolation

#### Automated

- [ ] 2.1 `npm run test:e2e -- risk-01-cross-account.spec.ts` exits 0
- [ ] 2.2 `npm run lint` passes
- [ ] 2.3 No `page.waitForTimeout()` in the spec (grep guard)
- [ ] 2.4 Only `getByText` / `getByRole` locators in the spec (no CSS/XPath)
- [ ] 2.5 `tests/e2e/risk-01-cross-account.spec.ts` exists

#### Manual

- [ ] 2.6 RLS-policy-flip mutation drill: spec fails on price-prompt-absent assertion
- [ ] 2.7 Integration test still passes after policy revert
- [ ] 2.8 Ephemeral B users deleted after the test (auth.users count stable across 3 runs)

### Phase 3: Risk #4 spec — cross-cutoff dashboard valuation

#### Automated

- [ ] 3.1 `npm run seed:e2e` exits 0 on a clean primary account
- [ ] 3.2 `npm run seed:e2e && npm run test:e2e -- risk-04-cross-cutoff-valuation.spec.ts` exits 0
- [ ] 3.3 `npm run lint` passes
- [ ] 3.4 Re-running `npm run seed:e2e` is idempotent (DB state unchanged)
- [ ] 3.5 Spec does NOT import from `src/lib/valuation/compute.ts` (grep guard — oracle independence)

#### Manual

- [ ] 3.6 Naive-SUM mutation drill: spec fails on `toHaveText` assertion
- [ ] 3.7 Expected PLN value confirmed hand-computed from the Phase 2 worked example (not lifted from `computeValuation` output)
- [ ] 3.8 Dashboard visually renders the asserted numbers post-seed

### Phase 4: CI gating

#### Automated

- [ ] 4.1 PR triggers the e2e job and it completes
- [ ] 4.2 Playwright HTML report uploaded as artifact on failure
- [ ] 4.3 `actionlint` (if used) reports no errors on the new workflow
- [ ] 4.4 Local invocation matches CI invocation exactly

#### Manual

- [ ] 4.5 One CI run completes with the e2e job green
- [ ] 4.6 E2e job visible in PR checks with a clear name
- [ ] 4.7 After 2 green runs, `continue-on-error` removed and an intentional failure blocks PR merge
- [ ] 4.8 README / CI doc lists all 5 required secrets
