-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
-- Table NOUVELLE, indépendante des tables repjour partagées (lecture seule).
--
-- Suivi ménage : UNE ligne par (jour, chambre) avec un statut. On ne stocke que
-- les chambres à un statut non-défaut (nettoyee / refus) ; l'absence de ligne
-- vaut « non_nettoyee ». Remplace la version précédente (jamais déployée) qui
-- stockait une ligne par jour → d'où le drop initial.

drop table if exists public.rapro_rooms cascade;

create table public.rapro_rooms (
  id          uuid primary key default gen_random_uuid(),
  report_date date not null,
  room        smallint not null,
  status      text not null default 'non_nettoyee'
                check (status in ('nettoyee', 'non_nettoyee', 'refus', 'noshow')),
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Clé d'upsert. Son index couvre aussi les lectures par report_date (colonne
  -- de tête), donc pas d'index supplémentaire nécessaire.
  unique (report_date, room)
);

-- Trigger updated_at dédié (nom rapro_* pour éviter toute collision).
create or replace function public.rapro_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rapro_rooms_set_updated_at on public.rapro_rooms;
create trigger rapro_rooms_set_updated_at
  before update on public.rapro_rooms
  for each row execute function public.rapro_set_updated_at();

-- RLS : lecture pour tout authentifié, écriture réservée super_utilisateur/admin.
-- get_user_role() est supposée DÉJÀ déployée (partagée avec caisse/pdj).
alter table public.rapro_rooms enable row level security;

drop policy if exists "rapro read (authenticated)" on public.rapro_rooms;
create policy "rapro read (authenticated)"
  on public.rapro_rooms for select
  to authenticated using (true);

drop policy if exists "rapro insert (super/admin)" on public.rapro_rooms;
create policy "rapro insert (super/admin)"
  on public.rapro_rooms for insert
  to authenticated
  with check (get_user_role() in ('super_utilisateur', 'admin'));

drop policy if exists "rapro update (super/admin)" on public.rapro_rooms;
create policy "rapro update (super/admin)"
  on public.rapro_rooms for update
  to authenticated
  using (get_user_role() in ('super_utilisateur', 'admin'))
  with check (get_user_role() in ('super_utilisateur', 'admin'));

drop policy if exists "rapro delete (super/admin)" on public.rapro_rooms;
create policy "rapro delete (super/admin)"
  on public.rapro_rooms for delete
  to authenticated
  using (get_user_role() in ('super_utilisateur', 'admin'));
