# Étape 5 — Styles, PDF, cards & légende

## Objectif

Câbler les deux nouveaux statuts partout où l'affichage est décompté ou coloré en
dur : les classes CSS des pastilles, la génération PDF, les cartes de synthèse et
la légende — pour que l'écran et le PDF restent cohérents et complets.

## Contexte

Plusieurs points d'affichage sont indexés par `CellState` ou codés en dur, sans
garde d'exhaustivité automatique (contrairement au type `RoomStatus`) :

- `src/styles/rapro.css` : classes `.rapro-room-clean/-refus/-todo/-noshow/-empty`
  (l.184-223) et pastilles de légende `.rapro-legend-dot.is-*` (l.411-429).
- `src/lib/rapro/pdf.ts` : `CELL_FILL` (l.101-107, couleurs RGB), bandeau de
  compteurs (l.135-142), légende (l.193-199).
- `RaproBoard.tsx` : cards `sold`/`clean`/`balance`/`carried`/`refus`/`noshow` et
  `countStats` (constants.ts:75-92), la légende inline (l.746-761).

La garde d'exhaustivité ajoutée à l'étape 2 couvre le mapping statut → `CellState`,
mais pas ces tables d'affichage : elles doivent être complétées à la main.

## Fichier(s) impacté(s)

- `src/styles/rapro.css` (modifié)
- `src/lib/rapro/pdf.ts` (modifié)
- `src/components/rapro/RaproBoard.tsx` (modifié — cards + légende)

## Travail à réaliser

### 1. Styles CSS

Ajouter les classes des nouveaux états visuels, préfixées `.rapro-*`, avec des
couleurs distinctes de l'existant (vert `clean`, ambre `refus`, rouge `todo`,
violet `noshow`) :

```css
.rapro-room-bloque { /* couleur dédiée « indisponible » */ }
.rapro-room-faux-noshow { /* couleur dédiée */ }
```

Ajouter les pastilles de légende correspondantes `.rapro-legend-dot.is-bloque` /
`.is-faux-noshow`.

### 2. PDF (`pdf.ts`)

- `CELL_FILL` : ajouter les couleurs RGB des nouveaux états (cohérentes avec le
  CSS écran).
- Bandeau de compteurs et légende PDF : inclure les nouveaux statuts dans le même
  ordre que `LEGEND_ORDER`.

### 3. Cards de synthèse & légende écran

- `countStats` (déjà étendu à l'étape 2) : vérifier que les nouveaux décomptes
  sont exposés.
- Ajouter, si pertinent métier, une card ou une ligne de légende pour `bloque` /
  `faux_noshow` dans `RaproBoard.tsx` (l.746-761).

## Ordre d'exécution

1. Ajouter les classes CSS + pastilles de légende.
2. Étendre `CELL_FILL` et la légende dans `pdf.ts`.
3. Compléter cards et légende écran.
4. Comparer visuellement écran vs PDF sur un jour test contenant les 6 statuts.
5. `npx tsc --noEmit`.

## Critère de validation

- Une chambre `bloque` et une chambre `faux_noshow` ont une couleur distincte et
  lisible à l'écran ET dans le PDF.
- La légende (écran et PDF) liste les 6 statuts dans le même ordre.
- Aucun statut n'apparaît sans couleur (trou d'affichage) ni absent du décompte.
- `npx tsc --noEmit` vert.
