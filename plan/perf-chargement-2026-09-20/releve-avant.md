# Relevé de référence — avant travaux

Mesures prises le **2026-09-20**, avant toute modification, sur la base de
production et sur le build de `main` à `876ec8d`.

Fenêtre de `pg_stat_statements` : remise à zéro le 2026-09-06, soit environ
14 jours d'observation.

---

## 1. Répartition du processeur de la base

| Sous-système | CPU | Part | Appels |
|---|---:|---:|---:|
| Realtime — poller WAL | 5 874,9 s | **71,1 %** | 1 006 056 |
| Applicatif et autre | 1 409,9 s | 17,1 % | 83 923 |
| PostgREST — cache de schéma | 543,9 s | 6,6 % | 1 444 |
| Realtime — divers | 326,6 s | 4,0 % | 20 389 |
| PostgREST — préambule | 103,4 s | 1,3 % | 17 881 |

Le poller tourne à **0,85 appel par seconde en continu**, indépendamment du
nombre d'utilisateurs connectés.

## 2. Signature de la famine processeur

`set_config()` ne lit aucune donnée, ne rend aucune ligne, et ne touche pas le
disque. Sa durée ne devrait pas dépasser quelques centièmes de milliseconde.

| Appels | min | moyenne | max | écart-type |
|---:|---:|---:|---:|---:|
| 14 319 | **0,019 ms** | **5,13 ms** | **1 211 ms** | 26 |
| 2 698 | 0,021 ms | 1,85 ms | 153 ms | 5 |

Un facteur **270 entre le minimum et la moyenne**, et **63 000 entre le minimum
et le maximum**, sur un appel purement mémoire. C'est une contention au niveau de
l'instance, pas un problème SQL.

## 3. Tables publiées en temps réel

`baby_cot_assignments`, `parking_reservations`, `pdj_breakfasts`.

## 4. `pdj_daily_agg` — un mois, mesuré à froid

```
Hash Full Join  (actual time=336.333..336.953 rows=65 loops=1)
  Filter: (COALESCE(pdj_breakfasts.service_date, pdj_addon_production.service_date) <= CURRENT_DATE
           AND COALESCE(...) >= (CURRENT_DATE - 19))
  Rows Removed by Filter: 802
  ->  HashAggregate  (actual time=331.759..332.091 rows=829 loops=1)
        ->  Seq Scan on pdj_breakfasts  (actual time=2.612..276.432 rows=13512 loops=1)
              Buffers: shared hit=510
Execution Time: 337.329 ms
```

**802 lignes agrégées puis jetées pour 65 lignes utiles.** Le filtre s'applique
après l'agrégat : le `FULL JOIN` combiné au `COALESCE` empêche le pushdown du
prédicat. Le `Seq Scan` met **276 ms pour 510 blocs tous en mémoire**, à cause des
cinq `upper()` + `LIKE` de la clause `CASE` évalués sur chacune des 13 512 lignes.

Défaut **structurel et reproductible**. Cible de l'étape 12.

## 5. `pdj_service_dates` — témoin

```
Sort  (actual time=5.493..5.509 rows=249 loops=1)
  ->  HashAggregate  (actual time=5.014..5.048 rows=249 loops=1)
        ->  Seq Scan on pdj_breakfasts  (actual time=0.026..2.787 rows=13512 loops=1)
Execution Time: 5.684 ms
```

**5,68 ms à froid** contre 1 053 ms de moyenne cumulée dans `pg_stat_statements` :
un écart de **185**. Cette vue n'a aucun défaut — l'écart mesure la famine. C'est
le témoin qui interdit d'optimiser sur des statistiques cumulées.

## 6. `rapro_daily_agg` — un mois, mesuré à froid

```
Index Scan using rapro_rooms_report_date_room_key on rapro_rooms r
  Filter: (status = ANY (...) AND (report_date)::text >= '2026-09-01'::text
           AND (report_date)::text <= '2026-09-20'::text)
  Rows Removed by Filter: 2902
Execution Time: 43.235 ms
```

**2 902 lignes parcourues et jetées pour 996 gardées.** La vue expose
`report_date::text` : le filtre porte sur du texte et ne peut pas borner l'index
sur une colonne `date`. Cible de l'étape 12.

## 7. Poids du JavaScript

Build `pnpm build`, tailles brutes et `gzip -9` (majorant : Vercel sert en brotli,
compter 15 à 20 % de moins). 152 fichiers JS, 6,54 Mo bruts au total.

**Coût plancher du shell — payé par n'importe quelle page :**

| Fichier | Brut | Gzip |
|---|---:|---:|
| `index-*.js` | 442 144 | 137 643 |
| `utils-*.js` (Supabase) | 245 873 | 65 109 |
| `styles-*.css` | 141 689 | 22 867 |
| `schemas-*.js` (zod) | 53 002 | 14 200 |
| 14 autres | 94 887 | 37 819 |
| **Total, 18 fichiers** | **977 595** | **277 638** |

**Les deux poids morts du chemin critique :**

| Fichier | Brut | Gzip | Chargé |
|---|---:|---:|---|
| `galaxie-*.js` (echarts inclus) | 504 582 | 168 469 | statiquement, à l'ouverture de `/facturation/galaxie` |
| `ChartTooltip-*.js` (recharts) | 345 540 | 100 765 | statiquement, à l'ouverture des **11** pages analytique |

Pour mémoire, correctement chargés à la demande et donc hors du chemin critique :
`three.module` 724 467, `extract` (pdf.js) 431 719, `stamp` (pdf-lib) 422 174,
`jspdf.es.min` 399 697, `html2canvas` 199 577, `cannon-es` 122 684.

---

## 8. Ce qui manque à ce relevé

Les mesures navigateur (temps jusqu'au premier pixel, durée de
`/auth/v1/token`, délai entre un clic et le premier changement visible) **n'ont
pas été prises** : elles demandent une session ouverte sur le domaine de
production. Elles restent à faire selon le protocole de l'étape 1, et l'étape 13
devra les recueillir dans les mêmes conditions.

Les chiffres de temps de démarrage cités dans l'index (1 RTT normal, jusqu'à ~40 s
dégradé, ~87 s sur une requête en panne) sont **déduits du code** d'`auth-js` et
de `lib/query.ts`, pas chronométrés.
