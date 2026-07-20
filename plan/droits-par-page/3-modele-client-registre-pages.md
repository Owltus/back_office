# Étape 3 — Modèle client : registre des pages + helpers

## Objectif

Créer le socle métier pur (sans React, sans Tailwind) qui décrit les pages, les niveaux et les grades, et fournit les helpers de décision (`canView`, `levelOf`, `atLeast`) que consommeront la navbar, les gardes, les boards et l'écran d'administration. Une source unique de vérité, pour éviter la dispersion actuelle (le pattern `role === 'super_utilisateur' || role === 'admin'` copié dans ~10 fichiers).

## Contexte

Aujourd'hui les rôles sont typés dans `src/lib/repjour/types.ts` et les constantes dans `src/lib/repjour/roles.ts`, mais rien ne décrit « les pages » comme entité : `NAV_ITEMS` (dans `Navbar.tsx`) est la liste la plus proche, mais côté composant et sans les sous-routes. On introduit un domaine dédié `src/lib/permissions/`, conforme à l'arborescence (métier pur sous `src/lib/<domaine>/`). Les niveaux sont `lecture`/`ecriture`/`gestion` (mêmes valeurs qu'en base) ; les grades `admin`/`utilisateur`.

## Fichier(s) impacté(s)

- `src/lib/permissions/pages.ts` (nouveau — registre des pages)
- `src/lib/permissions/levels.ts` (nouveau — niveaux, rang, grades)
- `src/lib/permissions/index.ts` (nouveau — barrel)
- `src/lib/repjour/types.ts` (modification : ajout `Grade`, `PageKey`, `PageLevel`, `UserPagePermission`)
- `src/lib/repjour/roles.ts` (modification : `ROLE_HOME` → helper « première page accordée » ; `ROLE_LABELS` conservés pour l'affichage du grade)

## Travail à réaliser

### 1. Niveaux et grades — `levels.ts`

```ts
export type PageLevel = 'lecture' | 'ecriture' | 'gestion'
export type Grade = 'admin' | 'utilisateur'

export const LEVEL_LABELS: Record<PageLevel, string> = {
  lecture: 'Lecture',
  ecriture: 'Écriture',
  gestion: 'Gestion',
}

const RANK: Record<PageLevel, number> = { lecture: 1, ecriture: 2, gestion: 3 }

export function levelRank(level: PageLevel | null): number {
  return level ? RANK[level] : 0
}

export function atLeastLevel(level: PageLevel | null, min: PageLevel): boolean {
  return levelRank(level) >= RANK[min]
}
```

### 2. Registre des pages — `pages.ts`

```ts
import { ClipboardList, Coffee, SquareParking, ArrowLeftRight, Banknote, Monitor, Stamp, Palette } from 'lucide-react'

export type PageKey =
  | 'repjour' | 'pdj' | 'parking' | 'rapro' | 'caisse' | 'affichage' | 'facturation' | 'artefact'

export interface PageDef {
  key: PageKey
  label: string
  route: string
  icon: typeof ClipboardList
}

export const PAGES: PageDef[] = [
  { key: 'repjour', label: 'RepJour', route: '/repjour', icon: ClipboardList },
  { key: 'pdj', label: 'PDJ', route: '/pdj', icon: Coffee },
  { key: 'parking', label: 'Parking', route: '/parking', icon: SquareParking },
  { key: 'rapro', label: 'Rapprochement', route: '/rapro', icon: ArrowLeftRight },
  { key: 'caisse', label: 'Caisse', route: '/caisse', icon: Banknote },
  { key: 'affichage', label: 'Affichage', route: '/affichage', icon: Monitor },
  { key: 'facturation', label: 'Facturation', route: '/facturation', icon: Stamp },
  { key: 'artefact', label: 'Artefact', route: '/artefact', icon: Palette },
]

export const PAGE_BY_KEY: Record<PageKey, PageDef> =
  Object.fromEntries(PAGES.map(p => [p.key, p])) as Record<PageKey, PageDef>
```

Le registre remplacera à terme `NAV_ITEMS`/`ADMIN_ITEMS` (Étape 5) : une seule liste, filtrée par les droits.

### 3. Type de permissions résolues

Dans `types.ts`, la carte que l'AuthContext exposera (Étape 4) :

```ts
export type PagePermissions = Partial<Record<PageKey, PageLevel>>
export interface UserPagePermission { user_id: string; page: PageKey; level: PageLevel }
```

### 4. Helpers de décision (fonctions pures, prennent la carte en argument)

Placés dans `index.ts` (barrel) — pures, testables, sans hook :

```ts
export function levelOf(perms: PagePermissions, grade: Grade, page: PageKey): PageLevel | null {
  if (grade === 'admin') return 'gestion'         // admin = Gestion partout
  return perms[page] ?? null
}
export function canView(perms: PagePermissions, grade: Grade, page: PageKey): boolean {
  return levelOf(perms, grade, page) !== null
}
export function atLeast(perms: PagePermissions, grade: Grade, page: PageKey, min: PageLevel): boolean {
  return atLeastLevel(levelOf(perms, grade, page), min)
}
export function firstAllowedPage(perms: PagePermissions, grade: Grade): PageKey | null {
  return PAGES.find(p => canView(perms, grade, p.key))?.key ?? null
}
```

L'Étape 4 exposera des wrappers `useAuth()` qui injectent `perms`/`grade` automatiquement, pour que les boards écrivent simplement `atLeast('parking', 'ecriture')`.

## Ordre d'exécution

1. Créer `levels.ts`, `pages.ts`, `index.ts`.
2. Étendre `types.ts` (`Grade`, `PageKey`, `PageLevel`, `PagePermissions`, `UserPagePermission`).
3. Ajuster `roles.ts` (conserver `ROLE_LABELS` pour le grade ; retirer/adapter `ROLE_HOME`).

## Critère de validation

- `npx tsc --noEmit` vert.
- Respect des conventions : named exports uniquement, alias `#/` avec extension explicite, simple quotes, pas de point-virgule final (attention : `types.ts`/`roles.ts` ont un héritage avec point-virgules — ne pas propager, aligner les nouveaux fichiers sur la convention sans `;`).
- Aucune dépendance React/Tailwind dans `src/lib/permissions/` (métier pur).
- `firstAllowedPage` renvoie `null` pour un utilisateur sans aucune page (géré à l'Étape 5).

## Contexte complémentaire

Cette étape ne change aucun comportement à elle seule (code non encore branché) : elle est le contrat que consomment les Étapes 4 à 7. La brancher tôt permet de paralléliser ensuite auth / gardes / boards.
