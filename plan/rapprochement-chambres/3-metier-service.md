# Étape 3 — Types + service Supabase

## Objectif

Exposer la couche d'accès aux données du rapprochement : lire l'état d'un jour, borner la navigation au plus ancien enregistrement, et sauvegarder la liste des chambres « non faites ». Aucune logique React ici — le composant consommera ce service via TanStack Query.

## Contexte

Patron répliqué : `src/lib/pdj/service.ts` (le plus proche : lecture par jour, upsert idempotent) et `src/lib/caisse/service.ts` (borne « plus ancien enregistrement »). Convention d'erreur maison : `const { data, error } = await …; if (error) throw error`, l'appelant `.catch()`. Deux représentations comme caisse/pdj : ligne DB `snake_case` miroir du schéma, modèle app `camelCase`, conversion dans le service.

Cette étape suppose D1=A / D2=A (une ligne par jour, `rooms_not_done` en tableau). Si D2=B, `fetchDay` renvoie des lignes par chambre et `saveNotDone` fait un upsert par `(report_date, room)`.

## Fichier(s) impacté(s)

- `src/lib/rapro/types.ts` (nouveau)
- `src/lib/rapro/service.ts` (nouveau)

## Travail à réaliser

### 1. Types — `src/lib/rapro/types.ts`

```ts
/** Ligne DB (miroir de public.rapro_rooms). */
export interface DbRaproDay {
  id: string
  report_date: string
  rooms_not_done: number[]
  comment: string
  updated_at: string
}

/** Modèle applicatif (camelCase). */
export interface RaproDay {
  reportDate: string
  roomsNotDone: Set<number>
  comment: string
}
```

### 2. Service — `src/lib/rapro/service.ts`

```ts
import { supabase } from '#/lib/supabase.ts'
import type { DbRaproDay, RaproDay } from '#/lib/rapro/types.ts'

export const RAPRO_TABLE = 'rapro_rooms'

function toRaproDay(row: DbRaproDay): RaproDay {
  return {
    reportDate: row.report_date,
    roomsNotDone: new Set(row.rooms_not_done),
    comment: row.comment,
  }
}

/** État d'un jour (null si rien de saisi encore). */
export async function fetchDay(reportDate: string): Promise<RaproDay | null> {
  const { data, error } = await supabase
    .from(RAPRO_TABLE)
    .select('id, report_date, rooms_not_done, comment, updated_at')
    .eq('report_date', reportDate)
    .maybeSingle()
  if (error) throw error
  return data ? toRaproDay(data as DbRaproDay) : null
}

/** Jour le plus ancien enregistré (borne basse de navigation), ou null si base vide. */
export async function fetchOldestDay(): Promise<string | null> {
  const { data, error } = await supabase
    .from(RAPRO_TABLE)
    .select('report_date')
    .order('report_date', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? data.report_date : null
}

/** Enregistre (upsert) la liste des chambres non faites d'un jour. */
export async function saveNotDone(
  reportDate: string,
  roomsNotDone: Set<number>,
  comment = '',
): Promise<void> {
  const { error } = await supabase.from(RAPRO_TABLE).upsert(
    {
      report_date: reportDate,
      rooms_not_done: [...roomsNotDone].sort((a, b) => a - b),
      comment,
    },
    { onConflict: 'report_date' },
  )
  if (error) throw error
}
```

## Ordre d'exécution

1. Créer `types.ts` puis `service.ts`.
2. Vérifier que `supabase` est bien importé depuis `#/lib/supabase.ts` (client partagé, protégé par RLS).
3. `npx tsc --noEmit`.

## Critère de validation

- `fetchDay` d'un jour sans donnée renvoie `null` sans lever d'erreur (`maybeSingle`).
- `saveNotDone` fait un **upsert** sur `report_date` (pas de doublon de ligne pour un même jour).
- `fetchOldestDay` renvoie la plus ancienne `report_date` ou `null`.
- Le mapping `rooms_not_done` (tableau) ↔ `roomsNotDone` (`Set`) est symétrique.
- `npx tsc --noEmit` vert.
