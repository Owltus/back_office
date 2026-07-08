# Étape 1 — Métier pur : inventaire chambres + navigation par jour

## Objectif

Fournir, en logique pure (sans React ni Supabase), les deux briques réutilisées par tout le reste : l'**inventaire étages → chambres** (pour dessiner la grille) et les **helpers de date par jour** (pour la navigation temporelle et ses bornes). Ces modules sont testables isolément.

## Contexte

Le modèle chambres existe déjà dans `src/lib/pdj/csv.ts` : la constante `ALL_ROOMS` (80 chambres) et le helper `range` (`src/lib/utils.ts`). L'étage n'est pas un champ stocké : il se dérive par `Math.floor(room / 100)` (centaine = étage), comme le fait `BreakfastBoard` (`src/components/pdj/BreakfastBoard.tsx`, `useMemo` `floors`). On veut réutiliser cette même source pour ne pas diverger.

Les helpers de date pur existent aussi côté caisse (`src/lib/caisse/shift.ts` : `dateStr`, `addDays`). On en a besoin d'une version **sans notion de shift** : la clé de comparaison d'un jour est directement la chaîne `'YYYY-MM-DD'`, déjà comparable lexicalement comme chronologiquement (pas de `slotKey`).

Décision D3 (où vit l'inventaire) : ce fichier suppose l'**Option A** — un module partagé `src/lib/hotel/rooms.ts` d'où pdj et rapro tirent `ALL_ROOMS`. Si D3 = B, `rapro/rooms.ts` importe directement depuis `#/lib/pdj/csv.ts` ; si D3 = C, il re-déclare une constante locale. Adapter uniquement l'origine de `ALL_ROOMS`, le reste est identique.

## Fichier(s) impacté(s)

- `src/lib/hotel/rooms.ts` (nouveau, si D3=A)
- `src/lib/rapro/rooms.ts` (nouveau)
- `src/lib/rapro/day.ts` (nouveau)
- `src/lib/rapro/day.test.ts` (nouveau, optionnel)
- `src/lib/pdj/csv.ts` (modifié, si D3=A : ré-exporter `ALL_ROOMS` depuis `hotel/rooms.ts` pour ne pas dupliquer)

## Travail à réaliser

### 1. Inventaire partagé (si D3=A) — `src/lib/hotel/rooms.ts`

Déplacer ici la source de vérité chambres, puis la ré-exporter depuis pdj pour compat.

```ts
import { range } from '#/lib/utils.ts'

/** Toutes les chambres de l'hôtel (80), numéro = centaine d'étage. */
export const ALL_ROOMS = [
  ...range(102, 114), // étage 1 (13)
  ...range(201, 214), // étage 2 (14)
  ...range(301, 314), // étage 3 (14)
  ...range(401, 414), // étage 4 (14)
  ...range(501, 514), // étage 5 (14)
  ...range(621, 631), // étage 6 (11)
]

/** Étage d'une chambre (centaine). */
export const floorOf = (room: number) => Math.floor(room / 100)
```

Dans `src/lib/pdj/csv.ts`, remplacer la définition littérale de `ALL_ROOMS` par `export { ALL_ROOMS } from '#/lib/hotel/rooms.ts'` (les imports existants `#/lib/pdj/csv.ts` continuent de fonctionner).

### 2. Inventaire rapro — `src/lib/rapro/rooms.ts`

Exposer la grille prête à afficher : liste d'étages, chacun avec ses numéros de chambre.

```ts
import { ALL_ROOMS, floorOf } from '#/lib/hotel/rooms.ts' // ou '#/lib/pdj/csv.ts' selon D3

export interface Floor {
  floor: number
  rooms: number[]
}

/** Étages ordonnés (1→6), chacun avec ses chambres triées. */
export const FLOORS: Floor[] = (() => {
  const byFloor = new Map<number, number[]>()
  for (const room of ALL_ROOMS) {
    const f = floorOf(room)
    const list = byFloor.get(f) ?? []
    list.push(room)
    byFloor.set(f, list)
  }
  return [...byFloor.entries()]
    .sort(([a], [b]) => a - b)
    .map(([floor, rooms]) => ({ floor, rooms }))
})()

export const ROOM_COUNT = ALL_ROOMS.length // 80
```

### 3. Helpers de navigation par jour — `src/lib/rapro/day.ts`

Version « jour seul » du mécanisme caisse (pas de shift, la date-string est la clé).

```ts
/** 'YYYY-MM-DD' en heure locale (aujourd'hui par défaut). */
export function today(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Décale une date-string de `delta` jours (heure locale). */
export function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + delta)
  return today(d)
}

/** Clampe une date dans [min, max] (comparaison lexicale = chronologique). */
export function clampDay(date: string, min: string, max: string): string {
  if (date > max) return max
  if (date < min) return min
  return date
}
```

Note : `today`/`addDays` travaillent en **heure locale du navigateur** (même comportement que la caisse). Garder ce point en tête si un jour le rapprochement doit être calé sur un fuseau serveur.

## Ordre d'exécution

1. Acter D3 (origine de `ALL_ROOMS`).
2. Créer `src/lib/hotel/rooms.ts` (si D3=A) et ajuster `src/lib/pdj/csv.ts`.
3. Créer `src/lib/rapro/rooms.ts` puis `src/lib/rapro/day.ts`.
4. (Optionnel) Écrire `day.test.ts` : `today` déterministe, `addDays` (report de mois), `clampDay` aux bornes.
5. Vérifier `npx tsc --noEmit`.

## Critère de validation

- `FLOORS` renvoie 6 étages, `ROOM_COUNT === 80`, l'étage 1 commence à 102 et l'étage 6 va de 621 à 631.
- Si D3=A : la page PDJ compile et affiche toujours ses chambres (ré-export transparent).
- `addDays('2026-02-28', 1) === '2026-03-01'` ; `clampDay` renvoie les bornes quand on déborde.
- `npx tsc --noEmit` vert.
