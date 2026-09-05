-- =============================================================================
-- CAISSE — RLS : fenêtre d'action J-1 (écriture) + passé libre (gestion)
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
-- Ne touche QUE les policies d'écriture de caisse_sheets : aucune table, aucune
-- donnée, aucun trigger (caisse_stamp conservé). Ré-exécutable (drop if exists).
--
-- RÈGLE (miroir de lib/caisse/editability.ts, CAISSE_GRACE_DAYS = 1) — remplace
-- l'ancien verrou « 24 h après validation » :
--   - gestion  : agit sur n'importe quelle feuille (édition, clôture, réouverture) ;
--   - ecriture : uniquement les feuilles report_date >= aujourd'hui - 1 (aujourd'hui
--     et J-1) — saisir, clôturer, rouvrir puis re-clôturer ; dès J-2, rien, même
--     feuille non clôturée.
--   - DELETE reste réservé à la gestion (une feuille est une pièce comptable).
-- On droppe AUSSI les anciens noms de policy (par rôle) pour être autoritatif quel
-- que soit l'ordre d'exécution passé.
-- 2026-09-05 : aides en schéma private (voir private_schema_aides.sql)
-- =============================================================================

-- 1) APERÇU (facultatif) — feuilles clôturées hors fenêtre (réouverture = gestion).
select count(*) as feuilles_cloturees_hors_fenetre
from public.caisse_sheets
where status = 'validated'
  and report_date < (current_date - 1);


-- 2) POLICIES
drop policy if exists "caisse insert (super/admin)" on public.caisse_sheets;
drop policy if exists "caisse update (role + verrou)" on public.caisse_sheets;
drop policy if exists "caisse delete (admin)" on public.caisse_sheets;
drop policy if exists "caisse write (page:caisse)" on public.caisse_sheets;
drop policy if exists "caisse update (page:caisse + verrou)" on public.caisse_sheets;
drop policy if exists "caisse delete (page:caisse gestion)" on public.caisse_sheets;

-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "caisse write (page:caisse)"
  on public.caisse_sheets for insert to authenticated
  with check (
    (select private.get_page_level('caisse')) = 'gestion'
    or (
      (select private.page_level_rank(private.get_page_level('caisse'))) >= 2
      and report_date >= (current_date - 1)
    )
  );

-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "caisse update (page:caisse + verrou)"
  on public.caisse_sheets for update to authenticated
  using (
    (select private.get_page_level('caisse')) = 'gestion'
    or (
      (select private.page_level_rank(private.get_page_level('caisse'))) >= 2
      and report_date >= (current_date - 1)
    )
  )
  with check (
    (select private.get_page_level('caisse')) = 'gestion'
    or (
      (select private.page_level_rank(private.get_page_level('caisse'))) >= 2
      and report_date >= (current_date - 1)
    )
  );

-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "caisse delete (page:caisse gestion)"
  on public.caisse_sheets for delete to authenticated
  using ((select private.get_page_level('caisse')) = 'gestion');


-- 3) VÉRIFICATION — doit lister les 3 policies (insert/update/delete).
select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'caisse_sheets'
  and policyname like 'caisse %(page:caisse%'
order by cmd;
