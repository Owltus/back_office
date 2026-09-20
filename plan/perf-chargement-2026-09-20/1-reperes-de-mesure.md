# Étape 1 — Repères de mesure avant/après

## Objectif

Poser un point zéro chiffré, côté navigateur et côté base, pour que chaque étape
suivante puisse être jugée sur pièces plutôt que sur impression.

## Contexte

Tout l'audit du 2026-09-20 côté front est **déduit** de la structure du code et du
build : aucun chronomètre n'a tourné dans un vrai navigateur. Côté base en
revanche, les chiffres sont réels mais **cumulés depuis le 2026-09-06**, donc
pollués par les périodes de famine.

La leçon écrite dans `CLAUDE.md` après l'audit du 2026-09-06 est explicite :
« Toujours re-mesurer par `explain analyze` avant d'optimiser sur des statistiques
cumulées. » Elle a déjà évité un chantier inutile (la colonne générée `code` sur
`pdj_breakfasts`, abandonnée parce que les 339 ms cumulés valaient 5,5 ms à froid).

Cette étape n'améliore rien. Elle rend le reste mesurable.

## Fichier(s) impacté(s)

- `supabase/verif_perf_2026-09-20.sql` (nouveau, **lecture seule**)
- `plan/perf-chargement-2026-09-20/releve-avant.md` (nouveau, relevé horodaté)

## Travail à réaliser

### 1. Script de repères base, en lecture seule

Il reprend les mesures qui ont servi au diagnostic, pour pouvoir les rejouer à
l'identique à l'étape 13.

```sql
-- verif_perf_2026-09-20.sql — repères de performance, LECTURE SEULE.
-- Symptôme : pages parfois très longues à charger, 2 utilisateurs maximum.
-- Cause : famine CPU (poller Realtime 71 %) + attentes en série côté client.
-- Innocuité : que des SELECT sur les catalogues et pg_stat_statements.

-- 1. Répartition du CPU par sous-système
select
  case
    when query like '%realtime.list_changes%' then 'realtime — poller WAL'
    when query like '%pg_publication%' or query like '%replication_slot%'
      then 'realtime — divers'
    when query like '%pg_timezone_names%' or query like '%base_types%'
      then 'postgrest — cache de schéma'
    when query like '%set_config%' then 'postgrest — préambule'
    else 'applicatif'
  end as sous_systeme,
  round(sum(total_exec_time)::numeric / 1000, 1) as cpu_s,
  round(100 * sum(total_exec_time) / sum(sum(total_exec_time)) over (), 1) as pct,
  sum(calls) as appels
from pg_stat_statements
group by 1 order by 2 desc;

-- 2. La signature de la famine : un appel purement mémoire doit être instantané
select calls, round(min_exec_time::numeric, 3) as min_ms,
       round(mean_exec_time::numeric, 2) as mean_ms,
       round(max_exec_time::numeric, 0) as max_ms,
       round(stddev_exec_time::numeric, 0) as stddev
from pg_stat_statements
where query like '%set_config%' order by calls desc limit 3;

-- 3. Top 20 par temps cumulé
select round(total_exec_time::numeric / 1000, 1) as total_s, calls,
       round(mean_exec_time::numeric, 1) as mean_ms,
       round(max_exec_time::numeric, 0) as max_ms, left(query, 110) as requete
from pg_stat_statements order by total_exec_time desc limit 20;

-- 4. Volumétrie (doit rester autour de 11 Mo)
select relname, n_live_tup,
       pg_size_pretty(pg_total_relation_size(c.oid)) as taille
from pg_stat_user_tables s join pg_class c on c.oid = s.relid
order by pg_total_relation_size(c.oid) desc limit 12;

-- 5. Les deux vues à surveiller, mesurées À FROID
explain (analyze, buffers)
  select * from pdj_daily_agg
  where service_date between current_date - 19 and current_date;

explain (analyze, buffers)
  select service_date from pdj_service_dates order by service_date desc;
```

### 2. Relevé navigateur

Sur le domaine de production, onglet **Réseau** ouvert, cache désactivé, et en
notant l'heure de chaque mesure (la famine est intermittente : une mesure isolée
ne vaut rien).

Trois scénarios, trois fois chacun, à des moments différents de la journée :

| Scénario | Ce qu'on note |
|---|---|
| Ouverture à froid sur la page d'accueil, **après plus d'une heure d'inactivité** | temps jusqu'au premier pixel, temps jusqu'au contenu, durée de `/auth/v1/token`, durée de `fonts.googleapis.com` |
| Navigation par clic (sans survol préalable) vers `/parking`, `/caisse`, `/facturation/galaxie` | délai entre le clic et le premier changement visible à l'écran |
| Rechargement immédiat de la même page | confirme ce qui vient du cache et ce qui repart sur le réseau |

Pour chaque scénario, relever aussi le nombre de requêtes et le total transféré.

### 3. Consigner

Écrire le tout dans `releve-avant.md` : date, heure, scénario, chiffres bruts. Pas
d'interprétation, des nombres.

## Ordre d'exécution

1. Écrire et commiter `supabase/verif_perf_2026-09-20.sql`.
2. `supabase db query --linked -f supabase/verif_perf_2026-09-20.sql`
3. Faire les trois scénarios navigateur, à deux moments de la journée au moins.
4. Écrire `releve-avant.md` et le commiter.

## Critère de validation

- Le script s'exécute sans erreur et ne contient que des `select` / `explain`.
- `releve-avant.md` contient au moins six mesures navigateur horodatées.
- Le `explain analyze` de `pdj_daily_agg` rend bien une ligne
  `Rows Removed by Filter` supérieure au nombre de lignes rendues — c'est la
  confirmation que le défaut de l'étape 12 est réel et pas un artefact.
