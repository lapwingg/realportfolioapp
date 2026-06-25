-- Cross-account RLS isolation test for `transactions` and `price_snapshots`.
--
-- Proves that the per-operation policies created in
--   20260625101139_create_transactions.sql
--   20260625101140_create_price_snapshots.sql
-- actually deny cross-user reads and writes at the database layer — the
-- load-bearing NFR from the PRD ("no cross-account data exposure under any
-- condition"). If a future migration weakens RLS, this test fails.
--
-- Impersonation pattern (REQUIRED — do not change either step):
--   1. SET LOCAL ROLE authenticated  → engages policies scoped TO authenticated.
--      Without this, the test runs as `postgres` (the migration superuser);
--      policies that target `authenticated` would not be consulted as
--      production consults them and the test could pass for the wrong reason.
--   2. set_config('request.jwt.claim.sub', '<uuid>', true) → sets the claim
--      auth.uid() reads. Verified against supabase/postgres schema-17.sql:
--      auth.uid() = nullif(current_setting('request.jwt.claim.sub', true), '')::uuid.
--
-- The whole file runs inside a single transaction rolled back by pgTAP, so
-- no test residue lands in the database.

begin;

select plan(10);

-- Setup user fixtures BEFORE switching role (auth.users insert needs superuser).
-- FK-target-only setup: GoTrue side effects (auth.identities rows, the
-- handle_new_user trigger) are intentionally skipped because the RLS test
-- does not exercise them. DO NOT copy this pattern for tests that need a
-- fully realized user.
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111');
insert into auth.users (id) values ('22222222-2222-2222-2222-222222222222');

-- ============================================================================
-- transactions: 5 assertions
-- ============================================================================

-- Impersonate user A.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

insert into public.transactions (transaction_date, source, units, gross_amount)
values ('2026-01-15', 'own', 10.0, 100.0);

select is(
  (select count(*)::int from public.transactions),
  1,
  'transactions: user A inserts and selects own row'
);

-- Switch to user B (role stays `authenticated`; only the JWT claim changes).
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select is(
  (select count(*)::int from public.transactions),
  0,
  'transactions: user B SELECT returns 0 rows (cannot see user A''s row)'
);

with updated as (
  update public.transactions set units = 999.0 returning id
)
select is(
  (select count(*)::int from updated),
  0,
  'transactions: user B UPDATE affects 0 rows (USING filter denies)'
);

with deleted as (
  delete from public.transactions returning id
)
select is(
  (select count(*)::int from deleted),
  0,
  'transactions: user B DELETE affects 0 rows (USING filter denies)'
);

select throws_ok(
  $$insert into public.transactions (user_id, transaction_date, source, units, gross_amount)
    values ('11111111-1111-1111-1111-111111111111'::uuid, '2026-02-15', 'own', 5.0, 50.0)$$,
  '42501',
  null,
  'transactions: user B cannot INSERT a row spoofing user A''s user_id (WITH CHECK denies)'
);

-- ============================================================================
-- price_snapshots: 5 assertions
-- ============================================================================

-- Back to user A to seed one row.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

insert into public.price_snapshots (ticker, price)
values ('PPK001', 123.4567);

select is(
  (select count(*)::int from public.price_snapshots),
  1,
  'price_snapshots: user A inserts and selects own row'
);

-- Switch back to user B.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select is(
  (select count(*)::int from public.price_snapshots),
  0,
  'price_snapshots: user B SELECT returns 0 rows (cannot see user A''s row)'
);

with updated as (
  update public.price_snapshots set price = 999.0 returning id
)
select is(
  (select count(*)::int from updated),
  0,
  'price_snapshots: user B UPDATE affects 0 rows (USING filter denies)'
);

with deleted as (
  delete from public.price_snapshots returning id
)
select is(
  (select count(*)::int from deleted),
  0,
  'price_snapshots: user B DELETE affects 0 rows (USING filter denies)'
);

select throws_ok(
  $$insert into public.price_snapshots (user_id, ticker, price)
    values ('11111111-1111-1111-1111-111111111111'::uuid, 'PPK001', 200.0)$$,
  '42501',
  null,
  'price_snapshots: user B cannot INSERT a row spoofing user A''s user_id (WITH CHECK denies)'
);

-- ----------------------------------------------------------------------------
-- Note on FORCE ROW LEVEL SECURITY and Supabase's BYPASSRLS roles
-- ----------------------------------------------------------------------------
-- The 10 assertions above run as the `authenticated` role, which has
-- `rolbypassrls = false` and is subject to RLS whether or not FORCE is set.
-- This test does NOT directly assert FORCE — in Supabase, the only roles
-- that would benefit from FORCE (`postgres`, `service_role`, `supabase_admin`)
-- all have `rolbypassrls = true`, so they bypass RLS unconditionally. FORCE
-- is still set on both tables (see the schema migrations) as defense-in-depth
-- in case Supabase ever changes those role defaults.
--
-- The sanity-check drill should therefore exercise a regression the test
-- *can* catch — e.g., weakening a policy's USING clause from
-- `auth.uid() = user_id` to `true`. That makes user A's row visible to user B
-- and fails assertion #2 (`user B SELECT returns 0 rows`).

select * from finish();

rollback;
