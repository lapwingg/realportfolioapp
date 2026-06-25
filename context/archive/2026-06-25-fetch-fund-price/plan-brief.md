# Fetch Fund Unit Price — Plan Brief

> Full plan: `context/changes/fetch-fund-price/plan.md`

## What & Why

A signed-in user clicks "Pobierz cenę" on `/dashboard`; the server fetches `analizy.pl/fundusze-ppk/ALL88/allianz-plan-emerytalny-2055`, parses the unit price, writes it under RLS into the already-shipped `price_snapshots` table (skipping when the new price equals the latest stored one), and the page re-renders showing the user's portfolio valuation (`SUM(transactions.units) × price`), the units × price breakdown, ticker + fund label, and a clearly-labeled "Pobrano ..." timestamp. This is roadmap slice **S-02** — together with the shipped S-01 it removes the last prerequisite blocking S-03's withdrawal-scenarios dashboard.

## Starting Point

F-01 already shipped a typed `price_snapshots` table — `(user_id default auth.uid(), ticker, price numeric(20,4), fetched_at default now())` — with FORCE RLS, four per-operation policies, and a `(user_id, ticker, fetched_at desc)` index whose migration comment explicitly says "for the latest-price query in S-02/S-03". The API-route convention (`prerender = false` + `context.locals.user` auth-check + 303-redirect with named query params) and the SSR-page-reads-Supabase pattern are both established by S-01 in `src/pages/api/transactions/import.ts:6-53` and `src/pages/setup.astro:1-109`. `/dashboard` today is a minimal 35-line welcome page (`src/pages/dashboard.astro`) that needs a real layout extension. No test framework — S-01 uses `tsx scripts/verify-parser.ts` + a committed fixture, and this slice mirrors that. UI strings are hardcoded in Polish per AGENTS.md. Runtime is Cloudflare Workers with `nodejs_compat`; the 10ms free-plan CPU budget is comfortably more than this slice's hot path.

## Desired End State

