# Étape 5 — Parking : impression native sur tactile (D1) — la plus complexe

## Objectif

Même principe que les étapes 3-4, appliqué à `ParkingBoard.tsx`, avec une
différence structurelle importante : contrairement à Rapro/RepJour, le DOM
écran de Parking (planning horizontal défilable, plusieurs semaines) n'a
AUCUN rapport structurel avec le document imprimé (4 feuilles de suivi
séparées, une par jour, grille fixe 14 places). Réutiliser le DOM écran
n'est pas une option ici : un bloc HTML imprimable DÉDIÉ est nécessaire.

## Contexte

`ParkingSheetPdfData` (consommée par `printParkingSheets`, `src/lib/parking/
pdf.ts`) contient `days: [{ date, rows: [{ spot, nom, numero, facture,
checkIn, checkOut }] }]` pour 4 jours (J-1 à J+2 par rapport à aujourd'hui).
Le PDF actuel est en PAYSAGE, deux tableaux par page (donc 2 pages pour 4
jours) : colonnes Place / NOM / N° / Facturé? / Check-in / Check-out, 14
places par tableau, places 13 et 14 grisées (personnel), pictogramme PMR sur
la place 8.

C'est le document le plus dense de l'app et le seul en orientation paysage —
prévoir plus de temps que les 3 autres étapes.

## Fichier(s) impacté(s)

- `src/components/parking/ParkingBoard.tsx`
- `src/styles/parking.css` (NOUVEAU — Parking n'a actuellement aucun fichier
  CSS dédié, tout est en classes Tailwind)
- `src/styles.css` (ajouter `@import './styles/parking.css';`, à la même
  place alphabétique que les autres `@import` du fichier)

## Travail à réaliser

### 1. Calculer les mêmes données que `handleGeneratePdf`, mais pour le rendu HTML

Le calcul des 4 jours + lignes pré-remplies (`ParkingBoard.tsx:790-838` —
`fetchPdjDay`, `matchRoom`, dates de séjour) est identique quel que soit le
mécanisme de sortie (jsPDF ou HTML). Factoriser ce calcul dans une fonction
partagée (ex. `buildParkingSheetData()`) réutilisée par les deux chemins
(souris → jsPDF, tactile → bloc HTML), pour que les deux rendus ne puissent
jamais diverger sur LES DONNÉES (seule la présentation CSS diffère).

### 2. Bloc HTML imprimable dédié

Un bloc JSX toujours monté (`hidden print:block` ou équivalent — invisible à
l'écran, visible SEULEMENT à l'impression), qui reproduit la structure du
PDF : 4 grilles jour (Place/NOM/N°/Facturé?/Check-in/Check-out, 14 lignes,
13-14 grisées), sur le modèle des `.pdj-floor > table` de PDJ mais adapté au
contenu Parking.

### 3. CSS `@media print` dans `parking.css` (nouveau fichier)

`@page { size: A4 landscape; margin: ...; }` — paysage, contrairement aux
3 autres documents (portrait). Deux tableaux par page (page-break entre le
2e et 3e jour). Reprendre les couleurs/grisés du PDF actuel (places 13-14).

### 4. Bascule tactile

```ts
function handlePrint() {
  const stamp = /* même calcul de date que handleGeneratePdf */
  printWithTitle(`Feuille_parking_${stamp}`)
}
onClick={isTouchDevice ? handlePrint : handleGeneratePdf}
```
Bouton d'en-tête (souris, jamais affiché en tactile) + cellule
`MobileToolbar` (déjà en place) + raccourci Ctrl+P.

## Ordre d'exécution

1. Factoriser le calcul des données (sous-tâche 1) — sert de base commune
   fiable pour ne pas dupliquer la logique métier (matching PDJ, dates).
2. Construire le bloc HTML imprimable (structure d'abord, sans style).
3. CSS `@media print` paysage (nouveau fichier `parking.css` + son
   `@import` dans `styles.css`).
4. Bascule tactile, chemin souris (jsPDF) inchangé.

## Critère de validation

- `npx tsc --noEmit`
- `npx vitest run`
- `npx pnpm build`
- Test manuel tactile : interface d'impression native en PAYSAGE, 4 jours
  répartis sur 2 pages, places 13-14 grisées, pictogramme PMR sur la place 8.
- Test manuel souris : PDF jsPDF inchangé (mêmes 4 jours, même contenu).
- Comparer une feuille imprimée en tactile à son équivalent jsPDF (souris)
  pour la MÊME date : les données (noms, chambres, dates de séjour) doivent
  être identiques — seule la mise en page peut différer.

## Contrôle qualité (revue)

Étape la plus critique du chantier : document le plus dense, orientation
paysage inédite pour un document HTML imprimé dans cette app, et risque de
divergence de données le plus élevé si le calcul n'est pas correctement
factorisé (sous-tâche 1). Avant de clore, vérifier explicitement que les
DEUX chemins (souris et tactile) produisent les mêmes lignes pour la même
date, en comparant un export de chaque côté.
