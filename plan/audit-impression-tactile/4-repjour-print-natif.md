# Étape 4 — RepJour : impression native sur tactile (D1)

## Objectif

Même principe que l'étape 3 (Rapro), appliqué à `DashboardBoard.tsx` : sur
tactile, `printWithTitle()` sur un document HTML `@media print` ; sur
souris, `handleGeneratePdf` (jsPDF) inchangé.

## Contexte

`RepjourPdfData` (consommée par `printRepjourReport`, `src/lib/repjour/
pdf.ts`) contient : `titleDate`, `realiseJour`, `realiseMTD`, `projeteMois`,
`budget`, `ecart`, `pickup`, `dayOfMonth`, `daysInMonth`,
`monthStartProjection`, `importedAt`. Le document PDF affiche : en-tête,
cartes de synthèse (les mêmes 4 qu'à l'écran via `monthPace`), progression
du mois (acquis/jour/projeté vs budget + répartition), détail par
indicateur (Jour/Cumul/Projeté/Budget/Écart).

## Fichier(s) impacté(s)

- `src/components/repjour/boards/DashboardBoard.tsx`
- `src/styles/repjour.css`

## Travail à réaliser

### 1. Décider : réutiliser le DOM écran, ou bloc imprimable dédié ?

Le commentaire de `repjour/pdf.ts` dit explicitement que les cartes de
synthèse PDF viennent de `monthPace`, « la même source que le composant
écran `SummaryCards` » — donc le DOM écran de `SummaryCards` est déjà très
proche du besoin PDF pour cette partie. Le « détail par indicateur »
(tableau Jour/Cumul/Projeté/Budget/Écart) et la « progression du mois »
existent-ils DÉJÀ comme markup écran ailleurs dans `DashboardBoard.tsx`, ou
sont-ils une mise en page propre au PDF ? Vérifier avant d'écrire le CSS —
s'ils n'existent qu'en PDF, il faudra un bloc HTML dédié pour cette partie
seulement (pas besoin de tout reconstruire si les cartes de synthèse sont
déjà réutilisables telles quelles).

### 2. CSS `@media print` dans `repjour.css`

Même patron que PDJ/Rapro (étape 3) : `@page`, dimensions physiques (`mm`),
masquage du chrome écran, mise en page sobre pour le papier.

### 3. Bascule tactile

```ts
function handlePrint() {
  const [yr, mo, da] = selectedDate.split('-')
  printWithTitle(`Repjour_NACV_${da}-${mo}-${yr}`)
}
onClick={isTouchDevice ? handlePrint : handleGeneratePdf}
```
Aux deux endroits (bouton d'en-tête, cellule `MobileToolbar` déjà en place —
RepJour a déjà migré sur le socle partagé, contrairement à Rapro) + le
raccourci Ctrl+P.

## Ordre d'exécution

1. Vérifier l'existant écran pour chaque section du document (cartes,
   progression, détail).
2. Compléter le markup manquant si nécessaire (section « détail par
   indicateur » notamment, probablement absente à l'écran sous cette forme
   tabulaire).
3. CSS `@media print`.
4. Bascule tactile, chemin souris inchangé.

## Critère de validation

- `npx tsc --noEmit`
- `npx vitest run`
- `npx pnpm build`
- Test manuel tactile : interface d'impression native, cartes + progression
  + détail par indicateur tous visibles.
- Test manuel souris : PDF jsPDF inchangé.

## Contrôle qualité (revue)

Étape critique (second rendu d'un document déjà validé). Vérifier
particulièrement que le tableau « détail par indicateur » (Jour/Cumul/
Projeté/Budget/Écart), qui n'a probablement pas d'équivalent écran direct,
est bien complet et correctement formaté dans le document imprimé — c'est
la section la plus dense en données du rapport.
