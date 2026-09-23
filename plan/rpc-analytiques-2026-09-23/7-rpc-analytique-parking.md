# Étape 7 — RPC analytique parking et bornage des arrivées

## Objectif

Supprimer les deux seules lectures « tout l'historique » de la couche parking,
et aligner les deux pages sur le patron RPC du chantier.

⚠ **Le bornage est le vrai sujet ; la RPC est de l'uniformité.** Les analytiques
parking ne font que 1 à 2 lectures : j'ai argumenté qu'une RPC n'y était pas
rentable, l'utilisateur a tranché pour l'homogénéité (décision du 2026-09-23).
Si le temps manque, **borner sans créer la RPC suffit** à capter tout le gain
réel de cette étape.

## Contexte

`fetchParkingArrivals` (`service.ts:157-174`) lit la vue `parking_arrivals_agg`
**sans aucune borne de date**, par pages de 1 000, et ses deux appelants en
font des usages très étroits :

| appelant | ce qu'il lit | ce dont il a besoin |
|---|---|---|
| `ParkingAnalytiqueBoard.tsx:46-54` | tout l'historique | l'année sélectionnée **+** la liste des années distinctes |
| `ParkingAnalytiqueMoisBoard.tsx:60-63` | tout l'historique | `free` et `ca_ht` du **mois affiché** (28-31 valeurs) |

Une ligne par jour d'arrivée, croissance linéaire d'environ 365 par an. Le
commentaire `ParkingAnalytiqueBoard.tsx:49-53` parle de « quelques centaines de
lignes » — **non vérifié**, à mesurer avant d'agir (point 1).

Les deux autres vues de la couche, `parking_daily_occupation` et
`rapro_daily_agg`, sont **déjà bornées par date chez tous leurs lecteurs** :
rien à y faire.

### Ce qui est hors de cause

Le canal Realtime `parking-reservations` (`ParkingBoard.tsx:532-535`) est le
**seul survivant** de la réduction du 2026-09-20. Cette étape ne touche ni la
table, ni la publication, ni le canal.

⚠ Ce canal **n'invalide jamais** `['parking','arrivals-all']` : les analytiques
parking sont déjà potentiellement périmées après une modification faite par un
collègue. Ce n'est **pas** une régression à créer, c'est un état existant — mais
l'étape 2 allonge le `staleTime` du lecteur mensuel de 60 s à 10 min, ce qui
l'aggrave légèrement. À accepter sciemment, ou à compenser par une invalidation
ciblée depuis le miroir Realtime.

## Fichier(s) impacté(s)

- `supabase/parking_arrivals_bornage_2026-09-XX.sql` (nouveau, si option B)
- `src/lib/parking/service.ts` (modifié : `fetchParkingArrivals` borné)
- `src/components/parking/ParkingAnalytiqueBoard.tsx` (modifié)
- `src/components/parking/ParkingAnalytiqueMoisBoard.tsx` (modifié)

## Travail à réaliser

### 1. Mesurer avant de décider

Compter les lignes de `parking_arrivals_agg` et mesurer un
`explain (analyze, buffers)` **à froid** de la lecture non bornée. Si la vue
fait quelques centaines de lignes et répond en dizaines de millisecondes,
**cette étape ne vaut pas d'être faite maintenant** — elle devient une note dans
« Différé ». La règle du projet est explicite : re-mesurer avant d'optimiser sur
des statistiques cumulées.

Mesurer aussi le coût de `parking_daily_occupation` : sa `spine` fait un
`generate_series` sur **toute** la table avant que le filtre PostgREST ne
s'applique. Sur une petite table c'est indolore ; c'est une **hypothèse, pas une
mesure**.

### 2. Borner — le gain réel de l’étape

`fetchParkingArrivals(from?, to?)` accepte déjà des bornes optionnelles, comme
`fetchReservations`. Il suffit que les deux appelants les passent :

