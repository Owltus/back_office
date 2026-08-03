-- =============================================================================
-- REPJOUR — RLS : import des FORECAST réservé à la GESTION
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Idempotent.
-- Ne touche QUE les policies d'écriture de forecast_days : aucune table, aucune
-- donnée. Aligne la base sur l'UI (ForecastImportButton déjà gestion-only).
--
-- MODÈLE repjour :
--   - lecture  : consultation seule ;
--   - ecriture : import des rapports CSV (daily_reports + pms_daily_metrics, >= 2) ;
--   - gestion  : tout, + import des FORECAST (forecast_days) — ce script.
-- daily_reports / pms_daily_metrics restent à >= 2 (écriture), inchangés.
-- =============================================================================

drop policy if exists "SuperUser/Admin write forecast" on public.forecast_days;
drop policy if exists "SuperUser/Admin update forecast" on public.forecast_days;
drop policy if exists "SuperUser/Admin delete forecast" on public.forecast_days;
drop policy if exists "forecast_days write (page:repjour)" on public.forecast_days;
drop policy if exists "forecast_days update (page:repjour)" on public.forecast_days;
drop policy if exists "forecast_days delete (page:repjour)" on public.forecast_days;

create policy "forecast_days write (page:repjour)"
  on public.forecast_days for insert to authenticated
  with check (public.get_page_level('repjour') = 'gestion');
create policy "forecast_days update (page:repjour)"
  on public.forecast_days for update to authenticated
  using (public.get_page_level('repjour') = 'gestion')
  with check (public.get_page_level('repjour') = 'gestion');
create policy "forecast_days delete (page:repjour)"
  on public.forecast_days for delete to authenticated
  using (public.get_page_level('repjour') = 'gestion');


-- VÉRIFICATION — les 3 policies forecast_days doivent exiger 'gestion'.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'forecast_days'
  and policyname like 'forecast_days %(page:repjour)'
order by cmd;
