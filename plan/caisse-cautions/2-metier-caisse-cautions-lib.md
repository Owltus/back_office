# Étape 2 — Métier : calcul du fond effectif (toujours en direct) + service CRUD

## Objectif

Fonctions pures (testées, sans React ni Supabase) pour déterminer si une caution est active à une date donnée (passée ou présente) et calculer le fond de caisse effectif (`FUND_TARGET` + cautions actives), plus le service d'accès Supabase (fetch/create/refund/delete). Brancher ce calcul partout où un fond attendu est affiché ou évalué — y compris l'analytique.

## Contexte

Décision D4 (actée) : l'utilisateur veut qu'ajouter une caution en retard **corrige automatiquement** une feuille déjà clôturée. Pour l'obtenir sans jamais réécrire une ligne verrouillée par la RLS, le fond attendu n'est **plus jamais figé** dans `fund_origin` — il est **recalculé en direct, systématiquement**, pour n'importe quelle date. La colonne `fund_origin` de `caisse_sheets` reste en base (inchangée), mais `fundEcart` ne la lit plus : elle devient une valeur historique non significative pour ce chantier.

Décision D3 (actée) : une caution cesse de compter **immédiatement** à son remboursement (pas de « jour où elle compte encore ») — `refunded_date` marque le jour où elle a été rendue, et elle ne compte plus À PARTIR de ce jour (borne exclusive), pas encore ce jour-là.

Reprend le principe déjà présent dans le repo pour un report DÉRIVÉ (pas stocké en cumul) : `src/lib/rapro/carryover.ts`. Ici la règle est plus simple (pas de fenêtre bornée, pas de résolution multi-critères).

## Fichier(s) impacté(s)

- `src/lib/caisse/cautions.ts` (nouveau)
- `src/lib/caisse/cautions.test.ts` (nouveau)
- `src/lib/caisse/calc.ts` (modifié : signature de `fundEcart`/`isBalanced` changée)
- `src/lib/caisse/calc.test.ts` (modifié : tests existants à adapter à la nouvelle signature)
- `src/lib/caisse/service.ts` (modifié : + fonctions CRUD cautions)
- `src/lib/caisse/types.ts` (modifié : + type `Caution`, `DbCaution`)
- `src/lib/caisse/analytics.ts` (modifié : `hasAnomaly` utilise le fond effectif live, pas `s.fundOrigin`)

## Travail à réaliser

### 1. Types (`types.ts`)

```typescript
export type CautionStatus = 'active' | 'refunded'

export interface Caution {
  id: string
  room: number
  amount: number
  comment: string
  takenDate: string // 'YYYY-MM-DD'
  status: CautionStatus
  refundedDate: string | null // jour où elle a cessé de compter (borne exclusive)
  createdBy: string
  createdAt: string
}

/** Ligne DB (miroir de public.caisse_cautions). */
export interface DbCaution {
  id: string
  room: number
  amount: number
  comment: string
  taken_date: string
  status: CautionStatus
  refunded_date: string | null
  refunded_by: string | null
  refunded_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}
```

### 2. Calcul pur (`cautions.ts`)

```typescript
import type { Caution } from '#/lib/caisse/types.ts'

/** Une caution compte pour une date donnée si elle a déjà été prise (taken_date
 *  <= date) ET qu'elle est encore active OU que son remboursement n'a lieu
 *  qu'APRÈS cette date (borne EXCLUSIVE : le jour même du remboursement, elle
 *  ne compte plus — décision D3, l'utilisateur a explicitement écarté toute
 *  logique de « jour où ça compte encore »). Fonctionne pour une date PASSÉE
 *  comme présente : c'est ce qui permet la correction rétroactive (D4). */
export function isCautionActiveOn(c: Caution, date: string): boolean {
  if (c.takenDate > date) return false
  if (c.status === 'active') return true
  return c.refundedDate != null && date < c.refundedDate
}

/** Somme des cautions actives à une date donnée, à partir de la liste COMPLÈTE
 *  des cautions (actives ET remboursées : une caution remboursée compte encore
 *  pour toute date antérieure à son remboursement — ne jamais filtrer sur le
 *  statut avant d'appeler cette fonction). */
export function activeCautionsTotal(cautions: Caution[], date: string): number {
  return cautions
    .filter((c) => isCautionActiveOn(c, date))
    .reduce((sum, c) => sum + c.amount, 0)
}

/** Fond de caisse EFFECTIF attendu à une date : le plancher + les cautions
 *  actives ce jour-là. Remplace toute lecture de `fundOrigin` stocké — à
 *  appeler PARTOUT où un fond attendu est affiché ou évalué (board, PDF,
 *  dialogue de clôture, analytique), pour une feuille brouillon OU déjà
 *  validée, passée ou présente (D4). */
export function effectiveFundTarget(
  cautions: Caution[],
  date: string,
  fundTarget: number,
): number {
  return round2(fundTarget + activeCautionsTotal(cautions, date))
}
```

