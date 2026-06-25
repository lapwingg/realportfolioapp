-- Grant base table privileges to the `authenticated` role so RLS policies
-- created in the prior migrations can actually be reached.
--
-- Without these GRANTs, requests arriving with a user JWT (which PostgREST
-- maps to the `authenticated` role) fail with `permission denied for table`
-- BEFORE RLS is evaluated — the role lacks privilege to even attempt the
-- operation. Supabase's `db reset` did not auto-apply default grants for
-- these tables, so the grants are stated explicitly here.
--
-- `anon` is intentionally NOT granted any privilege on either table —
-- unauthenticated visitors must never read or write user data.

grant select, insert, update, delete on public.transactions    to authenticated;
grant select, insert, update, delete on public.price_snapshots to authenticated;
