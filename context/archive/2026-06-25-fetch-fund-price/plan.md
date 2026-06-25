# Fetch Fund Unit Price — Implementation Plan

## Overview

Roadmap slice **S-02 (`fetch-fund-price`)**. A signed-in user clicks "Pobierz cenę" on `/dashboard`; the server pulls the current unit price for fund `ALL88` (`Allianz Plan Emerytalny 2055`) from `https://www.analizy.pl/fundusze-ppk/ALL88/allianz-plan-emerytalny-2055`, writes a row into the already-shipped `price_snapshots` table under RLS (skipping the insert if the new price equals the latest stored one), and the page re-renders showing the current portfolio valuation (`SUM(transactions.units) × unit price`), the units × price breakdown, and a clearly-labeled "Pobrano ..." timestamp. Failure modes surface a generic Polish error banner with a collapsible `<details>` disclosure of the raw error string; a stale prior price is shown with an explicit age label under an amber banner — never confused with "current" (FR-006, FR-007). Together with the shipped S-01, this slice removes the last prerequisite blocking S-03's withdrawal-scenarios dashboard.

## Current State Analysis

- **`price_snapshots` already shipped** (`supabase/migrations/20260625101140_create_price_snapshots.sql`) with the exact shape this slice needs: `(id, user_id default auth.uid(), ticker text, price numeric(20,4), fetched_at timestamptz default now())`, FORCE RLS, four per-operation policies, and the index `price_snapshots_user_ticker_fetched_at_desc` whose migration comment explicitly says "for the latest-price query in S-02/S-03". No schema migration is required.
- **`transactions` table** (`supabase/migrations/20260625101139_create_transactions.sql:5-14`) stores `units numeric(20,4)` per row, fund-agnostic (no `fund_name` column). S-01 explicitly deferred multi-fund unit accounting and noted the current user is fully switched out of `Allianz PPK 2055` into `Plan Emerytalny 2055`, so `SUM(units)` is the accepted MVP approximation.
- **API-route convention** (`src/pages/api/transactions/import.ts:6-53`): `export const prerender = false` → `if (!context.locals.user) return context.redirect("/auth/signin", 303)` → body work → `createClient(context.request.headers, context.cookies)` from `@/lib/supabase` → 303 redirect to a page route with named query params (`?error=<encoded>` on failure, success-flag query params otherwise).
- **Middleware** (`src/middleware.ts:4`) gates `["/dashboard", "/setup", "/api/transactions"]` via path-prefix match (`route.startsWith()`). Adding `/api/prices` is a single-line edit.
- **Astro page pattern** (`src/pages/setup.astro:1-109`): `export const prerender = false`, server-side Supabase query under RLS via `createClient(Astro.request.headers, Astro.cookies)`, query-param-driven success/error banners, Tailwind glass-panel design (`bg-white/10 backdrop-blur-xl border border-white/10`).
- **`/dashboard` today** (`src/pages/dashboard.astro`) is 35 lines — greeting + Import-statement link + Sign-out form. Needs a real layout extension to host the valuation block.
- **No test framework** (CLAUDE.md/AGENTS.md, CI gates on lint + build only). S-01 verified its parser with `tsx scripts/verify-parser.ts` + `tests/fixtures/allianz-sample.csv` (`scripts/verify-parser.ts:1-50`). Same pattern fits here.
- **UI strings are Polish** (`AGENTS.md`: "UI strings are hardcoded in Polish — no i18n library").
- **Runtime**: Cloudflare Workers (`wrangler.jsonc`) with `nodejs_compat`. `fetch()` is native. The 10ms free-plan CPU budget (`context/foundation/lessons.md`) is comfortably above this slice's hot path (one fetch + one ~200KB HTML parse + one indexed SELECT + one INSERT).
- **Env vars** are read via `astro:env/server` (`src/lib/supabase.ts:3`); new env additions register in `astro.config.mjs:17-22` `env.schema` and in `src/lib/config-status.ts:11`. This slice adds no new env vars.
- **Supabase client**: only `createServerClient` via `createClient(headers, cookies)` from `@/lib/supabase` (AGENTS.md hard rule — `createClient` from `supabase-js` breaks SSR cookie handling on Cloudflare Workers).

## Desired End State

