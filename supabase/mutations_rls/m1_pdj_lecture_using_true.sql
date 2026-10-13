-- MUTATION M1 (base LOCALE, transaction annulée) : la lecture PDJ passe en
-- `using (true)`. Attendu : 01_rls_matrice ÉCHOUE (aucun / sans_profil voient
-- les lignes PDJ, noms de clients compris).
-- Lancer : psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -X -q -At -f supabase/mutations_rls/m1_pdj_lecture_using_true.sql
-- La transaction ouverte ici est annulée par le `rollback` final du fichier de
-- test inclus (son `begin` est ignoré : « transaction déjà en cours »).
begin;
alter policy "pdj read (page:pdj)" on public.pdj_breakfasts using (true);
\i supabase/tests/01_rls_matrice.test.sql
