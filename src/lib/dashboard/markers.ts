// Single source of truth for load-bearing dashboard copy strings consumed by
// both integration (tests/integration/risk-01-rls-route-leak.test.ts) and
// E2E (tests/e2e/risk-01-cross-account.spec.ts) suites. Editing the matching
// Polish copy in src/pages/dashboard.astro requires updating these constants;
// drift between layers becomes impossible.

export const EMPTY_STATE_MARKER = "zaimportuj plik transakcji";
export const PRICE_PROMPT_MARKER = "Pobierz cenę, aby zobaczyć wycenę portfela.";
