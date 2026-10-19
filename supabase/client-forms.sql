-- Proforma Studio — formulaires clients publics rattachés à chaque marque,
-- validation par appel et conversion contrôlée en facture.
-- À exécuter après supabase/proformas-history.sql et supabase/contacts-write.sql.
-- La clé service_role est utilisée uniquement par l’API serveur Vercel ; elle ne doit
-- jamais être placée dans index.html, le navigateur ou ce dépôt.

create extension if not exists pgcrypto;

-- Les colonnes ajoutées permettent de relier une demande publique à son document,
-- tout en conservant le snapshot de la proforma et son historique de validation.
alter table public.proformas
  add column if not exists source text not null default 'web',
  add column if not exists request_id uuid,
  add column if not exists validation_status text not null default 'not_required',
  add column if not exists validated_at timestamptz,
  add column if not exists validated_by uuid references auth.users (id) on delete set null,
  add column if not exists order_confirmed_at timestamptz,
  add column if not exists payment_received_at timestamptz,
  add column if not exists invoice_id uuid,
  add column if not exists invoice_number text;

create index if not exists proformas_user_validation_lookup
  on public.proformas (user_id, validation_status, updated_at desc);

create index if not exists proformas_request_lookup
  on public.proformas (request_id);

-- Les textes commerciaux restent toujours présents, y compris pour les proformas
-- déjà créées avant l'activation du formulaire public. Les valeurs non vides sont
-- conservées lorsqu'une équipe les a personnalisées.
update public.proformas
   set data = jsonb_set(
               jsonb_set(coalesce(data, '{}'::jsonb), '{deliveryTerms}',
                 to_jsonb($delivery$Sous 10 à 15 jours ouvrables à compter du paiement par chèque ou Virement (à compter de la réception du règlement)$delivery$::text), true),
               '{note}',
                 to_jsonb($note$>>Modalité de Règlement accordée au client:
Paiement intégral à la commande + Bon de commande (Cachet + signature)
-------------------------------------------
>> Tous nos règlements Acceptés
( Espèce, Orange Money, Paypal, Carte Bancaire, Virement ou Chèque) doivent être libellés au nom de "VOOMNET TECHNOLOGY"
-------------------------------------------
>> NB:
La garantie ne couvre pas la perte, le vol et la casse.
Les produits sur commande ne sont ni repris et ne peuvent être retournés.
Dans le cadre d’une vente à un professionnel (organisme public ou privé) la rétractation ne peut être appliquée.
Dès signature d'un bon de commande, le client ne peut en aucun cas se rétracter (Aucun remboursement partiel ou total ne sera accepté quelque soit le motif)
Le client ne peut en aucun cas se rétracter après le versement d’un acompte quelque soit le motif qui pourrait être évoqué.
Une fois le bon de commande signée la vente est définitive et le client a l'obligation de régler la somme convenu.$note$::text), true)
 where nullif(btrim(coalesce(data->>'deliveryTerms', '')), '') is null
    or nullif(btrim(coalesce(data->>'note', '')), '') is null;

create table if not exists public.client_form_links (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  brand_id text not null,
  token_hash text not null unique,
  profile_snapshot jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  used_at timestamptz,
  submission_count integer not null default 0 check (submission_count >= 0)
);

create index if not exists client_form_links_owner_lookup
  on public.client_form_links (owner_user_id, created_at desc);

create index if not exists client_form_links_brand_lookup
  on public.client_form_links (brand_id, active, created_at desc);

create table if not exists public.customer_requests (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  form_link_id uuid references public.client_form_links (id) on delete set null,
  brand_id text not null,
  status text not null default 'received',
  source text not null default 'client_form',
  company_name text not null,
  ncc text not null,
  rccm text not null,
  location text not null,
  validation_contact text not null,
  email text not null,
  phone text not null,
  payment_method text not null,
  contact_id uuid,
  proforma_id uuid,
  invoice_id uuid,
  raw_data jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default timezone('utc', now()),
  validated_at timestamptz,
  validated_by uuid references auth.users (id) on delete set null,
  order_confirmed_at timestamptz,
  payment_received_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists customer_requests_owner_lookup
  on public.customer_requests (owner_user_id, created_at desc);

create index if not exists customer_requests_brand_status_lookup
  on public.customer_requests (owner_user_id, brand_id, status, created_at desc);

create index if not exists customer_requests_proforma_lookup
  on public.customer_requests (proforma_id);

create table if not exists public.customer_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.customer_requests (id) on delete cascade,
  reference text not null,
  quantity numeric(18,3) not null check (quantity > 0),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists customer_request_items_request_lookup
  on public.customer_request_items (request_id, created_at);

create table if not exists public.invoice_sequences (
  user_id uuid not null references auth.users (id) on delete cascade,
  brand_id text not null,
  year integer not null check (year between 2000 and 3000),
  last_value integer not null default 0 check (last_value >= 0),
  primary key (user_id, brand_id, year)
);

-- Le segment de numérotation de l’application est 2620 ; l’ancienne
-- contrainte 2000–2200 empêchait la création de factures futures.
alter table public.invoice_sequences drop constraint if exists invoice_sequences_year_check;
alter table public.invoice_sequences add constraint invoice_sequences_year_check check (year between 2000 and 3000);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  proforma_id uuid not null references public.proformas (id) on delete restrict,
  request_id uuid,
  brand_id text not null,
  number text not null,
  status text not null default 'issued',
  issue_date date,
  data jsonb not null default '{}'::jsonb,
  amount numeric(18,2) not null default 0,
  profile_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, brand_id, number),
  unique (proforma_id)
);

create index if not exists invoices_user_updated_lookup
  on public.invoices (user_id, updated_at desc);

create index if not exists invoices_user_brand_updated_lookup
  on public.invoices (user_id, brand_id, updated_at desc);

create or replace function public.touch_customer_request_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists customer_requests_touch_updated_at on public.customer_requests;
create trigger customer_requests_touch_updated_at
before update on public.customer_requests
for each row execute procedure public.touch_customer_request_updated_at();

create or replace function public.touch_invoice_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists invoices_touch_updated_at on public.invoices;
create trigger invoices_touch_updated_at
before update on public.invoices
for each row execute procedure public.touch_invoice_updated_at();

-- Ces fonctions sont appelées par l’API serveur lors d’une soumission publique.
-- Elles ne dépendent pas de auth.uid(), mais vérifient explicitement le propriétaire
-- fourni par le lien de formulaire. L’API utilise la clé service_role côté serveur.
create or replace function public.next_proforma_number_for_user(
  p_user_id uuid,
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
  numbering_year constant integer := 2620;
  candidate text;
  suffix integer;
begin
  if p_user_id is null or p_brand_id is null or p_brand_code is null then
    raise exception 'Missing numbering parameters';
  end if;

  loop
    suffix := floor(random() * 900000)::integer + 100000;
    candidate := format('PRO-%s-%s-%s', upper(p_brand_code), numbering_year::text, lpad(suffix::text, 6, '0'));

    insert into public.proforma_number_reservations (user_id, brand_id, year, number)
    values (p_user_id, p_brand_id, numbering_year, candidate)
    on conflict do nothing;

    if found and not exists (
      select 1 from public.proformas
       where user_id = p_user_id
         and brand_id = p_brand_id
         and number = candidate
    ) then
      return candidate;
    end if;
  end loop;
end;
$$;

create or replace function public.next_invoice_number_for_user(
  p_user_id uuid,
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
  numbering_year constant integer := 2620;
  candidate text;
  suffix integer;
begin
  if p_user_id is null or p_brand_id is null or p_brand_code is null then
    raise exception 'Missing numbering parameters';
  end if;

  loop
    suffix := floor(random() * 900000)::integer + 100000;
    candidate := format('FAC-%s-%s-%s', upper(p_brand_code), numbering_year::text, lpad(suffix::text, 6, '0'));

    insert into public.invoice_number_reservations (user_id, brand_id, year, number)
    values (p_user_id, p_brand_id, numbering_year, candidate)
    on conflict do nothing;

    if found and not exists (
      select 1 from public.invoices
       where user_id = p_user_id
         and brand_id = p_brand_id
         and number = candidate
    ) then
      return candidate;
    end if;
  end loop;
end;
$$;

revoke all on function public.next_proforma_number_for_user(uuid, text, integer, text) from public, anon;
revoke all on function public.next_invoice_number_for_user(uuid, text, integer, text) from public, anon;
grant execute on function public.next_proforma_number_for_user(uuid, text, integer, text) to authenticated;
grant execute on function public.next_invoice_number_for_user(uuid, text, integer, text) to authenticated;

alter table public.client_form_links enable row level security;
alter table public.customer_requests enable row level security;
alter table public.customer_request_items enable row level security;
alter table public.invoice_sequences enable row level security;
alter table public.invoices enable row level security;

revoke all on table public.client_form_links from public, anon;
revoke all on table public.customer_requests from public, anon;
revoke all on table public.customer_request_items from public, anon;
revoke all on table public.invoice_sequences from public, anon, authenticated;
revoke all on table public.invoices from public, anon;

grant select, insert, update on table public.client_form_links to authenticated;
grant select, update on table public.customer_requests to authenticated;
grant select, update on table public.customer_request_items to authenticated;
grant select, insert, update on table public.invoices to authenticated;

drop policy if exists "Users can read their own client form links" on public.client_form_links;
create policy "Users can read their own client form links"
  on public.client_form_links for select to authenticated
  using (auth.uid() = owner_user_id);

drop policy if exists "Users can create their own client form links" on public.client_form_links;
create policy "Users can create their own client form links"
  on public.client_form_links for insert to authenticated
  with check (auth.uid() = owner_user_id);

drop policy if exists "Users can update their own client form links" on public.client_form_links;
create policy "Users can update their own client form links"
  on public.client_form_links for update to authenticated
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

drop policy if exists "Users can read their own customer requests" on public.customer_requests;
create policy "Users can read their own customer requests"
  on public.customer_requests for select to authenticated
  using (auth.uid() = owner_user_id);

drop policy if exists "Users can update their own customer requests" on public.customer_requests;
create policy "Users can update their own customer requests"
  on public.customer_requests for update to authenticated
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

drop policy if exists "Users can read their own request items" on public.customer_request_items;
create policy "Users can read their own request items"
  on public.customer_request_items for select to authenticated
  using (exists (
    select 1 from public.customer_requests request
     where request.id = customer_request_items.request_id
       and request.owner_user_id = auth.uid()
  ));

drop policy if exists "Users can update their own request items" on public.customer_request_items;
create policy "Users can update their own request items"
  on public.customer_request_items for update to authenticated
  using (exists (
    select 1 from public.customer_requests request
     where request.id = customer_request_items.request_id
       and request.owner_user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.customer_requests request
     where request.id = customer_request_items.request_id
       and request.owner_user_id = auth.uid()
  ));

drop policy if exists "Users can read their own invoices" on public.invoices;
create policy "Users can read their own invoices"
  on public.invoices for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own invoices" on public.invoices;
create policy "Users can create their own invoices"
  on public.invoices for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own invoices" on public.invoices;
create policy "Users can update their own invoices"
  on public.invoices for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Lecture sécurisée des demandes issues du formulaire public.
-- La demande reste visible même lorsqu’aucune proforma n’est encore associée.
create or replace function public.get_client_form_requests(p_brand_id text)
returns table (
  request_id uuid,
  company_name text,
  ncc text,
  rccm text,
  location text,
  validation_contact text,
  email text,
  phone text,
  payment_method text,
  brand_id text,
  status text,
  source text,
  proforma_id uuid,
  proforma_number text,
  proforma_status text,
  amount numeric,
  items jsonb,
  submitted_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    request.id,
    request.company_name,
    request.ncc,
    request.rccm,
    request.location,
    request.validation_contact,
    request.email,
    request.phone,
    request.payment_method,
    request.brand_id,
    request.status,
    request.source,
    proforma.id,
    proforma.number,
    proforma.status,
    coalesce(proforma.amount, 0),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'reference', item.reference,
          'quantity', item.quantity
        )
        order by item.created_at, item.id
      )
      from public.customer_request_items item
      where item.request_id = request.id
    ), '[]'::jsonb),
    request.submitted_at,
    request.updated_at
  from public.customer_requests request
  left join lateral (
    select candidate.*
    from public.proformas candidate
    where (candidate.id = request.proforma_id or candidate.request_id = request.id)
      and candidate.user_id = auth.uid()
      and candidate.brand_id = p_brand_id
      and candidate.source = 'client_form'
      and candidate.deleted_at is null
    order by
      (candidate.id = request.proforma_id) desc,
      candidate.updated_at desc nulls last
    limit 1
  ) proforma on true
  where request.owner_user_id = auth.uid()
    and request.brand_id = p_brand_id
    and request.source = 'client_form'
  order by request.submitted_at desc, request.id desc;
$$;

revoke all on function public.get_client_form_requests(text) from public, anon;
grant execute on function public.get_client_form_requests(text) to authenticated;

notify pgrst, 'reload schema';