A signed-in user lands on `/dashboard` and sees their greeting, valuation block (PLN total, `{units} szt. × {price} PLN` breakdown, ticker + fund label, "Pobrano ..." age), a Pobierz cenę button, an Import-statement link, and sign-out. Clicking the button fetches the analizy.pl page, dedupe-inserts a snapshot under RLS, and re-renders one of five explicit outcomes: **fresh** (just fetched), **fresh+dedup** (price unchanged — small "Cena bez zmian od ostatniego pobrania" note), **stale** (today's fetch failed — prior price shown under an amber-bordered block with explicit "Pobrano N dni temu" age + generic Polish error banner + collapsible `<details>` "Szczegóły" exposing the raw error), **no_price** (red banner asking to fetch), or **no_transactions** (hint linking back to `/setup`). Two users cannot see each other's snapshots or valuations (RLS, same guarantee as F-01). `npm run verify-price-parser` exercises the Polish-decimal-comma case + selector happy path against a committed fixture.

## Key Decisions Made

| Decision                    | Choice                                                                                              | Why (1 sentence)                                                                                                                                                       | Source |
| --------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Fund identity scope         | Hardcoded `ALL88` ticker + URL + label as `const` in `src/lib/analizy/types.ts`                     | PRD §Non-Goals explicitly excludes multi-fund; single user + single PPK in MVP — param-driven would over-engineer and multi-fund needs a schema change that's also out of scope. | Plan   |
| UI location                 | Extend `/dashboard` in place                                                                        | One protected page the user already knows; S-03 swaps the valuation block in place — minimum throwaway work vs a separate `/prices` route.                              | Plan   |
| Failure UX (with prior data)| Show prior price + amber-bordered block + explicit "Pobrano N dni temu" age + generic Polish banner | Honors FR-007 (never show stale as current) while preserving useful prior data; the age label makes "old" obvious.                                                      | Plan   |
| Snapshot dedup              | Skip insert if `Number(latest.price) === result.price`; redirect with `?dedup=1`                    | Append-only in spirit, no trivial double-click dupes, displayed `fetched_at` is the moment the price *last actually changed* — more informative than "last click".      | Plan   |
| Auto-fetch on first visit   | Always require explicit click                                                                       | Outbound network calls happen only when the user asked; GET on `/dashboard` stays side-effect-free; matches PRD §Non-Goals ("no automatic / scheduled price refresh"). | Plan   |
| Empty-state (units = 0)     | Hint linking to `/setup` ("Najpierw zaimportuj plik transakcji.")                                   | Guides the user to the missing prerequisite explicitly; valuation is meaningless without units; matches the conversational tone of `/setup`'s existing banners.        | Plan   |
| Error message granularity   | Generic Polish primary banner + collapsible `<details>` "Szczegóły" with raw decoded `priceError`   | Clean Polish UX for the persona who isn't a developer; full diagnostic for the solo operator; native `<details>` requires no JavaScript and matches the no-React-island dashboard. | Plan   |
| Scraping primitive          | `node-html-parser` (single ~50KB pure-JS dep)                                                       | `HTMLRewriter` is Workers-only and would block the Node verify script from exercising production code; `node-html-parser` runs identically in Workers + Node.           | Plan   |
| Multi-fund valuation        | MVP single-fund approximation: `SUM(transactions.units) × ALL88 price`                              | S-01 explicitly deferred multi-fund accounting and noted the current user is fully switched out — gap is small for current user, flagged in README for the next user.   | Plan   |
| Test approach               | Committed `tests/fixtures/analizy-sample.html` + `tsx scripts/verify-price-parser.ts`               | Matches the S-01 precedent (no test framework adoption); fixture documents "what the page looked like on the date we wrote this" for future regression diagnosis.       | Plan   |

## Scope

**In scope:**

- `node-html-parser` dependency (single ~50KB pure-JS module)
- `src/lib/analizy/{types,parse}.ts` — pure modules (`TICKER`/`ANALIZY_URL`/`FUND_LABEL` constants; selector-based extract + Polish-decimal-comma normalize + discriminated `ParseResult`)
- `tests/fixtures/analizy-sample.html` + `scripts/verify-price-parser.ts` + `npm run verify-price-parser`
- `src/pages/api/prices/fetch.ts` — POST API route (fetch with UA + 8s timeout, parse, dedup-read latest snapshot, conditional INSERT under RLS, 303 redirect with `?priced=1` / `?priced=1&dedup=1` / `?priceError=...`)
- `/api/prices` added to `PROTECTED_ROUTES` in `src/middleware.ts:4`
- `src/pages/dashboard.astro` rewrite — valuation block, five render outcomes (`fresh`, `fresh+dedup`, `stale`, `no_price`, `no_transactions`), Pobierz cenę button (`<form method="POST">` — no React island), generic Polish error banner + `<details>` "Szczegóły" disclosure of raw error
- README "Pobieranie cen" section with the multi-fund caveat

**Out of scope:**

- Schema changes (no `fund_name` column, no new table, no migration)
- Multi-fund unit accounting (single-fund approximation in MVP)
- Multi-ticker support (PRD §Non-Goals)
- Automatic / scheduled price refresh (PRD §Non-Goals)
- Auto-fetch on first dashboard visit (GET stays side-effect-free)
- Historical price chart (PRD §Non-Goals)
- After-tax math, withdrawal scenarios, gain/loss vs own capital (S-03)
- `vitest` / test framework adoption (S-01 precedent)
- Retry logic on fetch failure
- Rate-limiting / abuse protection
- Service-role Supabase client
- New env vars

## Architecture / Approach

Three independently shippable phases mirroring S-01's three-layer decomposition: **pure logic** (parser module + verify script + fixture, no DB, no UI), **server route** (one POST endpoint that delegates to the parser, dedup-reads the latest snapshot, conditionally inserts under the user's JWT with RLS enforcing ownership, redirects with named query params), **user-visible UI** (`/dashboard` rewrite reading `SUM(units)` + latest snapshot under RLS, five explicit render outcomes driven by query params + snapshot presence + units count, single-form-button progressive enhancement, generic Polish error banner with `<details>` raw-error disclosure). Each phase has a manual gate; regressions at any layer are locally diagnosable.

