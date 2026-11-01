# Étape 4 — Vérificateur, contrôle des réglages, places à pourvoir

## Objectif

L'oracle indépendant et les messages de l'app parlent du tableau de l'accueil, plus des besoins Réception et Club.

## Dépend de

3.

## Fichier(s) impacté(s)

- `src/lib/planning/verificateur.ts` : `presenceParCycle` l.617-647, `trous` l.548, nouvelle violation « au-delà de N », extras l.676-686
- `src/lib/planning/coherence.ts` : l.183-212, l.705-783
- `src/lib/planning/raisonsPlaces.ts`, `semaine.ts` l.1205-1248 (`a_pourvoir`, `raisonsBlocage`)

## Travail à réaliser

1. Vérificateur : compte exact, soutien inclus, middle dans deux moments ; ne rien importer de `generateur.ts`.
2. Contrôle : retirer « les besoins demandent N, la consigne en veut M » ; ajouter « il faut N personnes mardi matin, mais seulement K peuvent venir » et « aucun horaire du matin n'est possible ».
3. Places à pourvoir : un moment incomplet devient « Il manque 1 personne mardi matin à l'accueil » avec sa raison.

## Phase de test /martin

Différentiel générateur / vérificateur sur 1 000 semaines tirées ; mutation des comptes (middle compté une fois, soutien exclu) attrapée.

## Critère de validation

- `coherence.test.ts`, `verificateur.test.ts`, `auditMoteur.test.ts` verts.
- Les 8 points actuels de la prod disparaissent sur une copie.

## Contrôle /borg

L'oracle reste indépendant ; aucun message ne parle de « consigne » ni de « minimum ».
