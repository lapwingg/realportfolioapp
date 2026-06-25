# Testing Bootstrap — Critical Path — Plan Brief

> Full plan: `context/changes/testing-bootstrap-critical-path/plan.md`
> Test plan: `context/foundation/test-plan.md` (this change is §3 Phase 1)

## What & Why

Install Vitest and land the integration harness + three risk-defending tests that close the load-bearing data-isolation gaps in this app: cross-account read leak (Risk #1), Allianz file dedupe (Risk #3), and IDOR via forged `user_id` payloads (Risk #7). Without this phase, every subsequent feature ships against the assumption that RLS, dedupe, and request-identity work — an assumption no test currently defends at the route layer where these failures live.

## Starting Point

The project has lint + build in CI, four ad-hoc `verify-*.ts` scripts in `scripts/` run via `tsx`, and one pgTAP file (`supabase/tests/rls_isolation.test.sql`) that proves RLS at the DB layer but does not run in CI and does not exercise the route layer. No JS/TS test runner is installed. Supabase CLI is a devDep; the local stack is one `supabase start` away.

## Desired End State

A signed-in user A who fetches `/dashboard` never sees user B's data, even if RLS is later weakened (the test catches it). Re-uploading the same Allianz file produces no duplicate rows. A forged `user_id` in a request payload never lands a row under another user. All three failures are blocked by CI on every PR to `master`, and the test-plan cookbook tells a future contributor exactly how to add the next test in the same pattern.

## Key Decisions Made

| Decision                                              | Choice                                                                                  | Why (1 sentence)                                                                                                                                                  | Source     |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| Test runner                                           | Vitest                                                                                  | First-party Vite integration matches the Astro 6 + React 19 + Vite toolchain; named recommended in test-plan §4.                                                  | Test plan  |
| Likely cheapest layer per risk                        | Integration tests for #1, #3, #7                                                        | Test-plan §2 Risk Response Guidance says the failures live at the route layer (middleware + handler), not at the DB or the JS module boundary.                    | Test plan  |
| CI Supabase strategy                                  | `supabase start` inside the GHA runner (Docker-in-Docker)                               | Identical to local dev (same `config.toml`, same migrations) and supabase CLI is already a devDep; ~60-90s cost is acceptable for the signal.                     | Plan       |
| Test layout                                           | Co-located unit (`*.test.ts` next to source) + centralized `tests/integration/`, one Vitest config with `unit` and `integration` projects | Co-location matches dominant JS/TS convention for unit tests; integration directory cleanly carries the Supabase setup cost without slowing the unit loop.       | Plan       |
| Authenticated session helper                          | `auth.admin.createUser` → `signInWithPassword` → capture cookies → fetch real route     | Exercises the full middleware → `supabase.auth.getUser()` → route path; manually-minted JWTs would skip the production auth path and risk passing for the wrong reason. | Plan       |
| Existing pgTAP RLS test                               | Keep + run in CI via `supabase test db`                                                 | DB-layer regression lives at the DB; route-layer regression lives at the route; each test is at the layer its risk lives at, no duplicate proof.                  | Plan       |
| Per-test isolation                                    | Fresh randomized user per test, no global teardown                                       | Trivial, parallelizable, mirrors production partitioning; relies on RLS (which is what's tested — the failure mode would surface as a failing test).              | Plan       |
| CI gate timing                                        | Hard-required on PRs to `master` from Phase 1 completion onward                          | Test-plan §5 explicitly names this gate as required after §3 Phase 1; soft-required windows risk being forgotten under a 2026-07-05 deadline.                    | Plan       |

## Scope

**In scope:**
- Vitest install + config with `unit` and `integration` projects
- Three new npm scripts (`test`, `test:integration`, `test:all`)
- Integration harness: global Supabase boot, session helper, in-process Astro SSR fetch helper
- Three integration tests defending Risks #1, #3, #7
- CI workflow update: `supabase start`, run Vitest unit + integration, run pgTAP via `supabase test db`, all required for merge
- Test-plan cookbook fills for §6.1 (unit) and §6.2 (integration), §6.7 per-phase note, §3 row marked `complete`

**Out of scope:**
- Tax-math, valuation, scraper, or CPU-budget tests (Phases 2 + 3 of test-plan rollout)
- Playwright / e2e (Phase 4 of rollout, optional)
- Coverage thresholds, MSW, `@vitest/ui`
- Migrating the four `verify-*.ts` scripts to Vitest
- Branch protection configuration in GitHub (documented as follow-up if not already set)

## Architecture / Approach

```
                       ┌──────────────────────────────┐
                       │  GitHub Actions ci job       │
                       │                              │
   PR to master  ───▶  │  lint → build →              │
                       │  supabase start →            │
                       │  npm test (Vitest unit) →    │
                       │  npm run test:integration ─┐ │
                       │  supabase test db (pgTAP)  │ │
                       │                            │ │
                       └─────────────────┬──────────┼─┘
                                         │          │
                       ┌─────────────────▼──────────▼────────┐
                       │ Local Supabase stack (port 54321/2) │
                       │   ├─ auth.users (admin-created)     │
                       │   ├─ public.transactions (RLS)      │
                       │   └─ public.price_snapshots (RLS)   │
                       └─────────────────▲───────────────────┘
                                         │
   tests/integration/*.test.ts           │
   ──────────────────────────             │
   createSignedInUser() ──admin create──┐ │
        ↓                               │ │
   cookie ─▶ fetchRoute('/dashboard')   ▼ │
                  ↓                      │
       Astro SSR (in-process App)  ◀────┘
                  ↓
       middleware: supabase.auth.getUser()
                  ↓
       route handler reads via @supabase/ssr client
                  ↓
       Postgres with RLS USING auth.uid() = user_id
```

Integration tests hit the same Astro SSR entry the production Worker runs, via constructed `Request` objects with real session cookies. The pgTAP file continues to prove DB-layer policies; the new Vitest suite proves route-layer enforcement. Each test creates its own user; RLS partitions writes by `user_id`.

## Phases at a Glance

| Phase                                 | What it delivers                                                              | Key risk                                                                                            |
| ------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1. Bootstrap Vitest                   | Vitest installed, two projects configured, `npm test` proves the runner       | None major — install + config; lessons.md `package-lock.json` registry rule applies                |
| 2. Integration harness                | `createSignedInUser` + `fetchRoute` helpers + smoke test prove the harness    | Astro 6 SSR-entry boot path and `@supabase/ssr` cookie shape both need verification at implementation time |
| 3. Risk-defending integration tests   | Three tests for Risks #1 / #3 / #7 + mutation drill to prove they catch bugs  | Without the mutation drill, the tests could pass for the wrong reason (oracle problem)              |
| 4. CI wiring + required gate          | CI runs supabase + unit + integration + pgTAP, all required for merge         | `supabase start` cold-pull adds 60-90s; CI flakes block PRs until fixed                             |
| 5. Update test-plan cookbook          | §6.1 + §6.2 filled in, §3 Phase 1 marked complete, freshness ledger bumped    | Forgetting this step leaves future contributors guessing the pattern                                |

**Prerequisites:** Local Supabase stack runnable (`supabase start` works against `supabase/config.toml`). Docker available on dev machine. GitHub Actions can run Docker on ubuntu-latest (default — no special setup needed). `package-lock.json` `resolved` URLs already on the public registry (verify per `lessons.md` rule 2 after `npm i -D vitest`).

**Estimated effort:** ~3-4 after-hours sessions across 5 phases. Phase 2 is the longest (helper bring-up). Phase 4 is short but requires a real PR to verify branch behaviour.

## Open Risks & Assumptions

- **Astro 6 SSR-entry boot in-process.** The exact way to boot the Astro App for in-process `Request` handling (vs. running `astro dev` as a subprocess) needs current Astro 6 docs verification at Phase 2 implementation time — `WebFetch` against `docs.astro.build`. If the App API is unstable in Astro 6, the fallback is a `astro dev` subprocess with a port-listen wait, paying ~3-5s startup per `vitest run`.
- **`@supabase/ssr` cookie shape.** The session helper must build the exact cookie format `@supabase/ssr` reads. Cookie name and JSON shape should be verified against `@supabase/ssr` source at Phase 2 implementation time, not guessed.
- **CI Docker reliability.** `supabase start` on ubuntu-latest is reliable in practice but not bulletproof. First sustained flake (>2 PRs blocked in a week) is the trigger to revisit caching (Phase 4 optional step) or switch to a Postgres service container (rejected option 3 in the questioning round).
- **Risk #7 currently passes on green code.** The test demonstrates expected behaviour and is the regression lock against any future code that starts trusting `user_id` from the form. The mutation drill in Phase 3 manual verification proves the test actually catches that mutation.

## Success Criteria (Summary)

- A signed-in user can never see another user's data through any production read path that exists today — and CI will fail any PR that introduces such a leak.
- Re-uploading the same Allianz file is a no-op; partial overlaps merge cleanly; CI fails any PR that breaks this.
- Forged-payload IDOR attempts produce zero rows under the attacker's chosen victim; CI fails any PR that starts trusting client-supplied `user_id`.
