# Étape 12 — Les deux défauts structurels des vues d'agrégation

## Objectif

Faire en sorte que `pdj_daily_agg` filtre **avant** d'agréger, et que les filtres
de date des vues analytiques puissent se servir des index.

## Contexte

Cette étape est la seule à toucher la **base de production**. Elle est marquée
critique à ce titre.

### Défaut 1 — `pdj_daily_agg` agrège toute l'histoire à chaque appel

Mesuré à froid par `explain (analyze, buffers)`, sur une fenêtre de 20 jours :

```
Sort (actual time=312.297..312.304 rows=65)
  -> Hash Full Join (actual time=311.643..312.246 rows=65)
       Filter: (COALESCE(pdj_breakfasts.service_date, pdj_addon_production.service_date)
                >= '2026-09-01' AND COALESCE(...) <= '2026-09-20')
       Rows Removed by Filter: 802
       -> HashAggregate (actual time=304.006..304.363 rows=829)
            -> Seq Scan on pdj_breakfasts (actual time=3.374..248.283 rows=13512)
Execution Time: 312.667 ms
```

`Rows Removed by Filter: 802` pour 65 lignes utiles : le filtre s'applique **après**
l'agrégat. La cause est le `FULL JOIN` combiné au `COALESCE(c.service_date,
r.service_date)` — cette expression n'est pas poussable, donc Postgres agrège les
13 512 lignes, produit 867 groupes, puis en jette 802.

Second point dans le même plan : le `Seq Scan` met **248 ms** pour 510 blocs tous
en mémoire. La même table scannée par `pdj_service_dates` met **2,6 ms** pour les
mêmes 510 blocs. La différence tient aux cinq `upper()` + `LIKE '%…%'` de la clause
`CASE`, évalués sur chaque ligne — environ 70 000 opérations de texte, entièrement
liées au processeur, sur un cœur affamé.

⚠ **Distinction capitale.** `pdj_service_dates` affiche 1 053 ms de moyenne
cumulée dans `pg_stat_statements` et **4,8 ms à froid** : pour celle-là, le
coupable n'est pas la requête, c'est la famine. La leçon du 2026-09-06 s'applique.
`pdj_daily_agg`, elle, a un défaut **réel et reproductible** : c'est la seule des
deux à réécrire. Ne pas « optimiser » `pdj_service_dates` en se fiant aux
statistiques cumulées — ce serait exactement l'erreur que la leçon interdit.

### Défaut 2 — les dates castées en texte ne sont plus indexables

`rapro_daily_agg` expose `r.report_date::text AS report_date`. PostgREST envoie
donc un filtre **sur du texte**, qui ne peut pas borner un index sur une colonne
`date` :

```
Index Scan using rapro_rooms_report_date_room_key on rapro_rooms r
  Filter: (status = ANY (...) AND (report_date)::text >= '2026-09-01' ...)
  Rows Removed by Filter: 2902
