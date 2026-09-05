-- =============================================================================
-- perf_rls_ecriture_2026-09-05 — policies d'ÉCRITURE enveloppées en (select …)
--
-- Application : `supabase db query --linked -f supabase/perf_rls_ecriture_2026-09-05.sql`
-- EN UNE FOIS (une seule transaction : chaque `drop policy` est immédiatement
-- suivi du `create policy` de même nom ; en cas d'erreur, tout est annulé).
-- Ré-exécutable (idempotent) : `drop policy if exists` + `create policy`.
--
-- INNOCUITÉ : SÉCURITÉ STRICTEMENT IDENTIQUE. Ce fichier a été GÉNÉRÉ depuis le
-- catalogue de production (`pg_policies`, 2026-09-05) par une substitution
-- purement syntaxique, policy par policy, sans rien recopier des fichiers
-- d'autorité (impossible de réintroduire un état antérieur) :
--     get_page_level('x') = 'gestion'          → (select public.get_page_level('x')) = 'gestion'
--     page_level_rank(get_page_level('x')) >= n → (select public.page_level_rank(public.get_page_level('x'))) >= n
--     is_admin()                               → (select public.is_admin())
--     get_user_role() = 'admin'                → (select public.get_user_role()) = 'admin'
-- Ni nom, ni commande (insert/update/delete/all), ni rôle, ni condition de
-- colonne (fenêtres `current_date - n`, `auth.uid()`, `created_by`, …) ne
-- changent. `repjour_manual_forecast_allowed(year, month)` dépend de la ligne
-- et reste NUE. Les 6 policies déjà enveloppées (email_recipients,
-- server_report_recipients) ne sont pas touchées. Aucune table, aucune donnée,
-- aucun trigger, aucune policy SELECT.
--
-- POURQUOI (plan perf-resilience-2026-09-05, étape 10, décision utilisateur) :
-- un appel de fonction nu dans une policy est ré-évalué PAR LIGNE écrite
-- (jusqu'à 4 appels de get_page_level, soit 8 lectures de catalogue, par
-- ligne) ; enveloppé en `(select …)` et avec des fonctions STABLE
-- (perf_2026-09-05.sql), il est évalué UNE fois par instruction (InitPlan),
-- comme le sont déjà toutes les policies SELECT. Impact sur les écritures de
-- masse (imports, purge PDJ, matérialisation ELIOR).
--
-- ÉTAT AVANT (compte de policies d'écriture concernées, par table, figé) :
--   affiche_templates 3, baby_cot_assignments 3, baby_cots 1, budget 3,
--   caisse_cautions 3, caisse_sheets 3, daily_reports 3, easter_eggs 3,
--   forecast_days 3, hotel_config 1, hotel_rooms 1, literie_sheets 2,
--   parking_reservations 3, pdj_addon_production 3, pdj_breakfasts 3,
--   pdj_externals 3, pms_daily_metrics 3, profiles 2, rapro_rooms 3,
--   rapro_sheets 3 — total 52.
-- 2026-09-05 : aides en schéma private (voir private_schema_aides.sql)
-- =============================================================================

-- affiche_templates / DELETE
drop policy if exists "affiche delete (page:affichage)" on public.affiche_templates;
create policy "affiche delete (page:affichage)" on public.affiche_templates
  for delete to authenticated
  using ((((select private.get_page_level('affichage')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('affichage'))) >= 2) AND (created_by = auth.uid()))));

-- affiche_templates / INSERT
drop policy if exists "affiche write (page:affichage)" on public.affiche_templates;
create policy "affiche write (page:affichage)" on public.affiche_templates
  for insert to authenticated
  with check (((select private.page_level_rank(private.get_page_level('affichage'))) >= 2));

-- affiche_templates / UPDATE
drop policy if exists "affiche update (page:affichage)" on public.affiche_templates;
create policy "affiche update (page:affichage)" on public.affiche_templates
  for update to authenticated
  using ((((select private.get_page_level('affichage')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('affichage'))) >= 2) AND (created_by = auth.uid()))))
  with check ((((select private.get_page_level('affichage')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('affichage'))) >= 2) AND (created_by = auth.uid()))));

-- baby_cot_assignments / DELETE
drop policy if exists "baby_cot_assignments delete (page:literie)" on public.baby_cot_assignments;
create policy "baby_cot_assignments delete (page:literie)" on public.baby_cot_assignments
  for delete to authenticated
  using ((((select private.get_page_level('literie')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('literie'))) >= 2) AND (end_date >= (CURRENT_DATE - 2)))));

