-- =====================================================================
-- HORS PUBLIC — objets à nous en dehors de public et private, 2026-10-13
-- =====================================================================
-- Plan environnement-dev-docker-2026-10-12, étape 4. Chaque objet est repris
-- du CATALOGUE de la prod (lu le 2026-10-13, plan/…/releve-prod.md), jamais
-- de mémoire. En prod, cette migration n'est pas rejouée : tout y existe
-- déjà, elle y est marquée « appliquée » par `migration repair` (étape 9).
--
-- Pas de trigger sur auth.users : il n'y en a AUCUN en prod (les profils sont
-- créés par l'Edge Function create-user).
-- pg_cron : absent en prod (D7-A), non installé.
-- =====================================================================

-- 1. Bucket des images du Classeur (D16-B : en migration, pas dans
--    config.toml, pour qu'un bucket futur parte en prod par `livrer`).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('classeur-images', 'classeur-images', false, 20971520, array['image/webp'])
on conflict (id) do nothing;

-- 2. Policies de storage.objects, définitions exactes de pg_policies (prod).
create policy "classeur-images read (page:classeur)"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'classeur-images'
    and array_length(storage.foldername(name), 1) = 1
    and (storage.foldername(name))[1] ~ '^[0-9]{1,12}$'
    and (select private.classeur_lecture_ok(((storage.foldername(objects.name))[1])::bigint))
  );

create policy "classeur-images insert (page:classeur)"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'classeur-images'
    and array_length(storage.foldername(name), 1) = 1
    and (storage.foldername(name))[1] ~ '^[0-9]{1,12}$'
    and storage.extension(name) = 'webp'
    and (select private.classeur_write_ok(((storage.foldername(objects.name))[1])::bigint))
  );

create policy "classeur-images delete (page:classeur)"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'classeur-images'
    and array_length(storage.foldername(name), 1) = 1
    and (storage.foldername(name))[1] ~ '^[0-9]{1,12}$'
    and (select private.classeur_write_ok(((storage.foldername(objects.name))[1])::bigint))
  );

-- 3. Realtime : parking_reservations SEULE (décision du 2026-09-20).
alter publication supabase_realtime add table public.parking_reservations;

-- 4. Réglages de rôles relevés en prod (pg_db_role_setting) qui ne viennent
--    pas de la stack : idle_in_transaction_session_timeout (perf_audit
--    2026-09-06). statement_timeout et lock_timeout sont déjà ceux de la
--    stack locale.
alter role authenticated set idle_in_transaction_session_timeout = '60s';
alter role anon set idle_in_transaction_session_timeout = '60s';
alter role authenticator set idle_in_transaction_session_timeout = '60s';
alter role postgres set idle_in_transaction_session_timeout = '60s';

-- 5. Privilège par défaut du schéma private, comme en prod
--    (default_privileges_fonctions_2026-09-28.sql) : une fonction créée plus
--    tard dans private ne naît jamais exécutable par anon.
alter default privileges for role postgres in schema private
  revoke execute on functions from anon;
