# Étape 4 — Bloc `:::etape` (texte à gauche, photo à droite)

## Objectif

La version établie de « l'image à côté du texte » : le tableau « Action |
Photo » des modes opératoires, en deux colonnes, pas un habillage.

```md
### 4. Température du ballon

:::etape
Sur le boîtier, appuyer sur le **bouton rouge** :

1. Un appui court.
2. Un appui long.
3. Trois appuis courts.

![Boîtier du ballon, bouton rouge](5/….webp)
:::
```

Le titre `###` reste HORS du bloc : la règle « un titre n'est jamais seul en
bas de page » l'emporte alors avec l'étape.

## Fichier(s) impacté(s)

- `src/components/classeur/print/BlocEtape.tsx` (nouveau) + test de rendu
- `src/components/classeur/print/DocumentPages.tsx`
- `src/lib/classeur/print/paginate.ts`
- `src/styles/classeur.css`

## Travail à réaliser

### 1. Rendu

- Les paragraphes « image seule » du bloc vont dans la colonne de droite
  (≈ 38 % de la largeur, 1 à 3 images empilées, la 1re principale comme
  Dozuki) ; tout le reste (texte, listes, encadrés) à gauche, dans l'ordre.
- Image de la colonne : largeur de la colonne, hauteur bornée (≈ 90 mm).
- Aucune image dans le bloc : rendu comme du texte normal.

### 2. Pagination

- Bloc insécable s'il tient sur une page.
- Plus haut que la page (angle à valider) : repli = l'étape se DÉROULE en
  blocs normaux (texte, puis la ou les photos en figures centrées), coupables
  comme d'habitude. Jamais rogné.

## Critère de validation

- Doc 89 étapes 1, 2, 4 : texte et photo alignés en haut, aucun vide sous la
  photo supérieur à la hauteur du texte + 10 mm.
- Étape artificiellement trop longue : déroulée, aucun débordement.
- Test de rendu : répartition gauche/droite ; mutation attrapée.
