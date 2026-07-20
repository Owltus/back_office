-- =============================================================================
-- page_permissions_rls_lectures — fermeture des LECTURES par page
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
-- ⚠ DDL DE POLICIES : ne supprime AUCUNE donnée. Remplace 16 policies de SELECT.
--
-- POURQUOI
--   Pentest 2026-07-20 : un compte connecté sans permission sur une page lisait
--   quand même les tables de cette page. Ce n'était pas un bug mais un choix
--   assumé (page_permissions_rls.sql:6-8 : « la lecture reste ouverte, la RLS
--   garantit l'ÉCRITURE ») — la visibilité fine étant confiée à la navbar et à
--   PageGuard. Le pentest montre la limite du raisonnement : PageGuard protège
--   l'ÉCRAN, pas la DONNÉE. Un porteur de JWT n'est pas obligé de passer par
--   l'écran, et les caches localStorage (bo.auth.profile.v1, bo.auth.perms.v1)
--   sont éditables.
--   Décision utilisateur du 2026-07-20 : fermeture complète par page.
--
-- LES NOMS DE POLICIES CI-DESSOUS SONT RÉELS, PAS DEVINÉS
--   Relevés dans pg_policies le 2026-07-20 (voir doc/rapport securité/
--   etat-policies-prod.md). C'est essentiel : les policies sont OR-ed, donc un
--   `drop policy if exists "<nom deviné>"` laisserait silencieusement en place
--   la vraie policy permissive — la table paraîtrait durcie sans l'être.
--
-- CE QUI N'EST PAS TOUCHÉ, ET POURQUOI
--   - Les policies FOR ALL `Admin manages budget` et `Admin manages profiles` :
--     elles couvrent le SELECT admin MAIS AUSSI les écritures. Les supprimer
--     ferait sauter la garde d'écriture en même temps que la lecture.
--   - `hotel_config` : nom de l'hôtel, code, nombre de chambres. Aucune donnée
--     sensible, et ces valeurs sont de toute façon en dur dans
--     lib/repjour/constants.ts. La fermer ne protégerait rien.
--   - `audit_log`, `email_recipients`, `profiles`, `user_page_permissions` :
--     déjà correctement fermées.
--   - Toutes les policies d'écriture : déjà durcies par page, vérifié.
--
-- SAUVEGARDE AVANT EXÉCUTION (lecture seule) :
--   select tablename, policyname, cmd, qual, with_check
--   from pg_policies where schemaname = 'public' and cmd = 'SELECT'
--   order by tablename;
--
-- PRÉREQUIS : page_permissions.sql exécuté (is_admin / page_level_rank /
-- get_page_level existent et sont grantées à authenticated). Vérifié en prod.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Page REPJOUR
-- -----------------------------------------------------------------------------

-- daily_reports est le SEUL cas transverse : /rapro le lit aussi, via
-- fetchOfficialOcc (src/lib/rapro/service.ts:188-198, appelé par
-- RaproBoard.tsx:167) pour la ligne de contrôle OCC du rapprochement. Fermer sur
-- `repjour` seul casserait /rapro pour tout compte sans repjour. D'où le OR.
drop policy if exists "All read reports" on public.daily_reports;
create policy "daily_reports read (page:repjour ou rapro)"
  on public.daily_reports for select to authenticated
  using (
    (select public.page_level_rank(public.get_page_level('repjour'))) >= 1
    or (select public.page_level_rank(public.get_page_level('rapro'))) >= 1
  );

-- Les appels sont enveloppés dans un (select ...) pour être évalués UNE FOIS par
-- requête (InitPlan) au lieu d'une fois par ligne. Sur daily_reports, lue par
-- lots d'années (import/orchestrator.ts:77-78), la différence est réelle.
drop policy if exists "All read forecast" on public.forecast_days;
create policy "forecast_days read (page:repjour)"
  on public.forecast_days for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('repjour'))) >= 1);

-- Attention : NE PAS toucher à « Admin manages budget » (FOR ALL) qui porte
-- aussi les écritures admin. On ne retire que la SELECT permissive.
drop policy if exists "All read budget" on public.budget;
create policy "budget read (page:repjour)"
  on public.budget for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('repjour'))) >= 1);

drop policy if exists "pms_daily_metrics read (authenticated)" on public.pms_daily_metrics;
create policy "pms_daily_metrics read (page:repjour)"
  on public.pms_daily_metrics for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('repjour'))) >= 1);

-- -----------------------------------------------------------------------------
-- Page CAISSE
-- -----------------------------------------------------------------------------

drop policy if exists "caisse read (authenticated)" on public.caisse_sheets;
create policy "caisse read (page:caisse)"
  on public.caisse_sheets for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('caisse'))) >= 1);

-- -----------------------------------------------------------------------------
-- Page RAPRO
-- -----------------------------------------------------------------------------

