-- =============================================================================
-- lint_hardening_2026-09-05 — Security Advisor : anon sur 6 RPC + btree_gist
--
-- Application : `supabase db query --linked -f supabase/lint_hardening_2026-09-05.sql`
-- Idempotent, SÛR : uniquement des `revoke`/`grant execute` et un
-- `alter extension … set schema`. Aucune table, aucune donnée, aucune policy.
--
-- POURQUOI : le Security Advisor du 2026-09-05 signale
--   * 0028 anon_security_definer_function_executable sur 6 fonctions créées
--     APRÈS le durcissement du 2026-08-04 (facturation_ref_comptes_delete /
--     _reimport / _upsert, literie_record_movement, literie_toggle_bedding,
--     set_parking_tarif) : à la création, EXECUTE est accordé à PUBLIC dont
--     `anon` hérite. La boucle du 2026-08-04 (lint_hardening_functions.sql,
--     bloc 3) est REJOUÉE ici telle quelle : elle couvre toute fonction
--     security definer présente ou future au moment de son exécution.
--   * 0014 extension_in_public : `btree_gist` (contrainte anti-chevauchement
--     du parking) vit dans `public`. Extension relocatable ; le search_path par
--     défaut des rôles Supabase inclut `extensions` ; la contrainte EXCLUDE
--     référence les opclasses par OID → déplacement sans effet fonctionnel.
--   * 0029 (authenticated peut exécuter les RPC) : VOULU, inchangé. Voir la
--     NOTE de lint_hardening_functions.sql : ce sont les RPC de l'app, gardées
--     par is_admin / get_page_level + RLS.
-- =============================================================================

-- (1) Ni PUBLIC ni anon sur AUCUNE fonction security definer non-trigger, dans
--     public ET private (schéma privé créé par private_schema_aides.sql) ;
--     authenticated conservé (canal normal de l'app connectée). Depuis le plan
--     security-advisor-zero-2026-09-05, une fonction security definer restée
--     dans public est une ANOMALIE : signalée par notice.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig, n.nspname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prosecdef
      and p.prorettype <> 'pg_catalog.trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon;', r.sig);
    execute format('grant execute on function %s to authenticated;', r.sig);
    if r.nspname = 'public' then
      raise notice 'ANOMALIE : fonction security definer encore dans public : % (a deplacer dans private, voir private_rpc_relais.sql)', r.sig;
    end if;
  end loop;
end $$;

-- (2) btree_gist hors de public (idempotent).
do $$
begin
  if exists (
    select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'btree_gist' and n.nspname = 'public'
  ) then
    alter extension btree_gist set schema extensions;
  end if;
end $$;

-- =============================================================================
-- VÉRIFICATION (lecture seule) — attendu : 0 fonction definer exécutable par
-- anon/PUBLIC, btree_gist dans `extensions`, contrainte parking toujours là.
-- =============================================================================
select 'fonctions definer exposees a anon/PUBLIC' as controle,
       count(*)::text as valeur
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and p.prorettype <> 'pg_catalog.trigger'::regtype
  and (has_function_privilege('anon', p.oid, 'execute')
       or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))
union all
select 'schema de btree_gist', n.nspname
from pg_extension e join pg_namespace n on n.oid = e.extnamespace
where e.extname = 'btree_gist'
union all
select 'contrainte parking_reservations_no_overlap', count(*)::text
from pg_constraint where conname = 'parking_reservations_no_overlap';