- board mensuel : les bornes du mois affiché ;
- board annuel : les bornes de l'année **plus** une seconde lecture légère pour
  la liste des années (`select distinct` sur l'année, ou un `min`/`max`).

⚠ La liste des années est indispensable : `useAnnualYear` recale sur
`years.at(-1)` si l'année courante disparaît. Une lecture qui ne renverrait que
l'année demandée **casserait le sélecteur**.

Aucune modification en base. C'est le changement le plus petit.

### 3. Les deux RPC (uniformité)

- `public.parking_analytique_annuelle(p_annee int, p_aujourdhui date)`
  vers `{ annees, mois[12] }`
- `public.parking_analytique_mensuelle(p_annee int, p_mois int, p_aujourdhui date)`
  vers `{ jours, arriveesDuMois }`

Renvoyer `annees` **dans** la réponse supprime la seconde lecture évoquée au
point 2 et casse la dépendance du sélecteur.

Cas limites à reproduire, qui ne sont pas cosmétiques :

- **Toujours 12 mois** en annuel, **toujours N jours** en mensuel, trous
  compris. Les jours absents de la vue sont complétés à zéro.
- `occupancyRate = nights / (SPOTS × joursDuMois) × 100` avec **`SPOTS = 14`,
  toutes places** (personnel 13/14 compris). Dénominateur nul donne **0**, pas
  `NaN`.
- ⚠ **Ce taux peut dépasser 100 %** : les nuits d'un séjour sont imputées en
  entier au mois d'arrivée. C'est pourquoi le maximum de l'axe est dynamique
  (`ParkingAnalytiqueBoard.tsx:107-110`). Ne pas « corriger » en bornant à 100.
- `summary` : moyennes calculées sur les **mois ACTIFS** (`reservations > 0`),
  pas sur 12 ; `avgOccupancy` est la **moyenne arithmétique des taux mensuels**,
  pas un taux annuel pondéré.
- `chartData` : `occ = null` (pas 0) quand le mois n'a aucune réservation —
  trou dans la courbe, **distinct d'un vrai zéro**.
- Le CA est imputé au **jour d'arrivée**, jamais réparti sur le séjour.
- `hasData = occupied > 0` : un jour à zéro occupé mais avec des arrivées
  affiche des tirets sur six colonnes.
- Moyennes « par jour » du mensuel divisées par **tous les jours du mois**, y
  compris futurs et vides — contrairement à rapro qui divise par les jours
  actifs. **Divergence délibérée entre les deux onglets**, à préserver.
- `yearsFromParkingDates` : années distinctes **union annéeCourante**, tri
  croissant.

⚠ Les clés doivent rester sous `['parking', …]`.

### 4. Ce qu'il ne faut PAS faire

- **Ne pas** toucher à `parking_daily_occupation` ni à `rapro_daily_agg` : déjà
  bornées chez tous leurs lecteurs.
- **Ne pas** modifier la vue `parking_arrivals_agg` elle-même. Une redéfinition
  de vue qui change un type de colonne impose un `drop view` — opération
  destructrice, confirmation explicite requise. Le commentaire
  `parking_analytics_agg.sql:129-134` rappelle d'ailleurs que `occupied_free` a
  dû être ajoutée **en dernier** pour cette raison.
- **Ne pas** supposer que `parking_analytics_agg.sql` a été rejoué en
  production. Les `?? 0` sur `free` et `ca_ht` (`analytics.ts:117-120`)
  suggèrent qu'à l'écriture du code ce n'était pas garanti. **Vérifier en base
  avant d'écrire du SQL.**

## Ordre d'exécution

1. Vérifier en base que `parking_analytics_agg.sql` a bien été rejoué et que
   les colonnes attendues existent (point 4).
2. Compter les lignes, mesurer à froid (point 1).
3. Borner les deux lectures (point 2) — c'est le gain réel, il est acquis ici.
4. Écrire et commiter le SQL des deux RPC, l'essayer en `rollback`, l'appliquer.
5. Prouver l'équivalence sur toutes les années et tous les mois.
6. Réécrire les deux boards.
7. `npx tsc --noEmit` + `npx vitest run` + `pnpm build`.

## Critère de validation

- Écarts SQL contre TS à **zéro** sur toutes les années et tous les mois.
- Aucune lecture de `parking_arrivals_agg` sans borne de date dans le code.
- Un mois dont le taux dépasse 100 % s'affiche **toujours** au-dessus de 100.
- Le sélecteur d'années fonctionne toujours, y compris sur une année sans
  réservation.
- Les chiffres des deux pages parking sont identiques avant/après, vérifiés sur
  un mois complet et un mois partiel.
- Le canal Realtime du planning parking fonctionne toujours (test à deux
  onglets).

## Contrôle qualité (revue)

Étape critique (création d'objets en base, canal Realtime à proximité). `/borg`
n'étant pas installé, revue manuelle : (1) confirmer par requête que la vue
déployée en production a bien les colonnes que le code attend (`free`,
`free_nights`, `ca_ht`, `ca_ttc`, `occupied_free`) ; (2) vérifier qu'aucun
`drop view` n'a été écrit ; (3) tester le planning parking à deux onglets pour
confirmer que le canal Realtime est intact ; (4) confirmer que la liste des
années reste complète sur une base où l'année courante n'a aucune réservation.
