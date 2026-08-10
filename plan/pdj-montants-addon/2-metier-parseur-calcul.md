# Étape 2 — Métier pur : parseur Addon + calcul des montants

## Objectif

Écrire, en TypeScript pur (sans React, sans réseau), (1) le parseur du CSV Addon Production
et (2) le calcul des trois montants HT (PDJ inclus, extras, total) + un contrôle défensif.
Fonctions testées unitairement.

## Contexte

Conventions strictes de `src/lib/pdj/` : **named exports**, simple quotes, **pas de `;`**,
alias `#/…` **avec extension `.ts`**, JSDoc en français. Réutiliser l'existant : `parseCsvLine`
(`#/lib/pdj/csv.ts`) pour le découpage, et `fromTTC` / `VAT_FACTOR` (`#/lib/repjour/constants.ts`,
`VAT_FACTOR = 1.1`) pour la TVA — **ne pas réécrire de `/1.1` magique**.

Structure réelle du CSV Addon Production :
```
Hotel Code,Hotel Name,Generated Date,Generated Time,Report Name
4401NACH,Okko Hotels Nantes Centre Ville,10-08-2026,12:05:02,Addon Production
Date Range,Total number,Total Revenue,Average revenue
2026-08-09 - 2026-08-09,25,877.00,35.08
"",Total Count,Total Revenue,Average revenue,2026-08-09,""
PDJ,22,817.00,37.14,22,817.00
PDJBB,3,60.00,20.00,3,60.00
```
La ligne d'en-tête des codes est `"",Total Count,Total Revenue,Average revenue,<date>,""` :
la **date métier brute** est le token date de CETTE ligne (col 4, ici `2026-08-09`), **pas**
`Generated Date` (J+1). Colonnes des lignes code : `[code, Total Count, Total Revenue, Average,
count, revenue]` → seules 0..2 sont utiles.

