-- =============================================================================
-- pdj_addon_production — agrégats « Addon Production » par jour métier et code
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
-- Script strictement NON DESTRUCTIF (create if not exists / create or replace /
-- drop trigger if exists avant create) : aucun DROP TABLE, aucune donnée touchée.
--
-- Table NOUVELLE, indépendante des tables repjour partagées (aucune écriture sur
-- celles-ci). Granularité `(service_date, code)`, distincte de `pdj_breakfasts`
-- qui est `(service_date, room)`.
--
-- Elle stocke, par jour métier et par code petit-déjeuner, les agrégats du CSV
-- « Addon Production » : nombre de réservations (Total Count) + revenu TTC
-- (Total Revenue). Aucune PII → pas de purge RGPD.
--
-- ALIGNEMENT DES DATES : la date métier lue du contenu (ex. 2026-08-09) est
-- alignée **+1 jour** par l'importeur (breakfastServiceDate) AVANT insertion, si
-- bien que `service_date` reçu = jour du petit-déjeuner (le jour du board où
-- l'In-House est rangé, ex. 2026-08-10). Même sémantique que `pdj_breakfasts`.
--
-- DEUX CHEMINS D'ÉCRITURE (comme pdj_breakfasts) : l'Edge Function (service_role,
-- contourne la RLS, pipeline auto) ET l'app lors de l'import manuel (sous RLS,
-- réservé aux admins). D'où des policies de LECTURE ET d'ÉCRITURE `page:pdj`.
-- =============================================================================

-- ---- Table + index ----------------------------------------------------------
create table if not exists public.pdj_addon_production (
  id            uuid primary key default gen_random_uuid(),
  service_date  date not null,                     -- jour métier (même sémantique que pdj_breakfasts)
  code          text not null,                     -- 'PDJ' / 'PDJBB', normalisé upper/trim par l'import
  total_count   integer not null default 0,        -- Total Count = nb de réservations
  revenue_ttc   numeric(12, 2) not null default 0, -- Total Revenue (TTC)
  source_file   text,
  imported_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (service_date, code)                       -- clé d'upsert idempotent
);

create index if not exists pdj_addon_production_service_date_idx
  on public.pdj_addon_production (service_date);

-- ---- Trigger d'estampillage SERVEUR (updated_at) ----------------------------
-- PAS d'imported_by : la table est écrite par l'Edge en service_role →
-- auth.uid() serait NULL ; la traçabilité passe par source_file.
create or replace function public.pdj_addon_production_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists pdj_addon_production_set_updated_at on public.pdj_addon_production;
drop trigger if exists pdj_addon_production_stamp on public.pdj_addon_production;
create trigger pdj_addon_production_stamp
  before insert or update on public.pdj_addon_production
  for each row execute function public.pdj_addon_production_stamp();

-- ---- RLS + policies « par page » (page:pdj) ---------------------------------
alter table public.pdj_addon_production enable row level security;

-- Policies DÉFINIES ICI (et retirées de page_permissions_rls*.sql) : ces fichiers
-- d'autorité sont des migrations ONE-SHOT (leurs `drop` visent d'anciens noms
-- permissifs → non rejouables). Les policies addon n'existent QUE dans ce fichier,
-- donc aucun doublon et aucun « revert silencieux » : rejouer CE fichier recrée
-- exactement les mêmes policies (chaque `create` précédé d'un `drop if exists`).
-- Modèle = miroir EXACT de pdj_breakfasts (lecture rank>=1 ; écriture rank>=2 +
-- fenêtre J-3 ou gestion ; suppression gestion).

-- LECTURE (rank >= 1). Le (select ...) force une évaluation unique (InitPlan).
drop policy if exists "pdj addon read (page:pdj)" on public.pdj_addon_production;
create policy "pdj addon read (page:pdj)"
  on public.pdj_addon_production for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('pdj'))) >= 1);

-- ÉCRITURE INSERT/UPDATE : gestion, ou rank >= 2 + fenêtre J-3. L'import manuel
-- côté app est réservé aux admins (gestion → hors fenêtre) ; l'Edge (service_role)
-- contourne la RLS de toute façon.
drop policy if exists "pdj addon write (page:pdj)"  on public.pdj_addon_production;
drop policy if exists "pdj addon update (page:pdj)" on public.pdj_addon_production;
drop policy if exists "pdj addon delete (page:pdj)" on public.pdj_addon_production;

create policy "pdj addon write (page:pdj)"
  on public.pdj_addon_production for insert to authenticated
  with check (
    public.get_page_level('pdj') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('pdj')) >= 2
      and service_date >= (current_date - 3)
    )
  );

create policy "pdj addon update (page:pdj)"
  on public.pdj_addon_production for update to authenticated
  using (
    public.get_page_level('pdj') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('pdj')) >= 2
      and service_date >= (current_date - 3)
    )
  )
  with check (
    public.get_page_level('pdj') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('pdj')) >= 2
      and service_date >= (current_date - 3)
    )
  );

-- DELETE = gestion (miroir de pdj_breakfasts).
create policy "pdj addon delete (page:pdj)"
  on public.pdj_addon_production for delete to authenticated
  using (public.get_page_level('pdj') = 'gestion');

-- ---- Vérification (lecture seule) -------------------------------------------
-- Vérif :
--   select policyname, cmd from pg_policies
--   where tablename = 'pdj_addon_production';        -- SELECT + INSERT + UPDATE + DELETE
--   select relrowsecurity from pg_class
--   where relname = 'pdj_addon_production';          -- t
