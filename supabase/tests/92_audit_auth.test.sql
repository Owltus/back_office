-- =============================================================================
-- 92_audit_auth.test.sql — audit de sécurité « authentification et comptes »
-- du 2026-10-17 (base LOCALE).
--
-- Un compte d'auth.users SANS profil (révoqué par delete-user en mode
-- « banni », jeton encore valide ≤ 1 h) peut-il se recréer un profil ?
-- Avant le 2026-10-17 : OUI, avec n'importe quel e-mail (la policy
-- `profiles insert (bornee)` ne contrôlait que id et role). Corrigé par la
-- migration 20261017110000 : l'insertion est réservée à l'admin.
--
-- Compte créé DANS la transaction, tout est annulé à la fin.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(5);

insert into auth.users (id, email)
  values ('a0d17000-0000-4000-8000-0000000000c1', 'audit92-sansprofil@exemple.test');

select set_config('request.jwt.claims',
  '{"sub":"a0d17000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;

-- Ce qui tient : aucune élévation par l'auto-insertion.
select is(
  (public.get_my_access() ->> 'profile'), null,
  'sans profil, get_my_access rend profile = null (éjection côté app)');

select throws_ok(
  $$ insert into public.user_page_permissions(user_id, page, level)
     values ('a0d17000-0000-4000-8000-0000000000c1', 'repjour', 'gestion') $$,
  '42501', null,
  'un compte sans profil ne peut pas s''accorder une page');

select throws_ok(
  $$ select public.set_user_grade('a0d17000-0000-4000-8000-0000000000c1', 'admin') $$,
  'P0001', null,
  'un compte sans profil ne peut pas se promouvoir');

-- Finding : auto-recréation du profil avec un e-mail arbitraire.

select throws_ok(
  $$ insert into public.profiles(id, email, role)
     values ('a0d17000-0000-4000-8000-0000000000c1', 'audit92-usurpe@exemple.test', 'utilisateur') $$,
  '42501', null,
  'un compte sans profil ne recrée pas son profil avec un autre e-mail');

select throws_ok(
  $$ insert into public.profiles(id, email, role)
     values ('a0d17000-0000-4000-8000-0000000000c1', 'audit92-sansprofil@exemple.test', 'utilisateur') $$,
  '42501', null,
  'un compte sans profil ne recrée pas son profil (même avec son e-mail)');


select * from finish();
rollback;
