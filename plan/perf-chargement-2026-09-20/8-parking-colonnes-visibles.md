# Étape 8 — Parking : ne dessiner que les colonnes visibles

## Objectif

Faire passer le planning de **270 colonnes rendues et plus** à une trentaine, et
empêcher la page de ralentir à mesure que l'utilisateur la fait défiler.

## Contexte

`ParkingBoard.tsx:145-147` charge d'emblée `LOAD_PAST_DAYS = 90` et
`LOAD_FUTURE_DAYS = 180`, soit **270 jours**, extensibles par tranches de 120.

Le tableau `days` est ensuite parcouru **en entier trois fois dans le rendu**,
sans filtrage sur la fenêtre réellement visible :

| Ligne | Ce qui est rendu | Nombre |
|---|---|---|
| `:1690` | bordures de week-end | 270 itérations |
| `:1706` | en-tête des jours | **270 nœuds DOM**, plusieurs enfants chacun |
| `:1839` | colonnes critiques | 270 itérations |

Le contraste est parlant : **les réservations, elles, sont bien filtrées à la
fenêtre visible** (`:1861`). Le code sait faire ; il ne le fait que pour les
barres.

Conséquence directe : quand l'utilisateur fait défiler et déclenche l'extension de
la fenêtre, on passe à 390 colonnes, puis 510. **La page devient de plus en plus
lente au fil de la séance** — et redevient rapide au rechargement, ce qui est
exactement le genre de symptôme qui donne l'impression d'un problème serveur.

Second point : `dayInfo` (`:807`) est dans un `useMemo`, mais sa dépendance est
`reservations`. Il recalcule donc `O(270 × nombre de réservations)` **à chaque
modification**, c'est-à-dire à chaque glisser-déposer et à chaque édition.

## Fichier(s) impacté(s)

- `src/components/parking/ParkingBoard.tsx` (modifié)

## Travail à réaliser

### 1. Filtrer les trois parcours sur la fenêtre visible

La fenêtre visible est déjà connue du composant — c'est elle qui sert au filtrage
des réservations en `:1861`. Il s'agit d'appliquer le même découpage aux trois
autres parcours.

```tsx
// Les colonnes de jours étaient toutes rendues (270, puis 390, puis 510 au fil
// du défilement) alors que les barres de réservation étaient déjà filtrées à la
// fenêtre visible. On applique le même découpage.
const visibleDays = useMemo(
  () => days.slice(firstVisibleIndex, firstVisibleIndex + visibleCount),
  [days, firstVisibleIndex, visibleCount],
)
```

Puis remplacer `days.map` par `visibleDays.map` en `:1690`, `:1706` et `:1839`.

⚠ **Le décalage horizontal doit être préservé.** Si le planning se positionne par
la largeur cumulée des colonnes, retirer les colonnes de gauche décalera tout.
Deux solutions selon la mise en page réelle : soit une marge de remplissage à
gauche équivalente aux colonnes omises, soit un positionnement absolu déjà calculé
par index de jour — c'est à vérifier dans le code avant d'écrire la première ligne.
C'est le seul vrai risque de cette étape.

⚠ Garder une **marge de sécurité** de quelques jours de part et d'autre de la
fenêtre visible, sinon les colonnes apparaîtront visiblement pendant le
défilement.

### 2. Alléger `dayInfo`

Deux pistes, à choisir après relecture :

- restreindre le calcul aux jours visibles, si son résultat n'est consommé que
  pour l'affichage ;
- ou l'indexer par jour, pour qu'une modification de réservation ne recalcule que
  les jours concernés.

Si `dayInfo` sert à des totaux globaux, la première piste est fausse : vérifier
ses consommateurs avant de trancher.

### 3. Ne toucher à rien d'autre

`ParkingBoard` est le seul board dont l'affichage **n'est pas dérivé du cache** :
le canal temps réel patche l'état local ligne à ligne, et c'est délibéré — dériver
du cache effacerait les mises à jour optimistes encore en vol (glisser-déposer,
copie). C'est écrit dans `CLAUDE.md` et c'est un piège connu. **Ne pas « nettoyer »
cette partie.**

De même, la fenêtre de chargement arrondie au mois (`:169-175`, `snapRangeToMonths`)
est un acquis : la clé de cache doit rester stable d'un jour à l'autre.

## Ordre d'exécution

1. Relire la mise en page du planning pour comprendre comment les colonnes sont
   positionnées — c'est ce qui détermine la forme du correctif.
2. Introduire `visibleDays` et l'appliquer aux trois parcours.
3. Vérifier le décalage horizontal et le défilement.
4. Traiter `dayInfo` si ses consommateurs le permettent.
5. `npx tsc --noEmit`
6. `pnpm test`
7. `pnpm build`

## Critère de validation

- Le planning s'affiche **exactement** au même endroit qu'avant, aux mêmes dates,
  avec les mêmes réservations.
- Le défilement horizontal sur toute la plage reste fluide, sans colonne
  manquante ni apparition visible.
- Le glisser-déposer d'une réservation, la copie et l'annulation par
  <kbd>Ctrl</kbd>+<kbd>Z</kbd> fonctionnent comme avant — c'est le test qui prouve
  que les mises à jour optimistes n'ont pas été cassées.
- Le temps réel continue de refléter les changements d'un second onglet.
- Test décisif : faire défiler jusqu'à déclencher deux extensions de fenêtre
  (510 jours chargés), puis mesurer la réactivité d'une édition. Elle doit être
  identique à celle du premier chargement.
