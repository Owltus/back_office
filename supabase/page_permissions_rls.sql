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
-- Écriture bornée par NIVEAU **et** par FENÊTRE TEMPORELLE (miroir EXACT de
-- lib/parking/editability.ts, PARKING_GRACE_DAYS = 7) :
--   - gestion  : peut tout modifier/créer, y compris le passé verrouillé ;
--   - ecriture : n'agit que sur l'actualité, sans réécrire le passé figé :
--       INSERT  arrivée (start_date) >= J-7 (pas de back-dating) ;
--       UPDATE  fin (start_date + nights) >= J-7 avant ET après, ET le début ne
--               recule pas dans le passé verrouillé (trigger, cf. plus bas) ;
--       DELETE  seulement une résa d'actualité (fin >= J-7).
-- Le recul du début exige de comparer OLD/NEW → hors de portée d'une policy
-- (WITH CHECK ne voit que NEW), d'où le trigger parking_no_past_rewrite.
drop policy if exists "parking insert (super/admin)" on public.parking_reservations;
drop policy if exists "parking update (super/admin)" on public.parking_reservations;
drop policy if exists "parking delete (super/admin)" on public.parking_reservations;
drop policy if exists "parking write (page:parking)" on public.parking_reservations;
drop policy if exists "parking update (page:parking)" on public.parking_reservations;
drop policy if exists "parking delete (page:parking)" on public.parking_reservations;

create policy "parking write (page:parking)"
  on public.parking_reservations for insert to authenticated
  with check (
    public.get_page_level('parking') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('parking')) >= 2
      and start_date >= (current_date - 7)
    )
  );
create policy "parking update (page:parking)"
  on public.parking_reservations for update to authenticated
  using (
    public.get_page_level('parking') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('parking')) >= 2
      and (start_date + nights) >= (current_date - 7)
    )
  )
  with check (
    public.get_page_level('parking') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('parking')) >= 2
      and (start_date + nights) >= (current_date - 7)
    )
  );
create policy "parking delete (page:parking)"
  on public.parking_reservations for delete to authenticated
  using (
    public.get_page_level('parking') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('parking')) >= 2
      and (start_date + nights) >= (current_date - 7)
    )
  );

-- Trigger anti-recul du début (OLD vs NEW) : un éditeur écriture ne peut pas
-- faire reculer start_date plus loin dans le passé verrouillé. gestion et
-- contextes non-utilisateur (service_role / SQL editor) non bridés.
create or replace function public.parking_no_past_rewrite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if public.get_page_level('parking') = 'gestion' then
    return new;
  end if;
  if new.start_date < old.start_date and new.start_date < (current_date - 7) then
    raise exception 'parking: recul du debut dans le passe verrouille (reserve a la gestion)';
  end if;
  return new;
end;
$$;

drop trigger if exists parking_no_past_rewrite on public.parking_reservations;
create trigger parking_no_past_rewrite
  before update on public.parking_reservations
  for each row execute function public.parking_no_past_rewrite();

-- ---- PDJ (page 'pdj') — fenêtre J-3 (comme rapro/caisse) --------------------
-- Écriture bornée par NIVEAU **et** par FENÊTRE J-3 (miroir de
-- lib/pdj/editability.ts, PDJ_GRACE_DAYS = 3) : un écriture ne coche/sert que les
-- jours service_date >= aujourd'hui - 3 ; au-delà, bloqué. La gestion agit sur
-- tout jour. Pivot = service_date.
drop policy if exists "pdj insert (super/admin)" on public.pdj_breakfasts;
drop policy if exists "pdj update (super/admin)" on public.pdj_breakfasts;
drop policy if exists "pdj delete (super/admin)" on public.pdj_breakfasts;
drop policy if exists "pdj write (page:pdj)" on public.pdj_breakfasts;
drop policy if exists "pdj update (page:pdj)" on public.pdj_breakfasts;
drop policy if exists "pdj delete (page:pdj)" on public.pdj_breakfasts;

create policy "pdj write (page:pdj)"
  on public.pdj_breakfasts for insert to authenticated
  with check (
    public.get_page_level('pdj') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('pdj')) >= 2
      and service_date >= (current_date - 3)
    )
  );
create policy "pdj update (page:pdj)"
  on public.pdj_breakfasts for update to authenticated
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
-- DELETE = gestion (suppression d'un jour entier, réservée à l'admin côté UI).
create policy "pdj delete (page:pdj)"
  on public.pdj_breakfasts for delete to authenticated
  using (public.get_page_level('pdj') = 'gestion');

-- ---- RAPRO — feuilles jour (page 'rapro') -----------------------------------
-- Écriture bornée par NIVEAU **et** par FENÊTRE J-2 (miroir de
-- lib/rapro/editability.ts, RAPRO_GRACE_DAYS = 2) : un compte `ecriture` n'agit
-- (clôture, réouverture, commentaire) que sur les jours report_date >= J-2 ;
-- au-delà dans le passé, rien, même non clôturé. La `gestion` agit sur tout jour.
-- Le pivot est report_date (le jour rapproché) sur les DEUX tables.
drop policy if exists "rapro_sheets insert (super/admin)" on public.rapro_sheets;
drop policy if exists "rapro_sheets update (super/admin)" on public.rapro_sheets;
drop policy if exists "rapro_sheets delete (super/admin)" on public.rapro_sheets;
drop policy if exists "rapro_sheets write (page:rapro)" on public.rapro_sheets;
drop policy if exists "rapro_sheets update (page:rapro)" on public.rapro_sheets;
drop policy if exists "rapro_sheets delete (page:rapro)" on public.rapro_sheets;

