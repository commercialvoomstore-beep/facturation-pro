-- Proforma Studio — connexion par matricule 3CX
-- À exécuter une seule fois dans Supabase > SQL Editor.
-- Ce script ne contient aucune clé secrète et n'utilise pas service_role dans le navigateur.

create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  matricule_3cx text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- La normalisation en majuscules est faite par l'application et par le trigger.
-- L'index insensible à la casse empêche deux comptes d'utiliser le même matricule.
create unique index if not exists user_profiles_matricule_3cx_unique
  on public.user_profiles (upper(matricule_3cx));

alter table public.user_profiles enable row level security;

drop policy if exists "Users can read their own 3CX profile" on public.user_profiles;
create policy "Users can read their own 3CX profile"
  on public.user_profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "Users can create their own 3CX profile" on public.user_profiles;
create policy "Users can create their own 3CX profile"
  on public.user_profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update their own 3CX profile" on public.user_profiles;
create policy "Users can update their own 3CX profile"
  on public.user_profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

revoke all on table public.user_profiles from public, anon;
grant select, insert, update on table public.user_profiles to authenticated;

-- Crée automatiquement la correspondance dès l'inscription,
-- y compris lorsque la confirmation d'e-mail est activée.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matricule text;
begin
  matricule := upper(trim(coalesce(new.raw_user_meta_data ->> 'matricule_3cx', '')));
  if matricule <> '' then
    insert into public.user_profiles (id, matricule_3cx)
    values (new.id, matricule)
    on conflict (id) do update
      set matricule_3cx = excluded.matricule_3cx,
          updated_at = timezone('utc', now());
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute procedure public.handle_new_user_profile();

-- Résout un matricule vers l'e-mail interne nécessaire à signInWithPassword.
-- La table user_profiles reste privée : seul ce résultat ciblé est exposé à l'application.
create or replace function public.resolve_login_email(p_matricule text)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.email
  from auth.users as u
  join public.user_profiles as p on p.id = u.id
  where upper(p.matricule_3cx) = upper(trim(coalesce(p_matricule, '')))
    and u.email is not null
  limit 1;
$$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

-- Exemple facultatif pour rattacher un compte créé avant l'ajout du matricule :
-- insert into public.user_profiles (id, matricule_3cx)
-- select id, '3CX-001' from auth.users where email = 'utilisateur@exemple.ci'
-- on conflict (id) do update set matricule_3cx = excluded.matricule_3cx,
--   updated_at = timezone('utc', now());
