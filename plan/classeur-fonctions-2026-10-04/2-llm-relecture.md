# Étape 2 — LLM : relecture de la réponse avant import

## Objectif

Avant d'importer, chaque document de la réponse du LLM passe par la relecture
automatique (`alertesRelecture`) : tableau aux colonnes en trop, bloc
`:::` mal fermé, image dont le chemin n'existe pas dans la médiathèque
(« image inventée »), titre sauté, étape trop longue… Les alertes s'affichent
dans l'aperçu, à côté du document concerné. Jamais bloquant.

## Fichier(s) impacté(s)

- `src/components/classeur/dialogs/EchangeJsonDialog.tsx`
- `src/lib/classeur/relecture.ts` (déjà pur ; ajouter si besoin l'alerte « chemin d'image inconnu » quand la médiathèque est fournie — elle existe : « image supprimée »)
- `src/components/classeur/hooks/useImages.ts` (médiathèque chargée à l'ouverture du dialogue)

## Travail à réaliser

1. Pour chaque document créé ou modifié du plan : `alertesRelecture(contenu,
   médiathèque)` ; nombre d'alertes en pastille sur sa ligne (« 2 points à
   vérifier »), liste dépliable sous le diff de l'étape 1.
2. En tête de l'aperçu : « 3 documents ont des points à vérifier » ; aucun
   blocage, l'import reste possible (le Markdown du LLM n'est jamais réécrit).
3. Le message « image supprimée » est reformulé, dans ce contexte, en
   « image introuvable dans la médiathèque (inventée par le LLM ?) ».

## Critère de validation

- Test : un JSON dont un document contient `![x](24/inexistant.webp)` et un
  tableau mal formé → 2 alertes sur ce document.
- Navigateur, sans écrire : alertes visibles dans l'aperçu.
