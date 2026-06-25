---
change_id: e2e-rls-and-auth-smoke
title: E2E smoke for auth boundary and RLS isolation
status: implementing
created: 2026-06-25
updated: 2026-06-25
archived_at: null
---

## Notes

Scaffolded manually (equivalent to `/10x-new`) because the parent session
ran from a different repo. Re-open Claude Code in this repo and continue
with `/10x-plan` against this change folder.

Anchors `context/foundation/test-plan.md` § 3 Phase 4 (optional Playwright
smoke) and the two highest browser-level risks from § 2:

- **Risk #1** (high/high) — cross-account data exposure. A signed-in user
  must not fetch or dashboard another user's PPK transactions or scenario
  amounts. Full path: auth → middleware → API route → Supabase RLS.
- **Risk #4** (high/medium) — fund Zamiana dashboard valuation. A user
  with history crossing the 2024-11-07 OLD→NEW cutoff must see a correct
  dashboard SUM. Full path: signed-in render → server-side calculation →
  rendered numbers.

## Prerequisites (already in repo)

- `playwright.config.ts` with `setup` + `chromium` projects and `storageState`
- `tests/e2e/auth.setup.ts` driving the real signin form
- `tests/e2e/seed.spec.ts` as the model for Generator
- `.gitignore` covers `playwright/.auth/`, `test-results/`, `playwright-report/`

## Required before driving E2E phases

- Dedicated Supabase test account; `E2E_TEST_EMAIL` + `E2E_TEST_PASSWORD`
  exported in the shell running `npm run test:e2e`.
- For Risk #1: a second test account with at least one PPK transaction
  owned by it, so the assertion can prove the first user does NOT see it.
- Local Supabase stack running (`supabase start`) so RLS policies are real,
  not mocked.

## Out of scope

- Risk #2 (tax math correctness) — unit/integration only; E2E would lie.
- Risk #5 (analizy.pl scraper) — covered by nightly shape probe per § 5.
- Risk #6 (Workers 10ms CPU limit) — observed in production logs, not E2E.
