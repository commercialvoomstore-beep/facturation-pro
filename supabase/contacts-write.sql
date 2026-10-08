-- Proforma Studio — répertoire partagé public.contacts
-- À exécuter dans Supabase > SQL Editor avant la synchronisation VosFactures.
-- Les contacts restent partagés entre les utilisateurs authentifiés.
-- Aucune clé service_role n’est nécessaire dans le navigateur ni dans la fonction Vercel.

-- Colonnes d’identification externe et coordonnées normalisées.
-- Les valeurs déjà présentes sont conservées ; source=manual distingue les fiches existantes.
alter table public.contacts
  add column if not exists source text not null default 'manual',
  add column if not exists external_id text,
  add column if not exists contact text,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists post_code text,
  add column if not exists register_number text,
  add column if not exists numero_registre text,
  add column if not exists external_created_at timestamptz,
  add column if not exists external_updated_at timestamptz;

-- Compatibilité avec les lots SQL qui utilisent numero_registre pour le RCC.
update public.contacts
set numero_registre = coalesce(nullif(btrim(numero_registre), ''), nullif(btrim(register_number), ''))
where coalesce(nullif(btrim(numero_registre), ''), '') = ''
  and nullif(btrim(register_number), '') is not null;

-- Une nouvelle synchronisation met à jour la fiche VosFactures correspondante
-- au lieu de créer un doublon. Les external_id NULL restent autorisés pour les
-- anciennes fiches saisies directement dans Supabase.
create unique index if not exists contacts_source_external_id_unique
  on public.contacts (source, external_id);

alter table public.contacts enable row level security;

revoke all on table public.contacts from public, anon;
grant select, insert, update, delete on table public.contacts to authenticated;

drop policy if exists "Authenticated users can read shared contacts" on public.contacts;
create policy "Authenticated users can read shared contacts"
  on public.contacts for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can create shared contacts" on public.contacts;
create policy "Authenticated users can create shared contacts"
  on public.contacts for insert
  to authenticated
  with check (true);

drop policy if exists "Authenticated users can update shared contacts" on public.contacts;
create policy "Authenticated users can update shared contacts"
  on public.contacts for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated users can delete shared contacts" on public.contacts;
create policy "Authenticated users can delete shared contacts"
  on public.contacts for delete
  to authenticated
  using (true);
