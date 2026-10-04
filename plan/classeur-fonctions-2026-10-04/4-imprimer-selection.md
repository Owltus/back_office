# Étape 4 — Imprimer une sélection

## Objectif

La sélection multiple d'un chapitre (« Sélectionner », cases sur les cartes)
ne sert aujourd'hui qu'à déplacer ou supprimer. Ajouter **Imprimer** dans sa
barre : l'aperçu d'impression s'ouvre sur les éléments cochés, dans l'ordre du
chapitre, sans page de garde ni sommaire.

## Fichier(s) impacté(s)

- `src/components/classeur/ChapterBoard.tsx` (barre de sélection)
- `src/components/classeur/print/PrintPreview.tsx` + `ItemPages.tsx` (rendu d'une liste d'éléments, déjà utilisé pour le chapitre)
- `src/lib/classeur/selectionImpression.ts` (nouveau, pur + test) : ordre des éléments sélectionnés selon le chapitre.

## Travail à réaliser

1. Bouton « Imprimer (N) » dans la barre de sélection, à côté de Déplacer et
   Supprimer ; désactivé si rien n'est coché.
2. Aperçu : les éléments cochés, chacun avec sa numérotation de pages propre
   (comme l'impression d'un chapitre).
3. Au doigt : même bouton dans le mode sélection (pas de survol requis).

## Critère de validation

- Test : ordre conservé quelle que soit l'ordre de cochage.
- Navigateur : cocher 3 documents du chapitre 34 → aperçu de ces 3 seuls ;
  fermer sans imprimer.
