# Étape 3 — Vue annuelle : six cartes deviennent quatre

## Objectif

Retirer les cartes « Captage » et « Impayés », les deux colonnes
correspondantes du tableau, et la requête réseau qui n'existait que pour le
captage, dans `ParkingAnalytiqueBoard.tsx`.

## Contexte

La vue annuelle affiche six cartes (Réservations, TO moyen, Nuits totales, CA
Parking, Impayés, Captage) et un tableau de dix colonnes, plus une courbe
d'occupation mensuelle.

Le captage y coûte une requête entière : `['parking','hotel-year', year]` vers
`fetchYearAnalytics` (`ParkingAnalytiqueBoard.tsx:67-73`) ne sert qu'à produire
le dénominateur hôtelier. Elle disparaît avec la carte, ainsi que le
`loadingHotel` qui retardait l'affichage de toute la page.

Le piège de cette étape n'est pas la suppression elle-même, mais la
**comptabilité de la grille**. Trois compteurs doivent rester cohérents entre
eux, sinon le squelette de chargement n'a pas la forme du contenu et la page
saute au montage :

- `skeleton={{ cols, charts, rows, cards, cardCols }}` (ligne 208)
- `<AnalytiqueCardsGrid cols={...}>` (ligne 211)
- le nombre réel de `<th>` du tableau, et le `<td>` de la branche « mois vide »

Le `cols` du squelette compte les colonnes **après la première** : un tableau
de dix colonnes se déclare `cols: 9`.

## Fichier(s) impacté(s)

- `src/components/parking/ParkingAnalytiqueBoard.tsx` (modifié)

## Travail à réaliser

### 1. Supprimer la requête du captage

- `67-73` — la requête `['parking','hotel-year', year]` et son `fetchYearAnalytics`.
- `74` — `loading` redevient `loadingRes` seul.
- `81-86` — le calcul `hotelNuiteesByMonth`.
- `21` (ou voisin) — l'import de `fetchYearAnalytics`.

### 2. Retirer le captage du résumé et du tableau

- `93-103` et `112` — le calcul `avgCaptage` dans `summary`.
- `262-267` — la carte « Captage ».
- `320-325` — l'en-tête de colonne « Captage ».
- `332-333` — le calcul `captage` par ligne.
- `401-406` — la cellule de valeur.
- `431-433` — la cellule « — » correspondante dans la branche mois vide.
- `23` — l'import de `captageIndex`.

### 3. Retirer les impayés

- `107` — `totalUnpaid` dans `summary`.
- `251-261` — la carte « Impayés ».
- `308-313` — l'en-tête de colonne « Impayées ».
- `389-394` — la cellule de valeur.
- `428-430` — la cellule « — » de la branche mois vide.
- `9` — l'import de `shareSub`, qui n'a plus d'appelant dans ce fichier.

### 4. Borner l'axe de la courbe

`133-138` — le calcul `occMax`. Conformément à l'angle D3 (option A), **le
garder** sur cette vue, en corrigeant son commentaire : il ne parle plus des
places tampon mais de l'imputation des nuits au mois d'arrivée, seule cause
résiduelle de dépassement.

```ts
// Plafond de l'axe : 100 % dans la quasi-totalite des cas depuis que le taux
// se calcule sur les 14 places. Le calcul reste dynamique parce qu'un mois
// peut encore deborder : les nuits d'un sejour sont imputees en entier a son
// mois d'arrivee (voir analytics.ts). Mieux vaut un axe qui s'etire qu'une
// courbe tronquee en silence.
```

### 5. Recompter la grille

- `208` — `skeleton` : `cols: 9` devient `cols: 7`, `cards: 6` devient
  `cards: 4`, `cardCols: 6` devient `cardCols: 4`.
- `211` — `<AnalytiqueCardsGrid cols={6}>` devient `cols={4}`.
- `408-434` — la branche « mois vide » doit compter huit cellules, pas dix.

`cardsGridClass` (`AnalytiqueCards.tsx:18-24`) gère la valeur 4 par sa branche
par défaut : rien à modifier dans le socle partagé.

## Ordre d'exécution

1. Supprimer la requête, le calcul et l'affichage du captage.
2. Supprimer le calcul et l'affichage des impayés.
3. Corriger le commentaire de `occMax`.
4. Recompter le squelette, la grille de cartes et la branche « mois vide ».
5. Nettoyer les imports devenus morts (`captageIndex`, `shareSub`,
   `fetchYearAnalytics`, et `ACCENT.pink` / `ACCENT.red` s'ils n'ont plus
   d'usage **dans ce fichier**).
6. `npx tsc --noEmit` et `pnpm lint`.
7. Commit.

## Critère de validation

- `grep -n "aptage\|mpay" src/components/parking/ParkingAnalytiqueBoard.tsx`
  ne renvoie rien.
- `grep -n "hotel-year" src/components/parking/ParkingAnalytiqueBoard.tsx`
  ne renvoie rien.
- Le tableau compte exactement huit colonnes, et la branche « mois vide » en
  compte autant : le décompte des `<th>` et des `<td>` de cette branche est
  identique.
- `skeleton.cards`, `cardCols` et l'argument de `AnalytiqueCardsGrid` valent
  tous les trois 4 ; `skeleton.cols` vaut 7.
- `npx tsc --noEmit` et `pnpm lint` sans erreur ni avertissement d'import
  inutilisé.
- À l'écran : quatre cartes sur une ligne, aucun saut de mise en page entre le
  squelette et le contenu.
