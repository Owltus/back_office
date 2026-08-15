# Étape 3 — Moteur de guidage directionnel (pur)

## Objectif

Le cœur « vivant ». Une logique PURE et déterministe qui, pour un émetteur donné, classe les
FAMILLES (sections) en trois niveaux — **plausible / neutre / improbable** — à partir de son
historique. C'est ce qui « sait vers où diriger, et surtout vers où ne pas diriger ».

## Contexte

La mémoire existe : `issuerPrior(issuerCodes, key)` donne `P(code | émetteur)` (`issuerCodes.ts:49`),
et `budgetCategory(code)` donne la famille d'un code (`budgetRegistry.ts:60`). Un prior par
FAMILLE = repli des priors code sur leur famille. Le prior code n'agit aujourd'hui que si
l'émetteur est « strong » (≥5 factures, `ISSUER_STRONG_MIN`) ; une famille mûrit plus vite,
d'où un seuil famille plus bas (AA2). Contrainte d'architecture : `issuerCodes.ts` et
`detect.ts` sont PURS (pas d'import de `budgetRegistry`) → le mapping code→famille est
INJECTÉ en paramètre.

## Fichier(s) impacté(s)

- `src/lib/facturation/issuerFamilies.ts` (nouveau, pur)
- `src/lib/facturation/facturation.test.ts`

## Travail à réaliser

### 1. Prior par famille

```ts
// issuerFamilies.ts
import type { IssuerCodes } from '#/lib/facturation/issuerCodes.ts'
import { issuerPrior } from '#/lib/facturation/issuerCodes.ts'

/** Poids par famille pour un émetteur = somme des P(code|émetteur) des codes de la famille.
 *  `familyOf` est injecté (= budgetCategory) pour garder ce module pur. Renvoie {} si inconnu. */
export function issuerFamilyPrior(
  model: IssuerCodes,
  key: string,
  familyOf: (code: string) => string,
): Record<string, number> {
  const prior = issuerPrior(model, key) // {} si émetteur inconnu
  const out: Record<string, number> = {}
  for (const [code, p] of Object.entries(prior)) {
    const fam = familyOf(code)
    if (fam) out[fam] = (out[fam] ?? 0) + p
  }
  return out // somme ≈ 1 quand des familles existent
}
```

### 2. Maturité famille + niveaux (AA1, AA2)

```ts
export type FamilyTier = 'plausible' | 'neutre' | 'improbable'

/** Total de factures vues pour l'émetteur (via issuerMaturity) → assez pour oriente au niveau
 *  famille ? Seuil AA2 (ex. 3), plus bas que le seuil code. */
export function familyGuidanceReady(total: number, min = 3): boolean {
  return total >= min
}

/** Classe une famille pour un émetteur MÛR : part forte → plausible ; part ~0 → improbable ;
 *  entre les deux → neutre. Émetteur non mûr → tout 'neutre' (démarrage à froid : on n'oriente
 *  pas). Jamais d'exclusion dure (AA1) : 'improbable' = signal d'affichage, pas un filtre. */
export function familyTier(
  familyPrior: Record<string, number>,
  family: string,
  ready: boolean,
  { strong = 0.15, faint = 0.02 } = {},
): FamilyTier {
  if (!ready) return 'neutre'
  const w = familyPrior[family] ?? 0
  if (w >= strong) return 'plausible'
  if (w <= faint) return 'improbable'
  return 'neutre'
}
```

### 3. Démarrage à froid (honnêteté)

Émetteur inconnu / non mûr → `issuerFamilyPrior` renvoie `{}` et `familyGuidanceReady` est
faux → **toutes les familles sont neutres**. Aucune orientation trompeuse. À couvrir par test.

### 4. Tests (le scénario « technique → pas alcool »)

- Un émetteur mûr imputé surtout en « FRAIS EXPLOITATION » → cette famille `plausible`,
  « RESTAURATION » (jamais vue) `improbable`.
- Émetteur inconnu → toutes familles `neutre` (pas de faux signal).
- Émetteur vu 1-2 fois → `familyGuidanceReady` faux → neutre.
- Répartition équilibrée → familles `neutre`, aucune `improbable` artificielle.

## Ordre d'exécution

1. `issuerFamilyPrior`.
2. `familyGuidanceReady` + `familyTier`.
3. Tests, dont démarrage à froid et « technique → pas alcool ».

## Critère de validation

- `npx tsc --noEmit` propre, tests verts.
- Module PUR : aucun import de `budgetRegistry`/React ; `familyOf` injecté.
- Aucune famille n'est jamais retirée de l'ensemble (les niveaux sont des étiquettes).
