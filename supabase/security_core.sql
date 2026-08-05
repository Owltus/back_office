-- ============================================================================
-- security_core — fonctions de sécurité critiques (C1) : rapatriement + garde.
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor, APRÈS le diagnostic
-- (Étape 1). `admin_update_password` et `get_user_role` viennent de l'app repjour
-- ex-co-hébergée et ne sont PAS versionnées. Ce fichier documente comment les
-- confirmer et les durcir sans en inventer le corps.
--
-- ⚠ NE PAS COLLER DE CORPS DEVINÉ. Récupérer la définition RÉELLE via l'Étape 1 :
--     select pg_get_functiondef('public.admin_update_password'::regprocedure);
--   puis la coller ci-dessous (source de vérité versionnée), en s'assurant des
--   4 invariants — sinon C1 reste ouvert (un non-admin réinitialise un mot de
--   passe admin → prise de contrôle totale).
-- ============================================================================

-- === 0) VERROU IMMÉDIAT : retirer l'exécution à `anon` =======================
-- Diagnostic (f) du 2026-07-27 : `anon` peut EXÉCUTER admin_update_password,
-- set_user_grade, set_page_permission, remove_page_permission. Ces RPC sont donc
-- appelables SANS session (clé anon publique) ; seule leur garde interne bloque.
-- On retire ce droit : les admins connectés passent par `authenticated` (intact).
-- SÛR et idempotent — la boucle résout les signatures via l'OID (aucune devinette).
--
-- >>> Exécutable tel quel, indépendamment du reste de ce fichier. <<<
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('admin_update_password', 'set_user_grade',
                        'set_page_permission', 'remove_page_permission')
  loop
    execute format('revoke execute on function %s from anon;', r.sig);
  end loop;
end $$;

-- Contrôle après exécution : la requête (f) du diagnostic ne doit PLUS lister
-- `anon` pour aucune de ces quatre fonctions.

-- === admin_update_password — définition versionnée + search_path figé =========
-- État prod du 2026-07-27 : garde de rôle présente en 1re ligne (OK), complexité
-- du mot de passe solide (OK), mais `config = null` → search_path NON figé (le
-- « Function Search Path Mutable » du linter Supabase). Corps IDENTIQUE, on ajoute
-- seulement `set search_path = public, extensions` (profiles vit dans public,
-- pgcrypto dans extensions) et on qualifie `public.profiles`.
--
-- ⚠ APRÈS exécution : tester UN changement de mot de passe (page /comptes). Si
--   « function crypt does not exist » apparaît, pgcrypto est dans un autre schéma
--   → me le dire pour ajuster le search_path.
create or replace function public.admin_update_password(target_user_id uuid, new_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $function$
begin
  if (select role from public.profiles where id = auth.uid()) <> 'admin' then
    raise exception 'Accès refusé : rôle admin requis';
  end if;
  -- Anti-takeover inter-admin (A2) : refuser une cible admin autre que soi-même.
  if target_user_id <> auth.uid()
     and (select role from public.profiles where id = target_user_id) = 'admin' then
    raise exception 'Cible administrateur : réinitialisation interdite (passer par le dashboard)';
  end if;
  if length(new_password) < 12 then
    raise exception 'Le mot de passe doit faire au moins 12 caractères';
  end if;
  if new_password !~ '[A-Z]' then
    raise exception 'Le mot de passe doit contenir au moins une majuscule';
  end if;
  if new_password !~ '[a-z]' then
    raise exception 'Le mot de passe doit contenir au moins une minuscule';
  end if;
  if new_password !~ '[0-9]' then
    raise exception 'Le mot de passe doit contenir au moins un chiffre';
  end if;
  if new_password !~ '[^a-zA-Z0-9]' then
    raise exception 'Le mot de passe doit contenir au moins un caractère spécial';
  end if;
  update auth.users
  set encrypted_password = crypt(new_password, gen_salt('bf'))
  where id = target_user_id;
  -- Traçabilité (A2, pentest #2) : journaliser le reset (jamais le mot de passe).
  insert into public.audit_log (table_name, record_id, action, old_data, performed_by, performed_at)
  values (
    'auth.users', target_user_id::text, 'admin_password_reset',
    jsonb_build_object('target_role', (select role from public.profiles where id = target_user_id)),
    auth.uid(), now()
  );
end;
$function$;

-- === get_user_role — invariants ==============================================
--   security definer + set search_path = public. Sert de garde à de nombreuses
--   policies/RPC. Corps versionné à l'identique de la prod (dump du 2026-08-04
--   via pg_get_functiondef) — finding F3 du pentest.
create or replace function public.get_user_role()
returns text
language sql
security definer
set search_path = public
as $function$
  select role from public.profiles where id = auth.uid();
$function$;

-- === VÉRIFICATION (compte jetable, JWT non-admin) ============================
--   rpc/admin_update_password  →  doit renvoyer 403 / 'forbidden'.
--   La requête (f) du diagnostic ne doit PAS lister `anon` en granted_to.
