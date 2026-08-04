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
  status     text        not null default 'reserve'
                         check (status in ('reserve', 'paye', 'checkout')),
  comment    text        not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists parking_reservations_spot_date_idx
  on public.parking_reservations (spot, start_date);

-- updated_at automatique (fonction nommée spécifiquement pour ne RIEN écraser
-- d'existant dans la base partagée).
create or replace function public.parking_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
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

-- RLS : les policies de cette table vivent dans page_permissions_rls*.sql et
-- les fichiers *_rls_fenetre_*.sql (autorité UNIQUE). Ne PAS recréer de policy
-- ici : un rejeu rouvrirait les lectures et court-circuiterait permissions + fenetres.

-- Realtime : diffuser les INSERT/UPDATE/DELETE aux clients abonnés.
-- (Bloc idempotent : ne casse pas si la table est déjà dans la publication.)
do $$
begin
  alter publication supabase_realtime add table public.parking_reservations;
exception
  when duplicate_object then null;
end
$$;

-- ============================================================================
-- MIGRATION statuts (table DÉJÀ existante en prod)
--
-- Anciens statuts : 'confirme' (vert) / 'attente' (défaut) / 'annule' (rouge).
-- Nouveaux         : 'reserve'  (gris, défaut) / 'paye' (vert) / 'checkout' (orange).
--
-- Le `create table if not exists` plus haut NE modifie PAS une table existante :
-- ce bloc est nécessaire pour faire évoluer la contrainte + les données en place.
-- Idempotent : ré-exécutable sans dommage (les UPDATE deviennent des no-op).
-- ============================================================================
do $$
begin
  -- On lève d'abord la contrainte pour pouvoir réécrire les valeurs.
  alter table public.parking_reservations
    drop constraint if exists parking_reservations_status_check;

  update public.parking_reservations set status = 'paye'    where status = 'confirme';
  update public.parking_reservations set status = 'reserve' where status = 'attente';
  -- 'annule' n'a plus d'équivalent : annuler == supprimer. On retire ces lignes.
  -- (Pour les CONSERVER en 'reserve' à la place, commenter la ligne ci-dessous
  --  et décommenter l'UPDATE juste après.)
  delete from public.parking_reservations where status = 'annule';
  -- update public.parking_reservations set status = 'reserve' where status = 'annule';

  alter table public.parking_reservations
    alter column status set default 'reserve';

  alter table public.parking_reservations
    add constraint parking_reservations_status_check
    check (status in ('reserve', 'paye', 'checkout'));
end
$$;
