# Étape 4 — La fiche hérite du poste

## Objectif

La fiche d'une personne ne redéfinit pas les codes : elle hérite de ceux de ses
postes et ne peut que les restreindre (D5). La semaine type ne propose que ce
qui est réellement possible.

## Dépend de

2, 3.

## Fichier(s) impacté(s)

- `src/components/planning/parametres/equipe/SectionsFiche.tsx:184-204` (horaires), `269-287` (semaine type).
- `src/lib/planning/eligibilite.ts` (étape 2).

## Travail à réaliser

1. Section Horaires de la fiche, par poste tenu : « Réception : les 12 codes du poste » puis « Tous » / « Seulement ceux-ci » parmi ces 12. Une ligne par poste, repliée par défaut.
2. Codes morts (cochés mais plus permis par aucun poste) : affichés barrés avec « Ce code n'est plus prévu pour ses postes. Le retirer. » (un clic).
3. Semaine type : la liste d'un jour = `codesPermis` sur ses postes, rangée par famille ; un code fixé devenu impossible est signalé dans la case.
4. Personne sans aucun code utilisable sur un poste : phrase dans la fiche (D4), reprise par le contrôle de l'étape 5.

## Phase de test /martin

Pour toute fiche tirée : chaque code proposé par la semaine type passe `codesPermis` ; aucun code mort n'est proposé.

## Critère de validation

- Test de rendu de la fiche : poste restreint à 2 codes → la semaine type ne propose que ces 2 codes.
