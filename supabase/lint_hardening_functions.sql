-- ============================================================================
-- DURCISSEMENT FONCTIONS — réponse au database linter Supabase.
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Idempotent, SÛR.
-- Ne touche AUCUNE donnée, AUCUNE table : uniquement des `alter function` (fige
-- le search_path) et des `revoke execute` (retire l'exposition RPC superflue).
-- Toutes les signatures sont résolues via l'OID (`regprocedure`) → aucune
-- devinette, gère les surcharges (ex. facturation_issuer_codes_forget ×2).
--
-- Warnings traités :
--   * 0011 function_search_path_mutable          → bloc 1 (13 fonctions)
--   * 0028 anon_security_definer_...executable    → blocs 2 + 3 (revoke PUBLIC+anon ;
--          anon hérite de PUBLIC, donc c'est bien PUBLIC qu'il faut retirer)
--   * 0029 authenticated_security_definer_...exec → bloc 3 (triggers uniquement ;
--          voir la NOTE : les vraies RPC restent appelables par `authenticated`)
--   * auth_leaked_password_protection             → PAS de SQL, voir la fin.
-- ============================================================================


-- === 1) search_path figé sur les 13 fonctions flaggées (0011) ================
-- `set search_path = public` rend la résolution de schéma déterministe (le linter
-- exige juste un search_path NON mutable). `public` (et non `''`) car certaines de
-- ces fonctions trigger/stamp référencent des tables sans qualification.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'easter_eggs_set_updated_at', 'log_delete', 'caisse_set_updated_at',
        'rapro_set_updated_at', 'get_user_role', 'parking_set_updated_at',
        'affiche_set_updated_at', 'page_level_rank', 'pdj_set_updated_at',
        'caisse_stamp', 'rapro_sheets_stamp', 'pms_daily_metrics_stamp',
        'rapro_rooms_stamp'
      )
  loop
    execute format('alter function %s set search_path = public;', r.sig);
  end loop;
end $$;


-- === 2) Fonctions TRIGGER : retirer toute exposition RPC (0028 + 0029) ========
-- Une fonction qui renvoie `trigger` n'est JAMAIS un endpoint : elle est appelée
-- par le moteur au nom du propriétaire de la table, pas via /rest/v1/rpc. Lui
-- retirer EXECUTE pour public/anon/authenticated ne casse aucun trigger et la
-- sort de l'API exposée (clôt 0028 ET 0029 pour ces fonctions).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype = 'pg_catalog.trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated;', r.sig);
  end loop;
end $$;


-- === 3) RPC SECURITY DEFINER non-trigger : retirer PUBLIC + anon (0028) =======
-- POINT CLÉ : à la création, EXECUTE est accordé à `PUBLIC` par défaut. `anon`
-- hérite de PUBLIC → le linter le voit exécutable même après un `revoke from anon`
-- (le grant réel était sur PUBLIC). Il faut donc RETIRER PUBLIC, puis RÉ-ACCORDER
-- à `authenticated` seul (ces RPC sont appelées par l'app connectée ; leur sécurité
-- réelle = garde interne get_page_level/is_admin + RLS). Résultat : clôt 0028 (ni
-- PUBLIC ni anon), garde l'app fonctionnelle (authenticated conservé, 0029 voulu).
-- La passe boucle sur TOUTES les fonctions security definer → plus de dérive possible.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prorettype <> 'pg_catalog.trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon;', r.sig);
    execute format('grant execute on function %s to authenticated;', r.sig);
  end loop;
end $$;

-- NOTE sur 0029 (« authenticated peut exécuter ») : il RESTERA affiché pour les
-- vraies RPC (admin_update_password, set_user_grade, facturation_*, etc.). C'est
-- VOULU : le rôle `authenticated` est le canal normal des utilisateurs connectés,
-- et la sécurité réelle est la GARDE INTERNE (is_admin / get_page_level) + la RLS.
-- Révoquer `authenticated` casserait l'app. Ces 0029 sont donc des faux positifs
-- attendus. Seuls les triggers (bloc 2) le quittent réellement.


-- === VÉRIFICATION (lecture seule) ============================================
-- Tout doit être OK.
select item, status, detail from (

  -- a) ni PUBLIC ni anon sur une fonction SECURITY DEFINER (grantee 0 = PUBLIC :
  --    on ne peut PAS le joindre à pg_roles, d'où le case explicite ci-dessous)
  select 1 as ord, 'ni PUBLIC ni anon ne peut exécuter une fonction security definer' as item,
    case when not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where n.nspname = 'public' and p.prosecdef
        and a.privilege_type = 'EXECUTE'
        and (a.grantee = 0 or a.grantee = 'anon'::regrole)
    ) then 'OK' else 'A FAIRE' end as status,
    coalesce((select string_agg(distinct p.proname, ', ') from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where n.nspname = 'public' and p.prosecdef
        and a.privilege_type = 'EXECUTE'
        and (a.grantee = 0 or a.grantee = 'anon'::regrole)), '(aucune)') as detail

  -- b) aucune fonction trigger n'est exposée en RPC (PUBLIC/anon/authenticated)
  union all
  select 2, 'fonctions trigger sorties de l''API',
    case when not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where n.nspname = 'public' and p.prorettype = 'pg_catalog.trigger'::regtype
        and a.privilege_type = 'EXECUTE'
        and (a.grantee = 0 or a.grantee in ('anon'::regrole, 'authenticated'::regrole))
    ) then 'OK' else 'A FAIRE' end,
    coalesce((select string_agg(distinct p.proname, ', ') from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where n.nspname = 'public' and p.prorettype = 'pg_catalog.trigger'::regtype
        and a.privilege_type = 'EXECUTE'
        and (a.grantee = 0 or a.grantee in ('anon'::regrole, 'authenticated'::regrole))), '(aucune)')

  -- c) les 13 fonctions flaggées 0011 ont bien un search_path figé
  union all
  select 3, 'search_path figé sur les 13 fonctions',
    case when not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (
          'easter_eggs_set_updated_at','log_delete','caisse_set_updated_at',
          'rapro_set_updated_at','get_user_role','parking_set_updated_at',
          'affiche_set_updated_at','page_level_rank','pdj_set_updated_at',
          'caisse_stamp','rapro_sheets_stamp','pms_daily_metrics_stamp',
          'rapro_rooms_stamp')
        and (p.proconfig is null
             or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
    ) then 'OK' else 'A FAIRE' end,
    coalesce((select string_agg(distinct p.proname, ', ') from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (
          'easter_eggs_set_updated_at','log_delete','caisse_set_updated_at',
          'rapro_set_updated_at','get_user_role','parking_set_updated_at',
          'affiche_set_updated_at','page_level_rank','pdj_set_updated_at',
          'caisse_stamp','rapro_sheets_stamp','pms_daily_metrics_stamp',
          'rapro_rooms_stamp')
        and (p.proconfig is null
             or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))),
      '(toutes figées)')

) x order by ord;
