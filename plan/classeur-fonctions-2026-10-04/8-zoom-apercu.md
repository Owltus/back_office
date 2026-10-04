# Étape 8 — Zoom de l'aperçu A4 (UI et UX pensées)

## Objectif

Dans l'éditeur, l'aperçu A4 s'adapte tout seul à la largeur de sa colonne
(`apercuScale`). L'utilisateur veut pouvoir l'agrandir ou le réduire, et a
demandé : « attention à bien penser l'UI et l'UX ».

## Dépend de

- L'étape 0 (Stryker).
- Les décisions D27 (portée), D28 (raccourcis) et D29 (taille des cibles).

## Ce que font les autres (pratique établie)

- **Word, Google Docs, Acrobat** :
  - un contrôle compact en bas à droite : « − », pourcentage cliquable, « + » ;
  - le pourcentage ouvre un menu : 50 / 75 / 100 / 150 / 200 %, « Ajuster à
    la largeur », « Page entière » ;
  - Ctrl + molette zoome sur le document ;
  - Ctrl + 0 revient à l'ajustement.
- **Figma, navigateurs** :
  - pas de palier de 10 % ;
  - bornes 25 à 400 % ;
  - le point sous la souris reste sous la souris pendant le zoom.

## Proposition

- **Contrôle flottant discret** en bas à droite de la colonne d'aperçu :
  `−` · `Ajusté ▾` / `125 %` · `+`.
  - Menu : Ajuster à la largeur (par défaut, comportement actuel), Page
    entière (une page tient en hauteur), 50, 75, 100, 125, 150, 200 %.
- **Ctrl + molette** au-dessus de l'aperçu seulement (D28) ; la molette seule
  continue de faire défiler.
  - L'écouteur `wheel` est en `passive: false` pour pouvoir appeler
    `preventDefault`.
  - **Ctrl + 0** revient à « ajuster ».
  - Le point sous la souris reste en place.
- **Mémorisé par poste** (`localStorage`, try/catch), pas par document : c'est
  un réglage d'écran, sans donnée.
- Au-delà de la largeur de la colonne, l'aperçu défile aussi horizontalement
  (`items-center-safe`).
- **Ne rien casser** :
  - le clic sur un bloc mène toujours à sa ligne (`allerALigne`) ;
  - la synchro de défilement texte ⇄ aperçu utilise l'échelle EFFECTIVE
    (ajustement × facteur) comme seule source ;
  - la barre flottante d'une image suit l'image.
- **Au doigt** : le pincement natif du navigateur reste disponible ; les
  boutons font 44 px au doigt et 32 px à la souris (D29).

## Fichier(s) impacté(s)

- `src/lib/classeur/zoom.ts` (nouveau, pur) : paliers, bornes, ajustement,
  point fixe.
- `src/components/classeur/hooks/useZoomApercu.ts` (nouveau, sur le modèle de
  `useChapterZoom.ts`).
- `src/components/classeur/detail/ZoomApercu.tsx` (nouveau).
- `src/components/classeur/detail/DocumentDetail.tsx` (l.122-125, l.571 et
  l.660).
- `src/components/classeur/print/usePageScale.ts`.
- `src/components/classeur/print/PrintPreview.tsx`, si D27 = A.

## Implications propres

- Rien de ce qui s'imprime ne change.
- L'étape 9 (voie navigateur) devra capturer à l'échelle 1, sans `zoom` CSS.

## Phase de test /martin

- **Propriétés (numRuns 1000) sur `zoom.ts`.** Les oracles sont des formules
  écrites à la main :
  - toute suite de « + » et « − » reste dans les bornes 25 à 400 % ;
  - « + » puis « − » ramène au palier de départ ;
  - « ajuster » = largeur de colonne ÷ largeur A4 en pixels ;
  - « page entière » = min(largeur ÷ A4, hauteur ÷ A4) ;
  - point fixe : la coordonnée document sous la souris est la même avant et
    après, à 0,5 px près.
- **Rendu jsdom** :
  - le libellé suit le facteur ;
  - Ctrl + 0 affiche « Ajusté » ;
  - une molette sans Ctrl n'appelle pas `preventDefault`.
- **Mutations** : inverser un palier, retirer une borne. Stryker doit
  atteindre au moins 80 % sur `zoom.ts`.
- **Utilisateur** : ressenti à la souris et au doigt.

## Critère de validation

- Navigateur, sans écrire :
  - 50 %, 200 %, Page entière, Ctrl + molette, Ctrl + 0 ;
  - le clic sur un bloc va toujours à sa ligne ;
  - la barre d'une image est bien placée.
