# Étape 1 — Occupation sur les 14 places

## Objectif

Faire calculer le taux d'occupation du parking sur les 14 places réellement
disponibles au lieu des 12 places « client », pour que le taux ne dépasse plus
100 %, sans modifier la valeur de `CLIENT_SPOTS` ni toucher au planning.

## Contexte

Le numérateur compte déjà les 14 places : la vue `parking_daily_occupation`
renvoie `occupied` comme un `count(distinct spot)` sur toutes les places non
`employe`, et `parking_arrivals_agg` renvoie `nights` sur les mêmes places. Le
dépassement de 100 % vient uniquement du dénominateur, fixé à
`CLIENT_SPOTS = 12` en deux endroits de `src/lib/parking/analytics.ts`.

La tentation est de changer `CLIENT_SPOTS` de 12 à 14 dans
`src/lib/parking/model.ts:28`. Il ne faut pas. Cette constante porte un sens
métier — les places 1 à 12 sont vendables au client, 13 et 14 sont un tampon
personnel — et elle sert de dénominateur au captage
(`analytics.ts:67`), lui-même consommé par la bande de synthèse RepJour. La
changer modifierait silencieusement un chiffre de RepJour que ce chantier ne
vise pas.

La valeur 14 existe déjà sous le nom `SPOTS` (`model.ts:8`), aujourd'hui
utilisée pour la géométrie de la grille du planning et le PDF. Sa réutilisation
comme dénominateur métier est correcte, mais mérite un commentaire explicite :
c'est bien « toutes les places » et non « les places vendables ».

Le planning `/parking` n'importe pas `CLIENT_SPOTS` : il recalcule localement
`const clientSpots = FIRST_STAFF_SPOT - 1` (`ParkingBoard.tsx:808`). Il est
donc immunisé contre cette étape, et conserve sa zone critique rouge au-delà
de 12 places occupées. Cette divergence est assumée (angle D2).

## Fichier(s) impacté(s)

- `src/lib/parking/analytics.ts` (modifié : deux dénominateurs, trois blocs de documentation)
- `src/lib/parking/model.ts` (modifié : commentaire de `CLIENT_SPOTS` uniquement, valeur inchangée)

## Travail à réaliser

### 1. Le dénominateur mensuel (vue annuelle)

`analytics.ts:171-174`, dans `aggregateParkingMonthly` : la capacité du mois
passe de 12 places à `SPOTS`.

```ts
// Capacité du mois : 14 places (toutes les places, tampon 13/14 compris),
// multipliées par le nombre de jours. Le numérateur compte lui aussi toutes
// les places : le taux est donc homogene et ne depasse plus 100 %, sauf effet
// de l'imputation au mois d'arrivee documentee plus bas.
const capacity = SPOTS * daysInMonth(year, i + 1)
```

Ajuster l'import de tête de fichier : `SPOTS` vient de `#/lib/parking/model.ts`.
`CLIENT_SPOTS` reste importée tant que `captageIndex` existe (angle D1,
option A) — ne pas la retirer de l'import à cette étape.

### 2. Le dénominateur journalier (vue mensuelle)

`analytics.ts:231`, dans `aggregateParkingDaily` :

```ts
occupancy: (occupied / SPOTS) * 100,
```

Ce calcul-ci est strictement borné : `occupied` vient d'un `count(distinct spot)`
sur 14 places au maximum, donc le rapport ne peut pas dépasser 1.

### 3. La documentation du module

Trois blocs de commentaire décrivent l'ancienne règle et deviennent faux.

- `analytics.ts:28-32` — le bloc d'en-tête qui explique « numérateur toutes
  places, dénominateur 12 places client, dépassement assumé ». Le réécrire :
  numérateur et dénominateur portent désormais sur les mêmes 14 places.
- `analytics.ts:81-91` — la documentation du champ `occupancyRate`, qui
  mentionne « 12 places × jours du mois » et « peut dépasser 100 % ». Corriger
  le dénominateur, et **conserver** la mention du dépassement résiduel en la
  rattachant à sa vraie cause : l'imputation des nuits au mois d'arrivée
  (lignes 85-89), pas le dénominateur.
- `analytics.ts:192-194` — la documentation du champ `occupancy`, qui
  mentionne « occupied / 12 places CLIENT ». Corriger, et préciser que ce
  taux-ci est borné à 100 %.

### 4. Le commentaire de CLIENT_SPOTS

`model.ts:26-28` annonce aujourd'hui que `CLIENT_SPOTS` est « le dénominateur
du taux d'occupation » et que remplir le tampon pousse le taux au-dessus de
100 %. C'est devenu faux pour l'analytique. Réécrire le commentaire pour dire
ce que la constante est réellement : la frontière entre places vendables et
places tampon, utilisée par le captage et par la logique de zone critique du
planning. **Ne pas modifier la valeur** (`FIRST_STAFF_SPOT - 1`, soit 12).

## Ordre d'exécution

1. Corriger l'import et les deux dénominateurs dans `analytics.ts`.
2. Réécrire les trois blocs de documentation de `analytics.ts`.
3. Réécrire le commentaire de `CLIENT_SPOTS` dans `model.ts`.
4. `npx tsc --noEmit` — doit passer. Les tests échoueront à cette étape :
   c'est attendu, ils sont réalignés à l'étape 6.
5. Commit.

## Critère de validation

- `grep -n "CLIENT_SPOTS" src/lib/parking/analytics.ts` ne renvoie plus que
  l'import et la ligne 67 (`captageIndex`) — plus aucune occurrence dans
  `aggregateParkingMonthly` ni `aggregateParkingDaily`.
- `src/lib/parking/model.ts` contient toujours `CLIENT_SPOTS` avec la valeur
  12 : `grep -n "FIRST_STAFF_SPOT - 1" src/lib/parking/model.ts` renvoie une
  ligne.
- `npx tsc --noEmit` sans erreur.
- Aucun fichier de `src/components/parking/ParkingBoard.tsx` n'apparaît dans
  `git diff --name-only`.
- Vérification arithmétique à la main : un jour à 13 places occupées donne
  92,9 % (13 / 14) et non 108,3 % (13 / 12).