## Phases at a Glance

| Phase                                                  | What it delivers                                                                                                                                                                                                       | Key risk                                                                                                                                                                                          |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Parser + fixture + verify script                    | `node-html-parser` install, pure `src/lib/analizy/{types,parse}.ts` (extract + Polish-decimal-comma normalize), committed `tests/fixtures/analizy-sample.html`, `npm run verify-price-parser`                          | Wrong CSS selector or silent `parseFloat('12,3456') === 12` truncation — both defended by the verify script + a deliberate-fixture-corruption manual check                                       |
| 2. API route + middleware gate + dedup write           | POST handler: fetch with UA + 8s timeout, parse, dedup-read against latest snapshot, conditional INSERT under RLS, 303 redirect with `?priced=1` / `?priced=1&dedup=1` / `?priceError=...`; `/api/prices` middleware gate | Outbound fetch flakiness + dedup race on double-click — defended by treating duplicates as benign and verifying both happy and error paths via curl + Studio                                       |
| 3. Dashboard rewrite + README                          | Server-side `SUM(units)` + latest snapshot query, five render outcomes, single-form-button, generic Polish error banner + `<details>` raw-error disclosure, README "Pobieranie cen" section                            | Stale-vs-current confusion (FR-007) — defended by an explicit amber-bordered block + age label + manual forced-failure check; Polish-strings consistency — defended by an explicit manual checklist |

**Prerequisites:** F-01 + S-01 shipped. Local Docker + `supabase start` running. Hosted Supabase project linked. The implementer can manually open the analizy.pl page in a browser to record the CSS selector + reference price for the fixture during phase 1 step 1.
**Estimated effort:** ~1–2 after-hours sessions across the 3 phases.

## Open Risks & Assumptions

- **Multi-fund approximation.** `SUM(transactions.units) × ALL88 price` is mathematically exact only when historical Zamiana conversions preserved value 1:1; for the current user (fully switched out of `Allianz PPK 2055` into `Plan Emerytalny 2055`) the gap is small and acceptable for MVP. README documents the caveat for any future user still split across funds.
- **analizy.pl markup changes.** The CSS selector is captured during phase 1 from a real fixture; the parser hard-fails on a missed selector (visible `?priceError=Selector matched no element...` reaching the user as a generic Polish banner with the raw error tucked inside `<details>`) rather than silently returning a wrong number. Fixture lets future regressions be reproduced locally without re-hitting the network.
- **`parseFloat('12,3456') === 12` silent truncation.** Headline failure class for Polish-locale numbers. Parser normalizes the comma first AND rejects any post-normalization string failing `/^\d+(\.\d+)?$/`.
- **`fetched_at` is the moment WE pulled the page**, not the trading-day timestamp analizy.pl assigns to the price (which lags by ~1 trading day). UI label is `Pobrano ...` — never something that implies it's the as-of trading date.
- **Cloudflare Workers free-plan 10ms CPU.** This slice's hot path (one `fetch`, one ~200KB HTML parse, one indexed SELECT, one INSERT) is microseconds. The `context/foundation/lessons.md` budget rule explicitly flags S-03's calculation loop as the risk, not this slice.

## Success Criteria (Summary)

- A signed-in user can click Pobierz cenę on `/dashboard` and see total PLN valuation, units × price breakdown, ticker + fund label, and an honest "Pobrano ..." timestamp.
- A second click within seconds shows "Cena bez zmian od ostatniego pobrania" and does NOT add a `price_snapshots` row (dedup verified at the DB).
- Forcing a fetch failure shows the prior price under an amber-bordered block with an explicit "Pobrano N dni temu" age — never as "current" — and exposes the raw error inside `<details>` "Szczegóły".
- Two distinct users cannot see each other's snapshots or valuations (RLS verified end-to-end through the new route + dashboard query).
- `npm run verify-price-parser` is green; deliberately corrupting the fixture makes it red — the regression net works.
