# Supabase Schema + RLS for User-Scoped Data — Implementation Plan

## Overview

Create the first Supabase migrations for the Real Value Portfolio App: a user-scoped `transactions` table (with deduplication constraint) and an append-only `price_snapshots` history table. Both tables enforce data isolation through Row-Level Security policies tied to `auth.uid()`, with `FORCE ROW LEVEL SECURITY` so even the table owner is RLS-checked. Ship a pgTAP isolation test that fails CI/local runs if a future migration ever weakens cross-account separation. End state: S-01 and S-02 can be planned and implemented against a typed Supabase client with the data-isolation NFR already proven at the database layer.

## Current State Analysis

- **Supabase client:** wired in `src/lib/supabase.ts:9` via `@supabase/ssr`'s `createServerClient`, consuming the cookie-based session. Auth middleware in `src/middleware.ts:7-10` populates `context.locals.user` for every request — once RLS policies use `auth.uid()`, the existing client passes the user's JWT to Postgres unchanged.
- **Auth routes:** `src/pages/api/auth/{signin,signup,signout}.ts` already exercise the anon-key path. There is no service-role client anywhere in the repo — staying that way is the recommended posture (service-role bypasses RLS).
- **No schema yet:** `supabase/config.toml:58` ships `schema_paths = []`; there is no `supabase/migrations/` directory and no `seed.sql`. The Supabase CLI is present as `supabase@^2.23.4` in `package.json` devDependencies.
- **Worker runtime:** `wrangler.jsonc` deploys via `@astrojs/cloudflare` with `nodejs_compat`. Worker secrets (`SUPABASE_URL`, `SUPABASE_KEY` = anon key) are uploaded via `wrangler secret put` per `context/foundation/infrastructure.md`. The schema must be applied to the **hosted** Supabase project — not just locally — for the deployed Worker to talk to it.
- **Lessons in play:** `context/foundation/lessons.md` flags two relevant priors — (1) Cloudflare Workers 10ms CPU limit could bite the calculation route in S-03, not F-01; out of scope here. (2) `package-lock.json` registry hygiene — already handled in bootstrap.

## Desired End State

After this change:

