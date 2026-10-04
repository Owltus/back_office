# Étape 8 — Zoom de l'aperçu A4 (UI et UX pensées)

## Objectif

Dans l'éditeur, l'aperçu A4 s'adapte seul à la largeur de sa colonne
(`apercuScale`). L'utilisateur veut pouvoir l'agrandir ou le réduire —
« attention à bien penser l'UI et l'UX ».

## Ce que font les autres (pratique établie)

- **Word, Google Docs, Acrobat** : un contrôle compact en bas à droite —
  « − », pourcentage cliquable (menu 50 / 75 / 100 / 150 / 200 % +
  « Ajuster à la largeur » + « Page entière »), « + » ; Ctrl + molette sur le
  document ; Ctrl + 0 revient à l'ajustement.
- **Figma, navigateurs** : pas de 10 %, bornes 25 – 400 %, le point sous la
  souris reste sous la souris pendant le zoom à la molette.

## Proposition

- **Contrôle flottant discret** en bas à droite de la colonne d'aperçu :
  `−` · `Ajusté ▾` / `125 %` · `+`. Menu : Ajuster à la largeur (défaut,
  l'actuel), Page entière (une page tient en hauteur), 50, 75, 100, 125, 150,
  200 %.
- **Ctrl + molette** au-dessus de l'aperçu (pas ailleurs : la molette seule
  continue de faire défiler), **Ctrl + 0** = ajuster. Le point sous la souris
  reste en place.
- **Mémorisé par poste** (`localStorage`, try/catch), pas par document.
- Au-delà de la largeur, l'aperçu défile aussi horizontalement (déjà possible :
  `items-center-safe`).
- Ne rien casser : le clic sur un bloc mène toujours à sa ligne, la synchro de
  défilement texte ⇄ aperçu tient compte de l'échelle, la barre flottante
  d'une image suit (elle se repositionne déjà en continu).
- Au doigt : pincement natif du navigateur conservé ; le contrôle reste
  utilisable (cibles 32 px).

## Fichier(s) impacté(s)

- `src/components/classeur/detail/ZoomApercu.tsx` (nouveau)
- `src/components/classeur/detail/DocumentDetail.tsx` (échelle effective =
  ajustement × facteur choisi)
- le hook qui calcule `apercuScale` (même dossier)

## Critère de validation

- Navigateur : 50 %, 200 %, Page entière, Ctrl + molette, Ctrl + 0 ; clic sur
  un bloc toujours relié à sa ligne ; barre d'image bien placée.
- Test : fonction pure d'échelle (bornes, paliers, ajustement).
