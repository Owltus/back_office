-- =============================================================================
-- default_privileges_fonctions_2026-09-28 — plus d'EXECUTE implicite pour
-- PUBLIC / anon sur les fonctions créées à l'avenir
--
-- ⚠ NON APPLIQUÉ. Écrit le 2026-09-28 (revue des rejeux), jamais exécuté.
--
-- SYMPTÔME  Chaque script qui crée une fonction doit penser à
--           `revoke execute … from public, anon` : un oubli, et la fonction
--           est appelable par un visiteur NON CONNECTÉ via /rest/v1/rpc
--           (lint Supabase 0028, verif_advisor.sql n° 2 en KO). La sécurité
--           repose donc sur la mémoire de chaque auteur de script.
--
-- CAUSE     Deux privilèges par défaut s'appliquent à toute fonction neuve :
--           (a) le défaut INTÉGRÉ de Postgres : EXECUTE à PUBLIC, sur tous
--               les schémas ;
--           (b) le défaut posé par Supabase à la création du projet :
--               `alter default privileges for role postgres in schema public
--               grant all on functions to anon, authenticated, service_role`.
--           (À CONFIRMER sur la prod par la requête (0), en lecture seule,
--           avant d'appliquer : c'est la configuration standard Supabase,
--           elle n'a pas été relue sur ce projet.)
--
-- CORRECTIF (1) retire EXECUTE à anon dans public (annule le défaut (b) pour
--           anon ; authenticated et service_role le gardent) ;
--           (2) retire EXECUTE à PUBLIC au niveau GLOBAL (sans `in schema`).
--           ⚠ Pourquoi global : la documentation de Postgres est explicite —
--           un `alter default privileges … in schema X revoke … from public`
--           ne peut PAS retirer un privilège accordé globalement (le défaut
--           intégré (a) en est un) ; un REVOKE par schéma n'annule qu'un GRANT
--           par schéma. La forme `in schema public revoke … from public, anon`
--           serait donc restée SANS EFFET pour PUBLIC, en silence.
--           (3) même retrait pour anon dans private, par ceinture (private
--           n'a normalement aucun défaut pour anon, et anon n'y a pas usage).
--
-- INNOCUITÉ Les privilèges PAR DÉFAUT ne concernent que les fonctions CRÉÉES
--           APRÈS l'application, et seulement celles créées par le rôle
--           `postgres` (CLI `supabase db query`, SQL Editor). AUCUNE fonction
--           existante n'est modifiée, aucune table, aucune policy, aucune
--           donnée. Rollback : les mêmes lignes avec `grant … to` à la place
--           de `revoke … from`.
--           ⚠ Effet à connaître : après (2), une fonction neuve de `private`
--           (aide de policy comprise) n'est plus exécutable par
--           authenticated tant qu'un `grant execute … to authenticated`
--           explicite n'est pas écrit — c'est déjà la règle de tous les
--           scripts private du dépôt (voir private_rpc_relais.sql), mais un
--           script qui l'oublierait casserait les policies qui l'appellent
--           (erreur 42501 visible, jamais une ouverture). Dans public,
--           authenticated garde son EXECUTE par défaut (défaut (b)).
--
-- APPLICATION (par l'utilisateur, ou l'assistant sur demande explicite) :
--   `supabase db query --linked -f supabase/default_privileges_fonctions_2026-09-28.sql`
--   Idempotent (révoquer un privilège absent ne fait rien). Puis relancer
--   verif_advisor.sql (doit rester OK) et relire la requête (4).
-- =============================================================================

-- (0) DIAGNOSTIC — lecture seule, à lire AVANT d'appliquer : privilèges par
--     défaut actuels sur les fonctions (defaclobjtype = 'f').
select pg_get_userbyid(d.defaclrole) as role_createur,
       coalesce(n.nspname, '(global)') as schema,
       d.defaclacl::text as acl_par_defaut
from pg_default_acl d
left join pg_namespace n on n.oid = d.defaclnamespace
where d.defaclobjtype = 'f'
order by 1, 2;

begin;

-- (1) public : plus d'EXECUTE par défaut pour anon.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;

-- (2) GLOBAL (tous schémas) : plus d'EXECUTE par défaut pour PUBLIC.
--     Voir CORRECTIF : la forme `in schema` serait sans effet ici.
alter default privileges for role postgres
  revoke execute on functions from public;

-- (3) private : ceinture pour anon (sans effet si aucun défaut n'existe).
alter default privileges for role postgres in schema private
  revoke execute on functions from anon;

commit;

-- (4) CONTRÔLE — lecture seule. Attendu : aucune ligne `=X/` (PUBLIC) ni
--     `anon=X/` dans les ACL par défaut des fonctions de `postgres` ; une
--     entrée globale `postgres=X/postgres` (le propriétaire seul) est normale.
select pg_get_userbyid(d.defaclrole) as role_createur,
       coalesce(n.nspname, '(global)') as schema,
       d.defaclacl::text as acl_par_defaut,
       (d.defaclacl::text ~ '(^|[{,])=X' or d.defaclacl::text ~ '(^|[{,])anon=[^,}]*X') as ko
from pg_default_acl d
left join pg_namespace n on n.oid = d.defaclnamespace
where d.defaclobjtype = 'f'
  and d.defaclrole = 'postgres'::regrole
order by 1, 2;