(`round2` : réutiliser le helper déjà présent en interne de `calc.ts`, ou le dupliquer localement comme le fait déjà le fichier.)

### 3. Changement de signature dans `calc.ts`

`fundEcart`/`isBalanced` ne lisent plus `s.fundOrigin` : la cible devient un paramètre explicite, calculé par l'appelant via `effectiveFundTarget`.

```typescript
/** Écart du fond de caisse : total compté − fond EFFECTIF attendu (doit être 0).
 *  `effectiveTarget` vient de `effectiveFundTarget()` (cautions.ts) — plus
 *  jamais de `s.fundOrigin` stocké (D4 : toujours recalculé en direct). */
export function fundEcart(
  s: Pick<CaisseSheet, 'counts'>,
  effectiveTarget: number,
): number {
  return round2(fundTotal(s) - effectiveTarget)
}
```

`isBalanced` prend le même paramètre supplémentaire et le transmet à `fundEcart`. **Tous les appelants doivent être mis à jour** (recherche globale de `fundEcart(` et `isBalanced(`) : `CaisseBoard.tsx` (calcul à l'écran + dialogue de clôture) et `analytics.ts` (`hasAnomaly`, voir point 5).

### 4. Service (`service.ts`)

```typescript
export const CAISSE_CAUTIONS_TABLE = 'caisse_cautions'

/** TOUTES les cautions (actives ET remboursées) — nécessaire pour recalculer
 *  correctement le fond effectif d'une date PASSÉE (une caution remboursée
 *  depuis comptait quand même à l'époque). Table de petite taille (quelques
 *  dizaines de lignes au plus) : pas de pagination, comme les tables
 *  équivalentes de petite volumétrie ailleurs dans l'app. */
export async function fetchAllCautions(): Promise<Caution[]>

export async function createCaution(input: {
  room: number
  amount: number
  comment: string
  takenDate: string
}): Promise<void>

export async function refundCaution(id: string, refundedDate: string): Promise<void>

export async function deleteCaution(id: string): Promise<void> // réservé gestion (RLS)
```

### 5. Branchement analytique (`analytics.ts`)

`hasAnomaly()` appelle aujourd'hui `fundEcart(s)` en lisant implicitement `s.fundOrigin`. À adapter : la fonction (et son appelant dans l'agrégation annuelle/mensuelle) doit désormais recevoir la liste complète des cautions (`fetchAllCautions`, chargée une fois, comme `fetchAllAddonProduction` sur PDJ) et calculer `effectiveFundTarget(cautions, s.reportDate, FUND_TARGET)` pour chaque feuille évaluée, avant d'appeler `fundEcart`/`isBalanced` avec la nouvelle signature. C'est la conséquence directe de D4 : sans ce branchement, l'analytique continuerait de juger les écarts contre l'ancien plancher fixe et ne refléterait pas la correction rétroactive voulue par l'utilisateur.

## Ordre d'exécution

1. Types
2. `cautions.ts` + tests
3. Changement de signature `calc.ts` + mise à jour de `calc.test.ts`
4. Service
5. Branchement `analytics.ts` (`hasAnomaly`)

## Critère de validation

- `npx vitest run src/lib/caisse` : tests de `isCautionActiveOn`/`activeCautionsTotal`/`effectiveFundTarget` couvrant au moins : caution prise avant/après la date testée, caution remboursée le jour même (NE compte PLUS ce jour-là, borne exclusive — D3), remboursée hier (ne compte plus aujourd'hui), plusieurs cautions actives simultanément, une caution remboursée qui compte encore pour une date passée antérieure à son remboursement (D4).
- `npx tsc --noEmit` (vérifie que tous les appelants de `fundEcart`/`isBalanced` ont bien été mis à jour avec le nouveau paramètre — sinon erreur de compilation immédiate, pas de risque d'oubli silencieux).