-- baby_cot_assignments / INSERT
drop policy if exists "baby_cot_assignments write (page:literie)" on public.baby_cot_assignments;
create policy "baby_cot_assignments write (page:literie)" on public.baby_cot_assignments
  for insert to authenticated
  with check ((((select private.get_page_level('literie')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('literie'))) >= 2) AND (start_date >= (CURRENT_DATE - 2)))));

-- baby_cot_assignments / UPDATE
drop policy if exists "baby_cot_assignments update (page:literie)" on public.baby_cot_assignments;
create policy "baby_cot_assignments update (page:literie)" on public.baby_cot_assignments
  for update to authenticated
  using ((((select private.get_page_level('literie')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('literie'))) >= 2) AND (end_date >= (CURRENT_DATE - 2)))))
  with check ((((select private.get_page_level('literie')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('literie'))) >= 2) AND (end_date >= (CURRENT_DATE - 2)))));

-- baby_cots / ALL
drop policy if exists "baby_cots write (page:literie)" on public.baby_cots;
create policy "baby_cots write (page:literie)" on public.baby_cots
  for all to authenticated
  using (((select private.get_page_level('literie')) = 'gestion'))
  with check (((select private.get_page_level('literie')) = 'gestion'));

-- budget / DELETE
drop policy if exists "budget delete (page:repjour gestion)" on public.budget;
create policy "budget delete (page:repjour gestion)" on public.budget
  for delete to authenticated
  using (((select private.get_page_level('repjour')) = 'gestion'));

-- budget / INSERT
drop policy if exists "budget write (page:repjour gestion)" on public.budget;
create policy "budget write (page:repjour gestion)" on public.budget
  for insert to authenticated
  with check (((select private.get_page_level('repjour')) = 'gestion'));

-- budget / UPDATE
drop policy if exists "budget update (page:repjour gestion)" on public.budget;
create policy "budget update (page:repjour gestion)" on public.budget
  for update to authenticated
  using (((select private.get_page_level('repjour')) = 'gestion'))
  with check (((select private.get_page_level('repjour')) = 'gestion'));

-- caisse_cautions / DELETE
drop policy if exists "caisse cautions delete (page:caisse)" on public.caisse_cautions;
create policy "caisse cautions delete (page:caisse)" on public.caisse_cautions
  for delete to authenticated
  using ((((select private.get_page_level('caisse')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('caisse'))) >= 2) AND (taken_date = CURRENT_DATE))));

-- caisse_cautions / INSERT
drop policy if exists "caisse cautions write (page:caisse)" on public.caisse_cautions;
create policy "caisse cautions write (page:caisse)" on public.caisse_cautions
  for insert to authenticated
  with check (((select private.page_level_rank(private.get_page_level('caisse'))) >= 2));

-- caisse_cautions / UPDATE
drop policy if exists "caisse cautions update (page:caisse)" on public.caisse_cautions;
create policy "caisse cautions update (page:caisse)" on public.caisse_cautions
  for update to authenticated
  using (((select private.page_level_rank(private.get_page_level('caisse'))) >= 2))
  with check (((select private.page_level_rank(private.get_page_level('caisse'))) >= 2));

-- caisse_sheets / DELETE
drop policy if exists "caisse delete (page:caisse gestion)" on public.caisse_sheets;
create policy "caisse delete (page:caisse gestion)" on public.caisse_sheets
  for delete to authenticated
  using (((select private.get_page_level('caisse')) = 'gestion'));

-- caisse_sheets / INSERT
drop policy if exists "caisse write (page:caisse)" on public.caisse_sheets;
create policy "caisse write (page:caisse)" on public.caisse_sheets
  for insert to authenticated
  with check ((((select private.get_page_level('caisse')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('caisse'))) >= 2) AND (report_date >= (CURRENT_DATE - 1)))));

-- caisse_sheets / UPDATE
drop policy if exists "caisse update (page:caisse + verrou)" on public.caisse_sheets;
create policy "caisse update (page:caisse + verrou)" on public.caisse_sheets
  for update to authenticated
  using ((((select private.get_page_level('caisse')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('caisse'))) >= 2) AND (report_date >= (CURRENT_DATE - 1)))))
  with check ((((select private.get_page_level('caisse')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('caisse'))) >= 2) AND (report_date >= (CURRENT_DATE - 1)))));

-- daily_reports / DELETE
drop policy if exists "daily_reports delete (page:repjour)" on public.daily_reports;
create policy "daily_reports delete (page:repjour)" on public.daily_reports
  for delete to authenticated
  using (((select private.page_level_rank(private.get_page_level('repjour'))) >= 2));

