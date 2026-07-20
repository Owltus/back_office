-- =============================================================================
-- page_permissions_rls — durcissement RLS : écriture bornée PAR PAGE + NIVEAU
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor, APRÈS page_permissions.sql.
-- Ré-exécutable. Ne touche QUE les policies d'écriture (aucune table, aucun
-- trigger, aucune donnée, aucun seed). La lecture (SELECT using(true)) est
-- laissée inchangée : la visibilité fine d'une page est assurée côté app
-- (navbar + PageGuard), la RLS garantit l'ÉCRITURE.
--
-- CORRESPONDANCE (fidèle à l'existant) :
--   - INSERT / UPDATE / DELETE : au moins 'ecriture' (rank >= 2) — remplace
--     l'ancien get_user_role() in ('super_utilisateur','admin').
--   - Exception CAISSE : DELETE et déverrouillage hors grâce réservés à 'gestion'
--     (rank = 3) — remplace l'ancien "admin seulement".
--   - Le cran 'gestion' des autres pages (supprimer le jour, gérer les
--     destinataires, réouverture rapro) reste un raffinement UI (Étape 6) : au
--     niveau SQL un DELETE d'import et un DELETE « de gestion » sont
--     indistinguables, donc on ne le borne pas en RLS pour ne pas casser les
--     réimports. À arbitrer (voir « points à trancher »).
--
-- PRÉREQUIS : les non-admins doivent avoir reçu leurs permissions AVANT
-- d'exécuter ce script (sinon écriture coupée jusqu'au pré-remplissage).
-- =============================================================================

-- ---- PARKING (page 'parking') -----------------------------------------------
drop policy if exists "parking insert (super/admin)" on public.parking_reservations;
drop policy if exists "parking update (super/admin)" on public.parking_reservations;
drop policy if exists "parking delete (super/admin)" on public.parking_reservations;
drop policy if exists "parking write (page:parking)" on public.parking_reservations;
drop policy if exists "parking update (page:parking)" on public.parking_reservations;
drop policy if exists "parking delete (page:parking)" on public.parking_reservations;

create policy "parking write (page:parking)"
  on public.parking_reservations for insert to authenticated
  with check (public.page_level_rank(public.get_page_level('parking')) >= 2);
create policy "parking update (page:parking)"
  on public.parking_reservations for update to authenticated
  using (public.page_level_rank(public.get_page_level('parking')) >= 2)
  with check (public.page_level_rank(public.get_page_level('parking')) >= 2);
create policy "parking delete (page:parking)"
  on public.parking_reservations for delete to authenticated
  using (public.page_level_rank(public.get_page_level('parking')) >= 2);

-- ---- PDJ (page 'pdj') -------------------------------------------------------
drop policy if exists "pdj insert (super/admin)" on public.pdj_breakfasts;
drop policy if exists "pdj update (super/admin)" on public.pdj_breakfasts;
drop policy if exists "pdj delete (super/admin)" on public.pdj_breakfasts;
drop policy if exists "pdj write (page:pdj)" on public.pdj_breakfasts;
drop policy if exists "pdj update (page:pdj)" on public.pdj_breakfasts;
drop policy if exists "pdj delete (page:pdj)" on public.pdj_breakfasts;

create policy "pdj write (page:pdj)"
  on public.pdj_breakfasts for insert to authenticated
  with check (public.page_level_rank(public.get_page_level('pdj')) >= 2);
create policy "pdj update (page:pdj)"
  on public.pdj_breakfasts for update to authenticated
  using (public.page_level_rank(public.get_page_level('pdj')) >= 2)
  with check (public.page_level_rank(public.get_page_level('pdj')) >= 2);
create policy "pdj delete (page:pdj)"
  on public.pdj_breakfasts for delete to authenticated
  using (public.page_level_rank(public.get_page_level('pdj')) >= 2);

-- ---- RAPRO — feuilles jour (page 'rapro') -----------------------------------
drop policy if exists "rapro_sheets insert (super/admin)" on public.rapro_sheets;
drop policy if exists "rapro_sheets update (super/admin)" on public.rapro_sheets;
drop policy if exists "rapro_sheets delete (super/admin)" on public.rapro_sheets;
drop policy if exists "rapro_sheets write (page:rapro)" on public.rapro_sheets;
drop policy if exists "rapro_sheets update (page:rapro)" on public.rapro_sheets;
drop policy if exists "rapro_sheets delete (page:rapro)" on public.rapro_sheets;

create policy "rapro_sheets write (page:rapro)"
  on public.rapro_sheets for insert to authenticated
  with check (public.page_level_rank(public.get_page_level('rapro')) >= 2);
create policy "rapro_sheets update (page:rapro)"
  on public.rapro_sheets for update to authenticated
  using (public.page_level_rank(public.get_page_level('rapro')) >= 2)
  with check (public.page_level_rank(public.get_page_level('rapro')) >= 2);
create policy "rapro_sheets delete (page:rapro)"
  on public.rapro_sheets for delete to authenticated
  using (public.page_level_rank(public.get_page_level('rapro')) >= 2);

-- ---- RAPRO — chambres (page 'rapro') ----------------------------------------
drop policy if exists "rapro insert (super/admin)" on public.rapro_rooms;
drop policy if exists "rapro update (super/admin)" on public.rapro_rooms;
drop policy if exists "rapro delete (super/admin)" on public.rapro_rooms;
drop policy if exists "rapro_rooms write (page:rapro)" on public.rapro_rooms;
drop policy if exists "rapro_rooms update (page:rapro)" on public.rapro_rooms;
drop policy if exists "rapro_rooms delete (page:rapro)" on public.rapro_rooms;