1. `supabase/migrations/` contains timestamped SQL files that, applied in order, produce:
   - A `contribution_source` ENUM `('own', 'employer', 'state')`.
   - A `transactions` table keyed by `(id uuid PK)` with `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, transaction date, source, units, gross_amount (NUMERIC(20,4)), inserted_at; with a composite UNIQUE on `(user_id, transaction_date, source, units, gross_amount)` for deduplication; with RLS enabled, FORCED, and four per-operation policies (SELECT/INSERT/UPDATE/DELETE), all using `auth.uid() = user_id`.
   - A `price_snapshots` table keyed by `(id uuid PK)` with `user_id`, `ticker text`, `price NUMERIC(20,4)`, `fetched_at timestamptz`; append-only by convention (no UPDATE policy that allows price rewrites); with RLS enabled, FORCED, and per-operation policies.
2. `supabase/tests/rls_isolation.sql` is a pgTAP test that creates two test users, inserts rows as user A on both tables, then asserts user B's queries return zero rows on SELECT and affect zero rows on UPDATE/DELETE. The test passes via `npx supabase test db` against the local stack and fails loudly if any future migration weakens the policies.
3. Migrations are applied to the hosted Supabase project; `src/lib/database.types.ts` is generated from the live schema by `npx supabase gen types typescript --linked` and committed to the repo. Any consumer (S-01, S-02) gets a typed `SupabaseClient<Database>` for free.
4. README documents the local Supabase boot command, the `db push` flow to the hosted project, and the secrets required for the deployed Worker.

### Verification at end of plan

- `cd /Users/kczajka/Desktop/realportfolioapp && npx supabase start` succeeds.
- `npx supabase db reset` applies all migrations cleanly from zero.
- `npx supabase test db` passes (RLS isolation test green).
- `npx supabase gen types typescript --linked > src/lib/database.types.ts` produces a file with `transactions` and `price_snapshots` row/insert/update types and a `contribution_source` union.
- Manual: signed in as user A in the deployed app, insert a row via Supabase Studio; signed in as user B, confirm the row is not visible.

### Key Discoveries

- `src/lib/supabase.ts:9` uses `createServerClient` with the anon key — RLS will Just Work; no app-layer changes needed in this slice.
- `wrangler.jsonc:6` deploys via `@astrojs/cloudflare/entrypoints/server`; the Worker will read `SUPABASE_URL`/`SUPABASE_KEY` from Worker secrets, so the hosted Supabase project URL + anon key must already match the secrets that infra step uploaded.
- `supabase/config.toml:58` `schema_paths = []` confirms the imperative migration workflow is the unchosen-but-natural default; no config change needed beyond creating `supabase/migrations/`.
- The roadmap's risk note explicitly calls out "RLS misconfiguration would silently leak data across accounts — directly violates the NFR that is non-negotiable" — this is why phase 2 is automated, not manual.

## What We're NOT Doing

- **No Allianz file parsing, upload route, or transactions UI** — that is S-01.
- **No analizy.pl fetch, price route, or valuation UI** — that is S-02.
- **No withdrawal-scenario calculations or dashboard** — that is S-03.
- **No service-role client** — staying anon-key-only is part of the security posture; if S-01 needs admin operations later, that decision is made in S-01's plan.
- **No CI wiring of `supabase test db`** — running the local Supabase stack inside GitHub Actions is heavier than the deadline warrants; the test ships as a developer-local gate. CI wiring is a follow-up.
- **No seed data** for `transactions` or `price_snapshots`; the test creates its own ephemeral data inside a transaction.
- **No multi-fund support** in `price_snapshots` schema design — `ticker text` is forward-compatible, but no v2 features are pre-built (PRD Non-Goals).
- **No `updated_at` triggers, audit columns, or soft-delete** — out of scope for F-01.

## Implementation Approach

Apply the migrations in two timestamped files (one per table + one initial migration that creates the enum and `transactions`, one for `price_snapshots`) rather than a single mega-migration, so each one is independently revertable and reviewable. Use `npx supabase migration new <slug>` to generate timestamped filenames — never hand-author timestamps. Each migration enables RLS, FORCES it, and creates per-operation policies in the same file as the `CREATE TABLE` so the table can never exist without policies. The pgTAP test in phase 2 is the contractual proof that the policies do what the policy names claim. Phase 3 connects the local schema to the hosted project and emits TypeScript types so downstream slices get compile-time safety.

## Critical Implementation Details

- **FORCE ROW LEVEL SECURITY must be set per table.** `ALTER TABLE … ENABLE ROW LEVEL SECURITY` alone exempts the table owner; `ALTER TABLE … FORCE ROW LEVEL SECURITY` is required to make even a service-role client subject to the policies. Without FORCE, the roadmap's flagged risk is not actually mitigated.
- **WITH CHECK on INSERT/UPDATE is non-optional.** A SELECT-only `USING (auth.uid() = user_id)` would let a user insert rows with someone else's `user_id`. Each INSERT and UPDATE policy must carry `WITH CHECK (auth.uid() = user_id)` in addition to (or instead of) `USING`.
- **`user_id` must default to `auth.uid()`** at the column level (`DEFAULT auth.uid()`) so the parser in S-01 can omit `user_id` from inserts and the DB fills it in safely. This eliminates a whole class of "developer forgot to set user_id" bugs.
- **NUMERIC arrives in supabase-js as `string`, not `number`.** `database.types.ts` will type money columns as `string`. App-layer code in S-01/S-03 must use a decimal library for math; do not coerce via `Number()`. Document this in README so the next slice's plan inherits it.
- **pgTAP impersonation requires BOTH `SET LOCAL ROLE authenticated` AND `set_config('request.jwt.claim.sub', …)`.** `supabase test db` runs as the `postgres` superuser by default. RLS policies scoped `TO authenticated` are not consulted as production consults them unless the session role is `authenticated` — even with `FORCE ROW LEVEL SECURITY`. Setting only the JWT claim without switching role can cause the test to pass for the wrong reason and leave a broken policy undetected. See Phase 2 contract for the exact ordering.

## Phase 1: Schema + RLS migrations

### Overview

Create `supabase/migrations/` and land two timestamped migrations: the first creates the `contribution_source` ENUM and the `transactions` table with constraints, indexes, RLS, FORCE RLS, and four per-operation policies; the second creates the `price_snapshots` table with the same RLS posture. `npx supabase db reset` against the local stack must apply both cleanly from zero.

### Changes Required:

#### 1. `transactions` table migration

**File**: `supabase/migrations/<timestamp>_create_transactions.sql` (filename generated by `npx supabase migration new create_transactions`)

**Intent**: Create the `contribution_source` ENUM and the `transactions` table that S-01 will insert into. Enforce per-user dedup at the DB layer so the parser can blindly `INSERT ... ON CONFLICT DO NOTHING`. Enable and FORCE RLS, then create four per-operation policies all tied to `auth.uid() = user_id`.

**Contract**:
- ENUM `contribution_source` with values `'own'`, `'employer'`, `'state'` (in that order).
- Table `transactions` columns:
  - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
  - `user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE`
  - `transaction_date date NOT NULL`
  - `source contribution_source NOT NULL`
  - `units numeric(20, 4) NOT NULL`
  - `gross_amount numeric(20, 4) NOT NULL`
  - `inserted_at timestamptz NOT NULL DEFAULT now()`
- Constraints / indexes:
  - `UNIQUE (user_id, transaction_date, source, units, gross_amount)` — natural key for FR-004 dedup.
  - Implicit B-tree index on `user_id` via the UNIQUE constraint covers `WHERE user_id = auth.uid()` reads; no extra index needed in MVP.
- RLS:
  - `ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;`
  - `ALTER TABLE transactions FORCE ROW LEVEL SECURITY;`
  - Four policies named `transactions_select_own`, `transactions_insert_own`, `transactions_update_own`, `transactions_delete_own`, each `TO authenticated`, using `auth.uid() = user_id` in both `USING` and `WITH CHECK` as applicable (SELECT/DELETE: `USING`; INSERT: `WITH CHECK`; UPDATE: both).
  - Revoke any policy for the `anon` role — anon must see nothing.

#### 2. `price_snapshots` table migration

**File**: `supabase/migrations/<timestamp>_create_price_snapshots.sql` (filename generated by `npx supabase migration new create_price_snapshots`)

**Intent**: Create the append-only history table that S-02 will insert into on each on-demand price fetch. Same RLS posture as `transactions`. Forward-compatible for v2 multi-fund chart (ticker column already present), but no v2 surface is built.

**Contract**:
- Table `price_snapshots` columns:
  - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
  - `user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE`
  - `ticker text NOT NULL`
  - `price numeric(20, 4) NOT NULL`
  - `fetched_at timestamptz NOT NULL DEFAULT now()`
- Index: `CREATE INDEX price_snapshots_user_ticker_fetched_at_desc ON price_snapshots (user_id, ticker, fetched_at DESC);` — supports the "latest price for this user/ticker" query S-02/S-03 will issue.
- RLS:
  - `ALTER TABLE price_snapshots ENABLE ROW LEVEL SECURITY;`
  - `ALTER TABLE price_snapshots FORCE ROW LEVEL SECURITY;`
  - Four per-operation policies named `price_snapshots_select_own`, `price_snapshots_insert_own`, `price_snapshots_update_own`, `price_snapshots_delete_own`, `TO authenticated`, all using `auth.uid() = user_id`. (Append-only is a convention enforced by the app and the absence of UPDATE call sites; the policies still exist so a future admin script can correct bad rows under RLS.)

### Success Criteria:

#### Automated Verification:

- `cd /Users/kczajka/Desktop/realportfolioapp && npx supabase start` brings up the local stack.
- `npx supabase db reset` applies both migrations from zero with no errors.
- `npx supabase db lint` (if available in CLI 2.23.4) returns no warnings on the new migrations.
- `psql "$(npx supabase status --output env | grep DB_URL | cut -d= -f2-)" -c "\d+ transactions"` shows RLS enabled and four policies present.

#### Manual Verification:

- Open Supabase Studio at `http://127.0.0.1:54323`, browse to Authentication → Policies, and confirm both tables list four policies each, all targeting role `authenticated`.
- In the SQL editor, run `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('transactions','price_snapshots');` and confirm both columns are `true` for both tables.

