# Testing Bootstrap — Critical Path Implementation Plan

## Overview

Phase 1 of the project's test rollout (`context/foundation/test-plan.md` §3). Install Vitest, build the integration harness, write three route-layer integration tests that defend Risks #1 (RLS leak), #3 (Allianz dedupe), and #7 (IDOR via forged `user_id`), wire everything as a required CI gate on `master`, and fill in the §6.1 + §6.2 cookbook entries so future contributors can add unit and integration tests without re-deriving the patterns.

## Current State Analysis

- **No JS/TS test runner.** `package.json` has lint, build, format, and four ad-hoc `verify-*.ts` scripts run via `tsx`. No Vitest, no Jest, no test scripts.
- **One DB-layer test exists.** `supabase/tests/rls_isolation.test.sql` is a pgTAP file that proves the `transactions` and `price_snapshots` RLS policies deny cross-user reads, updates, deletes, and forged-INSERTs at the database layer. It uses `SET LOCAL ROLE authenticated` + `request.jwt.claim.sub` to impersonate users. It runs via `supabase test db` but is not wired into CI.
- **CI runs lint + build only.** `.github/workflows/ci.yml` targets `master`, runs `npm run lint` then `npm run build`. The `deploy` job runs `wrangler deploy` on push to `master`. No test step, no Supabase service.
- **Supabase local stack is one command away.** `supabase` CLI is a devDep; `supabase/config.toml` defines ports 54321 (API) / 54322 (DB).
- **Risk #3 dedupe is at the DB-constraint layer.** `src/pages/api/transactions/import.ts:46` calls `supabase.from("transactions").upsert(payload, { onConflict: "user_id,transaction_date,source,units,gross_amount", ignoreDuplicates: true })` — the dedupe key is the composite unique constraint defined in the `transactions` migration.
- **Risk #1 and #7 live at the route layer.** Middleware (`src/middleware.ts:6`) calls `supabase.auth.getUser()` per request and sets `context.locals.user`. Routes and SSR pages read it. The pgTAP test proves *the policies* are correct; it does NOT prove *the routes use the right Supabase client*. That gap is what the new integration tests close.
- **Transactions are read via SSR, not a JSON endpoint.** `grep` of `from("transactions")` in `src/` returns `dashboard.astro`, `setup.astro`, and `import.ts` (the writer). Risk #1's route-layer test must therefore fetch a page (e.g. `/dashboard`) and inspect the response body, not call a non-existent `GET /api/transactions`.
- **Fixtures already live under `tests/fixtures/`** (`allianz-sample.csv`, `allianz-malformed.csv`, `analizy-sample.html`). Vitest can reuse these.
- **Default branch is `master`.** Not `main`. All CI gates and PR rules use `master`.

## Desired End State

- `npm test`, `npm run test:integration`, and `npm run test:all` run locally. The first runs the co-located unit suite; the second boots `supabase start` (if not already up) and the Astro SSR entry, then runs `tests/integration/**/*.test.ts`; the third runs both.
- A protected `/dashboard` fetch with user A's cookies never returns a string that appears in user B's seeded data, and vice versa.
- Re-uploading a byte-identical Allianz file via `POST /api/transactions/import` leaves the row count unchanged for that user; uploading a partial-overlap file produces the set union — no duplicates and no missing rows.
- A `POST /api/transactions/import` request whose multipart form (or any payload field) names `user_id: <user B>` while signed in as user A produces zero rows owned by user B in the database.
- `supabase test db` runs the pgTAP file in CI; failure blocks merge to `master`.
- The CI job runs `lint → build → npm test → npm run test:integration → supabase test db`, all required before merge; the deploy job continues to gate on the full CI pass.
- `context/foundation/test-plan.md` §6.1 and §6.2 are filled in with the file location, naming convention, reference test, and run command for unit and integration tests. §6.7 carries a 2–3 line note from this phase. §3 Phase 1 row is `complete`.
- `change.md` is `status: planned` after this plan lands; `status: implemented` after `/10x-implement` finishes Phase 5.

### Key Discoveries

