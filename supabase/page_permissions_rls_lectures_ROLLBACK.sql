-- =============================================================================
-- ROLLBACK de page_permissions_rls_lectures.sql
--
-- Remet les policies de LECTURE exactement dans l'état où elles étaient AVANT
-- le durcissement, c'est-à-dire lecture ouverte à tout compte connecté.
--
-- N'exécuter QUE si le durcissement casse quelque chose en production. Ce
-- script ROUVRE la lecture : après l'avoir joué, le finding 1 du pentest
-- redevient entièrement ouvert.
--
-- PROVENANCE : ces commandes ne sont pas reconstituées de mémoire. Elles ont été
-- GÉNÉRÉES depuis pg_policies le 2026-07-20, avant toute modification, par :
--
--   select 'create policy "' || policyname || '" on public.' || tablename
--          || ' for select to ' || array_to_string(roles, ', ')
--          || ' using (' || qual || ');'
--   from pg_policies where schemaname = 'public' and cmd = 'SELECT'
--   order by tablename;
--
-- Les rôles d'origine sont conservés tels quels — plusieurs policies étaient
-- `to public` et non `to authenticated`. Ce n'était pas une faille (la clause
-- `auth.uid() IS NOT NULL` écarte les anonymes), mais c'est moins explicite ;
-- le script de durcissement, lui, pose `to authenticated` partout.
--
-- Ne touche ni aux données, ni aux policies d'écriture, ni aux policies FOR ALL.
-- =============================================================================

-- 1. Retirer les policies posées par le durcissement.
drop policy if exists "daily_reports read (page:repjour ou rapro)" on public.daily_reports;
drop policy if exists "forecast_days read (page:repjour)" on public.forecast_days;
drop policy if exists "budget read (page:repjour)" on public.budget;
drop policy if exists "pms_daily_metrics read (page:repjour)" on public.pms_daily_metrics;
drop policy if exists "caisse read (page:caisse)" on public.caisse_sheets;
drop policy if exists "rapro_rooms read (page:rapro)" on public.rapro_rooms;
drop policy if exists "rapro_sheets read (page:rapro)" on public.rapro_sheets;
drop policy if exists "pdj read (page:pdj)" on public.pdj_breakfasts;
drop policy if exists "parking read (page:parking)" on public.parking_reservations;
drop policy if exists "affiche read (page:affichage)" on public.affiche_templates;
drop policy if exists "budget_lines read (page:facturation)" on public.facturation_budget_lines;
drop policy if exists "issuer_codes read (page:facturation)" on public.facturation_issuer_codes;
drop policy if exists "issuer_denylist read (page:facturation)" on public.facturation_issuer_denylist;
drop policy if exists "issuers read (page:facturation)" on public.facturation_issuers;
drop policy if exists "learned_docs read (page:facturation)" on public.facturation_learned_docs;
drop policy if exists "wordpool read (page:facturation)" on public.facturation_wordpool;

-- 2. Restaurer les policies d'origine, à l'identique.
create policy "All read reports" on public.daily_reports for select to public using ((auth.uid() IS NOT NULL));
create policy "All read forecast" on public.forecast_days for select to public using ((auth.uid() IS NOT NULL));
create policy "All read budget" on public.budget for select to public using ((auth.uid() IS NOT NULL));
create policy "pms_daily_metrics read (authenticated)" on public.pms_daily_metrics for select to authenticated using (true);
create policy "caisse read (authenticated)" on public.caisse_sheets for select to authenticated using (true);
create policy "rapro read (authenticated)" on public.rapro_rooms for select to authenticated using (true);
create policy "rapro_sheets read (authenticated)" on public.rapro_sheets for select to authenticated using (true);
create policy "pdj read (authenticated)" on public.pdj_breakfasts for select to authenticated using (true);
create policy "parking read (authenticated)" on public.parking_reservations for select to authenticated using (true);
create policy "affiche read (authenticated)" on public.affiche_templates for select to authenticated using (true);
create policy "budget_lines read (authenticated)" on public.facturation_budget_lines for select to authenticated using (true);
create policy "issuer_codes read (authenticated)" on public.facturation_issuer_codes for select to authenticated using (true);
create policy "issuer_denylist read (authenticated)" on public.facturation_issuer_denylist for select to authenticated using (true);
create policy "issuers read (authenticated)" on public.facturation_issuers for select to authenticated using (true);
create policy "learned_docs read (authenticated)" on public.facturation_learned_docs for select to authenticated using (true);
create policy "wordpool read (authenticated)" on public.facturation_wordpool for select to authenticated using (true);

-- =============================================================================
-- NON CONCERNÉES par le durcissement, donc absentes de ce rollback — elles
-- n'ont jamais été touchées et doivent rester en l'état :
--
--   audit_log             [SELECT] Admin reads audit log      (admin seul)
--   email_recipients      [SELECT] email_recipients read       (durci le 20/07)
--   hotel_config          [SELECT] All read config             (laissée ouverte)
--   profiles              [SELECT] Users read own profile / Admin reads all
--   user_page_permissions [SELECT] upp select self or admin
--   budget / profiles     [ALL]    Admin manages ...           (portent aussi
--                                                               les écritures)
-- =============================================================================
