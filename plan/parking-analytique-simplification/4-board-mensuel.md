# Étape 4 — Vue mensuelle : six cartes deviennent quatre

## Objectif

Même retrait que l'étape 3, appliqué au détail mensuel
`ParkingAnalytiqueMoisBoard.tsx`, et bornage de l'axe de la courbe à
`[0, 100]` — possible ici parce que le taux journalier est mathématiquement
plafonné.

## Contexte

La vue mensuelle affiche six cartes et un tableau de huit colonnes (Jour,
Occupation, Occupées, Gratuité, Arrivées, Départs, CA, Captage). Elle n'a **pas**
de colonne « Impayées » : l'impayé n'y figure que sous forme de carte.

Deux différences avec l'étape 3 méritent l'attention.

La première est la requête `['parking','arrivals-all']` (lignes 62-67). Les
deux agents d'exploration se contredisent sur son rôle : l'un l'a décrite comme
servant surtout l'impayé, l'autre affirme qu'elle alimente aussi `caByDate` et
le CA du mois (angle D5). **Lire le fichier avant de trancher.** En l'état des
rapports, la requête est conservée et seul le calcul `unpaid` qui en dérive
disparaît. Elle partage sa clé de cache avec la vue annuelle : la supprimer à
tort ferait perdre un cache déjà chaud.

La seconde est le `yDomain`. Contrairement à la vue annuelle, le taux
journalier vient d'un `count(distinct spot)` sur 14 places au maximum : il ne
peut pas dépasser 100 %. L'axe peut donc être fixé en dur sans risque de
tronquer une courbe, ce qui rend les douze mois comparables entre eux.

## Fichier(s) impacté(s)

- `src/components/parking/ParkingAnalytiqueMoisBoard.tsx` (modifié)

## Travail à réaliser

### 1. Supprimer la requête du captage

- `79-82` — la requête `['parking','hotel-month', year, month]` vers
  `fetchNuiteesByMonth`.
- `83` — `loading` redevient `loadingOcc` seul.
- `105-112` — le calcul `hotelRoomsByDay`.
- `21` — l'import de `fetchNuiteesByMonth`.

### 2. Retirer le captage du résumé et du tableau

- `131-141` et `150` — le calcul `avgCaptage`.
- `274-279` — la carte « Captage ».
- `324-329` — l'en-tête de colonne « Captage ».
- `336-338` — le calcul par ligne.
- `389-394` — la cellule de valeur.
- `24` — l'import de `captageIndex`.

### 3. Retirer les impayés, sans toucher à la requête partagée

- `121-125` — le calcul `const unpaid = monthArrivals.reduce(...)`.
- `147` — `unpaid` dans le retour de `summary`.
- `267-273` — la carte « Impayés ».
- `9` — l'import de `shareSub`.
- `62-67` — **conserver la requête** `['parking','arrivals-all']`, en
  corrigeant son commentaire de tête qui annonce aujourd'hui les impayés.
  Avant de la conserver ou de la supprimer, vérifier ligne à ligne que
  `monthArrivals` alimente encore `caByDate` et le CA du mois (angle D5). Si,
  contre toute attente, elle ne servait plus que l'impayé, la supprimer avec
  son `loading` associé.

### 4. Borner l'axe de la courbe

`167-172` — remplacer le calcul `occMax` par une borne fixe, et supprimer la
constante devenue inutile.

```tsx
// Le taux journalier vient d'un count(distinct spot) sur 14 places : il est
// borne a 100 % par construction. Axe fixe, pour que tous les mois se
// comparent a la meme echelle.
yDomain={[0, 100]}
```

Ligne 419 : `yDomain={[0, occMax]}` devient `yDomain={[0, 100]}`.

### 5. Recompter la grille

- `218-224` — `skeleton` : `cols: 7` devient `cols: 6`, `cards: 6` devient
  `cards: 4`, `cardCols: 6` devient `cardCols: 4`.
- `227` — `<AnalytiqueCardsGrid cols={6}>` devient `cols={4}`.
- `397-398` — le `colSpan={7}` de la ligne vide devient `colSpan={6}`.

## Ordre d'exécution

1. Lire les lignes 62-130 pour trancher l'angle D5 avant toute suppression.
2. Supprimer la requête, le calcul et l'affichage du captage.
3. Supprimer le calcul et l'affichage des impayés.
4. Fixer `yDomain={[0, 100]}` et supprimer `occMax`.
5. Recompter squelette, grille et `colSpan`.
6. Nettoyer les imports devenus morts.
7. `npx tsc --noEmit` et `pnpm lint`.
8. Commit.

## Critère de validation

- `grep -n "aptage\|mpay" src/components/parking/ParkingAnalytiqueMoisBoard.tsx`
  ne renvoie rien.
- `grep -n "hotel-month" src/components/parking/ParkingAnalytiqueMoisBoard.tsx`
  ne renvoie rien.
- `grep -n "arrivals-all" src/components/parking/ParkingAnalytiqueMoisBoard.tsx`
  renvoie toujours la requête, **et** le CA du mois affiché est identique à
  celui d'avant le chantier sur un mois de référence.
- Le tableau compte sept colonnes et `colSpan` vaut 6.
- `skeleton.cards`, `cardCols` et `AnalytiqueCardsGrid` valent 4 ;
  `skeleton.cols` vaut 6.
- La courbe d'occupation a un axe fixe de 0 à 100, sur un mois chargé comme
  sur un mois creux.
- `npx tsc --noEmit` et `pnpm lint` sans erreur.