-- daily_reports / INSERT
drop policy if exists "daily_reports write (page:repjour)" on public.daily_reports;
create policy "daily_reports write (page:repjour)" on public.daily_reports
  for insert to authenticated
  with check (((select private.page_level_rank(private.get_page_level('repjour'))) >= 2));

-- daily_reports / UPDATE
drop policy if exists "daily_reports update (page:repjour)" on public.daily_reports;
create policy "daily_reports update (page:repjour)" on public.daily_reports
  for update to authenticated
  using (((select private.page_level_rank(private.get_page_level('repjour'))) >= 2))
  with check (((select private.page_level_rank(private.get_page_level('repjour'))) >= 2));

-- easter_eggs / DELETE
drop policy if exists "easter_eggs delete (admin)" on public.easter_eggs;
create policy "easter_eggs delete (admin)" on public.easter_eggs
  for delete to authenticated
  using ((select private.is_admin()));

-- easter_eggs / INSERT
drop policy if exists "easter_eggs insert (admin)" on public.easter_eggs;
create policy "easter_eggs insert (admin)" on public.easter_eggs
  for insert to authenticated
  with check ((select private.is_admin()));

-- easter_eggs / UPDATE
drop policy if exists "easter_eggs update (admin)" on public.easter_eggs;
create policy "easter_eggs update (admin)" on public.easter_eggs
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- forecast_days / DELETE
drop policy if exists "forecast_days delete (page:repjour)" on public.forecast_days;
create policy "forecast_days delete (page:repjour)" on public.forecast_days
  for delete to authenticated
  using (((select private.get_page_level('repjour')) = 'gestion'));

-- forecast_days / INSERT
drop policy if exists "forecast_days write (page:repjour)" on public.forecast_days;
create policy "forecast_days write (page:repjour)" on public.forecast_days
  for insert to authenticated
  with check ((((select private.get_page_level('repjour')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('repjour'))) >= 2) AND private.repjour_manual_forecast_allowed(year, month))));

-- forecast_days / UPDATE
drop policy if exists "forecast_days update (page:repjour)" on public.forecast_days;
create policy "forecast_days update (page:repjour)" on public.forecast_days
  for update to authenticated
  using ((((select private.get_page_level('repjour')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('repjour'))) >= 2) AND private.repjour_manual_forecast_allowed(year, month))))
  with check ((((select private.get_page_level('repjour')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('repjour'))) >= 2) AND private.repjour_manual_forecast_allowed(year, month))));

-- hotel_config / UPDATE
drop policy if exists "Admin updates config" on public.hotel_config;
create policy "Admin updates config" on public.hotel_config
  for update to public
  using (((select private.get_user_role()) = 'admin'));

-- hotel_rooms / UPDATE
drop policy if exists "hotel_rooms write (page:literie)" on public.hotel_rooms;
create policy "hotel_rooms write (page:literie)" on public.hotel_rooms
  for update to authenticated
  using (((select private.page_level_rank(private.get_page_level('literie'))) >= 2))
  with check (((select private.page_level_rank(private.get_page_level('literie'))) >= 2));

-- literie_sheets / INSERT
drop policy if exists "literie_sheets write (page:literie)" on public.literie_sheets;
create policy "literie_sheets write (page:literie)" on public.literie_sheets
  for insert to authenticated
  with check ((((select private.get_page_level('literie')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('literie'))) >= 2) AND (report_date >= (CURRENT_DATE - 2)))));

-- literie_sheets / UPDATE
drop policy if exists "literie_sheets update (page:literie)" on public.literie_sheets;
create policy "literie_sheets update (page:literie)" on public.literie_sheets
  for update to authenticated
  using ((((select private.get_page_level('literie')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('literie'))) >= 2) AND (report_date >= (CURRENT_DATE - 2)))))
  with check ((((select private.get_page_level('literie')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('literie'))) >= 2) AND (report_date >= (CURRENT_DATE - 2)))));

-- parking_reservations / DELETE
drop policy if exists "parking delete (page:parking)" on public.parking_reservations;
create policy "parking delete (page:parking)" on public.parking_reservations
  for delete to authenticated
  using ((((select private.get_page_level('parking')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('parking'))) >= 2) AND ((start_date + (nights)::integer) >= (CURRENT_DATE - 7)))));

-- parking_reservations / INSERT
drop policy if exists "parking write (page:parking)" on public.parking_reservations;
create policy "parking write (page:parking)" on public.parking_reservations
  for insert to authenticated
  with check ((((select private.get_page_level('parking')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('parking'))) >= 2) AND (start_date >= (CURRENT_DATE - 7)))));

