-- Suivi sécurisé de l'envoi des proformas par e-mail via Microsoft Graph / Exchange Online.
-- À exécuter après supabase/client-forms.sql.
-- Les identifiants Microsoft Graph et la clé service_role restent uniquement côté serveur Vercel.

create extension if not exists pgcrypto;

create table if not exists public.proforma_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  proforma_id uuid not null references public.proformas (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  brand_id text not null,
  recipient_email text not null,
  sender_email text not null,
  provider text not null default 'microsoft-graph',
  attempt_number integer not null default 1 check (attempt_number >= 1),
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint proforma_email_deliveries_proforma_attempt_unique unique (proforma_id, attempt_number)
);

alter table public.proforma_email_deliveries alter column provider set default 'microsoft-graph';
alter table public.proforma_email_deliveries add column if not exists attempt_number integer not null default 1;
alter table public.proforma_email_deliveries drop constraint if exists proforma_email_deliveries_attempt_number_check;
alter table public.proforma_email_deliveries add constraint proforma_email_deliveries_attempt_number_check check (attempt_number >= 1);
alter table public.proforma_email_deliveries drop constraint if exists proforma_email_deliveries_proforma_id_key;
alter table public.proforma_email_deliveries drop constraint if exists proforma_email_deliveries_proforma_attempt_unique;
alter table public.proforma_email_deliveries add constraint proforma_email_deliveries_proforma_attempt_unique unique (proforma_id, attempt_number);

create index if not exists proforma_email_deliveries_proforma_attempt_lookup
  on public.proforma_email_deliveries (proforma_id, attempt_number desc);

create index if not exists proforma_email_deliveries_user_lookup
  on public.proforma_email_deliveries (user_id, updated_at desc);

create index if not exists proforma_email_deliveries_proforma_lookup
  on public.proforma_email_deliveries (proforma_id);

create or replace function public.touch_proforma_email_delivery_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists proforma_email_deliveries_touch_updated_at on public.proforma_email_deliveries;
create trigger proforma_email_deliveries_touch_updated_at
before update on public.proforma_email_deliveries
for each row execute procedure public.touch_proforma_email_delivery_updated_at();

alter table public.proforma_email_deliveries enable row level security;
revoke all on table public.proforma_email_deliveries from public, anon;
grant select on table public.proforma_email_deliveries to authenticated;

drop policy if exists "Users can read their own proforma email deliveries" on public.proforma_email_deliveries;
create policy "Users can read their own proforma email deliveries"
  on public.proforma_email_deliveries for select to authenticated
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';
