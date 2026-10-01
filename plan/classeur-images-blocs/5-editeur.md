# Étape 5 — Éditeur : dialogue image, barre, retouche

## Objectif

L'utilisateur ne tape jamais une directive : les boutons l'écrivent, et
l'app propose d'office la bonne mise en page selon le format de l'image.

## Fichier(s) impacté(s)

- `src/components/classeur/dialogs/ImagePreparationDialog.tsx`
- `src/components/classeur/detail/InsertionImage.tsx`
- `src/components/classeur/dialogs/ImagesDialog.tsx`
- `src/components/classeur/detail/BarreMiseEnForme.tsx`
- `src/lib/classeur/markdownEdition.ts` (+ tests)
- `src/lib/classeur/images.ts` (`texteAlternatif`, `markdownImage`)
- `src/components/classeur/detail/DocumentDetail.tsx` (retouche au clic)

## Travail à réaliser

### 1. Dialogue de préparation

- Garde : recadrage libre à poignées (`react-image-crop`), formats.
- Retire : Position (Gauche / Centre / Droite), curseur 20-100 %.
- Ajoute : **Légende** (champ texte → alt ; vide par défaut, plus jamais le
  nom de fichier) et **Taille** : Automatique (cochée) / Petite / Moyenne /
  Pleine largeur.
- Miniature A4 : montre la figure centrée avec sa légende et sa hauteur
  réelle.
- Conseils affichés selon l'image (jamais bloquants) : capture > 1 100 px →
  « recadrez sur la zone utile, sinon le texte sera illisible » ; bandeau
  très fin → recadrage proposé ; photo portrait → « la hauteur sera limitée ».

### 2. Barre de mise en forme

- Retire le bouton « Reprendre sous l'image » (`+++`, Bloc `sousImage`).
- Ajoute **Planche de photos** : ouvre la sélection multiple (fichiers ou
  médiathèque), prépare chaque image, écrit le bloc `:::photos` complet.
- Ajoute **Étape illustrée** : entoure la sélection (ou la ligne courante)
  d'un bloc `:::etape` et ouvre l'ajout d'image dedans.
- Tout passe par `execCommand('insertText')` via `appliquerQuandLibre`
  (Ctrl + Z annule).
- `markdownEdition.ts` : `entourerDeBloc(texte, plage, nom)` pure et testée
  (lignes vides autour, titre laissé hors du bloc).

### 3. Retouche au clic

Inchangée dans son principe (clic sur l'image de l'aperçu) ; fonctionne aussi
dans une planche et une étape (`trouverImage` par chemin) ; réécrit légende
et taille.

## Critère de validation

- Contrôle navigateur SANS sauvegarder : ajout d'une photo portrait →
  Automatique, figure ≤ 100 mm ; planche de 4 photos écrite en un clic ;
  étape illustrée autour d'une liste ; Ctrl + Z annule chaque action.
- Tests `markdownEdition` (entourer, idempotence, titre hors bloc).

## Contrôle /borg

- Aucun parcours ne `fetch()` une URL `blob:` (CSP de production).
- Le recadrage d'une image placée fonctionne encore (`ensureQueryData`).
