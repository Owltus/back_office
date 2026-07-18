# Étape 4 — Détection d'anomalies (métier pur)

## Objectif

Fournir la brique PURE de la « file de revue » : détecter les co-occurrences émetteur→code
aberrantes et les codes confusables, sans état serveur, testable en Node. Aucune action
automatique — on ne fait que PROPOSER (human-in-the-loop).

## Contexte

Diagnostic des agents : le modèle émetteur→codes rend la détection d'outliers quasi gratuite
(`{A:12, Z:1}` → Z suspect). La confusabilité entre codes se calcule avec l'appareil TF-IDF
DÉJÀ présent (`computeStats`/`vectorize`/`l2`, privés dans `wordpool.ts`) — cosinus
nuage-vs-nuage. Tout se calcule à la volée depuis les modèles en cache (D4).

## Fichier(s) impacté(s)

- `src/lib/facturation/issuerCodes.ts` (`issuerOutliers` + seuils)
- `src/lib/facturation/wordpool.ts` (`codeCosine`, `confusableCodes`)
- `src/lib/facturation/anomalies.ts` (nouveau, agrégateur)
- `src/lib/facturation/facturation.test.ts`

## Travail à réaliser

### 1. Outliers émetteur→codes (`issuerCodes.ts`)

```ts
export const ISSUER_OUTLIER_MAX_SHARE = 0.1
export const ISSUER_OUTLIER_MAX_COUNT = 1
export interface IssuerOutlier { issuerKey: string; code: string; count: number; share: number; dominant: string }
/** Chez un émetteur MÛR (total ≥ ISSUER_STRONG_MIN), les codes marginaux (share ≤ maxShare
 *  ET count ≤ maxCount) — probables erreurs d'imputation. */
export function issuerOutliers(model: IssuerCodes, opts?: { maxShare?: number; maxCount?: number }): IssuerOutlier[]
```

### 2. Confusabilité entre codes (`wordpool.ts`)

```ts
export const CONFUSABLE_MIN = 0.6
export interface CodePair { a: string; b: string; cosine: number }
export function codeCosine(pool: WordPool, a: string, b: string): number   // cosinus TF-IDF nuage-vs-nuage
export function confusableCodes(pool: WordPool, minCosine?: number): CodePair[] // paires ≥ seuil, triées
```

Réutiliser en interne `computeStats`/`vectorize`/`l2` (rester DANS `wordpool.ts` pour ne pas
élargir la surface publique).

### 3. Agrégateur (`anomalies.ts`)

```ts
export type Anomaly =
  | { kind: 'issuer-outlier'; data: IssuerOutlier }
  | { kind: 'confusable-codes'; data: CodePair }
/** File de revue calculée à la volée depuis les modèles en cache. Chaque anomalie porte de
 *  quoi la résoudre (émetteur+code pour unlearn/denylist, paire de codes pour inspection). */
export function reviewQueue(pool: WordPool, issuerCodes: IssuerCodes): Anomaly[]
```

### 4. Tests

- `issuerOutliers` : fixture `{ ramery: { A: 12, Z: 1 } }` → sort `Z`.
- `codeCosine`/`confusableCodes` : deux nuages proches → paire au-dessus du seuil.
- `reviewQueue` : agrège les deux, déterministe.

## Ordre d'exécution

1. `issuerOutliers` (+ seuils).
2. `codeCosine`/`confusableCodes`.
3. `anomalies.ts` (`reviewQueue`).
4. Tests. `npx tsc --noEmit` puis `npx vitest run src/lib/facturation`.

## Critère de validation

- `issuerOutliers` isole les co-occurrences marginales chez un émetteur mûr.
- `confusableCodes` remonte les paires de nuages trop ressemblants.
- Fonctions PURES (aucun React/DOM/Supabase), déterministes.
- `npx tsc --noEmit` et `npx vitest run` verts.
