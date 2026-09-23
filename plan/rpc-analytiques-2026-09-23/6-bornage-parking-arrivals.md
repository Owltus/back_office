# Étape 6 — Bornage de `parking_arrivals_agg`

## Objectif

Supprimer les deux seules lectures « tout l'historique » de la couche parking,
sans créer de RPC : les analytiques parking sont déjà sobres, elles n'ont besoin
que d'un filtre.

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

### 2. Option A — borner côté client (recommandée si la mesure le justifie)

`fetchParkingArrivals(from?, to?)` accepte déjà des bornes optionnelles, comme
`fetchReservations`. Il suffit que les deux appelants les passent :

- board mensuel : les bornes du mois affiché ;
- board annuel : les bornes de l'année **plus** une seconde lecture légère pour
  la liste des années (`select distinct` sur l'année, ou un `min`/`max`).

⚠ La liste des années est indispensable : `useAnnualYear` recale sur
`years.at(-1)` si l'année courante disparaît. Une lecture qui ne renverrait que
l'année demandée **casserait le sélecteur**.

Aucune modification en base. C'est le changement le plus petit.

### 3. Option B — une fonction bornée en base

`public.parking_arrivals(p_from date, p_to date)` renvoyant les lignes **et** la
liste des années en un `jsonb`. Supprime la seconde lecture de l'option A.
Justifiée seulement si la mesure du point 1 montre un coût réel.

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

1. Compter les lignes, mesurer à froid (point 1).
2. Si le coût est négligeable : classer l'étape en « Différé » et s'arrêter là.
3. Sinon, appliquer l'option A ; l'option B seulement si A ne suffit pas.
4. `npx tsc --noEmit` + `npx vitest run` + `pnpm build`.

## Critère de validation

- Aucune lecture de `parking_arrivals_agg` sans borne de date dans le code.
- Le sélecteur d'années fonctionne toujours, y compris sur une année sans
  réservation.
- Les chiffres des deux pages parking sont identiques avant/après, vérifiés sur
  un mois complet et un mois partiel.
- Le canal Realtime du planning parking fonctionne toujours (test à deux
  onglets).

## Contrôle qualité (revue)

Étape critique si l'option B est retenue (création d'objet en base). `/borg`
n'étant pas installé, revue manuelle : (1) confirmer par requête que la vue
déployée en production a bien les colonnes que le code attend (`free`,
`free_nights`, `ca_ht`, `ca_ttc`, `occupied_free`) ; (2) vérifier qu'aucun
`drop view` n'a été écrit ; (3) tester le planning parking à deux onglets pour
confirmer que le canal Realtime est intact ; (4) confirmer que la liste des
années reste complète sur une base où l'année courante n'a aucune réservation.
