-- Proforma Studio — persistance des archives et de l’historique Supabase.
-- À exécuter dans Supabase > SQL Editor après 3cx-auth.sql si nécessaire.
-- Les proformas et événements sont privés par utilisateur authentifié.
-- Les brouillons non enregistrés peuvent rester dans le localStorage.

create extension if not exists pgcrypto;

create table if not exists public.proformas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  brand_id text not null,
  number text not null,
  status text not null default 'saved',
  issue_date date,
  data jsonb not null default '{}'::jsonb,
  amount numeric(18,2) not null default 0,
  profile_snapshot jsonb not null default '{}'::jsonb,
  legacy_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

alter table public.proformas
  add column if not exists user_id uuid references auth.users (id) on delete cascade,
  add column if not exists status text not null default 'saved',
  add column if not exists issue_date date,
  add column if not exists data jsonb not null default '{}'::jsonb,
  add column if not exists amount numeric(18,2) not null default 0,
  add column if not exists profile_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists legacy_id text,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now()),
  add column if not exists deleted_at timestamptz;

create unique index if not exists proformas_user_brand_number_unique
  on public.proformas (user_id, brand_id, number);

create unique index if not exists proformas_user_legacy_id_unique
  on public.proformas (user_id, legacy_id);

create index if not exists proformas_user_updated_lookup
  on public.proformas (user_id, updated_at desc);

create index if not exists proformas_user_brand_updated_lookup
  on public.proformas (user_id, brand_id, updated_at desc);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  brand_id text,
  event_type text not null,
  entity_type text not null default 'other',
  entity_id text,
  entity_number text,
  client_label text,
  amount numeric(18,2),
  details jsonb not null default '{}'::jsonb,
  source text not null default 'web',
  source_event_id text,
  occurred_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.activity_events
  add column if not exists user_id uuid references auth.users (id) on delete cascade,
  add column if not exists brand_id text,
  add column if not exists event_type text,
  add column if not exists entity_type text not null default 'other',
  add column if not exists entity_id text,
  add column if not exists entity_number text,
  add column if not exists client_label text,
  add column if not exists amount numeric(18,2),
  add column if not exists details jsonb not null default '{}'::jsonb,
  add column if not exists source text not null default 'web',
  add column if not exists source_event_id text,
  add column if not exists occurred_at timestamptz not null default timezone('utc', now()),
  add column if not exists created_at timestamptz not null default timezone('utc', now());

create unique index if not exists activity_events_user_source_unique
  on public.activity_events (user_id, source_event_id);

create index if not exists activity_events_user_occurred_lookup
  on public.activity_events (user_id, occurred_at desc);

create index if not exists activity_events_user_brand_occurred_lookup
  on public.activity_events (user_id, brand_id, occurred_at desc);

create index if not exists activity_events_user_type_occurred_lookup
  on public.activity_events (user_id, event_type, occurred_at desc);

create table if not exists public.proforma_sequences (
  user_id uuid not null references auth.users (id) on delete cascade,
  brand_id text not null,
  year integer not null check (year between 2000 and 2200),
  last_value integer not null default 0 check (last_value >= 0),
  primary key (user_id, brand_id, year)
);

alter table public.proforma_sequences enable row level security;
revoke all on table public.proforma_sequences from public, anon, authenticated;

create or replace function public.next_proforma_number(
  p_brand_id text,
  p_year integer,
  p_brand_code text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  existing_max integer := 0;
  next_value integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select coalesce(max((substring(number from '([0-9]+)$'))::integer), 0)
    into existing_max
    from public.proformas
   where user_id = current_user_id
     and brand_id = p_brand_id
     and number like 'PRO-%-' || p_year::text || '-%';

  insert into public.proforma_sequences (user_id, brand_id, year, last_value)
  values (current_user_id, p_brand_id, p_year, existing_max)
  on conflict (user_id, brand_id, year) do nothing;

  update public.proforma_sequences
     set last_value = greatest(last_value, existing_max) + 1
   where user_id = current_user_id
     and brand_id = p_brand_id
     and year = p_year
  returning last_value into next_value;

  return format('PRO-%s-%s-%s', upper(p_brand_code), p_year::text, lpad(next_value::text, 4, '0'));
end;
$$;

revoke all on function public.next_proforma_number(text, integer, text) from public, anon;
grant execute on function public.next_proforma_number(text, integer, text) to authenticated;

create or replace function public.touch_proforma_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists proformas_touch_updated_at on public.proformas;
create trigger proformas_touch_updated_at
before update on public.proformas
for each row execute procedure public.touch_proforma_updated_at();

alter table public.proformas enable row level security;
alter table public.activity_events enable row level security;

revoke all on table public.proformas from public, anon;
revoke all on table public.activity_events from public, anon;
grant select, insert, update on table public.proformas to authenticated;
grant select, insert on table public.activity_events to authenticated;

drop policy if exists "Users can read their own proformas" on public.proformas;
create policy "Users can read their own proformas"
  on public.proformas for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own proformas" on public.proformas;
create policy "Users can create their own proformas"
  on public.proformas for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own proformas" on public.proformas;
create policy "Users can update their own proformas"
  on public.proformas for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can read their own activity events" on public.activity_events;
create policy "Users can read their own activity events"
  on public.activity_events for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own activity events" on public.activity_events;
create policy "Users can create their own activity events"
  on public.activity_events for insert
  to authenticated
  with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
