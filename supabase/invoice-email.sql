-- Suivi sécurisé de l'envoi des factures par e-mail via Resend.
-- À exécuter après supabase/client-forms.sql.
-- La clé Resend et la clé service_role restent uniquement côté serveur Vercel.

create extension if not exists pgcrypto;

create table if not exists public.invoice_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  brand_id text not null,
  recipient_email text not null,
  sender_email text not null,
  provider text not null default 'resend',
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (invoice_id)
);

create index if not exists invoice_email_deliveries_user_lookup
  on public.invoice_email_deliveries (user_id, updated_at desc);

create index if not exists invoice_email_deliveries_invoice_lookup
  on public.invoice_email_deliveries (invoice_id);

create or replace function public.touch_invoice_email_delivery_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists invoice_email_deliveries_touch_updated_at on public.invoice_email_deliveries;
create trigger invoice_email_deliveries_touch_updated_at
before update on public.invoice_email_deliveries
for each row execute procedure public.touch_invoice_email_delivery_updated_at();

alter table public.invoice_email_deliveries enable row level security;
revoke all on table public.invoice_email_deliveries from public, anon;
grant select on table public.invoice_email_deliveries to authenticated;

drop policy if exists "Users can read their own invoice email deliveries" on public.invoice_email_deliveries;
create policy "Users can read their own invoice email deliveries"
  on public.invoice_email_deliveries for select to authenticated
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';
