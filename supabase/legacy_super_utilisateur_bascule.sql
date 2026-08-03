-- =============================================================================
-- LEGACY — bascule des comptes `super_utilisateur` vers `utilisateur`
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
-- Prépare le retrait du rôle legacy `super_utilisateur` du code (types, /profil,
-- libellés). Après cette bascule il ne doit plus rester aucun super_utilisateur.
--
-- ⚠ AVERTISSEMENT : `super_utilisateur` = grade UTILISATEUR aujourd'hui (aucun
--   droit admin). Les basculer en `utilisateur` ne change donc PAS leurs droits
--   effectifs. MAIS assure-toi qu'il existe au moins un compte `admin` par
--   ailleurs (sinon plus personne ne gère les comptes/permissions depuis l'app) :
--     select id, email, role from public.profiles where role = 'admin';
--   Si tu veux qu'un de ces comptes soit ADMIN, mets 'admin' au lieu de
--   'utilisateur' pour celui-là (adapte le WHERE).
--
-- POURQUOI désactiver un trigger : `protect_role_escalation`
--   (prevent_self_role_change) FORCE role à son ancienne valeur dès que
--   `not is_admin()`. Dans le SQL editor, auth.uid() est NULL → is_admin() = false
--   → un UPDATE direct serait silencieusement annulé. On désactive donc le trigger
--   le temps de la bascule, PUIS on le réactive (sécurité rétablie).
-- =============================================================================

-- 1) APERÇU (doit lister les comptes à basculer).
select id, email, role from public.profiles where role = 'super_utilisateur';

-- 2) BASCULE (trigger désactivé le temps de l'update, puis réactivé).
alter table public.profiles disable trigger protect_role_escalation;

update public.profiles
set role = 'utilisateur'
where role = 'super_utilisateur';

alter table public.profiles enable trigger protect_role_escalation;

-- 3) VÉRIFICATION — doit renvoyer 0.
select count(*) as super_utilisateur_restants
from public.profiles
where role = 'super_utilisateur';

-- 4) CONTRÔLE — le trigger est bien RÉACTIVÉ (tgenabled = 'O').
select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.profiles'::regclass
  and tgname = 'protect_role_escalation';
