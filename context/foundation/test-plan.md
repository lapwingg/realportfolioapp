# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-25 (Phase 1 → `change opened`)

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in `<area>`"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the ground
   truth.

Hot-spot scope used for likelihood weighting: `src/`, `scripts/`, `supabase/`
(48 commits/30d, excluding lockfiles and generated snapshots).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | A signed-in user fetches or dashboards another user's PPK transactions or scenario amounts (RLS misconfig, wrong Supabase client wrapper, or middleware bypass on an API route) | High | High | PRD NFR ("no cross-account data exposure under any condition") + Access Control + `context/archive/2026-06-25-supabase-schema-rls/plan.md` + interview Q1 + hot-spot dir `src/pages/api/` — 9 commits/30d |
| 2 | One withdrawal-scenario amount (immediate Belka closure, 25% loan, or 60+ retirement) returns a plausible-but-wrong number — wrong tax base, ZUS deduction skipped, exemption condition misfiring | High | High | PRD NFR ("tax calculation correctness is non-negotiable; silent rounding errors or estimation are not acceptable") + roadmap S-03 risk + interview Q3 + hot-spot dir `src/lib/scenarios/` — 7 commits/30d |
| 3 | Re-uploading the same Allianz file, or two overlapping files, silently creates duplicate transactions or merges wrong, corrupting every downstream number | High | Medium | PRD FR-004 Socrates note (dedupe required) + interview Q2 (past burn) + `context/archive/2026-06-25-import-allianz-transactions/plan.md` + hot-spot dir `src/lib/allianz/` — 5 commits/30d |
| 4 | A user whose history crosses the 2024-11-07 OLD→NEW fund Zamiana sees a wrong dashboard valuation (pre-conversion OLD units leak back into the SUM, or the carryover NEW baseline is lost) — silently corrupting every S-03 scenario | High | Medium | roadmap S-04 + `context/archive/2026-06-25-fund-conversion-cutoff/plan.md` + hot-spot file `src/pages/dashboard.astro` — 8 commits/30d |
| 5 | analizy.pl scraper returns a stale or wrong price as "current" (DOM shift, Cloudflare outbound IP blocked, fetch failure swallowed) — dashboard renders confidently with garbage | High | Medium | PRD FR-006 + FR-007 Socrates notes + `context/archive/2026-06-25-fetch-fund-price/plan.md` + `context/foundation/infrastructure.md` risk register (analizy.pl IP block) |
| 6 | Calculation API route hits the Cloudflare Workers 10ms CPU limit on a user with 5+ years of history — silent 1101 error, no answer rendered, no helpful message | High | Medium | `context/foundation/lessons.md` rule 1 + `context/foundation/infrastructure.md` risk register + hot-spot dir `src/pages/api/` — 9 commits/30d |
| 7 | An API write route trusts a client-supplied `user_id` on insert/update (IDOR-style) — RLS does not protect against rows whose user_id is forged into a payload sent by an authenticated user | High | Medium | PRD Access Control + NFR + abuse lens (product has auth and accepts user input) + interview Q1 (related failure family) |

**Impact × Likelihood rubric.** Coarse High / Medium / Low so two readers agree on the same row.

| Rating | Impact | Likelihood |
|--------|--------|------------|
| High   | user loses access, data, or money; failure is publicly visible | area changes weekly, or we have already been burned here |
| Medium | feature degrades, a workaround exists, only some users affected | touched occasionally, has been a source of bugs |
| Low    | cosmetic, easily reverted, no data effect | stable code, rarely touched |

