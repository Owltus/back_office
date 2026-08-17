# Étape 7 — Grille des chambres (literie synthétique)

## Objectif

Afficher la grille des 80 chambres par étage (statut literie synthétique
oui/non) et permettre d'installer/retirer la literie synthétique d'une
chambre, avec répercussion immédiate sur le stock (RPC `literie_record_
movement`, étape 2). À l'issue, la grille reflète et modifie l'état réel.

## Fichier(s) impacté(s)

- `src/lib/literie/types.ts` (nouveau)
- `src/lib/literie/model.ts` (nouveau)
- `src/lib/literie/service.ts` (nouveau)
- `src/components/literie/LiterieBoard.tsx` (nouveau)

## Travail à réaliser

### 1. Modèle et types

```ts
// types.ts
export interface DbHotelRoom {
  room: number
  literie_synthetique: boolean
  updated_at: string
}
export interface RoomBedding {
  room: number
  synthetic: boolean
}
```

```ts
// model.ts — grille par étage, réutilise la source canonique
import { ALL_ROOMS, floorOf } from '#/lib/hotel/rooms.ts'
export const FLOORS = /* regroupement de ALL_ROOMS par floorOf, cf. lib/rapro/rooms.ts */
```

### 2. Accès Supabase

```ts
// service.ts
export async function fetchRooms(): Promise<DbHotelRoom[]> { /* select * from hotel_rooms */ }
export async function toggleBedding(
  room: number, synthetic: boolean,
): Promise<void> {
  // update hotel_rooms set literie_synthetique = synthetic where room = ...
  // PUIS appel RPC literie_record_movement(room, item, direction) pour CHAQUE
  // item concerné (oreiller + couette), direction déduite du sens du bascule
}
```

### 3. Composant grille

`LiterieBoard.tsx` : `useQuery(['literie','rooms'])` + grille façon
`RaproBoard`/`FLOORS` (cartes par étage, pastille par chambre), pastille
cliquable togglant `literie_synthetique` (avec confirmation légère si le
stock est insuffisant, cf. étape 8 pour l'affichage du compteur). Pas de
notion de « jour » sur cette action — c'est un état permanent, modifiable à
tout moment tant que `can('literie','ecriture')`.

## Ordre d'exécution

1. `types.ts` → `model.ts` → `service.ts` → `LiterieBoard.tsx`.
2. Brancher le bouton de la route `/literie` (étape 6) sur le composant fini.

## Critère de validation

- `npx tsc --noEmit` et `npx vitest run src/lib/literie` (tests du modèle
  pur) sans erreur.
- Bascule d'une chambre en synthétique décrémente bien le stock affiché
  (vérifier avec `select * from literie_stock` après action).
- Un compte en lecture seule sur `literie` voit la grille sans pouvoir
  basculer une chambre (RLS + garde front cohérentes).
