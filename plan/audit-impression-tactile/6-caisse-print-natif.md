# Étape 6 — Caisse : impression native sur tactile (D1)

## Objectif

Même principe que les étapes 3-4 (probablement plus proche de Rapro que de
Parking, la feuille de caisse ayant déjà une forme de formulaire à l'écran),
appliqué à `CaisseBoard.tsx`.

## Contexte

`CaissePdfData` (consommée par `printCaisseSheet`, `src/lib/caisse/pdf.ts`)
contient : `titleDate`, `form`, `operatorInitials`, `effectiveFundTarget`,
`activeCautions`. Le document PDF affiche la feuille de caisse : dénominations
(billets/pièces, rasterisées en PNG pour le PDF — `loadDenomImages`,
`caisse/pdf.ts:~90-100`), cautions actives, écarts. Rappel de l'audit :
`caisse/pdf.ts` a une implémentation dupliquée (pas de fonction
`openPrintablePdf` partagée) — l'étape 9 (nettoyage) s'en occupe séparément,
ne pas mélanger les deux chantiers dans cette étape.

## Fichier(s) impacté(s)

- `src/components/caisse/CaisseBoard.tsx`
- `src/styles/caisse.css`

## Travail à réaliser

### 1. Décider : réutiliser le DOM écran, ou bloc imprimable dédié ?

La feuille de caisse à l'écran affiche déjà un formulaire de saisie des
dénominations et des cautions — structure probablement très proche du PDF.
Vérifier si les IMAGES de billets/pièces à l'écran (probablement des SVG/PNG
déjà chargés pour l'UI, pas besoin de les re-rasteriser comme le fait
`loadDenomImages` pour jsPDF) peuvent être réutilisées telles quelles en
CSS `@media print` — ce serait plus simple et plus fidèle que reconstruire
une image séparée.

### 2. CSS `@media print` dans `caisse.css`

Attention : `caisse.css` contient déjà un bloc `@media print` MORT (repéré
par l'audit, `~lignes 19-27`, reliquat d'une ancienne implémentation
`window.print()` antérieure à la migration vers jsPDF). Vérifier s'il peut
servir de point de départ (probablement obsolète et à réécrire plutôt qu'à
réactiver tel quel, mais à examiner avant de le supprimer/remplacer).

### 3. Bascule tactile

```ts
const handlePrint = () => {
  const [yr, mo, da] = selectedDate.split('-')
  printWithTitle(`Caisse_${da}-${mo}-${yr}_${form.shift}`)
}
onClick={isTouchDevice ? handlePrint : handleGeneratePdf}
```
Bouton d'en-tête (souris) + cellule `MobileToolbar` (déjà en place) +
raccourci Ctrl+P.

## Ordre d'exécution

1. Examiner le bloc `@media print` mort existant dans `caisse.css`.
2. Décider réutilisation DOM écran vs bloc dédié.
3. Écrire/adapter le CSS d'impression.
4. Bascule tactile, chemin souris (jsPDF) inchangé.

## Critère de validation

- `npx tsc --noEmit`
- `npx vitest run`
- `npx pnpm build`
- Test manuel tactile : interface d'impression native, dénominations et
  cautions actives visibles et lisibles.
- Test manuel souris : PDF jsPDF inchangé.

## Contrôle qualité (revue)

Étape critique (second rendu d'un document déjà validé, feuille de caisse
= document comptable sensible). Vérifier que les MONTANTS (fond de caisse
effectif, cautions actives, écarts) affichés dans le document imprimé
correspondent exactement à ceux du PDF jsPDF pour la même feuille.