**Implementation Note**: After phase 1's automated checks pass, pause for manual confirmation that Studio shows the expected policies and FORCE RLS is on, before proceeding to phase 2.

---

## Phase 2: RLS isolation test harness

### Overview

Write a pgTAP test that creates two test users via `auth.users` inserts, sets the JWT claim on the session to user A, inserts rows into both tables, then switches the session to user B and asserts: zero rows returned by SELECT on both tables, zero rows affected by UPDATE and DELETE on both tables, and that an INSERT with `user_id` spoofed to user A is rejected by the INSERT policy's `WITH CHECK`. The test runs via `npx supabase test db` against the local Postgres and is the contract that future migrations cannot silently weaken RLS.

### Changes Required:

#### 1. pgTAP isolation test

**File**: `supabase/tests/rls_isolation.test.sql`

**Intent**: A single pgTAP test file that proves the four operational guarantees (SELECT denied, UPDATE denied, DELETE denied, INSERT spoof rejected) for both tables. Impersonates authenticated users by switching the session role AND setting the JWT claim — the same combination PostgREST applies in production, so the test exercises the real `auth.uid()` + `TO authenticated` code path.

**Contract**:
- Test plan: at least 10 assertions (4 operations × 2 tables, plus the INSERT-spoof rejection assertions).
- Setup: insert two rows into `auth.users` with distinct UUIDs (`user_a_id`, `user_b_id`) — minimal-fields insert: `INSERT INTO auth.users (id) VALUES (gen_random_uuid()) RETURNING id` × 2, captured into psql `:user_a_id` / `:user_b_id` variables. (Note: this is FK-target-only setup; GoTrue side effects — `auth.identities` rows, the `handle_new_user` trigger — are intentionally skipped because the RLS test does not exercise them. Do NOT copy this pattern for tests that need a fully realized user.)
- Impersonation pattern — every user switch MUST do both, in this order, inside the same transaction:
  1. `SET LOCAL ROLE authenticated;` — switches the session role so policies scoped `TO authenticated` actually engage. Without this, the test runs as `postgres` (the migration superuser) and the policies are not consulted in the way production consults them — the test could pass for the wrong reason.
  2. `SELECT set_config('request.jwt.claim.sub', '<user-uuid>'::text, true);` — sets the claim `auth.uid()` reads. Verified against `supabase/postgres` `schema-17.sql`: `auth.uid()` reads `current_setting('request.jwt.claim.sub', true)` (singular `claim.sub`, not the JSON `claims` form).
  3. To return to setup operations needing superuser, `RESET ROLE;` (or rely on `SET LOCAL` resetting at transaction end).