-- parking_reservations / UPDATE
drop policy if exists "parking update (page:parking)" on public.parking_reservations;
create policy "parking update (page:parking)" on public.parking_reservations
  for update to authenticated
  using ((((select private.get_page_level('parking')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('parking'))) >= 2) AND ((start_date + (nights)::integer) >= (CURRENT_DATE - 7)))))
  with check ((((select private.get_page_level('parking')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('parking'))) >= 2) AND ((start_date + (nights)::integer) >= (CURRENT_DATE - 7)))));

-- pdj_addon_production / DELETE
drop policy if exists "pdj addon delete (page:pdj)" on public.pdj_addon_production;
create policy "pdj addon delete (page:pdj)" on public.pdj_addon_production
  for delete to authenticated
  using (((select private.get_page_level('pdj')) = 'gestion'));

-- pdj_addon_production / INSERT
drop policy if exists "pdj addon write (page:pdj)" on public.pdj_addon_production;
create policy "pdj addon write (page:pdj)" on public.pdj_addon_production
  for insert to authenticated
  with check ((((select private.get_page_level('pdj')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('pdj'))) >= 2) AND (service_date >= (CURRENT_DATE - 3)))));

-- pdj_addon_production / UPDATE
drop policy if exists "pdj addon update (page:pdj)" on public.pdj_addon_production;
create policy "pdj addon update (page:pdj)" on public.pdj_addon_production
  for update to authenticated
  using ((((select private.get_page_level('pdj')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('pdj'))) >= 2) AND (service_date >= (CURRENT_DATE - 3)))))
  with check ((((select private.get_page_level('pdj')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('pdj'))) >= 2) AND (service_date >= (CURRENT_DATE - 3)))));

-- pdj_breakfasts / DELETE
drop policy if exists "pdj delete (page:pdj)" on public.pdj_breakfasts;
create policy "pdj delete (page:pdj)" on public.pdj_breakfasts
  for delete to authenticated
  using (((select private.get_page_level('pdj')) = 'gestion'));

-- pdj_breakfasts / INSERT
drop policy if exists "pdj write (page:pdj)" on public.pdj_breakfasts;
create policy "pdj write (page:pdj)" on public.pdj_breakfasts
  for insert to authenticated
  with check ((((select private.get_page_level('pdj')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('pdj'))) >= 2) AND (service_date >= (CURRENT_DATE - 3)))));

-- pdj_breakfasts / UPDATE
drop policy if exists "pdj update (page:pdj)" on public.pdj_breakfasts;
create policy "pdj update (page:pdj)" on public.pdj_breakfasts
  for update to authenticated
  using ((((select private.get_page_level('pdj')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('pdj'))) >= 2) AND (service_date >= (CURRENT_DATE - 3)))))
  with check ((((select private.get_page_level('pdj')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('pdj'))) >= 2) AND (service_date >= (CURRENT_DATE - 3)))));

-- pdj_externals / DELETE
drop policy if exists "pdj externals delete (page:pdj)" on public.pdj_externals;
create policy "pdj externals delete (page:pdj)" on public.pdj_externals
  for delete to authenticated
  using (((select private.get_page_level('pdj')) = 'gestion'));

-- pdj_externals / INSERT
drop policy if exists "pdj externals write (page:pdj)" on public.pdj_externals;
create policy "pdj externals write (page:pdj)" on public.pdj_externals
  for insert to authenticated
  with check ((((select private.get_page_level('pdj')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('pdj'))) >= 2) AND (service_date >= (CURRENT_DATE - 3)))));

-- pdj_externals / UPDATE
drop policy if exists "pdj externals update (page:pdj)" on public.pdj_externals;
create policy "pdj externals update (page:pdj)" on public.pdj_externals
  for update to authenticated
  using ((((select private.get_page_level('pdj')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('pdj'))) >= 2) AND (service_date >= (CURRENT_DATE - 3)))))
  with check ((((select private.get_page_level('pdj')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('pdj'))) >= 2) AND (service_date >= (CURRENT_DATE - 3)))));

-- pms_daily_metrics / DELETE
drop policy if exists "pms delete (page:repjour)" on public.pms_daily_metrics;
create policy "pms delete (page:repjour)" on public.pms_daily_metrics
  for delete to authenticated
  using (((select private.page_level_rank(private.get_page_level('repjour'))) >= 2));

-- pms_daily_metrics / INSERT
drop policy if exists "pms write (page:repjour)" on public.pms_daily_metrics;
create policy "pms write (page:repjour)" on public.pms_daily_metrics
  for insert to authenticated
  with check (((select private.page_level_rank(private.get_page_level('repjour'))) >= 2));

