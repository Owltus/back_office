-- =============================================================================
-- RAPRO — RLS : fenêtre d'action de 2 jours (écriture) + passé libre (gestion)
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
-- Ne touche QUE les policies d'écriture de rapro_sheets et rapro_rooms : aucune
-- table, aucun trigger, aucune donnée. Ré-exécutable (drop if exists puis create).
--
-- RÈGLE (miroir de lib/rapro/editability.ts, RAPRO_GRACE_DAYS = 2) :
--   - gestion  : agit sur n'importe quel jour ;
--   - ecriture : uniquement les jours report_date >= aujourd'hui - 2 (aujourd'hui,
--     J-1, J-2) — éditer la grille, clôturer, rouvrir puis re-clôturer. Au-delà
--     dans le passé : rien, même si le jour n'est pas clôturé.
-- Le pivot est report_date (le jour rapproché), présent sur les deux tables.
-- La réouverture est un simple UPDATE de rapro_sheets (status -> draft) : elle
-- passe donc par la policy UPDATE ci-dessous, bornée à la fenêtre pour l'écriture.
-- =============================================================================

-- 1) APERÇU (facultatif) — jours clôturés hors fenêtre (réouverture réservée gestion).
select count(*) as jours_clotures_hors_fenetre
from public.rapro_sheets
where status = 'validated'
  and report_date < (current_date - 2);


-- 2) RAPRO_SHEETS — feuilles jour (clôture / réouverture / commentaire)
drop policy if exists "rapro_sheets insert (super/admin)" on public.rapro_sheets;
drop policy if exists "rapro_sheets update (super/admin)" on public.rapro_sheets;
drop policy if exists "rapro_sheets delete (super/admin)" on public.rapro_sheets;
drop policy if exists "rapro_sheets write (page:rapro)" on public.rapro_sheets;
drop policy if exists "rapro_sheets update (page:rapro)" on public.rapro_sheets;
drop policy if exists "rapro_sheets delete (page:rapro)" on public.rapro_sheets;

-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "rapro_sheets write (page:rapro)"
  on public.rapro_sheets for insert to authenticated
  with check (
    (select public.get_page_level('rapro')) = 'gestion'
    or (
      (select public.page_level_rank(public.get_page_level('rapro'))) >= 2
      and report_date >= (current_date - 2)
    )
  );
-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "rapro_sheets update (page:rapro)"
  on public.rapro_sheets for update to authenticated
  using (
    (select public.get_page_level('rapro')) = 'gestion'
    or (
      (select public.page_level_rank(public.get_page_level('rapro'))) >= 2
      and report_date >= (current_date - 2)
    )
  )
  with check (
    (select public.get_page_level('rapro')) = 'gestion'
    or (
      (select public.page_level_rank(public.get_page_level('rapro'))) >= 2
      and report_date >= (current_date - 2)
    )
  );
-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "rapro_sheets delete (page:rapro)"
  on public.rapro_sheets for delete to authenticated
  using (
    (select public.get_page_level('rapro')) = 'gestion'
    or (
      (select public.page_level_rank(public.get_page_level('rapro'))) >= 2
      and report_date >= (current_date - 2)
    )
  );


-- 3) RAPRO_ROOMS — statuts ménage par (jour, chambre)
drop policy if exists "rapro insert (super/admin)" on public.rapro_rooms;
drop policy if exists "rapro update (super/admin)" on public.rapro_rooms;
drop policy if exists "rapro delete (super/admin)" on public.rapro_rooms;
drop policy if exists "rapro_rooms write (page:rapro)" on public.rapro_rooms;
drop policy if exists "rapro_rooms update (page:rapro)" on public.rapro_rooms;
drop policy if exists "rapro_rooms delete (page:rapro)" on public.rapro_rooms;

-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "rapro_rooms write (page:rapro)"
  on public.rapro_rooms for insert to authenticated
  with check (
    (select public.get_page_level('rapro')) = 'gestion'
    or (
      (select public.page_level_rank(public.get_page_level('rapro'))) >= 2
      and report_date >= (current_date - 2)
    )
  );
-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "rapro_rooms update (page:rapro)"
  on public.rapro_rooms for update to authenticated
  using (
    (select public.get_page_level('rapro')) = 'gestion'
    or (
      (select public.page_level_rank(public.get_page_level('rapro'))) >= 2
      and report_date >= (current_date - 2)
    )
  )
  with check (
    (select public.get_page_level('rapro')) = 'gestion'
    or (
      (select public.page_level_rank(public.get_page_level('rapro'))) >= 2
      and report_date >= (current_date - 2)
    )
  );
-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "rapro_rooms delete (page:rapro)"
  on public.rapro_rooms for delete to authenticated
  using (
    (select public.get_page_level('rapro')) = 'gestion'
    or (
      (select public.page_level_rank(public.get_page_level('rapro'))) >= 2
      and report_date >= (current_date - 2)
    )
  );


-- 4) VÉRIFICATION — doit lister les 6 policies (3 par table).
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('rapro_sheets', 'rapro_rooms')
  and policyname like 'rapro%(page:rapro)'
order by tablename, cmd;
