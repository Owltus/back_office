# Étape 2 — LLM : relecture de la réponse avant import

## Objectif

Avant d'importer, chaque document de la réponse du LLM passe par la relecture
automatique (`alertesRelecture`). Elle signale par exemple :
- un tableau aux colonnes en trop ;
- un bloc `:::` mal fermé ;
- une image dont le chemin n'existe pas dans la médiathèque (« image
  inventée ») ;
- un titre sauté ;
- une étape trop longue.

Les alertes s'affichent dans l'aperçu, sous le document concerné. Elles ne
bloquent jamais l'import.

## Dépend de

L'étape 1 : même aperçu, même ligne par document.

## Fichier(s) impacté(s)

- `src/components/classeur/dialogs/EchangeJsonDialog.tsx`
- `src/lib/classeur/relecture.ts` : `alertesRelecture(markdown, imagesConnues, pages)`, l.101. Le message « image supprimée » est à la l.168.
- `src/components/classeur/hooks/useImages.ts` : médiathèque chargée à l'ouverture, construite comme dans `DocumentDetail.tsx:355-366`.

## Travail à réaliser

1. Pour chaque document créé ou modifié du plan :
   - appeler `alertesRelecture(contenu, médiathèque, null)` ;
   - afficher le nombre d'alertes en pastille sur la ligne ;
   - afficher la liste sous le diff.
2. En tête de l'aperçu : « 3 documents ont des points à vérifier ». Aucun
   blocage, et le Markdown du LLM n'est jamais réécrit.
3. Dans ce contexte, le message « image supprimée » devient « image
   introuvable dans la médiathèque (inventée par le LLM ?) ».

## Implications propres

- **Pas de pagination dans le dialogue.** Les alertes de page (« page
  remplie à moins de 60 % », « schéma découpé ») ne peuvent pas sortir. On
  passe `pages = null`, et la ligne indique que la mise en page sera vérifiée
  dans l'éditeur.
- **`a-inserer` n'est jamais une image inventée.** C'est un emplacement à
  remplir, que les consignes demandent au LLM d'utiliser.
- **Les alertes d'image attendent la médiathèque.** Tant qu'elle est
  `isPending`, aucune alerte d'image n'est affichée. Sinon, toutes les images
  passeraient pour « introuvables » le temps du chargement, ce qui serait un
  mensonge.
- **Une lecture de plus**, faite à l'ouverture du dialogue seulement.

## Phase de test /martin

- **Exemples écrits à la main AVANT d'exécuter :**
  - `![x](24/inexistant.webp)` plus un tableau à 4 cases sous un en-tête à 3
    donnent exactement 2 alertes ;
  - `![x](a-inserer)` ne donne aucune alerte d'image.
- **Propriété (numRuns 300)** : médiathèque `null`, quel que soit le Markdown
  généré, donne zéro alerte d'image. Oracle : la loi elle-même.
- **Propriété (numRuns 300)** : ajouter au document un paragraphe sans
  Markdown ne retire jamais une alerte existante (monotonie).
- **Rendu jsdom** : pastille et en-tête « N documents ».
- **Mutations** (Stryker sur `relecture.ts`) : exception `a-inserer` retirée,
  garde `null` retirée.

## Critère de validation

- Dans le navigateur, sans écrire : alertes visibles, import toujours possible.
- `pnpm test` et `npx tsc --noEmit` verts.