- Dedupe surface: `src/pages/api/transactions/import.ts:46` — composite `onConflict` key + `ignoreDuplicates`. The integration test must exercise this through the route, not via a direct `supabase.upsert` call.
- Auth boundary: `src/middleware.ts:6` — `supabase.auth.getUser()` populates `context.locals.user`; every protected route trusts it. Forged-payload tests must go through this path, not around it.
- Read path for Risk #1 lives in `src/pages/dashboard.astro` (SSR), not in `/api/transactions`. The integration test fetches the page and asserts content.
- pgTAP impersonation pattern in `supabase/tests/rls_isolation.test.sql` is correct and load-bearing — it is the DB-layer regression test and must keep running. Do not delete or port it to Vitest.
- `lessons.md` rule on `package-lock.json` against the public registry applies the first time CI runs `npm ci` after Vitest is added — verify resolved URLs before pushing.

## What We're NOT Doing

- **Not migrating the existing `verify-*.ts` scripts** (`verify-parser`, `verify-price-parser`, `verify-scenarios`, `verify-valuation`). Their concerns (tax math, parser correctness, price extraction) belong to Phase 2 / Phase 3 of the test-plan. Phase 1 leaves them alone.
- **Not writing unit tests for tax math, parsers, or valuation.** Phase 2 owns oracles. Phase 1's only unit test is the trivial wiring smoke test that proves Vitest runs.
- **Not adding MSW.** No HTTP edge to mock in this phase — `analizy.pl` is Phase 3.
- **Not adding Playwright or e2e.** Optional, deferred to Phase 4 per test-plan §3.
- **Not introducing a separate "test" Supabase project in the cloud.** Local stack via `supabase start` is the only target for integration tests, both locally and in CI.
- **Not parsing dashboard HTML deeply.** The Risk #1 assertion is "does B's distinctive seeded amount appear in the response body?" — a substring check, not a DOM parse. The test is for cross-account *leakage*, not for layout correctness.
- **Not asserting performance or CPU budget.** That's Risk #6, Phase 3.
- **Not changing the default branch, the `master` → production deploy flow, or wrangler config.**
- **Not adding test coverage thresholds.** Coverage is not the metric — risk coverage is (test-plan §1 principle #2 by extension; explicit in §2 "Risk Map" framing).

## Implementation Approach

Five phases land in order. Each phase has a passing-test exit criterion so a regression in an earlier phase cannot be papered over by a later one.

1. Install and wire Vitest with two projects (`unit`, `integration`) and prove `npm test` runs on a trivial pure-function assertion.
2. Build the integration harness — a session helper (`adminCreateUser` → `signInWithPassword` → cookie capture) and a server helper (boot the Astro SSR entry in-process and `fetch` against it with the captured cookies). Prove the harness with a signed-out → 302 and signed-in → 200 smoke test against `/dashboard`.
3. Author the three risk-defending integration tests. Each test names the risk it defends in its file header and in its top-level `describe`.
4. Update `.github/workflows/ci.yml` to install the supabase CLI, run `supabase start`, run `npm test`, `npm run test:integration`, and `supabase test db`, with all three required for merge to `master`. The deploy job's `needs: ci` already gates on the full CI pass.
5. Fill in `test-plan.md` §6.1, §6.2, §6.7 with the patterns this phase landed; mark §3 Phase 1 row `complete`; bump §8 freshness ledger.

## Critical Implementation Details

- **Astro request handler in-process, not a subprocess.** Booting `astro dev` as a subprocess adds 3–5s of startup per `vitest run` and is flaky on CI. Instead, import the Astro SSR entry that `@astrojs/cloudflare` builds (or use `astro`'s App API in test mode — see Astro 6 docs via `WebFetch` at implementation time) and call it with constructed `Request` objects. The `globalSetup` is allowed one server boot per integration project; per-test fixtures rebuild only the `Request` + cookies.
- **Cookie capture for `@supabase/ssr`.** `signInWithPassword` against the local Supabase API returns the session in the response body, but the production code path reads it from `sb-<project-ref>-auth-token` cookies set by the SSR helper. The session helper must build those cookies the same way `@supabase/ssr` would. The simplest path: call the local `/auth/v1/token?grant_type=password` endpoint, then format the returned access/refresh tokens into the cookie shape `@supabase/ssr` expects (verify against `@supabase/ssr` source at implementation time — the cookie name and JSON shape are stable across patch versions but should not be guessed).
- **`supabase start` is idempotent but slow on cold start.** `globalSetup` should call `supabase status --output json`, parse it, and only run `supabase start` if not running. CI runs cold every time (~60–90s); local dev keeps the stack warm.
- **Per-test user isolation relies on RLS, which is what we're testing.** This is intentional and safe because each test creates its own user with a randomized email; the risk would be if RLS were broken (which the test would catch by failing). Do not "harden" this by truncating tables — that defeats parallelism and would mask the very failure mode we want surfaced.
- **Risk #1 substring assertion must use a value that cannot collide.** Seed user B's row with `gross_amount: 99999999.99` (or similar improbable marker) and assert `responseBody.includes("99999999.99")` is `false`. A naive amount like `100.00` could collide with template text.
- **`supabase test db` runs against the same instance as integration tests.** Order matters: run `supabase test db` last (or first) but never *during* integration runs — pgTAP's `begin; … rollback;` is per-file safe, but parallel writes from Vitest could fail pgTAP assertions that count rows. Sequence them in CI.
- **`package-lock.json` registry check before first push.** `lessons.md` rule #2 — after `npm i -D vitest …`, verify all new `resolved` URLs in `package-lock.json` point to `registry.npmjs.org` before committing.

## Phase 1: Bootstrap Vitest

### Overview

Install Vitest with two projects (`unit` and `integration`), wire `package.json` scripts, write one trivial unit test that proves the runner is working. Land before any integration work.

### Changes Required

#### 1. Dependencies

**File**: `package.json`

**Intent**: Add Vitest as a devDep so unit and integration tests can run.

**Contract**: `devDependencies` gains `vitest` (latest stable compatible with `vite ^7.3.2` in the existing overrides). No `@vitest/ui`, no coverage provider — neither is needed for Phase 1.

#### 2. Vitest config

**File**: `vitest.config.ts` (new)

**Intent**: Define two Vitest projects so unit tests run fast and isolated, and integration tests pay the Supabase + Astro cost only when explicitly requested.

**Contract**: A `defineConfig` with `test.projects` containing two entries:
- `unit` — `include: ['src/**/*.test.ts']`, `environment: 'node'`, no global setup.
- `integration` — `include: ['tests/integration/**/*.test.ts']`, `environment: 'node'`, `globalSetup: ['tests/integration/_helpers/global-setup.ts']` (created in Phase 2), `setupFiles: ['tests/integration/_helpers/per-file-setup.ts']` (created in Phase 2).

Path aliases must match `tsconfig.json` (the `@/` alias used in `src/`).

#### 3. Scripts

**File**: `package.json`

**Intent**: Distinguish unit from integration so the fast loop stays fast.

**Contract**: Add three scripts:
- `"test": "vitest run --project unit"`
- `"test:integration": "vitest run --project integration"`
- `"test:all": "vitest run"`

`test:watch` is intentionally not added; solo dev can use `npx vitest --project unit` ad-hoc.

#### 4. Trivial smoke unit test

**File**: `src/lib/utils.test.ts` (new — co-located with `utils.ts`)

**Intent**: Prove the unit runner is wired before anything else lands. The actual assertion content is incidental — pick the first pure exported function in `src/lib/utils.ts` and assert one input/output pair.

**Contract**: One `describe` / one `it` calling the chosen function with a known input and asserting the known output via `expect`.

### Success Criteria

#### Automated Verification

- `npm test` exits 0 and reports 1 passing test from `src/lib/utils.test.ts`.
- `npm run test:integration` exits 0 with "0 tests" (no integration files exist yet — the project boots cleanly).
- `npm run lint` still exits 0 (no new lint errors from Vitest types).
- `npm run build` still exits 0 (test files do not leak into the build — Astro/Vite excludes `*.test.ts` by default, but verify nothing breaks).
- `package-lock.json` has no `resolved` URLs pointing outside `registry.npmjs.org` (lessons.md rule #2).

#### Manual Verification

- `npx vitest --project unit` in watch mode picks up an edit to `src/lib/utils.test.ts` and re-runs in under 1s.

**Implementation Note**: Pause after this phase for manual confirmation before starting Phase 2.

---

## Phase 2: Integration harness

### Overview

Build the helpers and global setup that let integration tests act like real signed-in users hitting real routes against a real Supabase stack. Prove the harness with one smoke test before any risk test is written.

### Changes Required

#### 1. Global setup — ensure Supabase is running

**File**: `tests/integration/_helpers/global-setup.ts` (new)

**Intent**: Before any integration test, confirm the local Supabase stack is up; if not (cold local dev or CI), start it. Capture the API URL, anon key, and service-role key from `supabase status --output json` and expose them to tests via env vars.

**Contract**: Default-exported async function (Vitest globalSetup signature). Calls `supabase status --output json`; if the parsed status reports `Stopped`, runs `supabase start` and re-polls until ready. Sets `process.env.SUPABASE_URL`, `process.env.SUPABASE_KEY` (anon key), and `process.env.SUPABASE_SERVICE_ROLE_KEY` from the status output. Does NOT call `supabase stop` in teardown — leaving the stack up speeds local re-runs and CI tears down the runner anyway.

#### 2. Per-file setup — reset env per test file

**File**: `tests/integration/_helpers/per-file-setup.ts` (new)

**Intent**: Per-file hooks that future tests may need (e.g. for time mocking). Land an empty file with a header comment in Phase 2; risk tests in Phase 3 will add nothing here unless required.

**Contract**: An empty TypeScript module. No exports needed. Wired into `setupFiles` so Vitest loads it.

#### 3. Session helper — create user, sign in, capture cookies

**File**: `tests/integration/_helpers/session.ts` (new)

**Intent**: One-call helper that gives a test a real authenticated browser session. Used by every risk test.

**Contract**: Exports `createSignedInUser(): Promise<{ userId: string; email: string; cookie: string; supabaseAdmin: SupabaseClient }>`. The implementation:
1. Builds a `supabase-js` admin client using the service-role key.
2. Calls `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })` with a randomized email.
3. Calls the GoTrue token endpoint (or `signInWithPassword` against an anon client) to obtain access + refresh tokens.
4. Encodes those tokens into the cookie format `@supabase/ssr` expects (verify cookie name + JSON shape at implementation time against `@supabase/ssr` source).
5. Returns the user id, email, the serialized `cookie` header value to pass to `fetch`, and the admin client (so tests can seed rows under any user via service-role).

The helper is the single source of truth for the auth-cookie shape; if `@supabase/ssr` changes the shape in a major version, only this helper needs updating.

#### 4. Server helper — boot Astro SSR in-process

**File**: `tests/integration/_helpers/server.ts` (new)

**Intent**: Run the same SSR entry the production Worker runs, in-process, so integration tests exercise middleware → route exactly as production does. Avoids the cost and flake of `astro dev` as a subprocess.

**Contract**: Exports `fetchRoute(input: string | URL, init?: RequestInit & { cookie?: string }): Promise<Response>`. Internally, the helper boots the Astro App once (lazily, cached for the rest of the test run). Each call constructs a `Request` from the path + init, attaches `init.cookie` as the `Cookie` header, runs the App's `render`, and returns the resulting `Response`. The exact Astro App boot path (whether to import the `dist/` build or use Astro's `experimental_app` API in test mode) is determined at implementation time by checking Astro 6 docs — `WebFetch` `https://docs.astro.build/en/reference/integrations-reference/#astroconfigsetup-option` and adjacent pages.

#### 5. Smoke integration test

**File**: `tests/integration/_smoke/dashboard-auth.test.ts` (new)

**Intent**: Prove the harness end-to-end: signed-out hits `/dashboard` → middleware redirects to `/auth/signin`; signed-in hits `/dashboard` → 200.

**Contract**: Two `it` blocks. First: `fetchRoute('/dashboard')` (no cookie) returns status 302 (or 303) with `Location` containing `/auth/signin`. Second: `createSignedInUser()` then `fetchRoute('/dashboard', { cookie })` returns status 200.

### Success Criteria

#### Automated Verification

- `npm run test:integration` exits 0 with 2 passing tests from `tests/integration/_smoke/dashboard-auth.test.ts`.
- `supabase status` reports `running` after the test run completes.
- `npm test` still exits 0 (unit suite untouched).
- `npm run lint` still exits 0 (no new lint errors in `tests/integration/**`).

#### Manual Verification

- Running `npm run test:integration` with the Supabase stack already up (warm path) completes in under 15s.
- Stopping the stack (`supabase stop`) and re-running boots the stack via the global setup; second run reuses it.

**Implementation Note**: Pause after this phase for manual confirmation before starting Phase 3.

---

## Phase 3: Risk-defending integration tests

### Overview

Write the three tests this whole phase exists for. Each test file's top-of-file comment cites the risk number, the failure scenario in user terms (lifted from test-plan §2), and the "What would prove protection" line from §2 Risk Response Guidance.

### Changes Required

#### 1. Risk #1 — RLS leak at the route layer

**File**: `tests/integration/risk-01-rls-route-leak.test.ts` (new)

**Intent**: Prove that the SSR dashboard read path, exercised through the real middleware with real cookies, returns user A's data and never user B's. Defends the "load-bearing NFR" from PRD.

**Contract**: One `describe`. Inside:
1. `beforeAll`: create user A and user B via `createSignedInUser()`. Seed user B with one transaction whose `gross_amount` is the canary value `99999999.99` (improbable marker), using the admin client to insert with `user_id: B.userId`.
2. Test: `fetchRoute('/dashboard', { cookie: A.cookie })` returns 200. The response body text must NOT contain `"99999999.99"`. Assert via `expect(body).not.toContain("99999999.99")`.
3. (Symmetric test, optional but recommended): same assertion swapping roles. If implementer chooses, this lives as a second `it`.

#### 2. Risk #3 — Allianz dedupe at the route layer

**File**: `tests/integration/risk-03-import-dedupe.test.ts` (new)

**Intent**: Prove that re-uploading a byte-identical Allianz file produces no duplicate rows, and that an overlapping file produces the set union — not duplicates, not missing rows. Exercises the `onConflict` upsert through the real route.

**Contract**: One `describe` with two `it` blocks. Both use `createSignedInUser()` and a fresh user per `it` (no shared state).
1. **Byte-identical re-upload**: POST the existing `tests/fixtures/allianz-sample.csv` to `/api/transactions/import` (multipart form, field name `file`) with A's cookie. Query the DB via the admin client filtered by `user_id: A.userId` — record the row count. POST the same file again. Re-query: row count unchanged.
2. **Partial overlap**: Build a second CSV in the test (string-level, in-memory) that shares some rows with `allianz-sample.csv` and adds new ones. POST the sample, then POST the overlap variant. Final row count equals `unique(sample ∪ overlap)`, not their sum, and includes every unique row from both.

The second test requires the implementer to construct the overlap CSV by reading `allianz-sample.csv` and writing a new variant that shares a subset of lines — the exact construction is straightforward and intentionally not pre-written here.

#### 3. Risk #7 — IDOR via forged `user_id`

**File**: `tests/integration/risk-07-idor-forged-payload.test.ts` (new)

**Intent**: Prove that an authenticated user A cannot create a row under user B by sending `user_id: B` in the request payload. The current `import.ts` derives identity from the SSR Supabase client (which uses A's cookie) and does not read `user_id` from the form, so the test should pass on the current code — but the test is the regression lock against any future change that trusts a client-supplied `user_id`.

**Contract**: One `describe` with one `it`. `createSignedInUser()` for both A and B. POST a minimal valid Allianz file to `/api/transactions/import` with A's cookie, but append a `user_id` form field set to `B.userId`. Read all rows where `user_id = B.userId` via the admin client: count must be 0. Read all rows where `user_id = A.userId`: count must equal the row count parsed from the file (the row landed under the authenticated user, not the forged one).

The test demonstrates the **expected** behaviour: forged field is ignored, row lands under the session's user. If a future change starts trusting `user_id` from the form, the count under B becomes non-zero and the test fails.

### Success Criteria

#### Automated Verification

- `npm run test:integration` exits 0 with the smoke test (2) + Risk #1 (1 or 2) + Risk #3 (2) + Risk #7 (1) = 6 or 7 passing tests.
- Re-running `npm run test:integration` three times in a row keeps passing without manual reset — proves test isolation works.
- `npm test` and `npm run lint` still exit 0.

#### Manual Verification

- **Mutation sanity drill (the canonical "does this test catch what it claims to catch?" check):**
  - Risk #1: temporarily weaken the `transactions` SELECT policy in a local migration (e.g., `USING (true)`); apply via `supabase db reset`; rerun the Risk #1 test — it must **fail**. Revert.
  - Risk #3: temporarily change the `import.ts` upsert to `insert` (drop `onConflict` + `ignoreDuplicates`); rerun the Risk #3 byte-identical test — it must **fail**. Revert.
  - Risk #7: temporarily edit `import.ts` to read `user_id` from the form and pass it into the payload; rerun the Risk #7 test — it must **fail**. Revert.
- Each mutation, when reverted, restores the green run.

**Implementation Note**: Pause after this phase for the mutation drill before starting Phase 4. The drill is the only thing that proves the tests are real.

---

## Phase 4: CI wiring + required gate

### Overview

Make the new test suite a required gate for merge to `master`. Add the `supabase test db` step that runs the existing pgTAP file. Sequence pgTAP and Vitest so they don't fight over DB state.

### Changes Required

#### 1. CI workflow update

**File**: `.github/workflows/ci.yml`

**Intent**: Run unit, integration, and pgTAP tests on every PR and on push to `master`. All three must pass before `deploy` can run.

**Contract**: Inside the existing `ci` job, after `npm run build`, add the following steps in order:
1. **Install Supabase CLI** — using `supabase/setup-cli@v1` (preferred) or `npm i -g supabase` (fallback). Pin a version compatible with the `supabase` devDep already in `package.json`.
2. **Start Supabase** — `supabase start` (uses the project's `supabase/config.toml` and applies all migrations in `supabase/migrations/`).
3. **Unit tests** — `npm test`.
4. **Integration tests** — `npm run test:integration`. Inherits `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` from the global setup that reads `supabase status`.
5. **DB-layer pgTAP** — `supabase test db`. Runs `supabase/tests/rls_isolation.test.sql`. Runs last so it owns the DB state during its assertions.
6. **Stop Supabase** (optional — runner is torn down anyway, but explicit `supabase stop` makes logs cleaner if a step fails mid-run).

The `deploy` job's `needs: ci` already gates on the full CI pass — no change there.

#### 2. (Optional) Cache Docker layers

**File**: `.github/workflows/ci.yml`

**Intent**: Reduce the `supabase start` cold-pull cost on every CI run.

**Contract**: If `supabase/setup-cli@v1` exposes a cache option (verify at implementation time), enable it. If not, leave this out — the ~60–90s cost is acceptable for Phase 1's signal value. Do not over-engineer.

### Success Criteria

#### Automated Verification

- A PR to `master` containing this branch shows the CI job with `lint → build → supabase start → npm test → npm run test:integration → supabase test db` all green.
- A PR that deliberately mutates the `transactions` USING policy to `true` shows the CI job with `supabase test db` red — verifying the gate actually blocks.
- A PR that deliberately removes `onConflict` from `import.ts` shows the CI job with `npm run test:integration` red.
- The `deploy` job only runs on push to `master` and only after `ci` is green (unchanged from current).
- Total CI wall-clock time stays under 5 minutes on a cold runner.

#### Manual Verification

- Open a real PR (or a draft PR on a throwaway branch) to confirm GitHub's "Required status checks" picks up the new gates if branch protection is enabled. If branch protection is not configured, document that the gate is "blocking by convention" until protection is added.
- Confirm CI Supabase logs are visible if a test fails (`supabase status`, `supabase logs db` etc. accessible via runner logs).

**Implementation Note**: Pause after this phase to confirm the gate behaves as expected on a real PR before starting Phase 5.

---

## Phase 5: Update test-plan cookbook + close Phase 1 row

### Overview

Fill in the §6.1 and §6.2 placeholders in `context/foundation/test-plan.md` with what this phase actually shipped. Mark §3 Phase 1 row `complete`. Update the freshness ledger.

### Changes Required

#### 1. Cookbook §6.1 — Adding a unit test

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the `TBD — see §3 Phase 1` placeholder with the concrete pattern.

**Contract**: A 4-bullet section naming: (a) file location — co-located, `*.test.ts` next to the source file under `src/`; (b) naming — `<module>.test.ts`; (c) reference test — `src/lib/utils.test.ts`; (d) run command — `npm test` (single file: `npx vitest run --project unit <path>`).

#### 2. Cookbook §6.2 — Adding an integration test

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the `TBD — see §3 Phase 1` placeholder with the concrete pattern, including a sub-section per risk family this phase shipped.

**Contract**: Sub-bullets naming: (a) file location — `tests/integration/<topic>.test.ts`; (b) prerequisite — `supabase start` running locally, autostarted in CI; (c) session helper — `createSignedInUser()` from `tests/integration/_helpers/session.ts`; (d) route helper — `fetchRoute()` from `tests/integration/_helpers/server.ts`; (e) reference tests — `risk-01-rls-route-leak.test.ts` (cross-account leak pattern), `risk-03-import-dedupe.test.ts` (dedupe pattern), `risk-07-idor-forged-payload.test.ts` (forged-payload pattern); (f) DB-layer regression tests live under `supabase/tests/*.test.sql` and run via `supabase test db` — link the pgTAP file; (g) run command — `npm run test:integration` (single file: `npx vitest run --project integration <path>`).

#### 3. Cookbook §6.7 — Per-rollout-phase notes

**File**: `context/foundation/test-plan.md`

**Intent**: Append a 2–3 line note capturing anything surprising the rollout taught (per the §6.7 instruction).

**Contract**: One sub-section titled `Phase 1 (testing-bootstrap-critical-path)` with 2–3 lines covering: which decisions held up (e.g., per-test fresh user via admin API), what surprised the implementer (any cookie-shape gotcha with `@supabase/ssr`, any CI timing issue). The implementer writes the actual content based on what they encountered.

#### 4. Mark Phase 1 row `complete`

**File**: `context/foundation/test-plan.md`

**Intent**: Update the §3 status cell from `change opened` to `complete` so `/10x-test-plan` knows to advance to Phase 2 on next invocation.

**Contract**: In the `## 3. Phased Rollout` table, row 1 (Bootstrap), change the `Status` column from `change opened` to `complete`.

#### 5. Freshness ledger

**File**: `context/foundation/test-plan.md`

**Intent**: Bump §8 with today's date for "Strategy" and "Stack versions" since stack rows in §4 now have a real Vitest version pin.

**Contract**: Update the date on both lines in §8 to the date Phase 5 lands.

#### 6. Update `change.md`

**File**: `context/changes/testing-bootstrap-critical-path/change.md`

**Intent**: Reflect that the change has shipped.

**Contract**: Set `status: implemented` and bump `updated` to today's date. Leave `archived_at` null — `/10x-archive` handles that.

### Success Criteria

#### Automated Verification

- `grep -n "TBD — see §3 Phase 1" context/foundation/test-plan.md` returns zero matches.
- `grep -n "complete" context/foundation/test-plan.md` shows Phase 1 row marked `complete` in §3.

#### Manual Verification

- Re-reading §6.1 and §6.2 from a cold context, a new contributor can add a unit test and an integration test without asking the implementer any questions.
- `/10x-test-plan` (no arguments) advances to Phase 2 of the rollout on next invocation.

---

## Testing Strategy

### Unit Tests

- One smoke test in Phase 1 (`src/lib/utils.test.ts`) proving the runner works.
- All other unit-test coverage is out of scope for this phase. Phases 2 and 3 of the test-plan rollout add the tax-math, valuation, and scraper unit tests.

### Integration Tests

- Smoke harness test in Phase 2 (`tests/integration/_smoke/dashboard-auth.test.ts`) proving the harness is end-to-end correct.
- Three risk-defending tests in Phase 3:
  - `risk-01-rls-route-leak.test.ts` — Risk #1 (RLS leak at route layer)
  - `risk-03-import-dedupe.test.ts` — Risk #3 (Allianz dedupe)
  - `risk-07-idor-forged-payload.test.ts` — Risk #7 (IDOR via forged `user_id`)
- All integration tests assume a running local Supabase stack; global setup boots it if needed.

### DB-layer Tests (pgTAP)

- Existing `supabase/tests/rls_isolation.test.sql` is unchanged in this phase; only the CI wiring (Phase 4) changes — the file now runs in CI via `supabase test db`.

### Manual Testing Steps

1. Phase 1: `npm test` locally, expect 1 passing test.
2. Phase 2: `npm run test:integration` locally with Supabase running, expect 2 passing tests.
3. Phase 3 mutation drill (the canonical proof the tests are real):
   - Weaken `transactions` SELECT policy → Risk #1 test fails.
   - Drop `onConflict` from `import.ts` → Risk #3 byte-identical test fails.
   - Make `import.ts` read `user_id` from the form → Risk #7 test fails.
   - Revert each in turn; suite goes green.
4. Phase 4: open a PR and verify the new CI steps run; deliberately break one to verify the gate blocks merge.

## Performance Considerations

- Local: cold integration run with `supabase start` cold-pull is ~60–90s once; warm re-runs target <15s for the current suite size.
- CI: total ci-job wall-clock target <5 minutes on cold runner. If `supabase start` regularly pushes past this, revisit Docker-layer caching (Phase 4 optional step) before Phase 4 of the test-plan adds Playwright.
- No CPU-budget assertions in this phase (Risk #6 → test-plan Phase 3).

## Migration Notes

- The first CI run after this phase lands will see all new dependencies (`vitest`, anything Vitest pulls in) installed from `registry.npmjs.org`. Verify `package-lock.json` `resolved` URLs immediately after `npm i -D vitest` and before pushing (lessons.md rule #2).
- No DB migrations introduced by this phase. The existing `supabase/migrations/` set is applied unchanged by `supabase start`.
- Existing `verify-*.ts` scripts are untouched — they continue to work via `tsx`. Phase 2 of the test-plan rollout will decide their disposition.

## References

- Test plan: `context/foundation/test-plan.md` (Phase 1 row in §3, Risks #1 / #3 / #7 in §2 + Risk Response Guidance, stack picks in §4, gates in §5, cookbook in §6)
- PRD: `context/foundation/prd.md` (NFR on cross-account exposure, FR-004 dedupe Socrates note, Access Control)
- Tech stack + infrastructure: `context/foundation/tech-stack.md`, `context/foundation/infrastructure.md`
- Lessons: `context/foundation/lessons.md` (rule on `package-lock.json` registry)
- Dedupe surface: `src/pages/api/transactions/import.ts:46`
- Auth boundary: `src/middleware.ts:6`
- Existing pgTAP test: `supabase/tests/rls_isolation.test.sql`
- Existing CI workflow: `.github/workflows/ci.yml`
- Existing fixtures: `tests/fixtures/allianz-sample.csv`, `tests/fixtures/allianz-malformed.csv`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Bootstrap Vitest

#### Automated

- [x] 1.1 `npm test` exits 0 and reports 1 passing test from `src/lib/utils.test.ts` — c02c4d4
- [x] 1.2 `npm run test:integration` exits 0 with "0 tests" — c02c4d4
- [x] 1.3 `npm run lint` still exits 0 — c02c4d4
- [x] 1.4 `npm run build` still exits 0 — c02c4d4
- [x] 1.5 `package-lock.json` has no `resolved` URLs outside `registry.npmjs.org` — c02c4d4

#### Manual

- [x] 1.6 `npx vitest --project unit` watch mode re-runs in <1s on edit — c02c4d4

### Phase 2: Integration harness

#### Automated

- [x] 2.1 `npm run test:integration` exits 0 with 2 passing tests from `tests/integration/_smoke/dashboard-auth.test.ts`
- [x] 2.2 `supabase status` reports `running` after the test run
- [x] 2.3 `npm test` still exits 0
- [x] 2.4 `npm run lint` still exits 0

#### Manual

- [x] 2.5 Warm `npm run test:integration` completes in <15s
- [x] 2.6 Cold-start path (after `supabase stop`) boots the stack via global setup

### Phase 3: Risk-defending integration tests

#### Automated

- [ ] 3.1 `npm run test:integration` exits 0 with 6 or 7 passing tests covering smoke + Risk #1 + #3 + #7
- [ ] 3.2 Three consecutive `npm run test:integration` runs pass without manual reset
- [ ] 3.3 `npm test` and `npm run lint` still exit 0

#### Manual

- [ ] 3.4 Mutation drill — weakened RLS policy fails Risk #1 test; revert restores green
- [ ] 3.5 Mutation drill — `insert` (no `onConflict`) fails Risk #3 byte-identical test; revert restores green
- [ ] 3.6 Mutation drill — `import.ts` reading `user_id` from form fails Risk #7 test; revert restores green

### Phase 4: CI wiring + required gate

#### Automated

- [ ] 4.1 PR to `master` shows green `lint → build → supabase start → npm test → npm run test:integration → supabase test db`
- [ ] 4.2 Deliberately weakened RLS policy turns `supabase test db` red on PR
- [ ] 4.3 Deliberately removed `onConflict` turns `npm run test:integration` red on PR
- [ ] 4.4 `deploy` job only runs on push to `master` after `ci` is green
- [ ] 4.5 Total CI wall-clock under 5 minutes on cold runner

#### Manual

- [ ] 4.6 GitHub branch protection picks up new required checks (or documented as blocking by convention if not configured)
- [ ] 4.7 Supabase logs are accessible in runner output when a test fails

### Phase 5: Update test-plan cookbook + close Phase 1 row

#### Automated

- [ ] 5.1 `grep "TBD — see §3 Phase 1" context/foundation/test-plan.md` returns zero matches
- [ ] 5.2 §3 Phase 1 row marked `complete` in `test-plan.md`

#### Manual

- [ ] 5.3 Cold-context reader can add a unit test and an integration test from §6.1 + §6.2 alone
- [ ] 5.4 `/10x-test-plan` (no args) advances to Phase 2 on next invocation
