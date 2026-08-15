# Étape 2 — Modèle : le compte a un nom

## Objectif

Rendre le nom humain du compte disponible dans tout le métier, et faire que l'AFFICHAGE
ÉCRAN parle en noms (le numéro devient un repli/second plan). Le tampon PDF et l'historique
technique conservent le numéro (étape 7).

## Contexte

Le dictionnaire (étape 1) vit en base. Il faut le charger comme le référentiel couple
(`fetchBudgetLines` → query `['facturation','budgetLines']` → `setBudgetLines` au rendu) et
l'exposer via un accès synchrone, à côté de `budgetLabel`/`comptesForCode`.

## Fichier(s) impacté(s)

- `src/lib/facturation/types.ts` (type `CompteLine`)
- `src/lib/facturation/cloudService.ts` (`fetchComptes`)
- `src/components/facturation/useFacturationModel.ts` (query + `setCompteLabels`)
- `src/lib/facturation/budgetRegistry.ts` (index `COMPTE_LABEL` + `compteLabel`)
- `src/lib/facturation/imputationFormat.ts` (rendu écran par nom humain)
- `src/lib/facturation/facturation.test.ts`

## Travail à réaliser

### 1. Type + chargement

```ts
// types.ts
export interface CompteLine {
  compte: string
  libelle: string
}
```

`cloudService.fetchComptes(): Promise<CompteLine[]>` (patron de `fetchBudgetLines`, table
`facturation_ref_comptes`, tri par `compte`).

`useFacturationModel` : query `['facturation','comptes']` (mêmes réglages que budgetLines,
`retry:false`, `?? []`) ; appeler `setCompteLabels(comptes)` AU RENDU, avant les useMemo
enfants (comme `setBudgetLines`).

### 2. Registre synchrone

```ts
// budgetRegistry.ts
let COMPTE_LABEL = new Map<string, string>() // compte -> nom humain

export function setCompteLabels(rows: CompteLine[]): void {
  COMPTE_LABEL = new Map(rows.map((r) => [r.compte, r.libelle]))
}

/** Nom humain d'un compte, ou le numéro brut en repli (jamais vide). */
export const compteLabel = (compte: string): string =>
  COMPTE_LABEL.get(compte)?.trim() || compte
```

### 3. Format écran par nom humain

Faire évoluer `imputationFormat` pour privilégier le nom du compte à l'écran, avec repli
sur le numéro. Le tampon PDF continue d'utiliser `imputationParts` (numéro) — inchangé.

```ts
// imputationFormat.ts — nouveau rendu ÉCRAN, injectant le résolveur de nom
export function formatImputationLabel(
  code: string,
  compte: string,
  compteName: (compte: string) => string, // = compteLabel
): string {
  const p = imputationParts(code, compte)
  if (!p.hasCompte) return budgetLabelOrCode // le poste seul
  return `${posteLabel} · ${compteName(p.compte)}` // ex. « Commissions · Commission ADYEN »
}
```

Détails à trancher à l'implémentation : le libellé écran privilégie le POSTE (`budgetLabel`)
+ le NOM du compte, le numéro n'apparaissant qu'en survol/second plan. Garder `formatImputation`
(numéro) pour les surfaces techniques.

### 4. Tests

`compteLabel` (nom présent, repli numéro, libellé espacé) ; `formatImputationLabel`
(avec/sans compte, résolveur factice). Étendre le fixture de test avec quelques `CompteLine`.

## Ordre d'exécution

1. Type + `fetchComptes` + query + `setCompteLabels`.
2. Index `COMPTE_LABEL` + `compteLabel`.
3. Évolution du format écran + tests.

## Critère de validation

- `npx tsc --noEmit` propre, tests verts.
- Un compte connu s'affiche par son nom ; un compte hors dictionnaire retombe sur son numéro
  (jamais vide).
