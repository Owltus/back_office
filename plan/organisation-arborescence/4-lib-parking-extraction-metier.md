# Étape 4 — lib/parking : extraction du métier

## Objectif

Créer `src/lib/parking/` et y sortir le modèle métier du planning (types, constantes de configuration, slots demi-journées, détection de chevauchement, données de démonstration), en laissant dans `ParkingBoard.tsx` le rendu, l'interaction pointeur et les constantes de layout en pixels. Pas de création de `parkingStore` (arbitrage D5 : reporté).

## Fichier(s) impacté(s)

- `src/lib/parking/model.ts` (nouveau)
- `src/lib/parking/mock.ts` (nouveau)
- `src/components/parking/ParkingBoard.tsx` (modification : imports, suppression du code déplacé)

## Travail à réaliser

### 1. Créer `src/lib/parking/model.ts`

Y déplacer, sans modification de logique :

- les types `Status`, `Reservation`, `Mode` (`ParkingBoard.tsx:78-90`) ;
- les constantes métier : `SPOTS`, `FIRST_STAFF_SPOT`, `SPOTS_LIST`, `SLOTS_PER_DAY` (`:66-76`, partie métier uniquement) ;
- `arrivalSlot` / `departureSlot` (`:115-117`) ;
- `hasOverlap` refactorée en fonction pure `hasOverlap(reservations: Reservation[], candidate: …): boolean` (dé-clôturée de l'état du composant, `:227-243`).

Conformément à l'arbitrage D8, la map `STATUS` (labels + classes Tailwind) et `STATUS_ORDER` restent dans le composant (présentation), de même que les constantes de layout en pixels (`MIN_DAY_W`, `ROW_H`, `HEADER_H`, `LABEL_W`, `STEP`, `BAR_PAD_X/Y`) et les formatters `Intl` d'affichage.

### 2. Créer `src/lib/parking/mock.ts`

Y déplacer le jeu de données `INITIAL` (`:127-133`), typé `Reservation[]`, importé par le composant tant que la feature n'est pas branchée sur une vraie source de données.

### 3. Alléger `ParkingBoard.tsx`

Basculer sur les imports `#/lib/parking/model.ts` et `#/lib/parking/mock.ts` ; adapter les appels à `hasOverlap` (passage explicite de la liste).

## Ordre d'exécution

1. Créer `model.ts` puis `mock.ts`.
2. Basculer `ParkingBoard.tsx` sur les imports et adapter `hasOverlap`.
3. Typecheck et test manuel du drag/resize.

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- Sur `/parking` : création, déplacement, redimensionnement et refus de chevauchement identiques à avant (test manuel).
- `ParkingBoard.tsx` ne contient plus ni types métier, ni `hasOverlap`, ni données `INITIAL`.