- For each table:
  - Impersonate user A; insert one row; assert insert succeeds.
  - Impersonate user B; `SELECT count(*) FROM <table>` returns `0` (`is(count, 0)`).
  - `UPDATE <table> SET <col>` with no `WHERE` returns 0 rows affected (`is(diag, 0)` via `GET DIAGNOSTICS`).
  - `DELETE FROM <table>` with no `WHERE` returns 0 rows affected.
  - `INSERT INTO <table> (user_id, ...) VALUES (user_a_id, ...)` raises a policy violation (`throws_ok` or `throws_like`).
- Teardown: wrapped in a single transaction that the pgTAP runner rolls back, so the test leaves no residue.

#### 2. Test runner documentation

**File**: `README.md` (append a short section, do not rewrite)

**Intent**: Document the local commands needed to run the RLS isolation test, so the next contributor (or agent) can verify the load-bearing invariant in under a minute.

**Contract**: A new `## Database` section with three fenced bash snippets — `npx supabase start`, `npx supabase db reset`, `npx supabase test db` — and one sentence explaining what the test proves and that it MUST stay green on every migration.

### Success Criteria:

#### Automated Verification:

- `npx supabase test db` exits 0 with all pgTAP assertions passing.

#### Manual Verification:

- The test file reads end-to-end without `// TODO`s or skipped assertions.
- Output of `npx supabase test db` is captured in the PR description so reviewers can see the assertion count.
- Sanity-check drill executed: temporarily remove `FORCE ROW LEVEL SECURITY` on one table, confirm `npx supabase test db` fails, restore, confirm green. Result pasted in PR description. (The broken state must NOT be committed.)

**Implementation Note**: After phase 2 passes, pause for manual confirmation that the sanity-check drill (break FORCE, see red; restore, see green) was actually run, before proceeding to phase 3.

---

## Phase 3: Hosted project link + generated TypeScript types

### Overview

