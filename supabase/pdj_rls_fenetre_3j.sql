-- =============================================================================
-- PDJ — RLS : saisie (cocher les cases) dans une fenêtre J-3
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Idempotent.
-- Ne touche QUE les policies d'écriture de pdj_breakfasts : aucune table, aucune
-- donnée. Aligne la base sur l'UI (grille cochable seulement dans la fenêtre J-3).
--
-- MODÈLE pdj :
--   - lecture  : consultation seule ;
--   - ecriture : coche/sert les petits-déjeuners uniquement pour les jours
--     service_date >= aujourd'hui - 3 (aujourd'hui + 3 jours précédents) ; import
--     des rooming inchangé (écriture) ; au-delà de J-3, saisie bloquée ;
--   - gestion  : agit sur n'importe quel jour. DELETE (jour entier) = gestion.
-- Pivot = service_date.
-- =============================================================================

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
create policy "pdj delete (page:pdj)"
  on public.pdj_breakfasts for delete to authenticated
  using (public.get_page_level('pdj') = 'gestion');


-- VÉRIFICATION — insert/update avec la fenêtre 3 j, delete en gestion.
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'pdj_breakfasts'
  and policyname like 'pdj %(page:pdj)'
order by cmd;