-- pms_daily_metrics / UPDATE
drop policy if exists "pms update (page:repjour)" on public.pms_daily_metrics;
create policy "pms update (page:repjour)" on public.pms_daily_metrics
  for update to authenticated
  using (((select private.page_level_rank(private.get_page_level('repjour'))) >= 2))
  with check (((select private.page_level_rank(private.get_page_level('repjour'))) >= 2));

-- profiles / ALL
drop policy if exists "Admin manages profiles" on public.profiles;
create policy "Admin manages profiles" on public.profiles
  for all to public
  using (((select private.get_user_role()) = 'admin'));

-- profiles / INSERT
drop policy if exists "profiles insert (bornee)" on public.profiles;
create policy "profiles insert (bornee)" on public.profiles
  for insert to authenticated
  with check (((select private.is_admin()) OR ((id = auth.uid()) AND (role = 'utilisateur'::text))));

-- rapro_rooms / DELETE
drop policy if exists "rapro_rooms delete (page:rapro)" on public.rapro_rooms;
create policy "rapro_rooms delete (page:rapro)" on public.rapro_rooms
  for delete to authenticated
  using ((((select private.get_page_level('rapro')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('rapro'))) >= 2) AND (report_date >= (CURRENT_DATE - 2)))));

-- rapro_rooms / INSERT
drop policy if exists "rapro_rooms write (page:rapro)" on public.rapro_rooms;
create policy "rapro_rooms write (page:rapro)" on public.rapro_rooms
  for insert to authenticated
  with check ((((select private.get_page_level('rapro')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('rapro'))) >= 2) AND (report_date >= (CURRENT_DATE - 2)))));

-- rapro_rooms / UPDATE
drop policy if exists "rapro_rooms update (page:rapro)" on public.rapro_rooms;
create policy "rapro_rooms update (page:rapro)" on public.rapro_rooms
  for update to authenticated
  using ((((select private.get_page_level('rapro')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('rapro'))) >= 2) AND (report_date >= (CURRENT_DATE - 2)))))
  with check ((((select private.get_page_level('rapro')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('rapro'))) >= 2) AND (report_date >= (CURRENT_DATE - 2)))));

-- rapro_sheets / DELETE
drop policy if exists "rapro_sheets delete (page:rapro)" on public.rapro_sheets;
create policy "rapro_sheets delete (page:rapro)" on public.rapro_sheets
  for delete to authenticated
  using ((((select private.get_page_level('rapro')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('rapro'))) >= 2) AND (report_date >= (CURRENT_DATE - 2)))));

-- rapro_sheets / INSERT
drop policy if exists "rapro_sheets write (page:rapro)" on public.rapro_sheets;
create policy "rapro_sheets write (page:rapro)" on public.rapro_sheets
  for insert to authenticated
  with check ((((select private.get_page_level('rapro')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('rapro'))) >= 2) AND (report_date >= (CURRENT_DATE - 2)))));

-- rapro_sheets / UPDATE
drop policy if exists "rapro_sheets update (page:rapro)" on public.rapro_sheets;
create policy "rapro_sheets update (page:rapro)" on public.rapro_sheets
  for update to authenticated
  using ((((select private.get_page_level('rapro')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('rapro'))) >= 2) AND (report_date >= (CURRENT_DATE - 2)))))
  with check ((((select private.get_page_level('rapro')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('rapro'))) >= 2) AND (report_date >= (CURRENT_DATE - 2)))));

-- =============================================================================
-- VÉRIFICATION (lecture seule)
--   (a) 52 policies d'écriture enveloppées (même total qu'avant) ;
--   (b) 0 policy d'écriture avec appel encore nu (hors repjour_manual_forecast_allowed).
-- =============================================================================
select 'a_enveloppees' as controle, count(*)::text as valeur
from pg_policies
where schemaname = 'public' and cmd in ('INSERT','UPDATE','DELETE','ALL')
  and (coalesce(qual,'') || coalesce(with_check,'')) like '%( SELECT %'
  and tablename not in ('email_recipients','server_report_recipients')
union all
select 'b_appels_nus', count(*)::text
from pg_policies
where schemaname = 'public' and cmd in ('INSERT','UPDATE','DELETE','ALL')
  and regexp_replace(coalesce(qual,'') || coalesce(with_check,''),
                     '\( SELECT (page_level_rank\()?(get_page_level|is_admin|get_user_role)\(', '', 'g')
      ~ '(^|[^.])(get_page_level|is_admin|get_user_role)\(';
