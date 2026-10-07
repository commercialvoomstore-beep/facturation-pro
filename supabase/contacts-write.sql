-- Proforma Studio — écriture du répertoire partagé public.contacts
-- À exécuter dans Supabase > SQL Editor pour autoriser les utilisateurs connectés
-- à ajouter, modifier et supprimer les fiches depuis la plateforme.
-- Les contacts restent partagés entre les utilisateurs authentifiés.

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
