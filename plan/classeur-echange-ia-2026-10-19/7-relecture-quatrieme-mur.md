# Étape 7 — Relecture : quatrième mur et 4 natures

## Objectif

Si une IA glisse malgré la consigne une phrase sur elle-même dans le classeur
(« généré par IA », « à vérifier », « je peux me tromper », « brouillon »,
« en tant qu'IA »), l'aperçu d'import le signale sur la ligne concernée, que
ce soit un titre, une description ou un contenu, quelle que soit la nature.
Jamais bloquant (D9) : la ligne peut être refusée.

## Dépend de

5.

## Fichier(s) impacté(s)

- `src/lib/classeur/relecture.ts` : détection (blocs de code ignorés, comme le
  reste) ; active aussi dans l'éditeur (un « à vérifier » oublié vaut d'être
  vu).
- `relireLigneImport` (l.440) : relit titre et description de toutes les
  natures, en plus du contenu des documents.
- `src/components/classeur/dialogs/ApercuImport.tsx` : bandeau l.225
  généralisé (« N éléments ont des points à vérifier »).
- `src/components/classeur/ClasseurListActions.tsx` l.55-66 : relecture avant
  l'import en nouveau classeur (D7).
- `src/lib/classeur/relecture.test.ts`.

## Travail à réaliser

1. Liste fermée d'expressions (insensible à la casse et aux accents), sans
   faux positif évident : « à vérifier » seul dans une procédure de contrôle
   est légitime, donc viser les tournures sur l'IA et sur le texte lui-même
   (« contenu généré », « vérifiez ce texte », « en tant qu'IA »…). Établir la
   liste sur le contenu réel des classeurs de la copie locale (lecture seule) :
   0 alerte attendue sur l'existant.
2. Message : « Phrase sur l'IA dans le texte. Elle serait imprimée. »
3. Étendre la relecture d'import aux titres et descriptions.

## Phase de test /martin

- **Oracle** : les 86 documents réels de la copie locale ne déclenchent aucune
  alerte (faux positifs) ; chaque expression de la liste insérée dans un titre,
  une description ou un contenu en déclenche une.
- **Mutation** : retirer la normalisation des accents doit être attrapé.

## Critère de validation

- `pnpm test src/lib/classeur/relecture.test.ts`, rendu de l'aperçu en jsdom.