Execution Time: 61.559 ms
```

L'index est parcouru en entier (3 898 lignes) pour en garder 996. Même schéma dans
`parking_arrivals_agg` (`start_date::text`) et `parking_daily_occupation`
(`day::text`).

`parking_daily_occupation` mesure 8,8 ms et n'est pas un problème en soi ; la
correction vaut surtout pour la cohérence et pour l'avenir.

## Fichier(s) impacté(s)

- `supabase/pdj_daily_agg_pushdown_2026-09-20.sql` (nouveau)
- `supabase/vues_dates_typees_2026-09-20.sql` (nouveau)
- `supabase/pdj_daily_agg.sql` et ses deux compléments du 2026-09-12 (modifiés :
  en-tête « REMPLACÉ — NE PLUS REJOUER »)
- `supabase/rapro_daily_agg.sql`, `supabase/parking_analytics_agg.sql` (modifiés :
  même en-tête)
- Côté application, si le type rendu change : `src/lib/rapro/service.ts`,
  `src/lib/parking/service.ts` (à vérifier, pas à présumer)

## Travail à réaliser

### 1. `pdj_daily_agg` — rendre le filtre poussable

Trois voies, à départager par `explain analyze` et non par conviction :

**Voie A — remplacer le `FULL JOIN` par un socle de dates filtrable.** Construire
la liste des dates depuis `pdj_breakfasts` et `pdj_addon_production`, la filtrer,
puis joindre les agrégats dessus. La clé de groupement devient une colonne réelle,
donc poussable.

**Voie B — précalculer le `CASE`/`upper()` en colonne générée sur
`pdj_breakfasts`, avec index.** Supprime les 70 000 opérations de texte. ⚠ Cette
voie a **déjà été abandonnée** le 2026-09-06 après mesure : les 285-339 ms
attribués à l'époque valaient 5,5 ms à froid. Aujourd'hui les 248 ms **sont**
mesurés à froid, donc la situation a changé — mais c'est exactement le genre de
chantier qu'il faut re-mesurer avant d'entreprendre, pas ressusciter par principe.

**Voie C — vue matérialisée.** ⚠ **Écartée d'avance** : elle contournerait la RLS
et c'est une régression de sécurité. Elle avait déjà été refusée pour cette raison
le 2026-09-05. Ne pas la reproposer.

La voie A est la seule qui traite la cause. Commencer par elle.

### 2. Les casts `::text`

Retirer les `::text` des trois vues et rendre les colonnes de date en type `date`.

⚠ **C'est un changement de contrat d'API.** PostgREST rendra `"2026-09-20"` dans
les deux cas — le JSON est identique — mais il faut le **vérifier**, pas le
supposer, et contrôler que les filtres envoyés par l'application restent valides.
Relire les appelants dans `lib/rapro/service.ts` et `lib/parking/service.ts` avant
d'appliquer.

### 3. Discipline d'application

La règle du projet, sans exception :

1. Écrire le fichier SQL sous `supabase/`, avec l'en-tête habituel (symptôme,
   cause, correctif, innocuité, vérification).
2. **Le commiter.**
3. L'essayer en `begin … rollback` et lire le résultat.
4. Puis seulement l'appliquer par
   `supabase db query --linked -f supabase/<fichier>.sql`.
5. Marquer les anciens fichiers « REMPLACÉ — NE PLUS REJOUER », sous peine de
   revert silencieux — le projet s'est déjà fait mordre deux fois par un fichier
   rejoué qui rouvrait des policies.

`create or replace view` n'est pas destructif. Si une vue doit être **supprimée
puis recréée** (changement de type de colonne), c'est une opération destructrice
au sens de `CLAUDE.md` : **demander confirmation explicite avant**, et vérifier
qu'aucune policy ni aucune autre vue n'en dépend.

## Ordre d'exécution

1. Écrire `pdj_daily_agg_pushdown_2026-09-20.sql`, voie A.
2. Essai en `begin … rollback` + `explain analyze` sur la nouvelle définition.
3. Comparer **ligne à ligne** l'ancienne et la nouvelle vue sur trois mois
   différents : les résultats doivent être identiques.
4. Commiter, puis appliquer.
5. Même cycle pour `vues_dates_typees_2026-09-20.sql`.
6. Vérifier les appelants applicatifs, `npx tsc --noEmit`, `pnpm test`.
7. Rejouer `supabase/verif_perf_2026-09-20.sql` et consigner les nouveaux plans.

## Critère de validation

- `explain analyze` sur `pdj_daily_agg` pour un mois : **`Rows Removed by Filter`
  est nul ou négligeable**, et le temps d'exécution est très inférieur à 312 ms.
- Les valeurs rendues par la vue sont **identiques à l'ancienne** sur trois mois
  testés — requête de comparaison à l'appui, pas à l'œil.
- `explain analyze` sur `rapro_daily_agg` : le filtre de date apparaît comme
  **condition d'index** et non comme `Filter`, et `Rows Removed by Filter` chute.
- Les pages `/pdj`, `/pdj/analytique`, `/rapro/analytique`, `/parking/analytique`
  affichent exactement les mêmes chiffres qu'avant.
- Les anciens fichiers SQL portent l'en-tête « REMPLACÉ — NE PLUS REJOUER ».

## Contrôle qualité (revue)

`/borg` n'étant pas installé, revue manuelle ciblée après exécution :

1. **Aucune policy RLS n'a été modifiée ni supprimée** par le remplacement des
   vues : contrôler `pg_policies` avant/après sur `pdj_breakfasts`,
   `pdj_addon_production`, `rapro_rooms`, `parking_reservations`.
2. **Les vues restent en `security_invoker`** — c'est ce qui fait qu'elles
   respectent la RLS de l'appelant. Une vue recréée sans cette option deviendrait
   une fuite de données.
3. **`pdj_daily_agg` reste fermée à `anon`** (acquis du 2026-09-06). Vérifier les
   `grant` après recréation.
4. **Aucune dépendance cassée** : contrôler qu'aucune autre vue, fonction ou
   policy ne référençait les colonnes dont le type change.
5. Relire que le fichier appliqué est **exactement** celui qui a été commité.
