-- ============================================================================
-- Parking — table des réservations + RLS + Realtime
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
-- Table NOUVELLE, indépendante des tables repjour : l'app standalone
-- repjour-okko-nantes n'y touche pas, donc aucun risque pour ses données.
--
-- Stocke des DATES ABSOLUES (start_date) : le planning affiche un décalage
-- relatif au lundi courant, mais la persistance doit être absolue.
-- ============================================================================

create table if not exists public.parking_reservations (
  id         uuid primary key default gen_random_uuid(),
  spot       smallint    not null check (spot between 1 and 14),
  client     text        not null default '',
  start_date date        not null,
  nights     smallint    not null default 1 check (nights >= 1),
  status     text        not null default 'attente'
                         check (status in ('confirme', 'attente', 'annule')),
  comment    text        not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists parking_reservations_spot_date_idx
  on public.parking_reservations (spot, start_date);

-- updated_at automatique (fonction nommée spécifiquement pour ne RIEN écraser
-- d'existant dans la base partagée).
create or replace function public.parking_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists parking_reservations_set_updated_at on public.parking_reservations;
create trigger parking_reservations_set_updated_at
  before update on public.parking_reservations
  for each row execute function public.parking_set_updated_at();

-- RLS.
alter table public.parking_reservations enable row level security;

-- LECTURE : tout utilisateur authentifié voit le planning (les 3 rôles).
drop policy if exists "parking read (authenticated)" on public.parking_reservations;
create policy "parking read (authenticated)"
  on public.parking_reservations for select
  to authenticated using (true);

-- ÉCRITURE : réservée à `super_utilisateur` et `admin`. Le rôle `utilisateur`
-- (visiteur) peut lire mais PAS modifier.
drop policy if exists "parking write (authenticated)" on public.parking_reservations;

drop policy if exists "parking insert (super/admin)" on public.parking_reservations;
create policy "parking insert (super/admin)"
  on public.parking_reservations for insert
  to authenticated
  with check (get_user_role() in ('super_utilisateur', 'admin'));

drop policy if exists "parking update (super/admin)" on public.parking_reservations;
create policy "parking update (super/admin)"
  on public.parking_reservations for update
  to authenticated
  using (get_user_role() in ('super_utilisateur', 'admin'))
  with check (get_user_role() in ('super_utilisateur', 'admin'));

drop policy if exists "parking delete (super/admin)" on public.parking_reservations;
create policy "parking delete (super/admin)"
  on public.parking_reservations for delete
  to authenticated
  using (get_user_role() in ('super_utilisateur', 'admin'));

-- Realtime : diffuser les INSERT/UPDATE/DELETE aux clients abonnés.
-- (Bloc idempotent : ne casse pas si la table est déjà dans la publication.)
do $$
begin
  alter publication supabase_realtime add table public.parking_reservations;
exception
  when duplicate_object then null;
end
$$;
