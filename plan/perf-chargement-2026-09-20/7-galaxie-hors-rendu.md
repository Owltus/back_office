# Étape 7 — Sortir la simulation de la galaxie du fil d'exécution de la page

## Objectif

Supprimer le gel du navigateur à l'ouverture de `/facturation/galaxie`.

## Contexte

`src/lib/facturation/galaxy.ts:108` fixe `iters: 400`, et `:230-232` fait une
double boucle sur les nœuds actifs. Le coût est donc **400 × N²/2** calculs de
distance, avec racines carrées et trigonométrie. Pour 200 nœuds actifs, cela fait
environ **8 millions d'opérations**.

Le problème n'est pas le nombre en soi : c'est qu'il est exécuté **de façon
synchrone dans un `useMemo` du rendu** (`FacturationGalaxie.tsx:32`). Pendant tout
ce temps, le fil d'exécution unique du navigateur est bloqué : rien ne s'affiche,
rien ne répond, le curseur ne change même pas. C'est plusieurs centaines de
millisecondes, jusqu'à plus d'une seconde. Et cela s'ajoute aux 504 Ko d'echarts à
analyser, ce qui fait de cette page la plus lourde du projet à tous points de vue.

Le nombre réel de nœuds en production n'est pas connu — il dépend des données. Le
coût étant **quadratique**, il faut le mesurer avant de choisir la solution :
200 nœuds et 600 nœuds ne demandent pas le même remède.

## Fichier(s) impacté(s)

- `src/lib/facturation/galaxy.ts` (modifié)
- `src/lib/facturation/galaxyWorker.ts` (nouveau)
- `src/components/facturation/FacturationGalaxie.tsx` (modifié)

## Travail à réaliser

### 1. Mesurer d'abord

Avant d'écrire quoi que ce soit, instrumenter temporairement le `useMemo` de
`FacturationGalaxie.tsx:32` pour relever, sur les vraies données :

- le nombre de nœuds actifs `N` ;
- la durée réelle de la simulation.

C'est la règle du projet : ne pas optimiser sans mesure. Le résultat oriente la
suite.

### 2. Trois remèdes, par ordre de préférence

**Voie A — déporter dans un Web Worker (recommandée si N est grand).**
La simulation est un calcul pur sur des tableaux de nombres : elle se déporte bien.
Le composant affiche la galaxie en disposition initiale, ou un squelette, et la
remplace quand le worker rend le résultat.

```ts
// galaxyWorker.ts — la simulation est en O(N²) × 400 : exécutée dans le rendu,
// elle gelait le navigateur plusieurs centaines de ms. Elle tourne désormais à
// côté, et la page reste vivante pendant ce temps.
```

La CSP autorise déjà les workers (`worker-src 'self' blob:` dans `vercel.json`) :
rien à changer de ce côté.

**Voie B — découper en tranches avec `useDeferredValue` / `startTransition`.**
Moins de travail, garde tout sur le fil principal mais rend la main entre deux
paquets d'itérations. Suffisant si la mesure montre 200-300 ms.

**Voie C — réduire le coût algorithmique.** Deux leviers indépendants :
- baisser `iters` (400 est-il nécessaire ? le rendu converge peut-être à 150) ;
- remplacer la double boucle par un découpage spatial en grille, qui ramène le
  coût de O(N²) à ~O(N).

La voie C se combine avec A ou B et vaut d'être regardée : diviser `iters` par
deux divise le coût par deux, pour une ligne modifiée.

### 3. Garder le résultat visuellement identique

La disposition de la galaxie est une signature visuelle que l'utilisateur connaît.
Si la voie C change `iters`, **comparer deux captures avant/après sur le même jeu
de données** avant de valider. Une convergence plus courte donne une galaxie plus
resserrée : c'est peut-être acceptable, c'est peut-être non — c'est un choix
d'affichage, pas un choix technique.

## Ordre d'exécution

1. Instrumenter et mesurer `N` et la durée réelle.
2. Choisir la voie en fonction de la mesure, et l'écrire dans ce fichier.
3. Implémenter.
4. Comparer deux captures de la galaxie, avant et après.
5. `npx tsc --noEmit`
6. `pnpm test`
7. `pnpm build`

## Critère de validation

- La durée mesurée au point 1 est consignée dans ce fichier, avant et après.
- À l'ouverture de `/facturation/galaxie`, **la page reste réactive** : le
  défilement répond, les onglets du navigateur aussi.
- La galaxie affichée est visuellement équivalente à celle d'avant — captures à
  l'appui si `iters` a changé.
- Voie A : l'onglet Performance du navigateur ne montre plus de tâche longue de
  plus de 50 ms sur le fil principal au montage de la page.