create policy "rapro_rooms write (page:rapro)"
  on public.rapro_rooms for insert to authenticated
  with check (public.page_level_rank(public.get_page_level('rapro')) >= 2);
create policy "rapro_rooms update (page:rapro)"
  on public.rapro_rooms for update to authenticated
  using (public.page_level_rank(public.get_page_level('rapro')) >= 2)
  with check (public.page_level_rank(public.get_page_level('rapro')) >= 2);
create policy "rapro_rooms delete (page:rapro)"
  on public.rapro_rooms for delete to authenticated
  using (public.page_level_rank(public.get_page_level('rapro')) >= 2);

-- ---- PMS daily metrics — import Comparison (page 'repjour') ------------------
-- NOTE : rattachement 'repjour' à confirmer (l'import Comparison se fait dans RepJour).
drop policy if exists "pms_daily_metrics insert (super/admin)" on public.pms_daily_metrics;
drop policy if exists "pms_daily_metrics update (super/admin)" on public.pms_daily_metrics;
drop policy if exists "pms_daily_metrics delete (super/admin)" on public.pms_daily_metrics;
drop policy if exists "pms write (page:repjour)" on public.pms_daily_metrics;
drop policy if exists "pms update (page:repjour)" on public.pms_daily_metrics;
drop policy if exists "pms delete (page:repjour)" on public.pms_daily_metrics;

create policy "pms write (page:repjour)"
  on public.pms_daily_metrics for insert to authenticated
  with check (public.page_level_rank(public.get_page_level('repjour')) >= 2);
create policy "pms update (page:repjour)"
  on public.pms_daily_metrics for update to authenticated
  using (public.page_level_rank(public.get_page_level('repjour')) >= 2)
  with check (public.page_level_rank(public.get_page_level('repjour')) >= 2);
create policy "pms delete (page:repjour)"
  on public.pms_daily_metrics for delete to authenticated
  using (public.page_level_rank(public.get_page_level('repjour')) >= 2);

-- ---- AFFICHAGE (page 'affichage') -------------------------------------------
drop policy if exists "affiche insert (super/admin)" on public.affiche_templates;
drop policy if exists "affiche update (super/admin)" on public.affiche_templates;
drop policy if exists "affiche delete (super/admin)" on public.affiche_templates;
drop policy if exists "affiche write (page:affichage)" on public.affiche_templates;
drop policy if exists "affiche update (page:affichage)" on public.affiche_templates;
drop policy if exists "affiche delete (page:affichage)" on public.affiche_templates;

create policy "affiche write (page:affichage)"
  on public.affiche_templates for insert to authenticated
  with check (public.page_level_rank(public.get_page_level('affichage')) >= 2);
create policy "affiche update (page:affichage)"
  on public.affiche_templates for update to authenticated
  using (public.page_level_rank(public.get_page_level('affichage')) >= 2)
  with check (public.page_level_rank(public.get_page_level('affichage')) >= 2);
create policy "affiche delete (page:affichage)"
  on public.affiche_templates for delete to authenticated
  using (public.page_level_rank(public.get_page_level('affichage')) >= 2);

-- ---- CAISSE (page 'caisse') — verrou 24 h conservé --------------------------
-- INSERT : >= ecriture. UPDATE : >= ecriture ET (gestion OU pas validé OU grâce).
-- DELETE : gestion (pièce comptable). 'gestion' remplace l'ancien 'admin'.
-- Le trigger caisse_stamp (validated_at/by serveur) reste en place, inchangé.
drop policy if exists "caisse insert (super/admin)" on public.caisse_sheets;
drop policy if exists "caisse update (role + verrou)" on public.caisse_sheets;
drop policy if exists "caisse delete (admin)" on public.caisse_sheets;
drop policy if exists "caisse write (page:caisse)" on public.caisse_sheets;
drop policy if exists "caisse update (page:caisse + verrou)" on public.caisse_sheets;
drop policy if exists "caisse delete (page:caisse gestion)" on public.caisse_sheets;

create policy "caisse write (page:caisse)"
  on public.caisse_sheets for insert to authenticated
  with check (public.page_level_rank(public.get_page_level('caisse')) >= 2);

create policy "caisse update (page:caisse + verrou)"
  on public.caisse_sheets for update to authenticated
  using (
    public.page_level_rank(public.get_page_level('caisse')) >= 2
    and (
      public.get_page_level('caisse') = 'gestion'   -- gestion = déverrouille hors grâce (ex-admin)
      or validated_at is null
      or now() < validated_at + interval '24 hours'
    )
  )
  with check (
    public.page_level_rank(public.get_page_level('caisse')) >= 2
    and (
      public.get_page_level('caisse') = 'gestion'
      or validated_at is null
      or now() < validated_at + interval '24 hours'
    )
  );

create policy "caisse delete (page:caisse gestion)"
  on public.caisse_sheets for delete to authenticated
  using (public.get_page_level('caisse') = 'gestion');

-- =============================================================================
-- COMPLÉMENTS (dans d'autres fichiers, à exécuter à la bascule) :
--   - facturation_*  : les écritures passent par des RPC SECURITY DEFINER. Leur
--     garde a été durcie EN PLACE (get_user_role() → page_level_rank(
--     get_page_level('facturation')) < 2) dans facturation_{wordpool,issuers,
--     issuer_codes,issuer_denylist,learned_docs,corrections,budget_lines_rpc}.sql.
--     → Ré-exécuter ces 7 fichiers (idempotents).
--   - daily_reports / forecast_days : durcies dans page_permissions_rls_repjour.sql
--     (budget reste réservé au grade admin — policy « Admin manages budget »,
--     inchangée).
-- =============================================================================
