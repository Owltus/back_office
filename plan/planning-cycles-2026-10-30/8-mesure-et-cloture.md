# Étape 8 — Mesurer, éprouver, clore

## Objectif

Prouver que le moteur complète mieux, sans ralentir ni casser l'existant.

## Dépend de

Étapes 2 à 7.

## Travail

1. Taille du modèle et temps, avant / après, sur les semaines réelles de la
   base locale.
2. Essai « codes exotiques » : poser à la main des codes inhabituels sur une
   semaine, compléter, vérifier : aucun doublon, minimums tenus quand c'est
   possible, places vides expliquées sinon.
3. Essai « échec et mat » : une semaine volontairement impossible ; tout le
   possible est placé, le reste est vide et dit pourquoi.
4. /martin : mutation sur `cycles.ts`, `correspondances` et la contrainte des
   remplaçants ; revue adverse avant de rendre la main.
5. `CLAUDE.md` (section Planning) et mémoire à jour.
6. Rien ne part en prod sans « push ».

## Critère de validation

Temps ≤ 10 s par semaine ; sans shift exotique ni minimum, résultat identique
à aujourd'hui ; bilan chiffré dans `00-INDEX.md`.

## Contrôle /borg

Audit global moteur, base, écrans ; aucune donnée réelle dans le dépôt.