- A signed-in user lands on `/dashboard` and sees: greeting, an Import-statement link, **valuation block** (PLN total, units × unit price breakdown, ticker label, "Pobrano <relative time>" line), a "Pobierz cenę" button, and sign-out.
- Clicking "Pobierz cenę" POSTs to `/api/prices/fetch`, the server fetches `https://www.analizy.pl/fundusze-ppk/ALL88/allianz-plan-emerytalny-2055`, parses the current unit price, and writes a new `price_snapshots` row under RLS (or skips the insert if `Number(latest.price) === result.price`).
- On parse/network failure: dashboard renders a generic Polish banner ("Pobieranie nie powiodło się. Spróbuj ponownie.") with a collapsible `<details>` "Szczegóły" disclosure exposing the raw `?priceError=` string verbatim. If a prior snapshot exists, the prior valuation is still shown under an amber banner with an explicit age ("dane sprzed N dni"). If no prior snapshot exists, the valuation block is replaced by a red "Pobierz cenę, aby zobaczyć wycenę portfela." banner.
- Two users never see each other's snapshots or valuations (RLS — same guarantee as F-01, exercised end-to-end through the new route + the dashboard query).
- `npm run verify-price-parser` (Node, via `tsx`) asserts the committed `tests/fixtures/analizy-sample.html` fixture parses to the recorded reference price; CI continues to gate on lint + build only.

### Key Discoveries

- `price_snapshots` already has the `(user_id, ticker, fetched_at desc)` index needed for both the API-route dedup read and the dashboard "latest snapshot" query — `src/pages/api/prices/fetch.ts` and `src/pages/dashboard.astro` will both use `.select(...).eq('ticker', TICKER).order('fetched_at', { ascending: false }).limit(1).maybeSingle()`.
- `HTMLRewriter` is exposed only inside the Workers runtime — `tsx scripts/verify-price-parser.ts` running under plain Node has no access to it. To keep one parser path that runs identically in the production Worker and in the Node verify script (so the fixture-driven test actually exercises production code), use `node-html-parser` (pure JS, ~50KB, no native deps, CSS-selector API).
- analizy.pl uses Polish decimal commas (`12,3456`) — `parseFloat('12,3456')` returns `12` silently in V8. This is the exact failure class the FR-006 Socrates note warns against. The parser must replace `,` with `.` BEFORE `parseFloat`, and reject any post-normalization string failing `/^\d+(\.\d+)?$/` (no currency symbols, no thousand separators).
- The S-01 `categoriseRows` output ensures `transactions.units` is always positive (Zamiana sells are filtered out), so `SUM(units)` is safe.

## What We're NOT Doing

- **No schema changes.** `price_snapshots` is reused as-is. No `fund_name` column on `transactions`. No new table. No new index. No new migration file.
- **No multi-fund unit accounting.** Single-fund approximation (`SUM(units) × ALL88 price`) — explicitly accepted as MVP per S-01's archived plan-brief. Future-user-with-active-split caveat documented in README.
- **No multi-ticker support.** `ALL88` ticker, URL, and fund label are hardcoded as `const` in `src/lib/analizy/types.ts` (PRD §Non-Goals: "no multiple fund support").
- **No automatic / scheduled price refresh.** On-demand only (PRD §Non-Goals). A GET on `/dashboard` performs read-only Supabase queries — never an outbound `fetch` to analizy.pl, never a DB write.
- **No auto-fetch on first dashboard visit.** A user with zero snapshots sees the red "Pobierz cenę, aby zobaczyć wycenę portfela." banner and clicks the button — no surprise side-effects on GET.
- **No historical price chart.** `price_snapshots` accumulates over time, but no chart UI (PRD §Non-Goals).
- **No after-tax math, withdrawal scenarios, or gain/loss vs own capital.** That's S-03.
- **No `vitest` / test framework adoption.** Same precedent as S-01 (CLAUDE.md / AGENTS.md).
- **No retries on fetch failure.** Single attempt with `AbortSignal.timeout(8000)`; the user retries by clicking again.
- **No rate-limiting / abuse protection.** Solo personal-use MVP.
- **No service-role Supabase client.** All DB access flows through the user JWT under RLS — same as S-01.
- **No write to `price_snapshots` for an anonymous visitor.** API route is gated by middleware AND by an in-handler `context.locals.user` check (defence in depth).
- **No new env vars.** `SUPABASE_URL` / `SUPABASE_KEY` are the only secrets needed; both are already registered in `astro.config.mjs` and `src/lib/config-status.ts`.

## Implementation Approach

Three independently-shippable phases mirroring S-01's pure-logic → server-route → user-visible-UI decomposition:

1. **Pure parser module** with a committed HTML fixture and a Node assertion script — no Workers runtime dependency, fully testable from `tsx`. The parser splits into `extractPriceText` (DOM selection) and `parsePriceText` (Polish-decimal-comma normalization + format validation) so the failure surface is explicit and each layer is independently assertable.
2. **Server API route** that delegates to the pure parser, dedupes against the latest stored snapshot, writes under the user's JWT (RLS enforces ownership), and 303-redirects back to `/dashboard` with named query params.
3. **Dashboard UI extension** that reads the latest snapshot + sums units to render the valuation block, with four explicit render states (`fresh` / `stale` / `no_price` / `no_transactions`) driven by query params + snapshot presence + units count. Error UX uses a generic Polish banner with a collapsible `<details>` "Szczegóły" disclosure of the raw `?priceError=` string.

