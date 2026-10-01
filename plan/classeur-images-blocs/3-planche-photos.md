# Étape 3 — Bloc `:::photos` (planche de photos légendées)

## Objectif

Ranger plusieurs photos dans une grille régulière sans aucun réglage :
repérage (manchettes), avant/après, conforme/non conforme, aller/retour.

```md
:::photos
![Manchette 1 : près du ballon rouge, en hauteur](5/….webp)

![Manchette 2 : près du ballon rouge, en partie basse](5/….webp)
:::
```

## Fichier(s) impacté(s)

- `src/components/classeur/print/BlocPhotos.tsx` (nouveau) + test de rendu
- `src/components/classeur/print/DocumentPages.tsx` (composant `div[data-bloc]`)
- `src/lib/classeur/print/paginate.ts` (kind `grille`)
- `src/styles/classeur.css`

## Travail à réaliser

### 1. Rendu

- Colonnes automatiques selon le nombre d'images : 1 → 1 (bornée), 2 → 2,
  3 → 3, 4 → 2 × 2, 5-6 → 3, au-delà → 3.
- Cases au MÊME format 4:3 : `object-fit: cover` pour une photo, `contain`
  pour une capture (distinction par le format : capture = PNG d'origine ou
  ratio > 1,9 ; à défaut `contain`, qui ne rogne jamais).
- Légende sous chaque case (règle `legende.ts`), numérotation automatique
  optionnelle si aucune légende.
- Contenu non-image dans le bloc : rendu tel quel SOUS la grille (jamais
  perdu) ; la relecture le signale.

### 2. Pagination

Nouveau kind `grille` : coupable ENTRE deux rangées, une rangée minimum par
morceau (`MIN_PAR_MORCEAU = 2` ne s'applique pas), hauteur de rangée = max des
cases + écart. Réutilise `grouper()` / `buildOpenTag()`. 2-3 tests jsdom.

### 3. Registre (bureau)

Il affichera `:::photos` et `:::` en texte, les images en dessous : lisible.
Noté dans les consignes et l'aide.

## Critère de validation

- 1, 2, 3, 4, 5, 7 photos de formats mélangés (portrait, paysage, capture) :
  rangées de même hauteur, aucun débordement.
- Grille de 9 photos sur une page déjà à moitié pleine : coupée entre deux
  rangées, aucune case rognée.
- Test de rendu : nombre de colonnes et de légendes ; mutation attrapée.
