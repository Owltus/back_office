-- MUTATION M3 (base LOCALE, transaction annulée) : la fenêtre de modification
-- PDJ est élargie d'UN jour (J-3 → J-4). Attendu : 01_rls_matrice ÉCHOUE
-- (ecriture et reception modifient la ligne de J-4).
-- Lancer : psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -X -q -At -f supabase/mutations_rls/m3_pdj_fenetre_plus_un_jour.sql
begin;
alter policy "pdj update (page:pdj)" on public.pdj_breakfasts
  using (((select private.get_page_level('pdj')) = 'gestion')
         or (((select private.page_level_rank(private.get_page_level('pdj'))) >= 2)
             and (service_date >= (current_date - 4))))
  with check (((select private.get_page_level('pdj')) = 'gestion')
         or (((select private.page_level_rank(private.get_page_level('pdj'))) >= 2)
             and (service_date >= (current_date - 4))));
\i supabase/tests/01_rls_matrice.test.sql
