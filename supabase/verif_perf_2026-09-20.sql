-- verif_perf_2026-09-20.sql — repères de performance, LECTURE SEULE.
--
-- Symptôme : pages parfois très longues à charger, alors que l'app n'a jamais
--   plus de 2 utilisateurs simultanés et que la base pèse 11 Mo.
-- Cause diagnostiquée le 2026-09-20 : famine CPU de l'instance Micro, dont
--   71,2 % est consommé par le poller WAL de Realtime, auquel s'ajoutent des
--   attentes en série côté client.
-- Innocuité : que des SELECT sur les catalogues, pg_stat_statements et les vues
--   applicatives, plus deux EXPLAIN. Aucune écriture, aucun DDL.
-- Usage : à rejouer à l'identique en fin de chantier (étape 13) pour comparer.
--   Les mesures doivent être prises AUX MÊMES HEURES : la famine est
--   intermittente, une mesure isolée ne démontre rien.

select
  stats_reset,
  now() - stats_reset as fenetre
from pg_stat_statements_info;

select
  case
    when query like '%realtime.list_changes%' then 'realtime — poller WAL'
    when query like '%pg_publication%'
      or query like '%replication_slot%'
      or query like '%realtime.subscription%' then 'realtime — divers'
    when query like '%pg_timezone_names%'
      or query like '%base_types%' then 'postgrest — cache de schéma'
    when query like '%set_config%' then 'postgrest — préambule'
    else 'applicatif et autre'
  end as sous_systeme,
  round((sum(total_exec_time) / 1000)::numeric, 1) as cpu_s,
  round((100 * sum(total_exec_time) / sum(sum(total_exec_time)) over ())::numeric, 1) as pct,
  sum(calls) as appels
from pg_stat_statements
group by 1
order by 2 desc;

-- set_config() ne lit aucune donnée et ne rend aucune ligne. Un écart entre
-- min_ms et mean_ms signe une contention CPU au niveau de l instance, pas un
-- problème SQL. Repère du 2026-09-20 : min 0,00 / mean 5,13 / max 1 211.
select
  calls,
  round(min_exec_time::numeric, 3) as min_ms,
  round(mean_exec_time::numeric, 2) as mean_ms,
  round(max_exec_time::numeric, 0) as max_ms,
  round(stddev_exec_time::numeric, 0) as stddev
from pg_stat_statements
where query like '%set_config%'
order by calls desc
limit 3;

select
  round((total_exec_time / 1000)::numeric, 1) as total_s,
  calls,
  round(mean_exec_time::numeric, 1) as mean_ms,
  round(max_exec_time::numeric, 0) as max_ms,
  left(regexp_replace(query, '\s+', ' ', 'g'), 110) as requete
from pg_stat_statements
order by total_exec_time desc
limit 20;

select pubname, schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;

select
  s.relname,
  s.n_live_tup,
  pg_size_pretty(pg_total_relation_size(c.oid)) as taille
from pg_stat_user_tables s
join pg_class c on c.oid = s.relid
order by pg_total_relation_size(c.oid) desc
limit 12;

-- Défaut du 2026-09-20 : le FULL JOIN + COALESCE empêchent le pushdown, donc
-- la vue agrège toute l histoire puis jette le reste.
-- Repère AVANT : 312 ms, « Rows Removed by Filter: 802 » pour 65 lignes utiles.
-- Attendu APRÈS l étape 12 : Rows Removed négligeable, temps < 50 ms.
explain (analyze, buffers)
select * from public.pdj_daily_agg
where service_date between (current_date - 19) and current_date;

-- Repère du 2026-09-20 : 4,8 ms à froid, contre 1 053 ms de moyenne cumulée.
-- L écart de 200x mesure la famine, pas la requête. Ne PAS « optimiser » cette
-- vue sur la foi des statistiques cumulées : c est l erreur que la leçon du
-- 2026-09-06 interdit explicitement.
explain (analyze, buffers)
select service_date from public.pdj_service_dates
order by service_date desc;

-- Défaut du 2026-09-20 : la vue expose report_date::text, donc le filtre porte
-- sur du texte et ne peut pas borner l index sur une colonne date.
-- Repère AVANT : 61,5 ms, « Rows Removed by Filter: 2902 » pour 996 lignes.
explain (analyze, buffers)
select * from public.rapro_daily_agg
where report_date between '2026-09-01' and '2026-09-20';
