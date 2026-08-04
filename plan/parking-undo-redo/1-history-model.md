# Étape 1 — Modèle de commandes pur + tests

## Objectif

Poser le cœur métier de l'undo/redo : un type de commande décrivant une action
annulable, et la fonction `invert` qui en calcule l'inverse. Pur (sans React,
sans Supabase), donc testable seul.

## Contexte

Une commande décrit MON action déjà appliquée. Trois formes suffisent à couvrir
toutes les mutations du board (cf. inventaire dans
[3-refactor-apply-primitives.md](./3-refactor-apply-primitives.md)) :

- `create` : j'ai créé une réservation (nouvelle ou collée).
- `delete` : j'ai supprimé une réservation.
- `update` : j'ai modifié des champs (place, jour, durée, nom, statut,
  commentaire). Le patch est **limité aux champs touchés** — c'est la clé de la
  sécurité collaborative : l'undo ne réécrit pas les champs qu'un collègue aurait
  changés entre-temps.

Le modèle raisonne en termes du domaine d'affichage (`Reservation`, avec
`startDay` relatif au lundi de référence), pas de la ligne base (`start_date`
absolu). La conversion se fait au moment de la persistance, dans le board
(`startDayToDate`), comme le reste du code.

## Fichier(s) impacté(s)

- `src/lib/parking/history.ts` (nouveau : modèle de commandes + `invert`)
- `src/lib/parking/history.test.ts` (nouveau : tests de `invert`)

## Travail à réaliser

### 1. Type `ParkingCommand` et `invert`

```ts
import type { Reservation } from '#/lib/parking/model.ts'

// Patch limité aux champs modifiables d'une réservation (tout sauf l'id).
export type ReservationPatch = Partial<Omit<Reservation, 'id'>>

// Une action annulable, telle qu'elle a DÉJÀ été appliquée par le board.
// `update` ne porte que les champs touchés (before/after), jamais l'objet entier :
// c'est ce qui préserve le travail concurrent d'un collègue sur les autres champs.
export type ParkingCommand =
  | { kind: 'create'; snapshot: Reservation }
  | { kind: 'delete'; snapshot: Reservation }
  | { kind: 'update'; id: string; before: ReservationPatch; after: ReservationPatch }

// Commande inverse (appliquée par l'undo). Le redo ré-applique la commande
// d'origine : invert(invert(c)) === c.
export function invert(cmd: ParkingCommand): ParkingCommand {
  switch (cmd.kind) {
    case 'create':
      return { kind: 'delete', snapshot: cmd.snapshot }
    case 'delete':
      return { kind: 'create', snapshot: cmd.snapshot }
    case 'update':
      return { kind: 'update', id: cmd.id, before: cmd.after, after: cmd.before }
  }
}
```

### 2. Tests `history.test.ts`

Couvrir, selon les conventions Vitest du repo (`describe`/`it` en français,
imports `#/…` avec extension) :

- `invert(create)` renvoie un `delete` portant le même `snapshot`.
- `invert(delete)` renvoie un `create` portant le même `snapshot`.
- `invert(update)` échange `before` et `after`, garde le même `id`.
- involution : `invert(invert(cmd))` est égal à `cmd` (les trois formes).

```ts
import { describe, expect, it } from 'vitest'

import { invert } from '#/lib/parking/history.ts'
import type { ParkingCommand } from '#/lib/parking/history.ts'
import type { Reservation } from '#/lib/parking/model.ts'

const RES: Reservation = {
  id: 'r1', client: 'Dupont', spot: 3, startDay: 2,
  nights: 2, status: 'reserve', comment: '',
}
// … describe('invert — inverse d'une commande', () => { … })
```

## Ordre d'exécution

1. Créer `src/lib/parking/history.ts` (type + `invert`).
2. Créer `src/lib/parking/history.test.ts`.
3. `npm test` (doit passer).
4. `npx tsc --noEmit`.

## Critère de validation

- `npm test` : les tests de `invert` passent (dont l'involution).
- `npx tsc --noEmit` propre.
- `pnpm lint` propre sur les deux fichiers.
- Aucune dépendance React/Supabase importée dans `history.ts` (métier pur).
- Aucune écriture Supabase introduite.
