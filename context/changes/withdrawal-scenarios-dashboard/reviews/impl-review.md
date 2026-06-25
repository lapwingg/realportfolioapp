<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Withdrawal scenarios dashboard

- **Plan**: context/changes/withdrawal-scenarios-dashboard/plan.md
- **Scope**: All 5 phases (full plan)
- **Date**: 2026-06-25
- **Verdict**: APPROVED (with one minor warning)
- **Findings**: 0 critical · 1 warning · 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS (automated; manual rows pending by design) |

Automated checks re-run: verify-scenarios 53/53 · verify-valuation 10/10 · verify-parser 14/14 · verify-price-parser 13/13 · lint clean · build green · `grep TODO tax-constants.ts` empty · `grep redirect("/")` empty · `grep AppIntro` matches both pages.

## Findings

### F1 — Auth page headings left untranslated without TODO marker

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; one-line edits in two files
- **Dimension**: Pattern Consistency
- **Location**: src/pages/auth/signin.astro:14, src/pages/auth/signup.astro:14
- **Detail**: Plan §Phase 5 §3 + §4 said: optionally translate "Sign in" → "Zaloguj się" and "Sign up" → "Zarejestruj się", OR add a `// TODO: PL-translate (S-03 follow-up)` comment if deferred. Neither was done. AGENTS.md Polish-UI convention + the existing /setup translation done in this slice means these two English headings are now the only untranslated user-facing strings in the new surface.
- **Fix**: Translate the two headings now — "Sign in" → "Zaloguj się", "Sign up" → "Zarejestruj się". Two-line change.
- **Decision**: FIXED

### F2 — JS Date rolls invalid calendar dates; postgres is the actual gate

- **Severity**: ℹ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/profile/save-birth-date.ts:21-24
- **Detail**: `new Date("2024-02-30T00:00:00Z")` returns 2024-03-01 silently (JS rolls overflow days). `Number.isNaN(parsed.getTime())` doesn't catch it. In practice postgres's `date` type rejects "2024-02-30" with an out-of-range error, so the user sees a clean redirect — but the error banner shows the raw postgres text rather than a curated Polish copy.
- **Fix**: Add a round-trip check after parse: `if (parsed.toISOString().slice(0,10) !== raw) return …`. One line; closes the validator before postgres has to.
- **Decision**: FIXED

### F3 — Leap-year birthday rollover in addYearsIso

- **Severity**: ℹ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/lib/scenarios/availability.ts:11-13
- **Detail**: Feb-29 birthday + 45 or +60 years where the target year is not a leap year — `Date.UTC(y+years, m-1, d)` rolls Feb 29 → Mar 1. The user's housing/retirement boundary lands one day later than the "anniversary" reading would suggest. ~0.07% population, by one day.
- **Fix**: Document the rollover in a one-line code comment, or clamp Feb-29 to Feb-28 in non-leap target years. Probably document; not worth the branch.
- **Decision**: FIXED

### F4 — TxRow interface widens source from contribution_source to string

- **Severity**: ℹ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Architecture
- **Location**: src/pages/dashboard.astro:21-26
- **Detail**: Local TxRow interface declares `source: string` instead of the strict `Database["public"]["Enums"]["contribution_source"]` enum that database.types.ts provides. Loosens type safety at the dashboard boundary; harmless because computeScenarios accepts the wider type and switches on string values.
- **Fix**: Optional — import the typed Row from database.types.ts or use the enum directly. Skip if the indirection isn't earning its keep here.
- **Decision**: FIXED