ALIGNEMENT DES DATES (Point de correction n°1 de l'index) : cette date brute est la date métier
« clôture » (`2026-08-09`), mais le petit-déjeuner correspondant est servi **le lendemain**
(`2026-08-10`), jour sous lequel le In-House et le board rangent la journée. Le parseur renvoie
la date **brute** ; l'alignement `+1 jour` est appliqué par un helper dédié et documenté, réutilisé
côté service ET côté Edge (source unique de la règle).

## Fichier(s) impacté(s)

- `src/lib/pdj/addon.ts` (nouveau)
- `src/lib/pdj/amounts.ts` (nouveau)
- `src/lib/pdj/addon.test.ts` (nouveau)
- `src/lib/pdj/amounts.test.ts` (nouveau)
- `src/lib/pdj/format.ts` (modifié — ajouter `fmtEur` au réexport)

## Travail à réaliser

### 1. `format.ts` — réexporter `fmtEur`

`fmtEur` existe déjà dans `#/lib/format/index.ts` (espace insécable avant €, `decimals: 0 | 2`).
L'ajouter au réexport :

```ts
export { fmtInt, fmtPct, fmtPctInt, fmtEur } from '#/lib/format/index.ts'
```

### 2. `addon.ts` — parseur

```ts
export interface AddonProductionRow {
  code: string          // normalisé upper/trim (ex. 'PDJ', 'PDJBB')
  count: number         // Total Count = réservations
  revenue: number       // Total Revenue (TTC)
}

export interface ParsedAddonProduction {
  businessDate: string | null  // 'YYYY-MM-DD' BRUT lu du contenu (date métier « clôture »)
  rows: AddonProductionRow[]    // uniquement les codes petit-déjeuner
}

// petit-déjeuner = code commençant par 'PDJ' (matche PDJ et PDJBB), détection dynamique.
export function isBreakfastCode(code: string): boolean

export function parseAddonProduction(content: string): ParsedAddonProduction

// Alignement : jour du petit-déjeuner = date métier « clôture » + 1 jour. Source UNIQUE de la
// règle (réutilisée par service.ts et l'Edge). 'YYYY-MM-DD' → 'YYYY-MM-DD'. Calcul en UTC pour
// éviter tout décalage de fuseau (comme repjour extractReportDate).
export function breakfastServiceDate(businessDate: string): string
```

Points d'implémentation :
- strip BOM (`charCodeAt(0) === 0xfeff`), `split('\n').filter(l => l.trim())`.
- détecter la ligne d'en-tête des codes en cherchant une ligne qui contient `Total Count`
  ET `Total Revenue` (essayer séparateurs `,` puis `;`, façon `import-report/pdj.ts:163-183`).
  Ne PAS supposer un index fixe (préambule variable).
- `businessDate` = premier token de cette ligne qui matche `^\d{4}-\d{2}-\d{2}` (col 4). Si
  absent, tenter la ligne « Date Range » (`2026-08-09 - 2026-08-09` → borne gauche). `null` si rien.
- `breakfastServiceDate('2026-08-09') === '2026-08-10'` (ajout d'un jour en UTC).
- lignes suivantes = lignes code : `code = parts[0]`, `count = parseInt`, `revenue = parseFloat`
  (`.replace(',', '.')`). Ignorer les lignes dont `parts[0]` est vide ou non-code.
- filtrer `isBreakfastCode(code)` (écarte parking, taxe, bar…).
- normaliser `code` en `trim().toUpperCase()`.

### 3. `amounts.ts` — calcul

```ts
import { fromTTC } from '#/lib/repjour/constants.ts'

export interface CoversByCode { coversPDJ: number; coversPDJBB: number }

// Couverts par code depuis les lignes In-House (pdj_breakfasts). Pour chaque ligne dont
// `addons` mentionne PDJ : tester 'PDJBB' d'ABORD (sinon 'PDJ' capte aussi les PDJBB),
// couverts = adults + children (PAS la règle BB1PAX).
export function countCovers(rows: { addons: string | null; adults: number; children: number }[]): CoversByCode

export interface PdjAmountsInput {
  addon: AddonProductionRow[]   // revenus TTC par code (Étape 2.2)
  covers: CoversByCode          // couverts In-House (countCovers)
  extrasCount: number           // option A1 : Σ max(0, served − included) ; A2 : compteur saisi
}

export interface PdjAmounts {
  includedHT: number            // arrondi 2 déc.
  extrasHT: number | null       // null si prix unitaire PDJ indéterminable ; 0 si extrasCount 0
  totalHT: number               // arrondi 2 déc.
  unitTtcPDJ: number | null     // prix unitaire TTC du code PDJ (pour extras) ; null si covers=0
  warnings: string[]            // contrôle défensif (option B1)
}

export function computePdjAmounts(input: PdjAmountsInput): PdjAmounts
```

Règles :
- `includedTtc = Σ revenue` des lignes addon petit-déjeuner. `includedHT = round2(fromTTC(includedTtc))`.
- prix unitaire TTC du code PDJ = `revenuePDJ / coversPDJ` **si coversPDJ > 0**, sinon `null`
  (garde division par zéro). Idem PDJBB si besoin d'un contrôle.
- `extrasHT` : si `extrasCount === 0` → `0` ; sinon si `unitTtcPDJ` connu →
  `round2(fromTTC(extrasCount * unitTtcPDJ))` ; sinon `null` + warning.
- `totalHT = round2(fromTTC(includedTtc + extrasCount * (unitTtcPDJ ?? 0)))`. **Arrondi au
  total uniquement**, jamais au niveau unitaire.
- `warnings` (option B1, défensif, pas bloquant) : code addon avec revenu > 0 mais couverts = 0 ;
  extras demandés mais prix PDJ indéterminable ; (optionnel) écart marqué entre `Σ total_count`
  addon et le nombre de réservations PDJ In-House.
- `round2(n) = Math.round(n * 100) / 100`.

### 4. Tests (`addon.test.ts`, `amounts.test.ts`)

- `parseAddonProduction` sur le CSV d'exemple inline : `businessDate === '2026-08-09'`,
  2 lignes (PDJ 22/817, PDJBB 3/60), et un cas avec un code non-PDJ (ex. `PARKING`) **écarté**.
- `breakfastServiceDate('2026-08-09') === '2026-08-10'` ; robustesse fin de mois
  (`'2026-08-31' → '2026-09-01'`) et fin d'année.
- Robustesse : BOM en tête, séparateur `;`, préambule présent/absent, décimales `,`.
- `countCovers` : PDJBB compté à part, PDJ n'inclut pas les PDJBB, lignes sans PDJ ignorées.
- `computePdjAmounts` : `includedHT = round2(877/1.1) = 797.27` ; extras 0 → `extrasHT = 0` et
  case vide côté UI ; `coversPDJ = 0` → `unitTtcPDJ = null`, `extrasHT = null` si extras > 0 +
  warning ; arrondi au total (pas d'accumulation d'arrondis unitaires).

## Ordre d'exécution

1. `format.ts` (réexport `fmtEur`).
2. `addon.ts` puis `addon.test.ts`.
3. `amounts.ts` puis `amounts.test.ts`.
4. `pnpm test` (vitest) sur les deux nouveaux fichiers.

## Critère de validation

- `npx tsc --noEmit` vert.
- Tous les tests des deux fichiers verts, y compris division par zéro et arrondi au total.
- `includedHT === 797.27` sur le CSV fourni ; contrôle B1 lève un warning en cas de couverts=0.
