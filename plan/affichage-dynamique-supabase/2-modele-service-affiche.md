# Étape 2 — Métier : modèle + service Supabase

## Objectif

Créer la couche métier pure du feature affiche : le type applicatif `AfficheTemplate` (id + 7 champs) et le service d'accès Supabase (`DbAfficheTemplate` snake_case, mappers, CRUD `fetch/create/update/delete`). Miroir de `src/lib/parking/{model,service}.ts`.

## Contexte

Aujourd'hui le type `Template` (7 champs, sans id) vit dans `src/lib/poster/templates.ts`. On introduit un `id` (uuid DB) et on isole l'accès Supabase dans un service dédié, sans React ni Tailwind (convention : métier pur dans `src/lib/<feature>/`).

## Fichier(s) impacté(s)

- `src/lib/affiche/model.ts` (nouveau)
- `src/lib/affiche/service.ts` (nouveau)

## Travail à réaliser

### 1. `model.ts` — type applicatif

```ts
import type { ColorKey } from '#/lib/poster/config.ts'

/** Un modèle d'affiche persisté (7 champs métier + id). Sérialisable. */
export interface AfficheTemplate {
  id: string
  name: string
  icon: string
  color: ColorKey
  titleFr: string
  messageFr: string
  titleEn: string
  messageEn: string
}
```

Réutiliser `ColorKey` depuis `poster/config.ts` (source unique du type couleur). Le type `Template` historique de `poster/templates.ts` peut être ré-exprimé comme `Omit<AfficheTemplate, 'id'>` ou laissé tel quel selon D2.

### 2. `service.ts` — accès Supabase

```ts
import { supabase } from '#/lib/supabase.ts'
import type { AfficheTemplate } from '#/lib/affiche/model.ts'
import type { ColorKey } from '#/lib/poster/config.ts'

export const AFFICHE_TEMPLATES_TABLE = 'affiche_templates'

/** Ligne DB (snake_case), miroir des colonnes. */
export interface DbAfficheTemplate {
  id: string
  name: string
  icon: string
  color: ColorKey
  title_fr: string
  message_fr: string
  title_en: string
  message_en: string
  sort_order: number
}

export function toAfficheTemplate(row: DbAfficheTemplate): AfficheTemplate {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    titleFr: row.title_fr,
    messageFr: row.message_fr,
    titleEn: row.title_en,
    messageEn: row.message_en,
  }
}

/** app -> DB (insert/patch). L'id est fourni par le client (crypto.randomUUID). */
export function toDbInsert(t: AfficheTemplate, sortOrder = 0): DbAfficheTemplate {
  return {
    id: t.id,
    name: t.name,
    icon: t.icon,
    color: t.color,
    title_fr: t.titleFr,
    message_fr: t.messageFr,
    title_en: t.titleEn,
    message_en: t.messageEn,
    sort_order: sortOrder,
  }
}

export async function fetchTemplates(): Promise<AfficheTemplate[]> {
  const { data, error } = await supabase
    .from(AFFICHE_TEMPLATES_TABLE)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return ((data ?? []) as DbAfficheTemplate[]).map(toAfficheTemplate)
}

export async function createTemplate(row: DbAfficheTemplate): Promise<void> {
  const { error } = await supabase.from(AFFICHE_TEMPLATES_TABLE).insert(row)
  if (error) throw error
}

export async function updateTemplate(
  id: string,
  patch: Partial<Omit<DbAfficheTemplate, 'id'>>,
): Promise<void> {
  const { error } = await supabase
    .from(AFFICHE_TEMPLATES_TABLE)
    .update(patch)
    .eq('id', id)
  if (error) throw error
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase
    .from(AFFICHE_TEMPLATES_TABLE)
    .delete()
    .eq('id', id)
  if (error) throw error
}
```

Convention d'erreur identique au parking : `{ data, error }` → `if (error) throw error`, l'appelant (le board) `.catch()`.

## Ordre d'exécution

1. Créer `src/lib/affiche/model.ts`.
2. Créer `src/lib/affiche/service.ts`.
3. `npx tsc --noEmit`.

## Critère de validation

- `npx tsc --noEmit` passe (les types DB / app sont cohérents avec `ColorKey`).
- Named exports uniquement, alias `#/` avec extension explicite, simple quotes, pas de point-virgule final (conventions projet).
- Aucune dépendance React / Tailwind dans ces deux fichiers (métier pur).
