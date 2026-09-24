-- ============================================================================
-- DIAGNOSTIC DE PANNE — À JOUER EN PREMIER, AVANT TOUT REDÉMARRAGE
-- ============================================================================
--
-- SYMPTÔME visé : l'application ne répond plus, les requêtes expirent, le
-- dashboard affiche « Database not usable » ou « reachable but not serving
-- queries ».
--
-- CAUSE de l'existence de ce fichier : le 2026-09-24, le projet a été
-- redémarré AVANT qu'aucun relevé n'ait été pris. Le redémarrage relance
-- Postgres, donc remet à zéro `pg_stat_database`, `pg_stat_statements` et
-- `pg_stat_activity`. La base inspectée ensuite était fraîche — 100 % de
-- cache, zéro verrou — et rigoureusement inexploitable pour comprendre la
-- panne. La cause première n'a jamais pu être établie.
--   Post-mortem : `plan/panne-supabase-2026-09-24/00-INDEX.md`.
--
-- INNOCUITÉ : LECTURE SEULE INTÉGRALE. Aucun `update`, aucun `delete`, aucun
-- DDL, aucun `pg_terminate_backend`. Ne peut rien casser, même sur une base
-- en souffrance.
--
-- UTILISATION :
--   supabase db query --linked -f supabase/diagnostic_panne.sql
--
-- ⚠ PIÈGE VÉRIFIÉ LE 2026-09-24 : `db query -f` n'affiche que le résultat de
-- la DERNIÈRE requête du fichier. Les six autres s'exécutent mais leur sortie
-- est perdue. En situation réelle, jouer les blocs UN PAR UN (copier-coller
-- le bloc voulu derrière `db query --linked "…"`, sur une seule ligne — les
-- retours à la ligne font échouer l'appel), ou coller le fichier entier dans
-- le SQL Editor du dashboard, qui rend tous les résultats.
--
-- ⚠ Si le CLI échoue sur « Failed to create login role », ce n'est PAS une
-- preuve que la base est morte : c'est l'API de gestion qui n'arrive pas à
-- ouvrir sa session. Réessayer, puis passer par le SQL Editor du dashboard,
-- qui emprunte un autre chemin.
--
-- ⚠ Ces vues sont servies DEPUIS LA MÉMOIRE. Une base qui n'arrive plus à
-- lire ses tables a donc de bonnes chances de répondre ici quand même. Il
-- faut essayer.
-- ============================================================================


-- 1. QUI OCCUPE LA BASE, ET DEPUIS QUAND ------------------------------------
-- `wait_event_type` est la colonne qui tranche : `IO` = on attend le disque
-- (budget d'E/S épuisé), `Lock` = on attend un verrou, `Client` = on attend
-- l'application. Une transaction ouverte depuis des minutes bloque le vacuum
-- et retient le WAL.
select
  pid,
  usename                                                    as role,
  application_name                                           as appli,
  state,
  round(extract(epoch from (now() - xact_start)))::int        as transaction_s,
  round(extract(epoch from (now() - query_start)))::int       as requete_s,
  wait_event_type,
  wait_event,
  left(query, 200)                                           as requete
from pg_stat_activity
where pid <> pg_backend_pid()
order by xact_start nulls last;


-- 2. QUI BLOQUE QUI ----------------------------------------------------------
-- Vide = aucun verrou en cause, la piste est ailleurs. C'est une information
-- aussi utile que son contraire.
select
  pid,
  pg_blocking_pids(pid)  as bloque_par,
  usename                as role,
  left(query, 150)       as requete
from pg_stat_activity
where cardinality(pg_blocking_pids(pid)) > 0;


-- 3. CE QUI COÛTE LE PLUS ----------------------------------------------------
-- ⚠ `pg_stat_statements` N'ENREGISTRE PAS les requêtes refusées en permission
-- (démontré par témoin le 2026-09-23). Les pings de préchauffage, qui se font
-- refuser, sont donc INVISIBLES ici : leur absence ne prouve rien.
-- Signature d'une base affamée (et non d'une requête lente) : `ecart_ms` ≥
-- `moy_ms`, un minimum sous la milliseconde, et un maximum qui plafonne au
-- même endroit sur des familles de requêtes indépendantes.
select
  calls                          as appels,
  round(total_exec_time)::int    as total_ms,
  round(mean_exec_time)::int     as moy_ms,
  round(min_exec_time)::int      as min_ms,
  round(max_exec_time)::int      as max_ms,
  round(stddev_exec_time)::int   as ecart_ms,
  left(query, 150)               as requete
from pg_stat_statements
order by total_exec_time desc
limit 15;


-- 4. DISQUE CONTRE CACHE, ET TRACES DE SOUFFRANCE ----------------------------
-- `pct_cache` très en dessous de 99 % sur cette base (27 Mo, qui tient
-- entièrement en mémoire) signale que le cache a été vidé ou qu'on lit
-- vraiment le disque. `temp_files > 0` signale des tris qui débordent.
-- `stats_reset` dit depuis quand ces compteurs courent : s'il est récent,
-- la base a redémarré et les preuves sont déjà perdues.
select
  blks_read                                                        as blocs_disque,
  blks_hit                                                         as blocs_cache,
  round(100.0 * blks_hit / nullif(blks_hit + blks_read, 0), 2)     as pct_cache,
  temp_files                                                       as fichiers_temp,
  pg_size_pretty(temp_bytes)                                       as octets_temp,
  deadlocks                                                        as verrous_mortels,
  xact_commit                                                      as commits,
  xact_rollback                                                    as rollbacks,
  stats_reset                                                      as compteurs_depuis,
  pg_postmaster_start_time()                                       as postgres_demarre
from pg_stat_database
where datname = current_database();


-- 5. SLOTS DE RÉPLICATION ----------------------------------------------------
-- Un slot inactif ou très en retard retient le WAL indéfiniment et peut finir
-- par remplir le disque. `wal_status` : `reserved` = sain, `extended` =
-- au-delà de la réserve, `lost` = WAL déjà supprimé, le slot est mort.
select
  slot_name,
  plugin,
  active,
  wal_status,
  pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) as wal_retenu,
  pg_size_pretty(safe_wal_size)                                     as marge
from pg_replication_slots
order by pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) desc;


-- 6. VOLUME DU WAL SUR DISQUE ------------------------------------------------
select
  (select count(*)             from pg_ls_waldir()) as fichiers_wal,
  (select pg_size_pretty(sum(size)) from pg_ls_waldir()) as wal_total,
  pg_size_pretty(pg_database_size(current_database()))   as taille_base;


-- 7. TABLES LES PLUS GONFLÉES ------------------------------------------------
-- Un fort taux de lignes mortes ralentit toute lecture de la table. Regarder
-- `last_autovacuum` : s'il est ancien alors que `mortes` est élevé, c'est que
-- l'autovacuum n'arrive plus à passer (souvent à cause d'une transaction
-- ouverte de longue date — cf. requête 1).
select
  schemaname || '.' || relname                                     as table_,
  n_live_tup                                                       as vivantes,
  n_dead_tup                                                       as mortes,
  case when n_live_tup > 0
       then round(100.0 * n_dead_tup / n_live_tup) end             as pct_mortes,
  last_autovacuum,
  last_autoanalyze
from pg_stat_all_tables
where schemaname in ('public', 'auth', 'storage', 'realtime')
  and n_dead_tup > 0
order by n_dead_tup desc
limit 15;
