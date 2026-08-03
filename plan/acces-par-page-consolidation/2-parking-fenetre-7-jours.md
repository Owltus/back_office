# Étape 2 — Parking : fenêtre d'édition de 7 jours (client)

## Objectif

Appliquer la décision utilisateur au parking, côté client : un utilisateur
`ecriture` peut créer/modifier/déplacer/supprimer les réservations **en cours,
futures, et terminées depuis ≤ 7 jours** ; les réservations **terminées depuis
> 7 jours** ne sont modifiables qu'en `gestion`.

## Contexte

`ParkingBoard.tsx` centralise déjà tout le mutant sur un seul booléen
`canEdit = can('parking','ecriture')` (l.182), propagé à `ReservationBar` et à
chaque handler (`if (!canEdit) return`). Le niveau `gestion` n'est pas consommé.
On ajoute un second axe, **temporel**, par réservation.

Règle (D-borne-parking) : une résa est « d'actualité » tant que sa **date de fin
de séjour** `start_date + nights` est `≥ aujourd'hui − 7 j`. Cela couvre nativement
le cas « résa longue commencée il y a plus de 7 j mais toujours en cours » (sa fin
est dans le futur → éditable en écriture).

## Fichier(s) impacté(s)

- `src/lib/parking/editability.ts` (nouveau — logique pure, testable)
- `src/lib/parking/editability.test.ts` (nouveau — tests unitaires)
- `src/components/parking/ParkingBoard.tsx` (modifié — `canManage` + verrou par résa)
- `src/components/parking/ParkingHelpPanel.tsx` (modifié — mention de la règle)

## Travail à réaliser

### 1. Logique pure d'éditabilité

```ts
// src/lib/parking/editability.ts
import { PARKING_GRACE_DAYS } from '#/lib/permissions/actions.ts'
import type { PageLevel } from '#/lib/permissions/levels.ts'
import { atLeastLevel } from '#/lib/permissions/levels.ts'
import type { DbReservation } from '#/lib/parking/service.ts'

/** Une résa est « d'actualité » si sa fin de séjour n'est pas antérieure de plus
 *  de PARKING_GRACE_DAYS jours à aujourd'hui. `today` et les dates sont des
 *  chaînes 'YYYY-MM-DD' (comparaison lexicographique sûre). */
export function isReservationCurrent(res: Pick<DbReservation, 'start_date' | 'nights'>, today: string): boolean {
  const end = addDays(res.start_date, res.nights)          // checkout (exclusif)
  const floor = addDays(today, -PARKING_GRACE_DAYS)
  return end >= floor
}

/** Niveau requis satisfait pour modifier cette résa. gestion => toujours vrai. */
export function canEditReservation(res: Pick<DbReservation, 'start_date' | 'nights'>, today: string, level: PageLevel | null): boolean {
  if (!level) return false
  if (atLeastLevel(level, 'gestion')) return true
  if (!atLeastLevel(level, 'ecriture')) return false
  return isReservationCurrent(res, today)
}

/** Créer sur une date passée > grâce exige gestion. */
export function canCreateOn(day: string, today: string, level: PageLevel | null): boolean {
  if (!level) return false
  if (atLeastLevel(level, 'gestion')) return true
  if (!atLeastLevel(level, 'ecriture')) return false
  return day >= addDays(today, -PARKING_GRACE_DAYS)
}
```

`addDays` : réutiliser l'utilitaire de dates existant (`lib/shared/dates` ou
`lib/parking/*`), ne pas réintroduire de `new Date()` fragile.

### 2. Câblage board

```tsx
// ParkingBoard.tsx
const canEdit = can('parking', 'ecriture')          // existant
const canManage = can('parking', 'gestion')          // nouveau
const level = pageLevel('parking')                    // pour les helpers
const today = businessDateStr()                       // date métier déjà utilisée
```

- Chaque handler mutant sur une résa existante (`rename`, `startInteraction` move/
  resize, `setStatus`, `saveComment`, `copyReservation`, `remove`) garde son
  `if (!canEdit) return` **et** ajoute un test par résa :
  `if (!canEditReservation(res, today, level)) return`.
- `addReservation` / `pasteReservation` : garder `canEdit` **et** tester
  `canCreateOn(targetDay, today, level)`.
- `ReservationBar` reçoit une prop `locked` (= `!canEditReservation(...)`) : quand
  `canEdit` mais `locked`, désactiver poignées de resize, `onPointerDown` (move),
  double-clic (rename) et griser le menu contextuel avec un tooltip « Réservation
  passée — réservée à la gestion ». Réutiliser le motif tooltip déjà présent
  (l.1406-1413) pour le cas `!canEdit`.

### 3. Aide

Ajouter dans `ParkingHelpPanel` une ligne : « Écriture : réservations en cours,
futures et terminées depuis moins de 7 jours. Gestion : réservations plus
anciennes. » (visible seulement si `canEdit`).

## Ordre d'exécution

1. `editability.ts` + tests (rouge → vert).
2. Câbler `canManage` / `level` / `today` dans `ParkingBoard`.
3. Verrouiller chaque handler + prop `locked` de `ReservationBar`.
4. Mettre à jour l'aide.

## Critère de validation

- `npx vitest run src/lib/parking/editability.test.ts` — cas : futur, en cours,
  fin il y a 6 j (éditable écriture), fin il y a 8 j (verrou, gestion OK),
  création date passée.
- En écriture : impossible de bouger/supprimer une résa terminée depuis > 7 j
  (poignées absentes, menu grisé) ; possible en gestion.
- `npx tsc --noEmit` + `pnpm build` OK.
- La RLS (étape 3) est le vrai rempart : ne pas livrer en prod sans elle.
