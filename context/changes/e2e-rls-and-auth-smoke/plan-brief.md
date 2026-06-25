# E2E smoke for auth boundary and RLS isolation — Plan Brief

> Full plan: `context/changes/e2e-rls-and-auth-smoke/plan.md`

## What & Why

Add two Playwright E2E specs that lock the two highest-impact browser-level risks from `context/foundation/test-plan.md` § 2 — cross-account data exposure (#1, high/high) and cross-cutoff fund Zamiana dashboard valuation (#4, high/medium). These risks are partially covered at the integration and unit layers; this change adds the browser-level lock on top and closes test-plan § 3 Phase 4 for the two named risks. The two-risk scope mirrors the change.md exactly — the optional happy-path smoke also mentioned in § 3 Phase 4 is intentionally out of scope.

## Starting Point

Playwright is scaffolded but not yet exercising any real risk: `playwright.config.ts:1-33` defines setup + chromium projects with `storageState`; `tests/e2e/auth.setup.ts:9-27` drives the real signin form; `tests/e2e/seed.spec.ts:14-27` is a conventions reference. Risk #1 is already covered at the integration layer (`tests/integration/risk-01-rls-route-leak.test.ts`) with a load-bearing two-marker pattern; Risk #4 will be unit-tested in test-plan Phase 2 (`testing-tax-math-hardening`) with a hand-computed worked-example oracle. The current `playwright.config.ts` webServer is `astro dev`, which the integration cookbook had to pivot away from due to an Astro 6.4.8 + `@astrojs/cloudflare` reload bug.

## Desired End State

Two passing E2E specs run on every PR: a cross-account assertion that user A's dashboard never renders user B's PPK transaction markers, and a cross-cutoff valuation assertion that the dashboard renders the hand-computed PLN SUM exactly for a holder whose history crosses 2024-11-07. Both specs are paired with documented mutation drills that prove they fail for the right reason. The CI gate is required, not optional. Locator and marker conventions stay in lockstep with the integration test via a single shared markers module.

## Key Decisions Made

| Decision                              | Choice                                                                                      | Why (1 sentence)                                                                                                  | Source |
| ------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------ |
| Web server                            | `wrangler dev` against built `dist/`                                                        | Integration tests already pivoted here; avoids the documented `astro dev` reload bug and matches production workerd | Plan   |
| Risk #1 isolation model               | Fixed primary A + ephemeral B per run (admin-created with UUID email)                       | Single storageState for A, fresh B per test means no cross-run drift and no manual reseeding ritual               | Plan   |
| Risk #1 B seeding                     | Authenticated POST as B to `/api/transactions/import` (reuse integration helper)            | Service-role has no DML grant on `public.transactions`; the POST path is proven and exercises real ingestion       | Plan   |
| Risk #4 oracle source                 | Depend on test-plan Phase 2's hand-computed worked-example fixture and `EXPECTED_UNITS_SUM` | Single source of truth across unit + E2E; lifting the oracle from `computeValuation` is the explicit anti-pattern | Plan   |
| Risk #1 assertion shape               | Mirror the integration test's two-marker pattern (positive empty-state + negative price-prompt) | Negative marker is what catches a real leak; pattern is mutation-drill proven                                     | Plan   |
| Cleanup strategy                      | `afterEach` admin-delete ephemeral B; leave fixed primary A intact (seeded once)            | Per-test isolation for contamination; predictable state for cutoff scenario; no per-run drift                     | Plan   |
| Risk #4 price snapshot                | Pre-seed a fixed `price_snapshots` row via admin client (reference data, no RLS)            | Only way to assert an exact PLN value; route-stub bypassed by SSR DB read; live scraper is Risk #5 territory      | Plan   |
| Scope + CI                            | Two risk specs only; wire into CI as a required gate (after 2 green runs)                   | Matches change.md scope; closes test-plan § 5 e2e gate row; avoids gating PRs on a still-flaky suite              | Plan   |

## Scope

**In scope:**
- New: `tests/e2e/risk-01-cross-account.spec.ts`, `tests/e2e/risk-04-cross-cutoff-valuation.spec.ts`
- New: `scripts/seed-e2e-primary.ts` (idempotent primary-account seeder)
- New: `src/lib/dashboard/markers.ts` (shared marker constants), `tests/_helpers/session.ts` + `tests/_helpers/seed.ts` (extracted shared helpers)
- Modified: `playwright.config.ts` (webServer pivot), `.env.example` (5 env vars documented), `.github/workflows/ci.yml` (new e2e job)
- Refactor: `tests/integration/risk-01-rls-route-leak.test.ts` to import markers + helpers from the shared modules

**Out of scope:**
- Risk #2 (tax math correctness) — Phase 2 unit-test territory
- Risk #5 (analizy.pl scraper), Risk #6 (10ms CPU limit) — different test layers
- Test-plan § 3 Phase 4's optional happy-path smoke ("sign-in → upload → dashboard renders all 3 scenarios") — separate change folder
- Visual / pixel-diff / vision-model checks
- Granting `service_role` DML on `public.transactions`
- Multi-browser sweep (chromium only)
- Global cleanup job for orphaned auth.users rows

## Architecture / Approach

```
                ┌─────────────────────────────────────────────┐
                │            Playwright (chromium)            │
                │   webServer: wrangler dev against dist/     │
                └──────────────────┬──────────────────────────┘
                                   │
                ┌──────────────────┴──────────────────┐
                │                                     │
        ┌───────▼────────┐                  ┌─────────▼────────┐
        │  Risk #1 spec  │                  │   Risk #4 spec   │
        │ ephemeral B    │                  │ fixed primary A  │
        │ via admin API  │                  │ seeded once via  │
        │ + POST seed    │                  │ npm run seed:e2e │
        └───────┬────────┘                  └─────────┬────────┘
                │                                     │
                └──────────────┬──────────────────────┘
                               │
                ┌──────────────▼───────────────┐
                │  Shared markers + helpers    │
                │  also used by integration    │
                └──────────────────────────────┘
```

Phase 1 lays infrastructure (webServer, shared markers, shared helper, env). Phase 2 ships the Risk #1 spec. Phase 3 ships the Risk #4 spec (depends on test-plan Phase 2 oracle). Phase 4 gates CI.

## Phases at a Glance

| Phase                                         | What it delivers                                                                                    | Key risk                                                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1. Test infrastructure                        | wrangler webServer pivot, shared markers + helpers, env contract                                    | Build-then-serve startup adds ~30s to first CI run; integration suite must not regress on refactor    |
| 2. Risk #1 spec                               | Browser-level lock on cross-account dashboard isolation                                              | Ephemeral B cleanup failure could pollute auth.users over time                                         |
| 3. Risk #4 spec                               | Browser-level lock on cross-cutoff dashboard valuation                                               | Blocked on test-plan Phase 2 producing the fixture + hand-computed oracle                              |
| 4. CI gating                                  | E2E job runs on every PR; required gate after 2 green runs                                          | Flaky test gating PRs would damage trust — `continue-on-error` ramp protects against this              |

**Prerequisites:** Dedicated Supabase test account (primary) with `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` exported; local Supabase stack running (`supabase start`); CI secrets configured for all 5 env vars before Phase 4 flips the gate; test-plan Phase 2 must produce the cross-cutoff fixture + `EXPECTED_UNITS_SUM` before Phase 3 starts.

**Estimated effort:** ~3 working sessions across 4 phases (1: infra refactor; 2: Risk #1 spec; 3: Risk #4 spec gated on Phase 2 fixture; 4: CI wiring + observation runs).

## Open Risks & Assumptions

- Assumes test-plan Phase 2 (`testing-tax-math-hardening`) lands its cross-cutoff fixture + hand-computed `EXPECTED_UNITS_SUM` before Phase 3 of this plan starts. If Phase 2 slips, Phases 1, 2, and 4-without-Risk-#4 can still proceed; Phase 3 pauses.
- Assumes the CI integration job already starts the Supabase stack (per `test-plan.md:146`). If that workflow shape changes, the e2e job inherits the breakage.
- Assumes `supabase.auth.admin.deleteUser` cascades transactions cleanup (FK ON DELETE CASCADE). If it does not, Phase 2's `afterEach` may leak rows even as users are deleted; a verification step in Phase 2 manual testing covers this.
- Assumes the rendered PLN currency format (`Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" })`) is stable across Node/V8 versions in CI vs local. Mismatch would surface as a `toHaveText` failure — easy to diagnose, would require pinning or using a regex-with-anchored-digits fallback.

## Success Criteria (Summary)

- A signed-in user can never see another user's PPK transaction markers on `/dashboard` — proven on every PR by a browser-driven test.
- A holder whose history crosses 2024-11-07 sees the correct hand-computed PLN dashboard valuation — proven on every PR by a browser-driven assertion against an external oracle.
- Both specs fail under their documented mutation drills (RLS-policy-flip for #1, naive-SUM substitution for #4), proving they fail for the right reason — not just on accidental copy edits.
