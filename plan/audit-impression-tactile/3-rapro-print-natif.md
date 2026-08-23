# Étape 3 — Rapro : impression native sur tactile (D1)

## Objectif

Sur écran tactile, remplacer l'appel à `handleGeneratePdf` (jsPDF +
`window.open`) par `printWithTitle()` (`src/lib/print.ts`, déjà utilisé par
PDJ) déclenchant l'impression NATIVE du navigateur sur un document HTML
dédié, stylé `@media print`. Sur souris, RIEN ne change : `handleGeneratePdf`
reste le mécanisme jsPDF actuel, inchangé.

## Contexte

`RaproPdfData` (consommée par `printRaproSheet`, `src/lib/rapro/pdf.ts`)
contient : `titleDate`, `statuses`, `occupied`, `carried`, `counts` (balance/
vendues/nettoyées/refus/bloquées), `comment`, `operatorName`, `validatedAt`.
Le document PDF affiche : titre + date, bandeau de compteurs, grille des
chambres colorée par statut, légende, commentaire, signature opérateur.

Dépend de l'étape 2 (migration `MobileToolbar`) : le document imprimable
doit être un élément du DOM du board, jamais celui de la barre basse
(protégée par `print:hidden` depuis l'étape 2).

## Fichier(s) impacté(s)

- `src/components/rapro/RaproBoard.tsx`
- `src/styles/rapro.css`

## Travail à réaliser

### 1. Décider : réutiliser le DOM écran, ou bloc imprimable dédié ?

Première sous-tâche, avant d'écrire du CSS : comparer la grille de chambres
AFFICHÉE À L'ÉCRAN (déjà colorée par statut) à ce que produit
`renderRaproDocument` (`rapro/pdf.ts:135-...`) — bandeau de compteurs,
grille, légende, commentaire. Si la structure DOM écran est déjà proche
(probable, Rapro affiche déjà une grille chambres/statuts), privilégier la
réutilisation du MÊME DOM, restylé via `@media print` (masquer les boutons/
la Navbar/la barre basse, réafficher les éléments `screen-hidden`
équivalents, ajuster tailles de police/couleurs pour le papier) — c'est le
patron exact de PDJ (`.pdj-floor > table` réutilisé écran ET impression).
Ne construire un bloc HTML entièrement SÉPARÉ que si la structure écran
diverge trop pour être raisonnablement restylée (ex. si la grille écran a
une interactivité — drag, clic droit — qui complique le CSS d'impression).

### 2. CSS `@media print` dans `rapro.css`

Sur le modèle de `src/styles/pdj.css` (`@page`, en-tête compact, grille
figée en dimensions physiques `mm` plutôt que `vh` — cf. le bug corrigé
cette session sur PDJ, à ne PAS reproduire ici) : cacher tout ce qui est
`print:hidden` déjà en place (header, actions, Navbar), afficher le bandeau
de compteurs + la grille + la légende + le commentaire dans une mise en page
sobre, fidèle au contenu du PDF actuel (pas nécessairement pixel-identique —
l'objectif est la même information, pas une réplique exacte du rendu
vectoriel).

### 3. Bascule tactile dans `RaproBoard.tsx`

```ts
function handlePrint() {
  printWithTitle(`Rapprochement_${dd}-${mm}-${yy}`)
}
// ...
onClick={isTouchDevice ? handlePrint : handleGeneratePdf}
```
Appliquer ce branchement aux DEUX endroits où le bouton Imprimer est câblé
(en-tête souris — qui ne s'affichera de toute façon jamais en tactile — et
la cellule `MobileToolbar` migrée à l'étape 2). Le raccourci Ctrl+P
(`usePrintShortcut`) doit suivre la même bascule.

## Ordre d'exécution

1. Comparer DOM écran vs contenu du PDF actuel (sous-tâche 1).
2. Écrire le CSS `@media print` dans `rapro.css`.
3. Brancher `printWithTitle()` sur le chemin tactile uniquement.
4. Vérifier que le chemin souris (`handleGeneratePdf`, jsPDF) est
   STRICTEMENT inchangé.

## Critère de validation

- `npx tsc --noEmit`
- `npx vitest run`
- `npx pnpm build`
- Test manuel (DevTools device mode tactile, puis appareil réel si possible) :
  cliquer Imprimer ouvre directement l'interface d'impression native, avec
  le bandeau de compteurs, la grille et la légende visibles, la Navbar/
  barre basse absentes.
- Test manuel souris : le bouton Imprimer génère toujours le PDF jsPDF
  exactement comme avant cette étape (aucune régression).

## Contrôle qualité (revue)

Étape critique : introduit un second rendu du même document sur un board de
production déjà validé. Avant de clore, relire le CSS d'impression ligne à
ligne en le comparant au contenu de `renderRaproDocument` (rapro/pdf.ts)
pour vérifier qu'aucune information du PDF n'est absente du document HTML
imprimé (comptes, légende, commentaire, opérateur).
