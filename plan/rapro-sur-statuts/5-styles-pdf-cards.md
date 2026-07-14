# Étape 5 — Icône qualificatif, PDF, cards, légende

## Objectif

Afficher chaque sur-statut comme une **icône** dans la case chambre (pas une
couleur de fond), à l'écran comme au PDF, et refléter les qualificatifs dans les
cards et la légende. Base = couleur ; qualificatif = icône lisible en un coup
d'œil.

## Contexte

`src/styles/rapro.css` : couleurs de base `.rapro-room-*` ; `.rapro-room-reportee`
= pastille d'angle `::after` en haut-droite (marqueur additif existant). Le bouton
de case (`.rapro-room`) contient le numéro de chambre — on y superpose une icône
en coin. `src/lib/rapro/pdf.ts` : `CELL_FILL` (couleur par base), pastille
« reportée » dessinée en plus, légende. jsPDF ne rend pas de SVG lucide
facilement → au PDF, le qualificatif = un petit glyphe/lettre en coin + une
légende explicite.

## Fichier(s) impacté(s)

- `src/styles/rapro.css` (modifié)
- `src/lib/rapro/pdf.ts` (modifié)
- `src/components/rapro/RaproBoard.tsx` (modifié — icône en case, cards, légende)

## Travail à réaliser

### 1. Icône en case (écran)

Rendre l'icône `QUALIFIER_ICON[qualifier]` dans le bouton, positionnée en coin
opposé à « reportée » :

```css
.rapro-room { position: relative; }         /* déjà induit par reportée */
.rapro-room-qual-icon {
  position: absolute;
  top: 1px; left: 2px;                       /* haut-gauche (reportée = haut-droite) */
  width: 0.7rem; height: 0.7rem;
  opacity: 0.85;
  pointer-events: none;
}
```

Côté JSX : si `qualifier`, rendre `<Icon className="rapro-room-qual-icon" />` dans
le bouton. L'icône hérite de la couleur du texte du base (contraste assuré) ou
une teinte neutre selon lisibilité.

### 2. PDF (pdf.ts)

- Couleur de case = base.
- Pour une chambre qualifiée, dessiner un petit **glyphe/lettre** en coin
  (ex. initiale : F = faux no-show, D = départ anticipé, R = délogement/recouche),
  ou un mini-pictogramme vectoriel simple. Coin distinct de « reportée ».
- Légende PDF : une ligne par qualificatif (glyphe → libellé).

### 3. Cards & légende (écran)

- Une card (ou une ligne) par qualificatif, avec son icône + le compteur
  (`countStats` par qualificatif). Vérifier la grille `.rapro-stats`.
- Légende écran : entrées « Faux no-show / Départ anticipé / Délogement » avec
  l'icône, après la légende des couleurs de base (comme « Reportée »).

## Ordre d'exécution

1. Choisir les 3 icônes lucide (`QUALIFIER_ICON`) et le style `.rapro-room-qual-icon`.
2. Rendre l'icône dans le bouton de case.
3. Glyphe + légende côté PDF.
4. Cards + légende écran.
5. Comparer écran vs PDF sur un jour test avec chaque qualificatif + une chambre
   à la fois reportée ET qualifiée (icône + pastille sans collision).
6. `npx tsc --noEmit`.

## Critère de validation

- Chaque qualificatif s'affiche par une icône lisible en coin, SANS masquer la
  couleur du base, à l'écran ET au PDF (glyphe).
- Une chambre reportée ET qualifiée montre l'icône (haut-gauche) et la pastille
  reportée (haut-droite) sans collision.
- La légende (écran + PDF) documente les 3 qualificatifs.
- `npx tsc --noEmit` vert.
