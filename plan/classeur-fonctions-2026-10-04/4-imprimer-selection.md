# Étape 4 — Imprimer une sélection

## Objectif

Dans un chapitre, la sélection multiple (« Sélectionner », cases sur les
cartes) ne sert aujourd'hui qu'à déplacer ou supprimer. On ajoute
**Imprimer** dans sa barre. L'aperçu d'impression s'ouvre alors sur les
éléments cochés, dans l'ordre du chapitre, sans page de garde ni sommaire.

## Fichier(s) impacté(s)

- `src/lib/classeur/selectionImpression.ts` (nouveau, pur, avec ses tests).
  Il calcule l'ordre des éléments sélectionnés selon le chapitre
  (`flattenItems`, sous-listes comprises). Les étapes 5 et 9 le réutilisent.
- `src/components/classeur/ChapterBoard.tsx` :
  - barre de sélection, l.435-510 ;
  - état d'aperçu, l.762-793 : passer de `'item' | 'tout'` à `'item' | 'tout' | 'selection'`.
- `src/components/classeur/print/PrintPreview.tsx` et `ItemPages.tsx`.

## Travail à réaliser

1. Ajouter « Imprimer (N) » dans la barre de sélection, à côté de Déplacer et
   Supprimer. Le bouton est désactivé à 0, car `buildPrintHtml` lève une
   erreur sur 0 page.
2. Aperçu : les éléments cochés, chacun avec sa propre numérotation de pages.
3. Au doigt : le bouton apparaît dans le mode sélection, sans survol.
   `neDemarrePasDeGlisser` s'il est posé dans une carte.

## Implications propres

- `useSelection` n'est pas ordonnée : on ne s'appuie jamais sur l'ordre de
  cochage.
- Un élément supprimé entre le cochage et l'aperçu est ignoré.

## Phase de test /martin

- **Propriétés (numRuns 1000)** : chapitre généré avec sous-listes et cochage
  dans un ordre quelconque. Oracle : un filtre naïf de `flattenItems`.
  - La sortie est une sous-suite de `flattenItems`.
  - Aucun doublon.
  - Les éléments supprimés sont absents.
  - Cocher deux fois revient à cocher une fois (idempotence).
- **Rendu jsdom** : le bouton est désactivé à 0 et son compteur suit la
  sélection.
- **Mutation** : trier par ordre de cochage doit être attrapé.
- **Stryker** : au moins 80 % sur `selectionImpression.ts`.

## Critère de validation

- Dans le navigateur : cocher 3 documents du chapitre 34 ouvre un aperçu de
  ces 3 seuls ; fermer sans imprimer.
