# Étape 6 — Besoins et matin / soir réconciliés

## Objectif

Les deux réglages ne se contredisent plus en silence : la vue « Matin et soir »
montre, dans chaque case, ce que donnent les besoins face à la consigne.

## Dépend de

5.

## Fichier(s) impacté(s)

- `src/components/planning/parametres/reglages/ConsignesPresence.tsx`.
- `src/components/planning/parametres/BesoinsPage.tsx`.
- `src/lib/planning/presence.ts` (somme des besoins par période).

## Travail à réaliser

1. Sous chaque compteur « au moins 3 » : « Besoins : 2 » en couleur d'alerte quand ça ne suffit pas, neutre sinon.
2. Bouton « Ajuster » sur une case en écart : ouvre la vue « Par poste » sur le jour, avec la ligne à compléter mise en évidence (pas d'écriture automatique).
3. Phrase en tête de la carte (selon D1) : « Les besoins par poste font le planning. Le matin et le soir vérifient qu'il y a assez de monde. »
4. Si D1 = B : la consigne n'est plus envoyée au moteur, seulement contrôlée (étape 10).

## Phase de test /martin

Pour tout jeu de besoins tiré : le chiffre affiché sous la case = somme indépendante recalculée dans le test.

## Critère de validation

- `BesoinsPage.test.tsx` : écart affiché sur le samedi matin des données de test, disparaît après ajout d'un besoin.
