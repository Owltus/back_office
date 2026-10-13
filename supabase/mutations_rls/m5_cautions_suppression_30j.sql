-- MUTATION M5 (base LOCALE, transaction annulée) : la suppression d'une
-- caution par l'écriture n'est plus limitée au JOUR MÊME mais aux 30 jours de
-- la fenêtre de modification. Attendu : 01_rls_matrice ÉCHOUE.
-- Lancer : psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -X -q -At -f supabase/mutations_rls/m5_cautions_suppression_30j.sql
begin;
alter policy "caisse cautions delete (page:caisse)" on public.caisse_cautions
  using (((select private.get_page_level('caisse')) = 'gestion')
         or (((select private.page_level_rank(private.get_page_level('caisse'))) >= 2)
             and (taken_date >= (current_date - 30))));
\i supabase/tests/01_rls_matrice.test.sql
