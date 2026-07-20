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
-- budget : NON touché — reste réservé au grade admin (page /gestion), cf.
--   policy « Admin manages budget » (get_user_role() = 'admin', toujours valide).
-- =============================================================================

-- ---- daily_reports (page 'repjour') -----------------------------------------
drop policy if exists "SuperUser/Admin insert reports" on public.daily_reports;
drop policy if exists "SuperUser/Admin update reports" on public.daily_reports;
drop policy if exists "SuperUser/Admin delete reports" on public.daily_reports;
drop policy if exists "daily_reports write (page:repjour)" on public.daily_reports;
drop policy if exists "daily_reports update (page:repjour)" on public.daily_reports;
drop policy if exists "daily_reports delete (page:repjour)" on public.daily_reports;

create policy "daily_reports write (page:repjour)"
  on public.daily_reports for insert to authenticated
  with check (public.page_level_rank(public.get_page_level('repjour')) >= 2);
create policy "daily_reports update (page:repjour)"
  on public.daily_reports for update to authenticated
  using (public.page_level_rank(public.get_page_level('repjour')) >= 2)
  with check (public.page_level_rank(public.get_page_level('repjour')) >= 2);
create policy "daily_reports delete (page:repjour)"
  on public.daily_reports for delete to authenticated
  using (public.page_level_rank(public.get_page_level('repjour')) >= 2);

-- ---- forecast_days (page 'repjour') -----------------------------------------
drop policy if exists "SuperUser/Admin write forecast" on public.forecast_days;
drop policy if exists "SuperUser/Admin update forecast" on public.forecast_days;
drop policy if exists "SuperUser/Admin delete forecast" on public.forecast_days;
drop policy if exists "forecast_days write (page:repjour)" on public.forecast_days;
drop policy if exists "forecast_days update (page:repjour)" on public.forecast_days;
drop policy if exists "forecast_days delete (page:repjour)" on public.forecast_days;

create policy "forecast_days write (page:repjour)"
  on public.forecast_days for insert to authenticated
  with check (public.page_level_rank(public.get_page_level('repjour')) >= 2);
create policy "forecast_days update (page:repjour)"
  on public.forecast_days for update to authenticated
  using (public.page_level_rank(public.get_page_level('repjour')) >= 2)
  with check (public.page_level_rank(public.get_page_level('repjour')) >= 2);
create policy "forecast_days delete (page:repjour)"
  on public.forecast_days for delete to authenticated
  using (public.page_level_rank(public.get_page_level('repjour')) >= 2);
