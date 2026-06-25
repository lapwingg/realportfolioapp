-- Contribution source enum for transactions classification.
create type public.contribution_source as enum ('own', 'employer', 'state');

-- User-scoped PPK transactions. Natural-key UNIQUE supports idempotent re-imports (FR-004).
create table public.transactions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    transaction_date date not null,
    source public.contribution_source not null,
    units numeric(20, 4) not null,
    gross_amount numeric(20, 4) not null,
    inserted_at timestamptz not null default now(),
    constraint transactions_user_natural_key_uq unique (user_id, transaction_date, source, units, gross_amount)
);

alter table public.transactions enable row level security;
alter table public.transactions force row level security;

-- Per-operation policies scoped to the authenticated role; anon gets nothing.
create policy transactions_select_own on public.transactions
    for select to authenticated
    using (auth.uid() = user_id);

create policy transactions_insert_own on public.transactions
    for insert to authenticated
    with check (auth.uid() = user_id);

create policy transactions_update_own on public.transactions
    for update to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy transactions_delete_own on public.transactions
    for delete to authenticated
    using (auth.uid() = user_id);