drop policy if exists "rapro read (authenticated)" on public.rapro_rooms;
create policy "rapro_rooms read (page:rapro)"
  on public.rapro_rooms for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('rapro'))) >= 1);

drop policy if exists "rapro_sheets read (authenticated)" on public.rapro_sheets;
create policy "rapro_sheets read (page:rapro)"
  on public.rapro_sheets for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('rapro'))) >= 1);

-- -----------------------------------------------------------------------------
-- Page PDJ — contient des données nominatives (guest_name, purgé à J-2)
-- -----------------------------------------------------------------------------

drop policy if exists "pdj read (authenticated)" on public.pdj_breakfasts;
create policy "pdj read (page:pdj)"
  on public.pdj_breakfasts for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('pdj'))) >= 1);

-- -----------------------------------------------------------------------------
-- Page PARKING — contient `client` (PII, conservée par décision du 2026-07-13)
-- -----------------------------------------------------------------------------

drop policy if exists "parking read (authenticated)" on public.parking_reservations;
create policy "parking read (page:parking)"
  on public.parking_reservations for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('parking'))) >= 1);

-- -----------------------------------------------------------------------------
-- Page AFFICHAGE
-- -----------------------------------------------------------------------------

drop policy if exists "affiche read (authenticated)" on public.affiche_templates;
create policy "affiche read (page:affichage)"
  on public.affiche_templates for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('affichage'))) >= 1);

-- -----------------------------------------------------------------------------
-- Page FACTURATION — 6 tables. facturation_learned_docs mérite l'attention :
-- elle stocke un sac de mots par facture (point de confidentialité assumé et
-- documenté dans l'en-tête de facturation_learned_docs.sql).
-- -----------------------------------------------------------------------------

drop policy if exists "budget_lines read (authenticated)" on public.facturation_budget_lines;
create policy "budget_lines read (page:facturation)"
  on public.facturation_budget_lines for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('facturation'))) >= 1);

drop policy if exists "issuer_codes read (authenticated)" on public.facturation_issuer_codes;
create policy "issuer_codes read (page:facturation)"
  on public.facturation_issuer_codes for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('facturation'))) >= 1);

drop policy if exists "issuer_denylist read (authenticated)" on public.facturation_issuer_denylist;
create policy "issuer_denylist read (page:facturation)"
  on public.facturation_issuer_denylist for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('facturation'))) >= 1);

drop policy if exists "issuers read (authenticated)" on public.facturation_issuers;
create policy "issuers read (page:facturation)"
  on public.facturation_issuers for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('facturation'))) >= 1);

drop policy if exists "learned_docs read (authenticated)" on public.facturation_learned_docs;
create policy "learned_docs read (page:facturation)"
  on public.facturation_learned_docs for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('facturation'))) >= 1);

drop policy if exists "wordpool read (authenticated)" on public.facturation_wordpool;
create policy "wordpool read (page:facturation)"
  on public.facturation_wordpool for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('facturation'))) >= 1);

-- =============================================================================
-- VÉRIFICATIONS APRÈS EXÉCUTION (lecture seule)
--
-- 1) Plus aucune policy de SELECT permissive ne subsiste. Attendu : seulement
--    hotel_config (laissée ouverte volontairement).
--      select tablename, policyname, qual
--      from pg_policies
--      where schemaname = 'public' and cmd = 'SELECT'
--        and (qual = 'true' or qual ilike '%auth.uid() IS NOT NULL%')
--      order by tablename;
--
-- 2) Les policies d'ÉCRITURE n'ont pas été emportées. Attendu : inchangé
--    par rapport à la sauvegarde (INSERT/UPDATE/DELETE par page).
--      select tablename, cmd, count(*)
--      from pg_policies
--      where schemaname = 'public' and cmd <> 'SELECT'
--      group by tablename, cmd order by tablename, cmd;
--
-- 3) Les deux policies FOR ALL sont toujours là. Attendu : 2 lignes.
--      select tablename, policyname from pg_policies
--      where schemaname = 'public' and cmd = 'ALL';
--
-- 4) TESTS FONCTIONNELS — les seuls qui prouvent qu'on n'a rien cassé :
--    - un compte AVEC repjour ouvre /repjour normalement (graphiques, budget) ;
--    - un compte AVEC rapro mais SANS repjour ouvre /rapro et voit toujours la
--      ligne de contrôle OCC (c'est le seul effet de bord identifié) ;
--    - un compte SANS caisse obtient 0 ligne sur caisse_sheets via l'API ;
--    - un admin lit tout (is_admin() → get_page_level() = 'gestion' partout) ;
--    - l'import RepJour fonctionne toujours (il LIT daily_reports et budget).
--
-- 5) PERFORMANCE — vérifier que la fonction est évaluée une fois et non par
--    ligne, sur la requête la plus lourde du projet :
--      explain analyze select * from public.daily_reports
--        where year = 2026 order by report_date;
--    Attendu : un InitPlan sur get_page_level, pas un appel par ligne.
-- =============================================================================
