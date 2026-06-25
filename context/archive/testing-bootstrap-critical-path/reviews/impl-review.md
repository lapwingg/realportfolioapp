<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Testing Bootstrap — Critical Path

- **Plan**: `context/changes/testing-bootstrap-critical-path/plan.md`
- **Scope**: Phases 1–5 of 5
- **Date**: 2026-06-25
- **Verdict**: REJECTED (recoverable in same change with F1 fixed)
- **Findings**: 1 critical, 7 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Findings

### F1 — Risk #1 test green-lights several real RLS leaks

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; the whole change exists for this assertion to be sharp
- **Dimension**: Safety & Quality
- **Location**: tests/integration/risk-01-rls-route-leak.test.ts:37-45
- **Detail**: Asserts A's `/dashboard` contains the empty-state marker, which is also rendered on query error, missing env, or silently failed B-seed. Minimal mutation that should fail (weaken `transactions_select_own` USING to `true`) can pass if any precondition path produces the empty state.
- **Fix**: Assert `countOwnTransactions(userB) > 0` and `countOwnTransactions(userA) === 0` as preconditions; then assert body does NOT contain a B-derived positive marker (B's units sum formatted as `pl-PL` PLN). Restores the negative-canary shape the original plan called for.
- **Decision**: FIXED — applied as preconditions + dual-marker (empty-state present AND price-prompt marker "Pobierz cenę…" absent). Tests still green; mutation-drill validation deferred to F2.

### F2 — Manual mutation drills (3.4–3.6) marked done without running

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — F1 is exactly the bug those drills exist to catch
- **Dimension**: Success Criteria
- **Location**: plan.md Progress 3.4, 3.5, 3.6 (all [x] a129143)
- **Detail**: Plan §"Implementation Note" L267 says drills are "the only thing that proves the tests are real." Drill was not performed.
- **Fix**: After F1 lands, run all three mutations end-to-end (weaken RLS / drop onConflict / route-trusts-form-user_id), confirm each test fails as expected, revert.
- **Decision**: FIXED — all three drills ran. Drill 1 RED (F1 fix validated). Drill 2 partially RED (overlap fires; byte-identical passes for the wrong reason — DB unique constraint absorbs duplicates regardless of route's `ignoreDuplicates`; sub-finding worth a follow-up). Drill 3 RED via RLS-denial path (empirically confirms F3). After revert: all 4 risk tests green.

### F3 — Risk #7 test catches the regression via RLS, not via route hygiene

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: Safety & Quality
- **Location**: tests/integration/risk-07-idor-forged-payload.test.ts:21-44
- **Detail**: `countB === 0` is guaranteed by RLS WITH CHECK regardless of what the route does. If a future change copies form `user_id` into payload, RLS denies the batch → route 303s to /setup?error → `countA === 0` fires (regression caught, but via DB, not route hygiene). Test header overpromises.
- **Fix A ⭐ Recommended**: Add a stronger assertion on the redirect URL: must be `/setup?imported=N&skipped=M`, not `/setup?error=...`. Separates "route ignored field" from "RLS rejected batch."
  - Strength: Honest about layering; redirect URL is deterministic.
  - Tradeoff: Slight test complexity.
  - Confidence: HIGH.
  - Blind spot: A route that swallows errors into success-shape redirects would defeat this; not the current code.
- **Fix B**: Just update the header comment to acknowledge RLS denial is the actual catch path; remove the misleading "if a future change starts trusting form user_id, this fails" claim.
  - Strength: Zero code change, honest framing.
  - Tradeoff: Doesn't strengthen the test, only the documentation.
  - Confidence: HIGH.
  - Blind spot: None.
- **Decision**: PENDING

### F4 — Wrangler stdout pipe never consumed; stderr filter swallows diagnostics

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: Safety & Quality (Reliability)
- **Location**: tests/integration/_helpers/global-setup.ts:88-107
- **Detail**: (1) `stdio: [ignore, pipe, pipe]` + no stdout consumer → ~64KB pipe-fill hangs wrangler after a handful of requests. (2) stderr regex `/error/i` swallows useful non-error lines and echoes benign substring matches.
- **Fix**: Attach no-op stdout consumer (or pipe to bounded buffer); drop the stderr filter, forward unconditionally with a prefix.
- **Decision**: FIXED — stdout drained; stderr forwarded unconditionally with `[wrangler]` prefix.

### F5 — `TestUser.supabaseAdmin` exposes the service-role key to every test

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: Architecture / Pattern Consistency
- **Location**: tests/integration/_helpers/session.ts:9, 64
- **Detail**: Field is currently unused (dead) but invites future tests to bypass RLS one attribute access away from every signed-in user. Production deliberately exposes no service-role path.
- **Fix**: Drop `supabaseAdmin` from `TestUser` return value. Inline a service-role client in any one-off test that genuinely needs it, with a comment.
- **Decision**: FIXED — removed from interface + return; internal `adminClient()` use stays in `createSignedInUser` for admin createUser only.

### F6 — Cookie chunking will silently break `countOwnTransactions` on large JWTs

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: Safety & Quality (Reliability)
- **Location**: tests/integration/_helpers/session.ts:73-89
- **Detail**: `@supabase/ssr` chunks the auth-token cookie above ~3KB into `…auth-token.0`, `.1`. Helper attempts JSON.parse on each chunk independently → all fail → throws. Demo JWTs are small so today's tests pass; bumping claims or SDK version breaks it.
- **Fix**: Symmetric with `createSignedInUser`: build a `createServerClient` with the captured cookies as input, read `auth.getSession().access_token`. Delegates chunk handling to the SDK.
- **Decision**: FIXED — `accessTokenFromCookie` now async, delegates to `createServerClient` + `auth.getSession()`. Handles chunked cookies transparently. `countOwnTransactions` awaits the new helper.

### F7 — CI runs two Supabase CLIs from two install paths

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: CI Safety / Pattern Consistency
- **Location**: .github/workflows/ci.yml:28-31 + package.json:65
- **Detail**: `supabase/setup-cli@v1` (CI step) and the npm devDep `"supabase": "^2.23.4"` (used by `npx supabase status` in globalSetup) are two different binaries. Version skew between status JSON shapes has historically been a flake source.
- **Fix**: Drop the setup-cli step; use `npx supabase start` in CI; pin via the devDep as single source of truth.
- **Decision**: FIXED — setup-cli step removed; all CI supabase invocations use `npx`.

### F8 — CI loses test signal on first failure; no log artifacts

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: CI Safety
- **Location**: .github/workflows/ci.yml:38-47
- **Detail**: No `if: always()` on Integration or pgTAP steps — unit-test failure short-circuits both. No artifact upload of wrangler/supabase logs on failure → post-mortem is just re-reading run logs.
- **Fix**: `if: ${{ !cancelled() }}` on Integration + pgTAP. Add `actions/upload-artifact@v4` with `if: failure()` for `supabase logs` + wrangler log. (Composes with F4 fix — file output is needed.)
- **Decision**: FIXED — `if: !cancelled()` on Integration + pgTAP; added "Capture Supabase logs on failure" step (api/auth/db) and `actions/upload-artifact@v4` upload of `ci-logs/` with 7-day retention.

### F9 — `buildIfMissing()` never checks dist freshness

- **Severity**: ◦ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality (Reliability)
- **Location**: tests/integration/_helpers/global-setup.ts:52-62
- **Detail**: `existsSync` is the only freshness gate. Editing `src/` without rebuilding silently exercises stale code locally.
- **Fix**: Compare dist/server/entry.mjs mtime vs newest mtime under src/; rebuild if stale (or always rebuild — cheap with Astro).
- **Decision**: SKIPPED — local-dev annoyance only; CI always builds.

### F10 — Risk test headers omit mutation-drill notes

- **Severity**: ◦ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: tests/integration/risk-01-…, risk-03-…, risk-07-….test.ts
- **Detail**: The pgTAP test carries a "FORCE RLS sanity-check drill" note naming the exact regression each assertion catches. New TS tests have risk-source headers but no mutation-drill notes. Had Risk #1 forced one, F1 would have surfaced at authoring time.
- **Fix**: Add a 2-3 line "Mutation drill" block at the bottom of each risk-test header. If author can't name one, redesign the test.
- **Decision**: SKIPPED — risk-01 and risk-07 picked up drill notes as part of F1/F3 fixes; risk-03 left as-is (drill outcome captured in this review).