Link the local Supabase project to the hosted Supabase project, push the migrations remotely, generate `database.types.ts` from the live schema, and document the secrets the deployed Worker needs. After this phase, S-01 and S-02 can import a typed `SupabaseClient<Database>` from `@/lib/supabase` and the deployed app can read/write the new tables under RLS.

### Prerequisites:

- Hosted Supabase project exists (created out-of-band during bootstrap); project ref is available from the Supabase dashboard URL (`https://supabase.com/dashboard/project/<ref>`) or via `npx supabase projects list` after login.
- User is logged in via `npx supabase login` (opens browser OAuth). For unattended/CI runs, set `SUPABASE_ACCESS_TOKEN` instead — out of scope here since no CI wiring lands in this slice.
- `SUPABASE_URL` and `SUPABASE_KEY` (anon key) are already uploaded as Cloudflare Workers secrets per `context/foundation/infrastructure.md`. If not, upload before phase 3 so the deployed app picks up the new schema on next deploy.

### Changes Required:

#### 1. Link + push migrations to hosted project

**File**: no file change — operational step run by the implementer.

**Intent**: Apply both migrations to the hosted Supabase project so the production Worker can use the schema.

**Contract**: Commands run in order — `npx supabase login`, `npx supabase link --project-ref <ref>` (project ref provided by user via secret), `npx supabase db push`. After `db push`, the Supabase dashboard for the linked project must show both tables and RLS enabled on each.

#### 2. Generated TypeScript types

**File**: `src/lib/database.types.ts`

**Intent**: Provide compile-time safety for every downstream slice that reads or writes these tables. Generated, not hand-edited — every schema change re-runs the generator.

**Contract**: File produced by `npx supabase gen types typescript --linked > src/lib/database.types.ts`. Must export a `Database` type with `public.Tables.transactions`, `public.Tables.price_snapshots`, and `public.Enums.contribution_source`. Money columns appear as `string` (NUMERIC → string in supabase-js) — this is correct and load-bearing for S-03's calculation precision.

#### 3. Type-aware Supabase client

**File**: `src/lib/supabase.ts`

**Intent**: Parametrize the existing `createServerClient` call with the generated `Database` type so all downstream consumers get autocompletion and type errors for column typos.

**Contract**: Change `createServerClient(...)` to `createServerClient<Database>(...)` and add an `import type { Database } from './database.types';` at the top. No runtime behavior change. The existing auth handlers must keep compiling unchanged.

#### 4. README — Database section completion

**File**: `README.md`

**Intent**: Document the link/push workflow and the hosted-project secrets so the next contributor can repeat the deployment.

**Contract**: Extend the `## Database` section added in phase 2 with: (a) `npx supabase link --project-ref <ref>` + `npx supabase db push` for applying migrations to the hosted project, (b) a callout that the Worker reads `SUPABASE_URL` and `SUPABASE_KEY` (anon key) as Cloudflare Workers secrets — service-role key is intentionally not used and not uploaded, and (c) a one-line note that money columns are `string` in TypeScript and must be handled with a decimal library.

### Success Criteria:

#### Automated Verification:

- `npx tsc --noEmit` passes after the `Database` type parametrization (existing `astro check` via `@astrojs/check` covers this).
- `src/lib/database.types.ts` exists and contains the strings `"transactions"`, `"price_snapshots"`, `"contribution_source"` — verified via `grep -l`.
- `npm run build` succeeds (the typed client must build under the Cloudflare adapter).

#### Manual Verification:

- The Supabase dashboard for the linked hosted project shows both tables with RLS enabled, four policies each, and FORCE RLS via the SQL editor query from phase 1.
- Signed in as a freshly-created hosted user via the deployed app's auth UI, opening Supabase Studio (or the project's SQL editor) and inserting a row as that user, then opening an incognito session as a second user, confirms the second user cannot see the first user's row.
- The README's Database section reads coherently end-to-end.

**Implementation Note**: After phase 3, pause for manual confirmation that the hosted-project dashboard reflects the schema and the two-user manual check passed, before marking the change ready for archive.

---

## Testing Strategy

### Unit Tests:

- N/A in this slice — no app-layer logic added beyond a one-line generic-type annotation. The pgTAP file IS the test suite.

### Integration Tests:

- The pgTAP isolation test in phase 2 is the integration test for this slice. It exercises Postgres + RLS policies + JWT claims in concert — the exact stack that produces (or fails to produce) the NFR.

### Manual Testing Steps:

1. Run `npx supabase start && npx supabase db reset && npx supabase test db` locally — all green.
2. Apply to hosted project: `npx supabase link --project-ref <ref>` then `npx supabase db push` — dashboard reflects both tables.
3. In the deployed app, sign up as user A, then user B in incognito. As user A, insert a row via Studio (or by any means). As user B, query the tables — zero rows.
4. Sanity-check drill: temporarily comment out `FORCE ROW LEVEL SECURITY` on `transactions` in the local migration, `db reset`, `test db` — must fail; restore, re-run, must pass.

## Performance Considerations

- None significant in this slice. Both tables are small per user (PPK contribution rate is monthly; price snapshots are on-demand). The `(user_id, ticker, fetched_at DESC)` index on `price_snapshots` is the only forward-looking optimization; without it, S-02's "latest price" query would do a sort on every read.
- The `(user_id, transaction_date, source, units, gross_amount)` UNIQUE constraint adds a btree index that doubles as the primary access path — the same index serves both dedup and "all transactions for this user" reads.

## Migration Notes

- This is a greenfield migration — no existing data to migrate.
- Rollback for phase 1 + 2: `npx supabase migration repair --status reverted <timestamp>` followed by manual `DROP TABLE` against the hosted project, or simply create a follow-up migration that drops the table. Per `infrastructure.md`, **Supabase migrations are not auto-rolled-back by Worker rollback** — `wrangler rollback` reverts app code, not schema. If the schema needs to be undone after a hosted-push, write an explicit `drop_<table>.sql` migration rather than mutating Supabase state out-of-band.

## References

- Roadmap entry: `context/foundation/roadmap.md` (F-01, supabase-schema-rls)
- PRD: `context/foundation/prd.md` (Access Control, Non-Functional Requirements, FR-001/004/005/006/007)
- Infrastructure / Worker secrets: `context/foundation/infrastructure.md` (Operational Story → Secrets, Rollback)
- Lessons: `context/foundation/lessons.md`
- Existing Supabase client: `src/lib/supabase.ts:9`
- Auth middleware: `src/middleware.ts:7`
- Supabase config (schema_paths, db.migrations): `supabase/config.toml:53-58`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema + RLS migrations

#### Automated

- [x] 1.1 `npx supabase start` brings up the local stack — 25df9fa
- [x] 1.2 `npx supabase db reset` applies both migrations from zero with no errors — 25df9fa
- [x] 1.3 `npx supabase db lint` returns no warnings on the new migrations — 25df9fa
- [x] 1.4 `psql ... -c "\d+ transactions"` shows RLS enabled and four policies present — 25df9fa

#### Manual

- [x] 1.5 Studio shows four policies per table, all targeting role `authenticated` — 25df9fa
- [x] 1.6 `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('transactions','price_snapshots');` returns `true, true` for both — 25df9fa

### Phase 2: RLS isolation test harness

#### Automated

- [x] 2.1 `npx supabase test db` exits 0 with all pgTAP assertions passing — 0899abc

#### Manual

- [x] 2.2 Test file reads end-to-end without `// TODO`s or skipped assertions — 0899abc
- [x] 2.3 `supabase test db` output captured in the PR description — 0899abc
- [x] 2.4 Sanity-check drill executed: remove `FORCE RLS` on one table → `supabase test db` fails → restore → green; result pasted in PR description; broken state NOT committed — 0899abc

### Phase 3: Hosted project link + generated TypeScript types

#### Automated

- [x] 3.1 `npx tsc --noEmit` (via `astro check`) passes after `Database` type parametrization — a5710f9
- [x] 3.2 `src/lib/database.types.ts` contains `"transactions"`, `"price_snapshots"`, `"contribution_source"` — a5710f9
- [x] 3.3 `npm run build` succeeds with the typed client under the Cloudflare adapter — a5710f9

#### Manual

- [x] 3.4 Hosted Supabase dashboard shows both tables, four policies each, FORCE RLS via SQL editor — a5710f9
- [ ] 3.5 Two-user manual isolation check on the deployed app passes
- [x] 3.6 README Database section reads coherently end-to-end — a5710f9