Each phase has a manual gate. A regression at any layer is locally diagnosable: parser regressions caught by the verify script + a deliberate-fixture-corruption check, route regressions caught by curl + Supabase Studio inspection, UI regressions caught by browser.

## Critical Implementation Details

### Parser dependency choice (`node-html-parser` over `HTMLRewriter`)

`HTMLRewriter` is exposed only inside the Workers runtime — `tsx scripts/verify-price-parser.ts` running under plain Node has no access to it. To keep one parser path that runs identically in production (Worker) and in the verify script (Node), use `node-html-parser` (`npm i node-html-parser`). It's pure JS, ~50KB, no native deps, supports CSS selectors, parses the ~200KB analizy.pl page in well under 1ms, and matches the original selector-based intent. The streaming win HTMLRewriter would offer is irrelevant at this page size and CPU budget.

### Polish decimal comma (`12,3456` → `12.3456`)

`parseFloat('12,3456')` returns `12` silently in V8 — the classic "looks fine in dev, wrong number in prod" failure for Polish-locale numbers. `parsePriceText` MUST:

1. Trim the input.
2. Replace `,` with `.` (single replacement — Polish never groups thousands with comma).
3. Reject any post-normalization string not matching `/^\d+(\.\d+)?$/` (so a stray currency symbol like `12,34 PLN`, a thousand separator like `1 234,56`, or a malformed `12.34.56` does NOT silently coerce to a smaller number).
4. `parseFloat` and validate `Number.isFinite(price) && price > 0`.

### Snapshot dedup ordering (read latest BEFORE insert)

The insert must be conditional on a SELECT of the latest snapshot first. With RLS + `default user_id = auth.uid()`, both the read and the write are user-scoped — no inter-user race. Within a single user, a double-click on the button might race, but the worst case is a duplicate row that's benign (the dashboard query takes the most recent anyway). No transactional guard needed.

### Fetch hygiene (UA + timeout)

