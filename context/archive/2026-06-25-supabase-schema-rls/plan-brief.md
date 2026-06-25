# Supabase Schema + RLS — Plan Brief

> Full plan: `context/changes/supabase-schema-rls/plan.md`

## What & Why

Create the first Supabase migrations for the Real Value Portfolio App — a `transactions` table and an append-only `price_snapshots` history table — both user-scoped via Row-Level Security policies tied to `auth.uid()` and locked down with `FORCE ROW LEVEL SECURITY`. The roadmap sequences this first because the PRD's NFR ("no cross-account data exposure under any condition") is non-negotiable, and no downstream slice (S-01 import, S-02 price fetch, S-03 dashboard) can be safely planned or verified until the data-isolation contract exists in the schema.

## Starting Point

The repo has `@supabase/ssr` wired into `src/lib/supabase.ts` with cookie-based auth, signin/signup/signout routes already shipped, and `context.locals.user` populated by middleware — but `supabase/config.toml`'s `schema_paths` is empty, there is no `supabase/migrations/` directory, and no `seed.sql`. The Supabase CLI ships as a devDependency. This slice creates the schema from zero.

## Desired End State

`supabase/migrations/` contains two timestamped SQL files that create the ENUM, both tables, and per-operation RLS policies with FORCE; `supabase/tests/rls_isolation.test.sql` runs via `npx supabase test db` and proves cross-account reads/writes are denied at the database layer; the migrations are applied to the hosted Supabase project; `src/lib/database.types.ts` is generated and the existing client is parametrized with `<Database>` so S-01 and S-02 inherit compile-time type safety.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Migration workflow | Imperative timestamped `supabase/migrations/` files | Default Supabase CLI flow, every change is an auditable ordered file — critical for reproducible RLS rollouts. | Plan |
| `price_snapshots` shape | Append-only history per `(user_id, ticker, fetched_at)` | Future-proofs the parked v2 historical chart and makes "when was this price fetched?" (FR-007) a trivial query. | Plan |
| Transaction dedup | UNIQUE `(user_id, transaction_date, source, units, gross_amount)` | DB-level natural key lets the S-01 parser blindly `INSERT … ON CONFLICT DO NOTHING`. | Plan |
| RLS policy style | Per-operation policies + `FORCE ROW LEVEL SECURITY` | Even a future service-role call is RLS-checked — the only posture that actually meets the NFR. | Plan |
| Contribution source | Postgres ENUM `contribution_source` | Type-safe at the DB, smallest storage, generated TS gets a string-literal union for free. | Plan |
| RLS verification | pgTAP test in `supabase/tests/` via `supabase test db` | Tests RLS at the layer it's enforced — application-layer tests could mask DB-level regressions. | Plan |
| Money type | `NUMERIC(20, 4)` | Exact arithmetic directly answers the "no silent rounding" NFR; arrives in TS as `string`, forcing decimal-library math in S-03. | Plan |

## Scope

**In scope:**
- `contribution_source` ENUM
- `transactions` table (RLS, FORCE, dedup UNIQUE, FK to `auth.users`)
- `price_snapshots` table (RLS, FORCE, append-only convention, lookup index)
- pgTAP isolation test for both tables
- Hosted Supabase link + `db push`
- Generated `src/lib/database.types.ts` + `<Database>` parametrization of `createServerClient`
- README "Database" section

**Out of scope:**
- Allianz upload, parsing, dedup logic (S-01)
- Price fetch from analizy.pl (S-02)
- Withdrawal-scenario calculations (S-03)
- Service-role usage (intentionally never)
- CI wiring of `supabase test db`
- Seed data, audit columns, soft-delete, `updated_at` triggers

## Architecture / Approach

Two migration files (one per table, each self-contained: table + indexes + RLS + FORCE + four policies) applied via `supabase db push`. A single pgTAP test file proves the isolation contract by impersonating two users via `request.jwt.claim.sub` and asserting zero rows visible / zero rows mutated across users. The existing `createServerClient` in `src/lib/supabase.ts` already passes the user's JWT to Postgres, so once the migrations are applied no app-layer code beyond the type parameter changes.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema + RLS migrations | Two `.sql` files create both tables with FORCE RLS and per-operation policies | Forgetting `WITH CHECK` on INSERT/UPDATE would let users write rows owned by others — caught by phase 2 |
| 2. RLS isolation test | pgTAP test in `supabase/tests/` proves cross-account denial for both tables on SELECT/UPDATE/DELETE/INSERT-spoof | First exposure to pgTAP; sanity-check drill (break FORCE → see red) confirms the test would catch real regressions |
| 3. Hosted link + TS types | `db push` to hosted project + committed `src/lib/database.types.ts` + `<Database>` parametrization | Hosted-project rollback is manual (`wrangler rollback` does NOT undo schema); a bad `db push` is recoverable only via a forward-only drop migration |

**Prerequisites:** Hosted Supabase project exists and its URL + anon key are already uploaded as Cloudflare Workers secrets per `context/foundation/infrastructure.md`. Local Docker available for `supabase start`.
**Estimated effort:** ~1–2 after-hours sessions across 3 phases.

## Open Risks & Assumptions

- Assumes the hosted Supabase project ref is available to the implementer (asked for at phase 3 link step).
- Assumes Allianz statement rows are sufficiently distinct on `(date, source, units, gross_amount)` for the dedup natural key to behave correctly — this is validated against a real sample file in S-01 (roadmap explicitly flagged this as an S-01 unknown, not an F-01 blocker).
- pgTAP assertions cover the four operations on both tables; they do NOT cover Storage policies (out of scope for F-01 — upload lands in S-01).

## Success Criteria (Summary)

- `npx supabase test db` is green locally and the sanity-check drill confirms it would fail on a regression.
- Hosted Supabase dashboard shows both tables with RLS enabled, FORCE on, and four policies each.
- A signed-in user can never see another user's rows — verified both by the pgTAP test (DB layer) and by a manual two-user check on the deployed app (end-to-end).