create policy "rapro_sheets write (page:rapro)"
  on public.rapro_sheets for insert to authenticated
  with check (
    public.get_page_level('rapro') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('rapro')) >= 2
      and report_date >= (current_date - 2)
    )
  );
create policy "rapro_sheets update (page:rapro)"
  on public.rapro_sheets for update to authenticated
  using (
    public.get_page_level('rapro') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('rapro')) >= 2
      and report_date >= (current_date - 2)
    )
  )
  with check (
    public.get_page_level('rapro') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('rapro')) >= 2
      and report_date >= (current_date - 2)
    )
  );
create policy "rapro_sheets delete (page:rapro)"
  on public.rapro_sheets for delete to authenticated
  using (
    public.get_page_level('rapro') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('rapro')) >= 2
      and report_date >= (current_date - 2)
    )
  );

-- ---- RAPRO — chambres (page 'rapro') ----------------------------------------
drop policy if exists "rapro insert (super/admin)" on public.rapro_rooms;
drop policy if exists "rapro update (super/admin)" on public.rapro_rooms;
drop policy if exists "rapro delete (super/admin)" on public.rapro_rooms;
drop policy if exists "rapro_rooms write (page:rapro)" on public.rapro_rooms;
drop policy if exists "rapro_rooms update (page:rapro)" on public.rapro_rooms;
drop policy if exists "rapro_rooms delete (page:rapro)" on public.rapro_rooms;

create policy "rapro_rooms write (page:rapro)"
  on public.rapro_rooms for insert to authenticated
  with check (
    public.get_page_level('rapro') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('rapro')) >= 2
      and report_date >= (current_date - 2)
    )
  );
create policy "rapro_rooms update (page:rapro)"
  on public.rapro_rooms for update to authenticated
  using (
    public.get_page_level('rapro') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('rapro')) >= 2
      and report_date >= (current_date - 2)
    )
  )
  with check (
    public.get_page_level('rapro') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('rapro')) >= 2
      and report_date >= (current_date - 2)
    )
  );
create policy "rapro_rooms delete (page:rapro)"
  on public.rapro_rooms for delete to authenticated
  using (
    public.get_page_level('rapro') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('rapro')) >= 2
      and report_date >= (current_date - 2)
    )
  );

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

-- ---- AFFICHAGE (page 'affichage') — modèle PAR PROPRIÉTAIRE ------------------
-- INSERT : ecriture (created_by posé serveur par le trigger affiche_stamp).
-- UPDATE/DELETE : gestion (tout) OU ecriture sur SON propre modèle
-- (created_by = auth.uid()). L'auteur d'origine est figé (trigger). Détail +
-- migration created_by dans supabase/affiche_owner_model.sql (source de vérité).
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
  using (
    public.get_page_level('affichage') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('affichage')) >= 2
      and created_by = auth.uid()
    )
  )
  with check (
    public.get_page_level('affichage') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('affichage')) >= 2
      and created_by = auth.uid()
    )
  );
create policy "affiche delete (page:affichage)"
  on public.affiche_templates for delete to authenticated
  using (
    public.get_page_level('affichage') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('affichage')) >= 2
      and created_by = auth.uid()
    )
  );

-- ---- CAISSE (page 'caisse') — fenêtre J-1 (plus courte que rapro) -----------
-- Écriture bornée par NIVEAU **et** par FENÊTRE J-1 (miroir de
-- lib/caisse/editability.ts, CAISSE_GRACE_DAYS = 1). Remplace l'ancien verrou
-- « 24 h après validation » : ce qui compte désormais est le JOUR de la feuille.
--   - gestion  : agit sur n'importe quel jour (édition, clôture, réouverture) ;
--   - ecriture : uniquement les feuilles report_date >= aujourd'hui - 1 (aujourd'hui
--     et J-1 : éditer, clôturer, rouvrir puis re-clôturer) ; dès J-2, rien, même
--     non clôturée.
-- DELETE reste réservé à la gestion (pièce comptable). Le trigger caisse_stamp
-- (validated_at/by serveur) reste en place, inchangé (signature d'audit).
drop policy if exists "caisse insert (super/admin)" on public.caisse_sheets;
drop policy if exists "caisse update (role + verrou)" on public.caisse_sheets;
drop policy if exists "caisse delete (admin)" on public.caisse_sheets;
drop policy if exists "caisse write (page:caisse)" on public.caisse_sheets;
drop policy if exists "caisse update (page:caisse + verrou)" on public.caisse_sheets;
drop policy if exists "caisse delete (page:caisse gestion)" on public.caisse_sheets;

create policy "caisse write (page:caisse)"
  on public.caisse_sheets for insert to authenticated
  with check (
    public.get_page_level('caisse') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('caisse')) >= 2
      and report_date >= (current_date - 1)
    )
  );

create policy "caisse update (page:caisse + verrou)"
  on public.caisse_sheets for update to authenticated
  using (
    public.get_page_level('caisse') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('caisse')) >= 2
      and report_date >= (current_date - 1)
    )
  )
  with check (
    public.get_page_level('caisse') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('caisse')) >= 2
      and report_date >= (current_date - 1)
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
