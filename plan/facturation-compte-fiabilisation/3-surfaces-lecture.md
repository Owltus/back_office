# Étape 3 — Surfaces de lecture : format unique du couple

## Objectif

Appliquer le format unique du couple (étape 1) aux surfaces de **lecture** où il apparaît :
le tampon PDF, son aperçu écran, et l'historique. Objectif : un seul comportement de
présence/rendu du compte, plus les trois variantes actuelles.

## Contexte

Le couple est rendu différemment selon l'écran : tampon « `code   compte` » (trois espaces,
`stampLayout.ts:78-86`), historique « `code compte` » (un espace, `HistoriqueDialog.tsx:113-115`).
L'aperçu `StampPreview` consomme déjà `stampLines` (`StampPreview.tsx:271-290`) et le PDF
aussi (`stamp.ts:162-180`) : corriger `stampLayout` corrige donc aperçu ET PDF d'un coup.

## Fichier(s) impacté(s)

- `src/lib/facturation/stampLayout.ts`
- `src/lib/facturation/stamp.ts` (si un rendu du couple y vit hors `stampLines`)
- `src/components/facturation/StampPreview.tsx` (vérification, normalement transitif)
- `src/components/facturation/HistoriqueDialog.tsx`

## Travail à réaliser

### 1. Tampon (`stampLayout.ts`)

`stampLines` construit `text: compte ? `${code}   ${compte}` : code` (`stampLayout.ts:78-86`).
Selon A2 :

- variante **colonnes conservées** (recommandée) : garder l'alignement PDF mais dériver la
  présence du compte via `imputationParts(code, compte).hasCompte` (source unique de la
  règle « affiche-t-on le compte ? »), en conservant les trois espaces pour l'alignement.
- variante **séparateur identique partout** : utiliser `formatImputation(code, compte)`
  directement (perte de l'alignement en colonnes).

Dans les deux cas, la DÉCISION d'afficher le compte vient de `imputationParts`, plus d'un
`compte?.trim()` local dupliqué.

### 2. Aperçu (`StampPreview.tsx`)

Vérifier que l'aperçu consomme bien `stampLines` (`StampPreview.tsx:271-290`) et hérite donc
automatiquement du changement. Si un rendu local du couple subsiste, l'aligner sur
`imputationParts`/`formatImputation`.

### 3. Historique (`HistoriqueDialog.tsx`)

Remplacer `${c} ${e.comptes[c]}` (`HistoriqueDialog.tsx:113-115`) par
`formatImputation(c, e.comptes?.[c] ?? '')`.

## Ordre d'exécution

1. `stampLayout.ts` (variante A2 retenue) → couvre aperçu + PDF.
2. Vérifier `StampPreview.tsx` (aucun rendu local résiduel).
3. `HistoriqueDialog.tsx`.

## Critère de validation

- `npx tsc --noEmit` propre.
- Recette visuelle : le couple s'affiche de façon cohérente sur l'aperçu, le PDF généré et
  l'historique ; un code sans compte n'affiche que le code partout (jamais de séparateur
  orphelin) ; la troncature PDF (`stamp.ts` `fit()`) reste correcte.