Risk numbers are stable across refreshes — append new risks at the bottom, never renumber.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Signed in as user A, every read endpoint and dashboard SSR returns zero rows when only user B's data exists; a direct API call from A's session against B-scoped resources returns nothing | "Supabase SSR + middleware is wired correctly so RLS will always kick in." Verify the actual server-client path on every read; verify middleware applies to API routes, not just pages | Which Supabase client wrapper is used per route (createServerClient vs createClient); whether middleware injects auth context into API routes; the actual RLS policies on every user-scoped table | integration (hit the real route with user A's session against a seeded user B row, real Supabase test schema) | mocking the Supabase client and "proving" the mock instead of the policy; testing only the happy "user reads own rows" path without the cross-user attack |
| #2 | Each of the three scenario amounts matches a hand-computed worked example to the cent across normal, edge (zero-profit floor, 60+ boundary), and degenerate (empty / single-row) inputs | "The current function returns plausible numbers, so it's correct." The oracle must NOT be derived from running the current code | Authoritative tax-rule source (statute / official PPK documentation); exact formula and rounding order for each scenario; how `availability` gates which scenarios are computed | unit (table-driven from worked examples, oracle external) | **oracle problem**: copying the expected value from the implementation under test — every such test green-lights current bugs and can never fail for the right reason |
| #3 | Re-uploading a byte-identical file twice leaves row count unchanged; uploading file B which overlaps A produces the union, not duplicates and not missing rows | "Hashing the filename or the whole file is enough dedupe." Same content can arrive under a different filename; partial overlap is the harder case than full overlap | Dedupe key definition (which transaction fields determine identity); whether dedupe runs at parse, insert, or DB-constraint layer; what happens to ambiguous rows | integration (real Supabase test schema, real upload route, two fixture files: byte-identical + partial-overlap) | testing only full-overlap and skipping partial-overlap; mocking the DB and proving the mock instead of the constraint |
| #4 | The dashboard valuation function, fed a fixture history crossing 2024-11-07, returns the value matching the holder's actual current holdings — not the naive SUM of all units across both funds | "S-04 shipped, so this is settled." Future dashboard refactors can silently re-introduce the naive SUM; the regression test is the lock | Where the valuation read-path lives now (must be the read path, not storage); how carryover NEW units are encoded; that the storage layer remains append-only and parser must not drop pre-cutoff rows | unit (the valuation function alone, fed a fixture history crossing the cutoff) | testing only happy-path histories with no fund switch; asserting against a snapshot whose expected value was lifted from the current implementation |
| #5 | Parser fed a saved analizy.pl HTML snapshot returns the exact known price; a fetch failure or empty response surfaces a visible error and NEVER a stale-as-current price; a nightly probe verifies the live page still matches the fixture shape | "Last-known-good price is good enough if the live fetch fails." FR-006/007 require a visible error, never a stale price as "current" | The exact DOM path / extraction logic; how staleness is represented in the response shape; whether `Cache-Control` or KV are involved on the read path | unit (parser against a saved HTML fixture) + nightly live-shape probe (allowed to flag without blocking deploys) | mocking `fetch` and asserting the mock fired; treating an HTTP 200 with empty or unexpected content as success |
| #6 | The scenarios hot loop, fed a synthetic 5-year history fixture, completes under ~8ms wall-clock CPU under `wrangler dev --remote` (the only local runner that enforces the workerd CPU budget) | "`astro dev` and `wrangler dev` (without `--remote`) showed it's fast." Neither enforces the 10ms limit; only `--remote` runs on real workerd | The hot loop's actual computational shape; whether per-transaction work can be hoisted out of the loop; whether the synthetic fixture matches realistic multi-year holder history | perf check (synthetic 5-year fixture, `wrangler dev --remote`) | running the budget check under `astro dev` only; using a tiny fixture that under-represents real-holder history; treating a passing run as proof for all input shapes |
| #7 | API route handler ignores any `user_id` field on the request body and derives identity from the server session; a forged-payload request from user A's session never produces a row owned by user B | "RLS catches this." RLS protects reads and ownership-bound updates, but a handler that uses the forged user_id to INSERT may produce a row that RLS later permits because `auth.uid()` matches | Which routes do writes; whether any write route uses the service-role key for user-data inserts; whether request payloads are validated against a schema that strips `user_id` before reaching the DB | integration (sign in as A, POST a body with `user_id: B`, assert the row is created under A or the request is rejected — never under B) | mocking the auth context and "proving" the handler reads `auth.uid()` — a real attack uses a real session and a forged body |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Bootstrap test runner + data-isolation critical path | Install Vitest, wire it into CI, then defend RLS leak / dedupe / IDOR at the cheapest layer | #1, #3, #7 | unit + integration | change opened | `context/changes/testing-bootstrap-critical-path/` |
| 2 | Tax-math hardening with external oracles | Lock the three withdrawal-scenario amounts and the cross-cutoff valuation against hand-computed worked examples (no oracles lifted from the implementation) | #2, #4 | unit (table-driven) | not started | — |
| 3 | External-edge contract guards (scraper + CPU budget) | Lock analizy.pl extraction against a saved HTML fixture + nightly shape probe; enforce the scenarios hot-loop CPU budget under `wrangler --remote` with a realistic synthetic history | #5, #6 | unit + perf check under `wrangler --remote` | not started | — |
| 4 | Quality-gates wiring + optional happy-path e2e | Require unit + integration in CI; optionally add a single Playwright smoke for sign-in → upload → dashboard renders all three scenarios | cross-cutting | gates + optional e2e | not started | — |

**Status vocabulary** (fixed — parser literals): `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Vitest (recommended) | TBD | none yet — see §3 Phase 1; first-party Vite integration matches the Astro+React+Vite toolchain; required after §3 Phase 1 |
| API mocking (HTTP edge) | MSW (recommended) | TBD | none yet — see §3 Phase 3; needed for analizy.pl fetch in unit tests; only mock at the HTTP edge, never internal modules |
| Integration / DB | Supabase local stack (`supabase start`) | already vendored via `supabase` devDep | run against a real RLS-enabled test schema; never mock the Supabase client itself when the test purpose is RLS |
| e2e | Playwright (optional) | TBD | none yet — see §3 Phase 4; include only if cost × signal holds for a solo-after-hours MVP |
| accessibility | — | — | out of scope for MVP |
| (optional) AI-native | — | — | not included — cost × signal does not justify for this project; top risks are server-side calculation correctness and data isolation, not visual UI |

**Stack grounding tools (current session):**
- Docs: none in session (no Context7 or framework docs MCP exposed) — `WebFetch` is the fallback for current Vitest / `@astrojs/cloudflare` / Supabase docs; checked: 2026-06-25
- Search: none in session (no Exa.ai or web-search MCP exposed) — same `WebFetch` fallback; checked: 2026-06-25
- Runtime/browser: none in session (no Playwright MCP exposed) — Playwright would need to be added as a devDep; checked: 2026-06-25
- Provider/platform: none in session (no Cloudflare / Supabase / GitHub MCP exposed) — gates and rollback continue to use the existing `wrangler` CLI and GitHub Actions; checked: 2026-06-25

Use docs / search via `WebFetch` for current framework APIs; do not use it to infer code failure anchors — those belong in per-phase `/10x-research`.

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase `<N>`" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint (`npm run lint`) | local + CI (`.github/workflows/ci.yml`) | required (already wired) | syntactic drift, ESLint rule violations |
| build / typecheck (`npm run build`) | local + CI (already wired) | required (already wired) | type drift, broken imports, missing env vars |
| unit + integration | local + CI | required after §3 Phase 1 | logic regressions on Risks #1–#4 and #7 |
| analizy.pl shape probe (nightly) | CI scheduled | required after §3 Phase 3 (non-blocking; flags only) | DOM drift on the scraper without blocking PRs |
| CPU budget check (`wrangler dev --remote`) | local pre-merge | required after §3 Phase 3 | 10ms CPU regression on the scenarios hot loop |
| e2e happy-path smoke (Playwright) | CI on PR | optional, deferred to §3 Phase 4 | full sign-in → upload → dashboard regression |
| pre-prod smoke against deployed Worker | between merge and prod | optional after §3 Phase 4 | environment-specific failures the test suite cannot reach |

Visual-diff / multimodal review / accessibility gates are intentionally absent — see §7 for the negative-space rationale.

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, it reads "TBD — see §3 Phase
`<N>`."

### 6.1 Adding a unit test

- TBD — see §3 Phase 1 (Vitest config, file convention, run command, reference test for a pure function in `src/lib/`).

### 6.2 Adding an integration test (Supabase RLS, real route)

- TBD — see §3 Phase 1 (local Supabase test schema setup, reference RLS leak test, dedupe test, IDOR/forged-payload test).

### 6.3 Adding a tax-math test against an external oracle

- TBD — see §3 Phase 2 (worked-example fixture layout, citation requirement, table-driven pattern that makes the oracle visible, fund-conversion-cutoff fixture for Risk #4).

### 6.4 Adding a scraper / external-fetch test

- TBD — see §3 Phase 3 (saved-HTML fixture path, parser-only test, MSW for the HTTP edge, nightly live-shape probe skeleton).

### 6.5 Adding a CPU budget check

- TBD — see §3 Phase 3 (`wrangler dev --remote` invocation, synthetic 5-year fixture path, threshold).

### 6.6 Adding an e2e smoke (optional)

- TBD — see §3 Phase 4 (only filled in if the e2e smoke ships).

### 6.7 Per-rollout-phase notes

(Empty. `/10x-implement`'s final sub-phase appends a 2–3 line note per phase capturing anything surprising the rollout taught.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Authentication flows (sign-in / sign-up / sign-out)** — the SDK (`@supabase/ssr` + `@supabase/supabase-js`) is the test; writing local tests that re-prove "Supabase Auth signs a user in" adds no signal beyond what the vendor already verifies. Re-evaluate if the project ever moves off Supabase Auth or adds a custom auth path that is not a thin SDK wrapper. (Source: Phase 2 interview Q5.)
- **Visual snapshot tests for landing / marketing pages and Polish UI copy** — UI copy iterates fast and is hardcoded Polish with no i18n layer; snapshot tests would break on every copy edit and catch nothing meaningful about user value. Re-evaluate if i18n is introduced or if a regression in landing copy ever causes a measurable user-visible incident. (Source: skill default negative space, consistent with Q5 intent.)
- **Generated `src/lib/database.types.ts`** — produced by the `supabase` CLI; `tsc` plus the generator are the test. Re-evaluate if the project ever hand-edits the generated file. (Source: skill default negative space, consistent with Q5 intent.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-25
- Stack versions last verified: 2026-06-25
- AI-native tool references last verified: 2026-06-25 (none included)

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
