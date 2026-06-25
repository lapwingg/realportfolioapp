-- Per-user profile row holding optional birth_date for availability calculations.
-- One row per user (UNIQUE user_id); RLS forced so users only ever read/write their own row.
create table public.profiles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    birth_date date null,
    inserted_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint profiles_user_id_uq unique (user_id)
);

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

-- Per-operation policies scoped to the authenticated role; anon gets nothing.
create policy profiles_select_own on public.profiles
    for select to authenticated
    using (auth.uid() = user_id);

create policy profiles_insert_own on public.profiles
    for insert to authenticated
    with check (auth.uid() = user_id);

create policy profiles_update_own on public.profiles
    for update to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy profiles_delete_own on public.profiles
    for delete to authenticated
    using (auth.uid() = user_id);

grant select, insert, update, delete on public.profiles to authenticated;
