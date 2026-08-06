-- =============================================================================
-- Identité système « StayNTouch (PMS) » — pour estampiller les imports AUTOMATIQUES
-- (daily_reports.imported_by → « importé par StayNTouch »).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable (idempotent).
-- NON DESTRUCTIF : insère UNE ligne dans public.profiles. N'écrit rien d'autre.
--
-- Diagnostic confirmé (2026-08-06) :
--   - daily_reports.imported_by → FK public.profiles(id), nullable.
--   - profiles.id : AUCUNE FK vers auth.users → une simple ligne profiles suffit
--     (pas besoin de créer un compte auth.users).
--   - pms_daily_metrics.imported_by : aucune FK, posé par trigger auth.uid()
--     (sera null en service_role — acceptable, l'étiquette vit sur daily_reports).
--
-- SÉCURITÉ : cette identité n'a AUCUN droit. role='utilisateur' + aucune ligne
-- dans user_page_permissions = accès nul partout (défaut fermé). C'est une simple
-- ÉTIQUETTE d'affichage, pas un compte utilisable (aucun auth.users, donc aucune
-- connexion possible).
-- =============================================================================

insert into public.profiles (id, email, display_name, role, first_name, last_name)
values (
  '11111111-1111-1111-1111-111111111111',
  'pms@stayntouch.system',       -- adresse fictive (aucun auth.users derrière)
  'StayNTouch (PMS)',            -- ce qui s'affiche : « importé par StayNTouch (PMS) »
  'utilisateur',                 -- grade le plus bas ; aucun droit de page accordé
  'StayNTouch',
  'PMS'
)
on conflict (id) do update
  set display_name = excluded.display_name,
      first_name   = excluded.first_name,
      last_name    = excluded.last_name;

-- Vérification (lecture seule) :
--   select id, display_name, role from public.profiles
--   where id = '11111111-1111-1111-1111-111111111111';
--   -- attendu : StayNTouch (PMS), utilisateur
--   select * from public.user_page_permissions
--   where user_id = '11111111-1111-1111-1111-111111111111';
--   -- attendu : 0 ligne (aucun droit)
