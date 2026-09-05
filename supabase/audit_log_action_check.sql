-- =============================================================================
-- audit_log — élargir la contrainte CHECK sur `action` (correctif lot 3, A2/A4)
--
-- APPLIQUÉ en prod le 2026-09-04 ; VÉRIFIÉ le 2026-09-05 via `supabase db query`
-- (contrainte = admin_password_reset, DELETE, INSERT, set_user_grade, UPDATE ;
-- les 3 fonctions écrivant dans audit_log — set_user_grade, admin_update_password,
-- log_delete — n'utilisent que ces valeurs ; insert de test annulé = accepté).
-- Rejouable sans risque (idempotent), EN UNE FOIS.
-- SÛR / idempotent : aucune ligne modifiée, la contrainte est recréée avec un
-- SUR-ENSEMBLE des valeurs déjà admises (les lignes existantes restent valides).
--
-- Symptôme corrigé : « new row for relation "audit_log" violates check
-- constraint "audit_log_action_check" » au changement de mot de passe (/comptes)
-- et au changement de grade. Les RPC admin_update_password / set_user_grade
-- (remediation_securite_2026-08-05_lot3.sql) journalisent avec les actions
-- 'admin_password_reset' et 'set_user_grade', absentes de la contrainte posée à
-- la création de la table (vraisemblablement INSERT/UPDATE/DELETE des triggers
-- d'audit). L'exception annule TOUTE la transaction : le mot de passe / le grade
-- n'étaient donc PAS modifiés.
-- =============================================================================

-- (0) Diagnostic, lecture seule : définition actuelle de la contrainte.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.audit_log'::regclass and conname = 'audit_log_action_check';

-- (1) Recréation : valeurs actuelles de la contrainte ∪ nouvelles actions.
do $$
declare
  v_def    text;
  v_values text[];
  v_new    text[] := array['admin_password_reset', 'set_user_grade'];
  v_list   text;
begin
  select pg_get_constraintdef(oid) into v_def
  from pg_constraint
  where conrelid = 'public.audit_log'::regclass and conname = 'audit_log_action_check';

  if v_def is null then
    raise notice 'audit_log_action_check absente : rien à faire';
    return;
  end if;

  -- Extrait les littéraux '...' de la définition (forme action = ANY (ARRAY['A'::text, ...])
  -- ou action IN ('A', ...)). Si aucun littéral n'est trouvé, on s'arrête plutôt
  -- que de deviner (la définition est affichée par l'étape 0).
  select coalesce(array_agg(m[1]), '{}') into v_values
  from regexp_matches(v_def, '''((?:[^'']|'''')*)''', 'g') as m;

  if coalesce(array_length(v_values, 1), 0) = 0 then
    raise exception 'Forme de contrainte inattendue, adapter à la main : %', v_def;
  end if;

  -- Union sans doublon, ordre stable.
  select string_agg(quote_literal(v), ', ' order by v)
  into v_list
  from (select distinct unnest(v_values || v_new) as v) s;

  execute 'alter table public.audit_log drop constraint audit_log_action_check';
  execute format(
    'alter table public.audit_log add constraint audit_log_action_check check (action in (%s))',
    v_list
  );
  raise notice 'audit_log_action_check recréée : action in (%)', v_list;
end $$;

-- (2) Vérification : la définition doit maintenant lister les deux nouvelles actions.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.audit_log'::regclass and conname = 'audit_log_action_check';
