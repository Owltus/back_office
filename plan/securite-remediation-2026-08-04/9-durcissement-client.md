# Étape 9 — I3 + I5 + I4 : durcissement client

## Objectif

Réduire la surface côté client : désactiver `detectSessionInUrl` (inutile), borner
les params de route `$year/$month`, et remonter les dépendances vulnérables.

## Contexte

Trois points Info/hygiène, indépendants du reste. Aucun n'est exploitable en l'état,
mais tous simples à fermer.

## Fichier(s) impacté(s)

- `src/lib/supabase.ts` (I3)
- `src/lib/shared/routeParams.ts` (nouveau, I5)
- `src/routes/{repjour,rapro,pdj,parking,caisse}/analytique.$year.$month.tsx` (I5)
- `package.json` / lockfile (I4)

## Travail à réaliser

### 1. `detectSessionInUrl: false` (I3)

`src/lib/supabase.ts` : le login est `signInWithPassword` (aucun OAuth/magic-link),
donc aucun token n'arrive par l'URL. Passer `detectSessionInUrl` à `false`.
(Vérifier au préalable par grep `signInWith` qu'aucun flux redirect n'existe.)
F1 (tokens en localStorage) reste structurel et documenté comme risque accepté.

### 2. Garde bornée des params `$year/$month` (I5)

Créer un helper (esprit du repli silencieux de `lib/shared/searchParams.ts`) :

```ts
import { z } from 'zod'

const yearSchema = z.coerce.number().int().min(2020).max(2100)
const monthSchema = z.coerce.number().int().min(1).max(12)

/** Borne les params de route analytique ; repli silencieux sur le mois courant. */
export function parseYearMonthParams(raw: { year: string; month: string }): {
  year: number
  month: number
} {
  const y = yearSchema.safeParse(raw.year)
  const m = monthSchema.safeParse(raw.month)
  const now = new Date()
  return {
    year: y.success ? y.data : now.getFullYear(),
    month: m.success ? m.data : now.getMonth() + 1,
  }
}
```

Puis, dans chacune des 5 routes, remplacer `Number(year)` / `Number(month)` par
`const { year, month } = parseYearMonthParams(Route.useParams())`.

### 3. Bump des dépendances (I4)

`pnpm update` / `pnpm dedupe` (ou `pnpm.overrides`) pour remonter : postcss
(>=8.5.23), brace-expansion, undici (>=7.29.0), dompurify (>=3.4.12). Toutes
build/test-only sauf dompurify (runtime, sévérité low via jspdf). Priorité basse,
mais trivial. Revérifier avec `pnpm audit` après.

## Ordre d'exécution

1. `supabase.ts` (I3).
2. Helper `routeParams.ts` + les 5 routes (I5).
3. `pnpm update` ciblé + `pnpm audit` (I4).
4. `npx tsc --noEmit` + `pnpm build`, committer, pousser.

## Critère de validation

- `npx tsc --noEmit` : 0 erreur ; `pnpm build` OK.
- `/repjour/analytique/abc/xyz` -> repli sur le mois courant (pas de NaN, pas de crash).
- Login toujours fonctionnel avec `detectSessionInUrl:false`.
- `pnpm audit` : les high build-only résorbés (ou documentés si non remontables).
