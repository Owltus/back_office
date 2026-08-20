-- =============================================================================
-- pdj_externals — petits-déjeuners servis à des externes (non logés à l'hôtel)
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
-- Script strictement NON DESTRUCTIF (create if not exists / create or replace /
-- drop trigger if exists avant create) : aucun DROP TABLE, aucune donnée touchée.
--
-- Table NOUVELLE, indépendante de `pdj_breakfasts` : un externe n'a pas de
-- chambre. Granularité `(service_date)` — UN compteur par jour de service
-- (bouton « Externe » de la page PDJ, dialogue +/-). Aucune PII.
--
-- Ces couverts s'ADDITIONNENT au petit-déjeuner en EXTRA du jour (compteur,
-- carte « PDJ Extra », CA HT au tarif PDJ standard, analytique annuelle et
-- mensuelle) — voir src/lib/pdj/breakdown.ts (computePdjCA), amounts.ts
-- (computeAggDailyTotals) et analytics.ts (aggregatePdjMonthly/aggregatePdjDaily).
-- =============================================================================

-- ---- Table + index ----------------------------------------------------------
create table if not exists public.pdj_externals (
  service_date  date primary key,
  count         smallint not null default 0 check (count >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---- Trigger d'estampillage SERVEUR (updated_at) ----------------------------
create or replace function public.pdj_externals_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists pdj_externals_set_updated_at on public.pdj_externals;
create trigger pdj_externals_set_updated_at
  before update on public.pdj_externals
  for each row execute function public.pdj_externals_stamp();

-- ---- RLS + policies « par page » (page:pdj) ---------------------------------
alter table public.pdj_externals enable row level security;

-- Modèle = miroir EXACT de pdj_breakfasts / pdj_addon_production : lecture
-- rank >= 1 ; écriture (insert/update, upsert du bouton) gestion, ou rank >= 2 +
-- fenêtre J-3 ; suppression réservée à la gestion (non utilisée par l'app —
-- le bouton remet le compteur à 0 via upsert — gardée pour cohérence).

drop policy if exists "pdj externals read (page:pdj)" on public.pdj_externals;
create policy "pdj externals read (page:pdj)"
  on public.pdj_externals for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('pdj'))) >= 1);

drop policy if exists "pdj externals write (page:pdj)"  on public.pdj_externals;
drop policy if exists "pdj externals update (page:pdj)" on public.pdj_externals;
drop policy if exists "pdj externals delete (page:pdj)" on public.pdj_externals;

create policy "pdj externals write (page:pdj)"
  on public.pdj_externals for insert to authenticated
  with check (
    public.get_page_level('pdj') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('pdj')) >= 2
      and service_date >= (current_date - 3)
    )
  );

create policy "pdj externals update (page:pdj)"
  on public.pdj_externals for update to authenticated
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

create policy "pdj externals delete (page:pdj)"
  on public.pdj_externals for delete to authenticated
  using (public.get_page_level('pdj') = 'gestion');

-- ---- Vérification (lecture seule) -------------------------------------------
-- Vérif :
--   select policyname, cmd from pg_policies
--   where tablename = 'pdj_externals';        -- SELECT + INSERT + UPDATE + DELETE
--   select relrowsecurity from pg_class
--   where relname = 'pdj_externals';           -- t
