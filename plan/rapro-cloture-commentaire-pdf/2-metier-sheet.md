# Étape 2 — Types + service de la feuille jour

## Objectif

Exposer la couche d'accès à la feuille jour du rapprochement : lire l'état (`draft`/`validated` + commentaire) d'un jour, enregistrer le commentaire (upsert), clôturer et réouvrir. Aucune logique React ici — le composant consommera ce service via TanStack Query.

## Contexte

Patron répliqué : `src/lib/caisse/service.ts` (`validateSheet` / `reopenSheet` / `upsertSheet`), simplifié — pas de fenêtre de grâce, pas d'`operator_initials`. Convention d'erreur maison : `const { data, error } = await …; if (error) throw error`, l'appelant `.catch()`. Deux représentations comme le reste du projet : ligne DB `snake_case`, modèle app `camelCase`, conversion dans le service.

Suppose D3 = Option A (conserver `validated_at` / `validated_by`).

## Fichier(s) impacté(s)

- `src/lib/rapro/types.ts` (modifié)
- `src/lib/rapro/service.ts` (modifié)

## Travail à réaliser

### 1. Types — `src/lib/rapro/types.ts`

Ajouter à côté de `RoomStatus` / `RaproDay` existants :

```ts
/** État de clôture d'une feuille jour. */
export type SheetStatus = 'draft' | 'validated'

/** Ligne DB (miroir de public.rapro_sheets). */
export interface DbRaproSheet {
  report_date: string
  status: SheetStatus
  comment: string
  validated_at: string | null
  validated_by: string | null
}

/** Feuille jour (clôture + commentaire) du rapprochement. */
export interface RaproSheet {
  reportDate: string
  status: SheetStatus
  comment: string
  validatedAt: string | null
}
```

### 2. Service — `src/lib/rapro/service.ts`

Ajouter (le fichier expose déjà `RAPRO_TABLE`, `fetchDay`, `setStatus`…) :

```ts
export const RAPRO_SHEETS_TABLE = 'rapro_sheets'

function toRaproSheet(row: DbRaproSheet): RaproSheet {
  return {
    reportDate: row.report_date,
    status: row.status,
    comment: row.comment,
    validatedAt: row.validated_at,
  }
}

/** Feuille jour (null si aucune ligne encore créée → brouillon vide). */
export async function fetchSheet(reportDate: string): Promise<RaproSheet | null> {
  const { data, error } = await supabase
    .from(RAPRO_SHEETS_TABLE)
    .select('report_date, status, comment, validated_at, validated_by')
    .eq('report_date', reportDate)
    .maybeSingle()
  if (error) throw error
  return data ? toRaproSheet(data as DbRaproSheet) : null
}

/** Enregistre le commentaire du jour (upsert ; ne touche pas le status). */
export async function saveComment(
  reportDate: string,
  comment: string,
): Promise<void> {
  const { error } = await supabase
    .from(RAPRO_SHEETS_TABLE)
    .upsert({ report_date: reportDate, comment }, { onConflict: 'report_date' })
  if (error) throw error
}

/** Clôture le jour (status validated + qui/quand). Crée la ligne au besoin. */
export async function validateSheet(
  reportDate: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase.from(RAPRO_SHEETS_TABLE).upsert(
    {
      report_date: reportDate,
      status: 'validated',
      validated_at: new Date().toISOString(),
      validated_by: userId,
    },
    { onConflict: 'report_date' },
  )
  if (error) throw error
}

/** Réouvre le jour (retour en draft ; efface la trace de validation). */
export async function reopenSheet(reportDate: string): Promise<void> {
  const { error } = await supabase
    .from(RAPRO_SHEETS_TABLE)
    .update({ status: 'draft', validated_at: null, validated_by: null })
    .eq('report_date', reportDate)
  if (error) throw error
}
```

Note (D2) : `saveComment` fait un upsert `onConflict: 'report_date'` en ne fournissant que `comment` — sur une ligne existante, seul `comment` est mis à jour (les autres colonnes gardent leur valeur) ; sur une nouvelle ligne, `status` prend son défaut `draft`. Le composant l'appellera au **blur** de la zone commentaire.

## Ordre d'exécution

1. Ajouter les types dans `types.ts`.
2. Ajouter les fonctions dans `service.ts` (import de `DbRaproSheet` / `RaproSheet`).
3. `npx tsc --noEmit`.

## Critère de validation

- `fetchSheet` d'un jour sans ligne renvoie `null` sans erreur (`maybeSingle`).
- `saveComment` fait un **upsert** sur `report_date` (pas de doublon), sans écraser `status`/`validated_*`.
- `validateSheet` pose `status='validated'` + `validated_at`/`validated_by` ; `reopenSheet` repasse en `draft` et efface `validated_at`/`validated_by`.
- `npx tsc --noEmit` vert.
