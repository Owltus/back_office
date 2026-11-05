# Étape 6 — Fiche : le jour étoile

## Objectif

D6 : « si choisie c'est comme cela, et sinon c'est appliqué de la meilleure façon ». Dans la fiche d'un 39 h, on choisit (ou non) le jour de sa journée courte. Le planning choisit l'horaire de 7 h qui convient.

## Dépend de

Étape 4.

## Faits établis

- `JourType.etoile` et le bouton ★ existent, mais seulement sur un jour Libre ou Travaille, sans aperçu des horaires possibles, sans message s'il n'y en a aucun.
- La condition « au-delà de 35 h » est écrite en dur dans `brouillon.ts:305` (`etoilePossible`).

## Fichier(s) impacté(s)

- `src/components/planning/parametres/equipe/SectionsFiche.tsx`, `brouillon.ts`
- `src/lib/planning/regles.ts`, `eligibilite.ts` (`rubriqueEtoile`)

## Travail à réaliser

1. Un choix clair dans la fiche : « Jour de la journée courte : au choix du planning / lundi / … / dimanche ».
2. Jour choisi : imposé chaque semaine (sauf semaine où l'étoile saute, déjà calculée). Aucun jour : le planning le place au mieux, comme aujourd'hui.
3. Montrer les horaires de 7 h possibles ce jour-là ; aucun : message dans la fiche et dans « À vérifier ».
4. `etoilePossible` lit la règle du contrat (étape 5), plus « 35 h » en dur.

## Critère de validation

- Test : un 39 h avec jour choisi vendredi reçoit sa journée de 7 h le vendredi, jamais un autre jour.
- Test : sans jour choisi, résultat identique à aujourd'hui (empreinte).
