-- =============================================================================
-- pdj_breakfasts — petits-déjeuners persistés jour par jour (page PDJ)
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
--
-- Table NOUVELLE, indépendante des tables repjour partagées (aucune écriture
-- sur celles-ci). get_user_role() est supposée déjà déployée.
--
-- RGPD : `guest_name` est la SEULE donnée nominative, NULLABLE. Elle n'est
-- stockée que pour le jour de service (règle appliquée à l'import) et effacée
-- ensuite (purge). Aucune colonne ultra-sensible du CSV (réfs CB des notes,
-- plaque, accompagnants, identifiants de résa, balance) n'est persistée.
--
-- Droits (D6) : lecture pour tous les authentifiés ; écriture (import + saisie
-- « servi » + purge) réservée à super_utilisateur / admin.
-- Chargement app (D3/perf) : TanStack Query, pas de Realtime → pas de bloc
-- `alter publication supabase_realtime`.
-- =============================================================================

-- ---- Table + index ----------------------------------------------------------
create table if not exists public.pdj_breakfasts (
  id                  uuid primary key default gen_random_uuid(),
  service_date        date not null,                    -- date DU rapport (_YYYYMMDD)
  room                smallint not null,
  guest_name          text,                             -- PII : NULLABLE (purge RGPD)
  status              text not null default '',
  vip                 boolean not null default false,
  adults              smallint not null default 0,
  children            smallint not null default 0,
  guests              smallint not null default 0,      -- = adults + children (recalculé)
  no_of_nights        smallint,
  room_type           text,
  rate_plan           text,                             -- colonne CSV "Rate"
  channel             text,                             -- colonne CSV "TravelAgent"
  company             text,
  guarantee           text,
  payment_type        text,
  addons              text,                             -- "PDJ INCL;TAXE DE SEJOUR 5.72"
  adr                 numeric(8, 2),                    -- prix moyen / nuit
  arrival_date        date,                             -- date seule (heure écartée)
  departure_date      date,
  stay_count          smallint not null default 0,
  breakfasts_included smallint not null default 0,      -- calculé (BB1PAX=1 sinon guests)
  breakfasts_served   smallint not null default 0,      -- coché par le staff (D4)
  served              boolean not null default false,   -- raccourci servi oui/non (D4)
  source_file         text,
  imported_at         timestamptz not null default now(),
  purged_at           timestamptz,                      -- horodatage de l'anonymisation
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (service_date, room)                           -- clé d'upsert idempotent (D5)
);

create index if not exists pdj_breakfasts_service_date_idx
  on public.pdj_breakfasts (service_date);

-- ---- Trigger updated_at (fonction DÉDIÉE, ne rien écraser d'existant) --------
create or replace function public.pdj_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pdj_breakfasts_set_updated_at on public.pdj_breakfasts;
create trigger pdj_breakfasts_set_updated_at
  before update on public.pdj_breakfasts
  for each row execute function public.pdj_set_updated_at();

-- ---- RLS --------------------------------------------------------------------
alter table public.pdj_breakfasts enable row level security;

drop policy if exists "pdj read (authenticated)" on public.pdj_breakfasts;
create policy "pdj read (authenticated)"
  on public.pdj_breakfasts for select
  to authenticated using (true);

drop policy if exists "pdj insert (super/admin)" on public.pdj_breakfasts;
create policy "pdj insert (super/admin)"
  on public.pdj_breakfasts for insert
  to authenticated
  with check (get_user_role() in ('super_utilisateur', 'admin'));

drop policy if exists "pdj update (super/admin)" on public.pdj_breakfasts;
create policy "pdj update (super/admin)"
  on public.pdj_breakfasts for update
  to authenticated
  using (get_user_role() in ('super_utilisateur', 'admin'))
  with check (get_user_role() in ('super_utilisateur', 'admin'));

drop policy if exists "pdj delete (super/admin)" on public.pdj_breakfasts;
create policy "pdj delete (super/admin)"
  on public.pdj_breakfasts for delete
  to authenticated
  using (get_user_role() in ('super_utilisateur', 'admin'));

-- ---- Purge RGPD manuelle (référence) ----------------------------------------
-- Anonymise les noms des jours écoulés en gardant toutes les stats. Cette même
-- requête est jouée par l'app au chargement (voir src/lib/pdj/service.ts,
-- purgeOldGuestNames) en passant « aujourd'hui Europe/Paris » côté client (car
-- current_date est en UTC en base). À exécuter à la main au besoin :
--
--   update public.pdj_breakfasts
--      set guest_name = null, purged_at = now()
--    where service_date < current_date and guest_name is not null;

-- ---- Purge RGPD automatique via pg_cron (D1, filet nocturne) -----------------
-- Nécessite l'extension `pg_cron` ACTIVÉE (Database → Extensions). Le bloc est
-- tolérant : si pg_cron n'est pas dispo / non autorisé, le script continue sans
-- erreur (la purge par l'app suffit alors). `cron.schedule` est idempotent par
-- nom de job (ré-exécuter le script réordonnance sans dupliquer).
do $$
begin
  perform cron.schedule(
    'pdj_purge_names',
    '0 3 * * *',
    $job$
      update public.pdj_breakfasts
         set guest_name = null, purged_at = now()
       where service_date < current_date and guest_name is not null
    $job$
  );
  raise notice 'pg_cron: job "pdj_purge_names" planifié (03:00 quotidien).';
exception
  when others then
    raise notice 'pg_cron indisponible (%). Purge assurée par l''app.', sqlerrm;
end
$$;
