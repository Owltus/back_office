# Étape 7 — Analytique (socle partagé) : impression native sur tactile (D1)

## Objectif

Faire converger l'impression tactile des 10 pages analytique (5 domaines ×
annuel/mensuel) vers le comportement PDJ, en un seul socle partagé
(`AnalytiqueShell.tsx`) — le meilleur rapport effort/bénéfice du chantier,
puisqu'une seule implémentation couvre 10 pages.

## Contexte

`AnalytiqueShell.handlePrint` (`AnalytiqueShell.tsx:118-129`) génère
actuellement un PDF jsPDF via `printAnalytique` (`src/lib/analytique/
pdf.ts`), qui EXTRAIT les données du DOM déjà rendu (`extractAnalytique` lit
les cartes `.stat-tile`, le `<table>`, le `<svg class="recharts-surface">`)
avant de les redessiner en vectoriel. Contrairement à Parking, le DOM écran
analytique (cartes + tableau + graphique) est DÉJÀ très proche de ce que le
PDF affiche — c'est le candidat le plus favorable à la réutilisation directe
du DOM écran restylé `@media print`, plutôt qu'un bloc dédié.

## Fichier(s) impacté(s)

- `src/components/analytique/AnalytiqueShell.tsx`
- `src/components/analytique/AnalytiqueTable.tsx` (probablement, pour le
  `<thead sticky>` à neutraliser en impression — voir aussi étape 10)
- `src/styles/analytique.css` (NOUVEAU — aucun fichier CSS dédié n'existe
  actuellement pour ce socle)
- `src/styles.css` (ajouter `@import './styles/analytique.css';`)

## Travail à réaliser

### 1. Vérifier la fidélité du DOM écran vs le contenu extrait par `extractAnalytique`

Lister précisément ce que `extractAnalytique` lit (cartes, tableau, graphique
SVG) et vérifier que CHAQUE page analytique (10) affiche bien tout cela à
l'écran, sans élément manquant qui n'existerait qu'en PDF. Si tout y est
(probable), le CSS `@media print` peut se contenter de : masquer le chrome
(header, actions, `MobileToolbar`), afficher le graphique SVG tel quel
(pas besoin de le rasteriser en PNG comme le fait `rasterizeChartSvg` pour
jsPDF — un SVG s'imprime nativement), reformater cartes/tableau pour le
papier.

### 2. CSS `@media print` dans `analytique.css` (nouveau fichier)

Sur le modèle des autres documents (portrait, `@page` avec marges en `mm`).
Un seul jeu de règles CSS, ciblant les classes stables déjà documentées dans
le composant (`stat-tile`, etc.) — profite aux 10 pages sans dupliquer quoi
que ce soit par domaine.

### 3. Bascule tactile dans `AnalytiqueShell.tsx`

```ts
function handlePrint() {
  printWithTitle(printTitle)
}
onClick={isTouchDevice ? handlePrint : handlePrintPdf} // renommer l'actuel handlePrint en handlePrintPdf pour libérer le nom
```
Un seul point de branchement suffit (le bouton d'en-tête et la cellule
`MobileToolbar` de `AnalytiqueShell` appellent déjà la même fonction) —
répercuté automatiquement sur les 10 pages sans les toucher individuellement.
Le raccourci Ctrl+P (`usePrintShortcut(handlePrint)`, ligne 130) doit suivre
la même bascule.

## Ordre d'exécution

1. Vérifier la fidélité DOM écran vs `extractAnalytique` (sous-tâche 1).
2. CSS `@media print`.
3. Bascule tactile dans `AnalytiqueShell` (un seul endroit, 10 pages
   couvertes).

## Critère de validation

- `npx tsc --noEmit`
- `npx vitest run`
- `npx pnpm build`
- Test manuel tactile sur AU MOINS une page par domaine (5) : interface
  d'impression native, cartes + tableau + graphique visibles et lisibles.
- Test manuel souris (au moins 2 pages) : PDF jsPDF inchangé.

## Contrôle qualité (revue)

Étape critique (touche le socle partagé de 10 pages). Avant de clore,
vérifier explicitement sur au moins un domaine (ex. Rapro, qui a servi de
référence historique à `AnalytiqueShell`) que le graphique s'imprime
correctement (les navigateurs mobiles ont des politiques de rendu SVG
variables) et que rien du contenu extrait par `extractAnalytique` ne manque
dans le rendu imprimé.