The outbound `fetch` to analizy.pl MUST set a non-empty `User-Agent` (the default `undici` UA can be 403'd by anti-bot heuristics on some routes) and an `AbortSignal.timeout(8000)` to bound the request well inside the Worker CPU/wall budget. A connection failure or timeout is a `?priceError=`, never an HTTP 500.

### "Pobrano ..." vs "Cena z dnia ..."

`price_snapshots.fetched_at` is the moment WE pulled the page — NOT the trading-day timestamp analizy.pl assigns to the unit price (which lags by ~1 trading day). The dashboard label must read `Pobrano <relative time>` and never something that implies it's the "as-of trading date" — calling our fetch time the "as-of" date is exactly the kind of silent misleading FR-007 forbids.

### Error UX: generic Polish + collapsible raw details

The primary banner is a stable Polish string ("Pobieranie nie powiodło się. Spróbuj ponownie."). A `<details><summary>Szczegóły</summary><pre>{decoded priceError}</pre></details>` element below exposes the verbatim `?priceError=...` query-param value (URL-decoded). Native `<details>` requires no JavaScript and degrades gracefully — perfect fit for the no-React-island dashboard. Style the `<summary>` to match the existing glass-panel design (low-contrast small text, cursor-pointer).

### `/dashboard` GET stays side-effect-free

The page handler performs Supabase reads only — no outbound `fetch`, no DB write, never. All mutation lives in the POST handler at `/api/prices/fetch`. This preserves the "GET is safe" contract and makes the dashboard render predictable when analizy.pl is down (it just shows whatever snapshot is most recent).

---

## Phase 1: Parser module + fixture + verify script

### Overview

Capture a snapshot of the live analizy.pl page to a fixture file, build a pure parser module that extracts and normalizes the unit price from that HTML, and write a Node assertion script that proves the parser works against the fixture. No DB, no API route, no UI in this phase.

### Changes Required

#### 1. Save live page as a fixture

**File**: `tests/fixtures/analizy-sample.html`

**Intent**: Capture the live analizy.pl page exactly once so the parser can be developed and regression-tested without re-hitting the network. The fixture is the "what the page looked like on the date we wrote this code" anchor for future debugging.

**Contract**: A single static HTML file produced by `curl -A 'real-value-portfolio-app/0.1 (+contact)' https://www.analizy.pl/fundusze-ppk/ALL88/allianz-plan-emerytalny-2055 -o tests/fixtures/analizy-sample.html`. The implementer also opens the page in a browser, inspects the DOM to pick the CSS selector for the visible unit-price node, and records the visible price string in the `EXPECTED_PRICE` constant in step 5.

#### 2. Install `node-html-parser`

**File**: `package.json`

**Intent**: Add the single tiny parser dependency that powers both the production Worker and the verify script.

**Contract**: `npm i node-html-parser` adds it under `dependencies` (NOT `devDependencies` — the production API route imports it). Commit the updated `package-lock.json`.

#### 3. Parser module — types & constants

**File**: `src/lib/analizy/types.ts`

**Intent**: Pin the contract between extraction, normalization, and the API route in one place so future readers see the full surface without jumping files. Also the single source of truth for the hardcoded fund identity.

**Contract**:

```ts
export const TICKER = "ALL88" as const;
export const ANALIZY_URL = "https://www.analizy.pl/fundusze-ppk/ALL88/allianz-plan-emerytalny-2055" as const;
export const FUND_LABEL = "Allianz Plan Emerytalny 2055" as const;

export type ParseResult =
  | { ok: true; price: number; priceText: string }
  | { ok: false; error: string };
```

#### 4. Parser module — extraction + normalization

**File**: `src/lib/analizy/parse.ts`

**Intent**: One pure function (`extractPrice(html)`) that selects the unit-price node from the page via `node-html-parser`, normalizes the Polish decimal comma, and returns a discriminated `ParseResult`. Splits internally into `extractPriceText(html)` and `parsePriceText(text)` so the failure surface is clear and each step is independently assertable from the verify script.

**Contract**:

- `parsePriceText(text: string): ParseResult` — trims, replaces a single `,` with `.`, rejects any string failing `/^\d+(\.\d+)?$/`, `parseFloat`s, validates `Number.isFinite(price) && price > 0`.
- `extractPriceText(html: string): { ok: true; text: string } | { ok: false; error: string }` — uses `parse(html)` from `node-html-parser` to query the unit-price element via `PRICE_SELECTOR`. The exact CSS selector is filled in during phase 1 step 1 from fixture inspection — document it inline with a comment naming what was inspected. On `null` or empty match, return `{ ok: false, error: "Selector matched no element on analizy.pl page (DOM may have changed)" }`.
- `extractPrice(html: string): ParseResult` — composes the two, surfaces the first error.

The discriminated-return shape is the contract phases 2 and 3 depend on. The Polish-decimal-comma normalization is the headline failure class this module defends against — see Critical Implementation Details.

#### 5. Verify script

**File**: `scripts/verify-price-parser.ts`

**Intent**: Run the parser against the committed fixture and assert the price matches a recorded reference value. Provides a sub-second "did I break parse?" loop locally.

**Contract**: Mirrors `scripts/verify-parser.ts:1-50` structurally — same `assert.deepEqual` style, same `assertions` counter, same exit-code semantics. Reads `tests/fixtures/analizy-sample.html`, calls `extractPrice(html)`, throws if `!ok` or if `Math.abs(result.price - EXPECTED_PRICE) > 0.0001`. Also exercises `parsePriceText` directly with the headline cases: `"12,3456"` → `12.3456`, `"12,3456 PLN"` → `!ok`, `"1 234,56"` → `!ok`, `"12.34.56"` → `!ok`. `EXPECTED_PRICE` is a `const` filled by the implementer from manual browser inspection in phase 1 step 1, with a code comment recording the visible price + capture date.

#### 6. Wire the npm script

**File**: `package.json`

**Intent**: Make the verify script discoverable next to the existing one.

**Contract**: Add `"verify-price-parser": "tsx scripts/verify-price-parser.ts"` alongside the existing `"verify-parser"` script at `package.json:14`.

### Success Criteria

#### Automated Verification

- `npm run verify-price-parser` exits 0 against the committed fixture
- `npm run lint` passes
- `npm run build` passes (Astro build does not import the verify script but does import the parser through the API route in phase 2 — verify the parser module compiles standalone first by running build, even though the route doesn't exist yet)

#### Manual Verification

- `tests/fixtures/analizy-sample.html` exists, was captured from the real URL via the documented `curl` invocation, and the implementer has recorded the visible unit price + capture date in a code comment next to `EXPECTED_PRICE`
- Deliberately corrupting the fixture's price element (e.g. change the visible number to `not-a-number`) makes `npm run verify-price-parser` fail with the expected error message — proves the regression net works
- `parsePriceText('12,3456')` from a `tsx` REPL returns `{ ok: true, price: 12.3456, priceText: '12,3456' }` — the Polish decimal-comma case is the headline failure mode this phase prevents

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that the fixture-corruption check produced the expected red signal before proceeding to phase 2.

---

## Phase 2: `/api/prices/fetch` API route + middleware gate + dedup write

### Overview

A POST API route that authenticates the user, fetches the analizy.pl page with UA + timeout, runs it through the phase-1 parser, dedupes against the latest stored snapshot, writes a new `price_snapshots` row under RLS, and 303-redirects to `/dashboard` with named query params. Add `/api/prices` to the middleware `PROTECTED_ROUTES` list.

### Changes Required

#### 1. The API route

**File**: `src/pages/api/prices/fetch.ts`

**Intent**: Single POST handler owning the entire fetch → parse → dedup → insert → redirect flow. Mirrors `src/pages/api/transactions/import.ts:6-53` structurally so the convention stays consistent (auth guard → work → 303 redirect with named query params).

**Contract**:

- `export const prerender = false`
- `export const POST: APIRoute = async (context) => { ... }`
- Auth guard: `if (!context.locals.user) return context.redirect('/auth/signin', 303);`
- Outbound fetch: `fetch(ANALIZY_URL, { headers: { 'User-Agent': 'real-value-portfolio-app/0.1 (+contact)' }, signal: AbortSignal.timeout(8000) })`
  - On thrown / non-2xx / non-text response → `return context.redirect('/dashboard?priceError=' + encodeURIComponent(reason), 303)` where `reason` is a concise description (`"HTTP 503 from analizy.pl"`, `"Network error: <message>"`, `"Request timed out after 8s"`).
- Parse: `const result = extractPrice(await response.text())` from `@/lib/analizy/parse`.
  - On `!result.ok` → redirect with `?priceError=<encoded result.error>`.
- Supabase client: `const supabase = createClient(context.request.headers, context.cookies)`; on null → redirect with `?priceError=Server%20not%20configured`.
- Dedup read: `const { data: latest, error: readErr } = await supabase.from('price_snapshots').select('price').eq('ticker', TICKER).order('fetched_at', { ascending: false }).limit(1).maybeSingle();`
  - On `readErr` → redirect with `?priceError=` + `readErr.message`.
  - If `latest && Number(latest.price) === result.price` → SKIP the insert; redirect with `?priced=1&dedup=1`.
- Insert: `const { error: writeErr } = await supabase.from('price_snapshots').insert({ ticker: TICKER, price: result.price });` — `user_id` is filled by `default auth.uid()`, `fetched_at` by `default now()`.
  - On `writeErr` → redirect with `?priceError=` + `writeErr.message`.
- Success: redirect with `?priced=1`.
- Final form: `return context.redirect('/dashboard?' + new URLSearchParams({ ... }).toString(), 303);`.

#### 2. Gate the new route in middleware

**File**: `src/middleware.ts`

**Intent**: Make `/api/prices/*` require auth — same prefix-match list the other protected routes use.

**Contract**: Extend the `PROTECTED_ROUTES` array at `src/middleware.ts:4` from `["/dashboard", "/setup", "/api/transactions"]` to add `"/api/prices"` — alphabetically adjacent to `/api/transactions`. Single line, no other changes.

### Success Criteria

#### Automated Verification

- `npm run lint` passes
- `npm run build` passes (Astro picks up the new API route via folder-routing)
- Signed-out `curl -i -X POST http://localhost:4321/api/prices/fetch` returns a 302/303 to `/auth/signin` (middleware gate working)

#### Manual Verification

- Signed-in browser session: a `curl -X POST` with the auth cookie returns 303 → followed → reaches `/dashboard?priced=1` (first call) or `/dashboard?priced=1&dedup=1` (immediate second call same value)
- After a successful fetch, Supabase Studio (`:54323`) shows one `price_snapshots` row with `ticker = 'ALL88'`, a sensible `price`, and a `fetched_at` of "just now"
- A second click within seconds does NOT add another row — dedup verified at the DB
- Temporarily breaking the fetch (point `ANALIZY_URL` at `https://example.invalid/`) yields `/dashboard?priceError=...` and inserts no row
- Temporarily breaking the parser (change `PRICE_SELECTOR` to `"#nonexistent"`) yields `/dashboard?priceError=Selector%20matched%20no%20element...` and inserts no row
- Two-user RLS spot check: user A fetches a price, signs out; user B signs in fresh and queries `price_snapshots` in Studio impersonating user B's JWT — sees zero rows (RLS enforced end-to-end through the new route)

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that the dedup behavior, the two failure paths, and the two-user RLS check all worked before proceeding to phase 3.

---

## Phase 3: Dashboard valuation block + Pobierz cenę button + README

### Overview

Extend `/dashboard` from today's 35-line welcome page into a real layout hosting: greeting, valuation block (with four explicit render states), Pobierz cenę button (single-form-button POST), Import-statement link, sign-out, and a generic Polish error banner with collapsible `<details>` raw-error disclosure. Add a README section documenting the on-demand price-fetch model and the single-fund approximation.

### Changes Required

#### 1. Dashboard server logic

**File**: `src/pages/dashboard.astro` (frontmatter section)

**Intent**: Server-side query `transactions.units` SUM + the latest `price_snapshots` row for `(user, ALL88)`, derive the render state from query params + snapshot presence + units count, and pass everything to the template. All data fetched under the user's JWT — RLS enforces isolation.

**Contract**:

- `export const prerender = false`
- Read query params via `Astro.url.searchParams`: `priced` (`'1'` or null), `dedup` (`'1'` or null), `priceError` (string or null).
- Two Supabase queries via `createClient(Astro.request.headers, Astro.cookies)`, both under RLS:
  - `.from('transactions').select('units')` → `unitsSum = data.reduce((acc, row) => acc + Number(row.units), 0)` (defaults to `0` on null/error).
  - `.from('price_snapshots').select('price, fetched_at').eq('ticker', TICKER).order('fetched_at', { ascending: false }).limit(1).maybeSingle()` → `latest`.
- Derive `hasSnapshot = latest != null`, `valuation = hasSnapshot && unitsSum > 0 ? Number(latest.price) * unitsSum : null`.
- Compute a `state` literal (`"fresh" | "stale" | "no_price" | "no_transactions" | "idle"`):
  - `unitsSum === 0` → `"no_transactions"`
  - else `!hasSnapshot` → `"no_price"`
  - else `priceError != null` → `"stale"`
  - else `priced === '1'` → `"fresh"`
  - else → `"idle"` (page reload without action)
- Polish formatters (instantiated once in frontmatter): `Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" })` for valuation, plain `Intl.NumberFormat("pl-PL", { minimumFractionDigits: 4, maximumFractionDigits: 4 })` for the unit price text, and an inline relative-time helper that maps `fetched_at` → strings like `"przed chwilą"`, `"X minut temu"`, `"X godzin temu"`, `"N dni temu"` (a small if-ladder is sufficient — no library).
- Pass `valuation`, `unitsSum`, `latest`, `state`, `priceError`, `dedup` to the template.

#### 2. Dashboard template

**File**: `src/pages/dashboard.astro` (template section)

**Intent**: Render the existing greeting, an error banner if `priceError`, the valuation block scoped by `state`, the Pobierz cenę form button, the existing Import-statement link, and sign-out. All new user-visible strings in Polish per AGENTS.md. Style mirrors `/setup.astro:55-108` (glass panel, gradient heading, amber/red/green banner variants already established there).

**Contract**:

- Page heading + welcome line unchanged in spirit (keep the gradient `"Dashboard"` heading + `Welcome, {user.email}` line).
- **Error banner** (when `priceError != null`): the primary line in Polish — `"Pobieranie nie powiodło się. Spróbuj ponownie."`. Below it a `<details>` element: `<summary class="cursor-pointer text-blue-100/60 text-xs">Szczegóły</summary><pre class="mt-2 whitespace-pre-wrap break-words text-xs text-amber-100/80">{priceError}</pre></details>`. The amber-bordered banner styling matches `/setup.astro:79-83`. When the state is also `"stale"`, this banner sits ABOVE the valuation block.
- **Valuation block** rendering, scoped by `state`:
  - `state === "fresh" || state === "idle" || state === "stale"`:
    - Total in big bold: `{currencyFormatter.format(valuation)}`.
    - Smaller breakdown line: `{unitsFormatter.format(unitsSum)} szt. × {priceFormatter.format(latest.price)} PLN`.
    - Ticker + fund label line: `{TICKER} · {FUND_LABEL}`.
    - "Pobrano {relative} ({absoluteISO})" line — relative is friendly Polish, absolute is the raw `fetched_at.toLocaleString('pl-PL')` for honesty.
    - When `state === "stale"`: wrap the whole block in `border border-amber-400/40` and ensure the error banner sits above it (the "dane sprzed N dni" age is implicit in the "Pobrano N dni temu" line, but make the wrapping border explicit so the staleness is visually obvious).
    - When `state === "fresh" && dedup === '1'`: append a small unobtrusive note next to the "Pobrano" line — `"Cena bez zmian od ostatniego pobrania."` (low-contrast small text).
  - `state === "no_price"`: red banner — `"Pobierz cenę, aby zobaczyć wycenę portfela."`. No valuation block.
  - `state === "no_transactions"`: amber/info hint — `"Najpierw zaimportuj plik transakcji."` with an inline link to `/setup`. No valuation block. (This state wins over `no_price` per the derivation order in §1 — a user with no transactions sees the import hint, not the price prompt, regardless of snapshot presence.)
- **Pobierz cenę button**: `<form method="POST" action="/api/prices/fetch"><button type="submit">Pobierz cenę</button></form>`. No React island. No JS. Styled to match the existing `border border-white/20 bg-white/10 px-4 py-2` button class on the Import-statement link.
- **Import-statement link**: kept, restyled to sit alongside Pobierz cenę in the new layout.
- **Sign-out form**: kept, restyled likewise.

#### 3. README section

**File**: `README.md`

**Intent**: Document the on-demand price-fetch model and the single-fund approximation for anyone running the app locally or reading the codebase.

**Contract**: New H2 section near the existing "Importing transactions" section (or wherever S-01 documented the import flow — match the established README structure). Mentions:

- The single hardcoded ticker (`ALL88`) and URL (`analizy.pl/fundusze-ppk/ALL88/allianz-plan-emerytalny-2055`).
- The on-demand-only model (no auto-refresh, no scheduled job — user clicks the button).
- The single-fund approximation: valuation = `SUM(transactions.units) × ALL88 unit price` is correct for the current user (fully switched out of `Allianz PPK 2055`) but would be inaccurate for users still split across funds — future-work pointer to S-03 or a follow-up slice if a second fund matters.
- The `npm run verify-price-parser` command for catching parser regressions.

### Success Criteria

#### Automated Verification

- `npm run lint` passes
- `npm run build` passes
- Signed-out `curl -i http://localhost:4321/dashboard` returns a 302/303 to `/auth/signin` (middleware unchanged but regression check)

#### Manual Verification

- **Fresh state**: sign in, click Pobierz cenę → page reloads showing total PLN valuation, `{units} szt. × {price} PLN` breakdown, `ALL88 · Allianz Plan Emerytalny 2055` line, "Pobrano przed chwilą" line
- **Dedup state**: click Pobierz cenę a second time immediately → small "Cena bez zmian od ostatniego pobrania" note appears next to the timestamp; `price_snapshots` row count in Supabase Studio does NOT increase
- **Stale state**: temporarily point `ANALIZY_URL` at `https://example.invalid/` and click Pobierz cenę → amber-bordered valuation block + prior price + "Pobrano N dni/godzin temu" age label that's honestly old (NOT pretending today's failed fetch is "current"); the generic Polish error banner sits above; expanding `<details>` shows the raw network error
- **No-price state**: in Supabase Studio, delete all rows from `price_snapshots` for the test user; reload `/dashboard` → red "Pobierz cenę, aby zobaczyć wycenę portfela" banner; no valuation block
- **No-transactions state**: in Studio, delete all rows from `transactions` for the test user; reload `/dashboard` → "Najpierw zaimportuj plik transakcji" hint with link to `/setup`; no valuation block
- **Error `<details>` disclosure**: with `?priceError=Selector%20matched%20no%20element%20on%20analizy.pl%20page%20(DOM%20may%20have%20changed)` in the URL, click "Szczegóły" → raw decoded error visible verbatim
- **Two-user end-to-end**: user A imports transactions, fetches a price; user B signs in fresh and `/dashboard` shows the `no_transactions` hint — never user A's valuation or snapshot data
- **Polish localization**: every new user-visible string on `/dashboard` (banners, hints, "szt.", "Pobrano", "Cena bez zmian...", "Pobierz cenę", "Szczegóły") is in Polish

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that all five render states (`fresh`, `dedup`, `stale`, `no_price`, `no_transactions`), the `<details>` disclosure, and the two-user RLS check all worked before considering the slice done.

---

## Testing Strategy

### Unit-level (verify script)

- `parsePriceText('12,3456')` → `{ ok: true, price: 12.3456, priceText: '12,3456' }` (Polish decimal comma — headline case)
- `parsePriceText('12,3456 PLN')` → `!ok` (rejects stray currency symbol)
- `parsePriceText('1 234,56')` → `!ok` (rejects thousand-separator space)
- `parsePriceText('12.34.56')` → `!ok` (rejects double dot)
- `parsePriceText('-1,5')` → `!ok` (rejects non-positive)
- `extractPriceText(fixtureHtml)` → `{ ok: true, text: '...' }` (happy path)
- `extractPriceText(corruptedFixture)` → `!ok` (deliberate-corruption check)
- `extractPrice(fixtureHtml)` → matches `EXPECTED_PRICE` within `1e-4` tolerance

### Integration (manual via curl + browser)

- `/api/prices/fetch` end-to-end via curl with auth cookie: 303 + `?priced=1` + DB row appears
- Dedup: second call same value → `?priced=1&dedup=1` + no new row
- Network failure: temporarily wrong URL → `?priceError=...` + no row + dashboard shows generic banner + raw error in `<details>`
- Selector failure: temporarily wrong selector → `?priceError=Selector matched no element...` + no row + same UX
- Auth failure: signed-out POST → 303 to `/auth/signin`

### End-to-end (manual via browser)

- Five `/dashboard` render outcomes verified visually (`fresh`, `dedup` on top of fresh, `stale`, `no_price`, `no_transactions`)
- `<details>` "Szczegóły" disclosure expands and shows decoded raw error
- Two-user RLS check via signing in as a second account
- Polish-strings spot check

## Performance Considerations

- Worker CPU per request: one outbound `fetch` (network-bound, not CPU-bound), one `node-html-parser` parse of ~200KB HTML (~1ms), one indexed Supabase SELECT, one INSERT (or skip). Well under the 10ms free-plan budget.
- Dashboard render path: two Supabase reads (both indexed: `transactions` per-user scan is small, `price_snapshots` uses `(user_id, ticker, fetched_at desc)`). Negligible.
- See `context/foundation/lessons.md` rule "Check CPU time before public launch and upgrade to Workers Paid if needed" — this slice is comfortably under budget; the lesson explicitly flags S-03's calculation loop as the risk, not S-02.

## Migration Notes

No schema migration. The reused `price_snapshots` table is empty in production (no prior writers); the first successful fetch is the first row.

## References

- Roadmap: `context/foundation/roadmap.md` (S-02)
- PRD: `context/foundation/prd.md` (US-01, FR-006, FR-007, NFR)
- Lessons: `context/foundation/lessons.md` (Cloudflare CPU budget)
- F-01 schema for `price_snapshots`: `supabase/migrations/20260625101140_create_price_snapshots.sql`
- F-01 archived plan-brief: `context/archive/2026-06-25-supabase-schema-rls/plan-brief.md`
- S-01 archived plan-brief (multi-fund deferral): `context/archive/2026-06-25-import-allianz-transactions/plan-brief.md`
- Similar API route: `src/pages/api/transactions/import.ts:6-53`
- Similar page pattern: `src/pages/setup.astro:1-109`
- Similar verify script: `scripts/verify-parser.ts:1-50`
- Middleware: `src/middleware.ts:4`
- Supabase client: `src/lib/supabase.ts:6-25`
- AGENTS.md (Polish strings, MVVM-C, env vars, `createServerClient` rule)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Parser module + fixture + verify script

#### Automated

- [x] 1.1 `npm run verify-price-parser` exits 0 against the committed fixture — 0291ba8
- [x] 1.2 `npm run lint` passes — 0291ba8
- [x] 1.3 `npm run build` passes — 0291ba8

#### Manual

- [x] 1.4 `tests/fixtures/analizy-sample.html` exists, captured from the real URL via documented `curl`, with `EXPECTED_PRICE` + capture-date comment — 0291ba8
- [x] 1.5 Deliberate fixture corruption makes `npm run verify-price-parser` fail with the expected error — 0291ba8
- [x] 1.6 `parsePriceText('12,3456')` from a tsx REPL returns `{ ok: true, price: 12.3456, priceText: '12,3456' }` — 0291ba8

### Phase 2: `/api/prices/fetch` API route + middleware gate + dedup write

#### Automated

- [x] 2.1 `npm run lint` passes — d0bf032
- [x] 2.2 `npm run build` passes — d0bf032
- [x] 2.3 Signed-out POST to `/api/prices/fetch` returns 302/303 to `/auth/signin` — d0bf032

#### Manual

- [x] 2.4 Signed-in POST reaches `/dashboard?priced=1` (or `?priced=1&dedup=1`) via 303 — cf54130
- [x] 2.5 Successful fetch writes exactly one `price_snapshots` row with `ticker = 'ALL88'`, sensible `price`, `fetched_at` = "just now" — cf54130
- [x] 2.6 Second click within seconds does NOT add another row (dedup verified at the DB) — cf54130
- [x] 2.7 Breaking `ANALIZY_URL` to `example.invalid` yields `?priceError=...` and inserts no row — cf54130
- [x] 2.8 Breaking `PRICE_SELECTOR` to `#nonexistent` yields `?priceError=Selector matched no element...` and inserts no row — cf54130
- [x] 2.9 Two-user RLS spot check: user B cannot see user A's snapshot via Studio impersonation — cf54130

### Phase 3: Dashboard valuation block + Pobierz cenę button + README

#### Automated

- [x] 3.1 `npm run lint` passes — cf54130
- [x] 3.2 `npm run build` passes — cf54130
- [x] 3.3 Signed-out request to `/dashboard` redirects to `/auth/signin` — cf54130

#### Manual

- [x] 3.4 Fresh state: click Pobierz cenę → total PLN + `{units} szt. × {price} PLN` + ticker line + "Pobrano przed chwilą" — cf54130
- [x] 3.5 Dedup state: second click → "Cena bez zmian od ostatniego pobrania" note; no new row in Studio — cf54130
- [x] 3.6 Stale state: forced fetch failure → amber-bordered valuation + prior price + honest "Pobrano N dni/godzin temu" + generic Polish banner + raw error in `<details>` — cf54130
- [x] 3.7 No-price state: empty `price_snapshots` → red "Pobierz cenę..." banner; no valuation block — cf54130
- [x] 3.8 No-transactions state: empty `transactions` → "Najpierw zaimportuj plik transakcji" hint linking `/setup` — cf54130
- [x] 3.9 Error `<details>` "Szczegóły" disclosure shows the raw decoded `priceError` string verbatim — cf54130
- [x] 3.10 Two-user end-to-end: user B sees the no-transactions hint, not user A's valuation or snapshot data — cf54130
- [x] 3.11 Every new user-visible string on `/dashboard` is in Polish (banners, "szt.", "Pobrano", "Cena bez zmian...", "Pobierz cenę", "Szczegóły", "Najpierw zaimportuj...") — cf54130
