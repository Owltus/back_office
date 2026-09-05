-- =============================================================================
-- page_permissions_rls_repjour — durcissement RLS des tables du socle RepJour
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor, APRÈS page_permissions.sql.
-- ⚠ SCRIPT DE BASCULE : à lancer avec page_permissions_rls.sql, une fois les
--    droits pré-remplis (sinon il coupe l'écriture RepJour des non-admins).
-- Ré-exécutable. Ne touche QUE les policies d'écriture. La lecture (SELECT
-- auth.uid() is not null) est laissée inchangée.
--
-- daily_reports + forecast_days : écriture (I/U/D) → au moins 'ecriture' sur la
--   page 'repjour' (remplace get_user_role() in ('super_utilisateur','admin')).
-- budget : désormais rattaché à repjour:gestion (page /gestion) — voir
--   supabase/gestion_budget_rls.sql (remplace l'ancienne policy FOR ALL par grade
--   « Admin manages budget »). L'admin conserve tout (gestion partout).
-- 2026-09-05 : aides en schéma private (voir private_schema_aides.sql)
-- =============================================================================

-- ---- daily_reports (page 'repjour') -----------------------------------------
drop policy if exists "SuperUser/Admin insert reports" on public.daily_reports;
drop policy if exists "SuperUser/Admin update reports" on public.daily_reports;
drop policy if exists "SuperUser/Admin delete reports" on public.daily_reports;
drop policy if exists "daily_reports write (page:repjour)" on public.daily_reports;
drop policy if exists "daily_reports update (page:repjour)" on public.daily_reports;
drop policy if exists "daily_reports delete (page:repjour)" on public.daily_reports;

-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "daily_reports write (page:repjour)"
  on public.daily_reports for insert to authenticated
  with check ((select private.page_level_rank(private.get_page_level('repjour'))) >= 2);
-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "daily_reports update (page:repjour)"
  on public.daily_reports for update to authenticated
  using ((select private.page_level_rank(private.get_page_level('repjour'))) >= 2)
  with check ((select private.page_level_rank(private.get_page_level('repjour'))) >= 2);
-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "daily_reports delete (page:repjour)"
  on public.daily_reports for delete to authenticated
  using ((select private.page_level_rank(private.get_page_level('repjour'))) >= 2);

-- ---- forecast_days (page 'repjour') — GESTION, ou ÉCRITURE en MODE MANUEL ----
-- L'import Forecast (analytique) est réservé à la GESTION côté UI
-- (ForecastImportButton) : écriture d'un forecast = gestion, pas le simple import
-- CSV (daily_reports/pms restent à >= 2 écriture).
--
-- EXCEPTION « MODE MANUEL » (2026-09-03) : si le PMS ne transmet pas ses exports,
-- un compte ÉCRITURE doit pouvoir déposer l'extraction manuelle (Comparison +
-- Forecast) dans RepJour. Le Forecast est alors accepté de l'écriture UNIQUEMENT :
--   - hors de la plage Paris [02h, 03h[ (créneau où le pipeline est attendu) ;
--   - tant que le rapport du JOUR D'IMPORT (J-1 hôtelier, bascule 02h) n'est pas
--     PARTI (auto_sent_at null) — le pipeline auto n'a pas conclu ;
--   - pour les lignes du MOIS de ce jour d'import seulement (ce que produit
--     l'import RepJour ; jamais un autre mois).
-- Le test porte sur « pas parti » et non « pas reçu » car l'import écrit
-- daily_reports AVANT forecast_days (orchestrator.ts) : au moment d'écrire le
-- Forecast, le rapport manuel existe déjà. Miroir UI : lib/businessDay.ts
-- (isManualImportOpen, MANUAL_MODE_HOUR). DELETE reste gestion.
-- ---------------------------------------------------------------------------
-- PÉRIMÉ le 2026-09-05 : repjour_manual_forecast_allowed vit désormais dans le
-- schéma private (autorité : supabase/private_schema_aides.sql). Ne pas
-- rejouer ce bloc (fonction et ses grants) : il recréerait une fonction
-- security definer dans public (Security Advisor rouvert, doublon avec le
-- relais). Conservé pour l'historique.
-- ---------------------------------------------------------------------------
create or replace function public.repjour_manual_forecast_allowed(p_year int, p_month int)
returns boolean
language sql stable security definer set search_path = public
as $$
  with paris as (
    select (now() at time zone 'Europe/Paris') as ts
  ), cycle as (
    select ts, ((ts - interval '2 hours')::date - 1) as import_day from paris
  )
  select (extract(hour from ts) < 2 or extract(hour from ts) >= 3)
     and p_year  = extract(year  from import_day)::int
     and p_month = extract(month from import_day)::int
     and not exists (
       select 1 from public.daily_reports d
       where d.date = cycle.import_day and d.auto_sent_at is not null
     )
  from cycle;
$$;
revoke all on function public.repjour_manual_forecast_allowed(int, int) from public, anon;
grant execute on function public.repjour_manual_forecast_allowed(int, int) to authenticated;

drop policy if exists "SuperUser/Admin write forecast" on public.forecast_days;
drop policy if exists "SuperUser/Admin update forecast" on public.forecast_days;
drop policy if exists "SuperUser/Admin delete forecast" on public.forecast_days;
drop policy if exists "forecast_days write (page:repjour)" on public.forecast_days;
drop policy if exists "forecast_days update (page:repjour)" on public.forecast_days;
drop policy if exists "forecast_days delete (page:repjour)" on public.forecast_days;

-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "forecast_days write (page:repjour)"
  on public.forecast_days for insert to authenticated
  with check (
    (select private.get_page_level('repjour')) = 'gestion'
    or (
      (select private.page_level_rank(private.get_page_level('repjour'))) >= 2
      and private.repjour_manual_forecast_allowed(year, month)
    )
  );
-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "forecast_days update (page:repjour)"
  on public.forecast_days for update to authenticated
  using (
    (select private.get_page_level('repjour')) = 'gestion'
    or (
      (select private.page_level_rank(private.get_page_level('repjour'))) >= 2
      and private.repjour_manual_forecast_allowed(year, month)
    )
  )
  with check (
    (select private.get_page_level('repjour')) = 'gestion'
    or (
      (select private.page_level_rank(private.get_page_level('repjour'))) >= 2
      and private.repjour_manual_forecast_allowed(year, month)
    )
  );
-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "forecast_days delete (page:repjour)"
  on public.forecast_days for delete to authenticated
  using ((select private.get_page_level('repjour')) = 'gestion');

-- VÉRIFICATION — 3 policies forecast_days + la fonction du mode manuel.
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'forecast_days'
  and policyname like 'forecast_days %(page:repjour)'
order by cmd;
select proname, prosecdef, proconfig
from pg_proc
where proname = 'repjour_manual_forecast_allowed';
