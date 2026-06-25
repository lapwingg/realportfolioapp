-- Append-only per-user price history captured on each on-demand fetch (S-02).
create table public.price_snapshots (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    ticker text not null,
    price numeric(20, 4) not null,
    fetched_at timestamptz not null default now()
);

-- Supports the "latest price for this user/ticker" query in S-02/S-03.
create index price_snapshots_user_ticker_fetched_at_desc
    on public.price_snapshots (user_id, ticker, fetched_at desc);

alter table public.price_snapshots enable row level security;
alter table public.price_snapshots force row level security;

create policy price_snapshots_select_own on public.price_snapshots
    for select to authenticated
    using (auth.uid() = user_id);

create policy price_snapshots_insert_own on public.price_snapshots
    for insert to authenticated
    with check (auth.uid() = user_id);

create policy price_snapshots_update_own on public.price_snapshots
    for update to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy price_snapshots_delete_own on public.price_snapshots
    for delete to authenticated
    using (auth.uid() = user_id);
