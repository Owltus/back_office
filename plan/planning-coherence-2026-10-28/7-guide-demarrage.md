# Étape 7 — Ordre de réglage et « Prêt à générer »

## Objectif

On sait dans quel ordre régler, et on ne peut plus générer un planning vide en
se faisant dire « complet ».

## Dépend de

5.

## Fichier(s) impacté(s)

- `src/components/planning/EnTeteParametres.tsx:33-38` (ordre : Horaires, Postes, Équipe, Besoins).
- Nouveau `src/components/planning/PretAGenerer.tsx`.
- `mois/BarreMois.tsx:233-242`, `semaine/EnTeteSemaine.tsx:293-299` (bouton de génération).

## Travail à réaliser

1. Menu des paramètres réordonné, numéroté discrètement (1 à 4), avec une coche quand l'étape n'a plus de point bloquant.
2. Tant qu'il manque l'essentiel (aucun code, aucun poste, aucune personne sur un poste, aucun besoin), la page Planning affiche à la place de la grille vide une carte « Pour commencer » en 4 lignes, chacune avec son bouton.
3. Bouton « Générer » grisé s'il reste un point bloquant, avec la raison en infobulle et le lien (D6).
4. Boîte de génération : la liste « À vérifier » non bloquante, repliée, avec « Générer quand même ».

## Phase de test /martin

Référentiel vide → carte « Pour commencer » ; ajout pas à pas → chaque ligne se coche ; bouton actif seulement à la fin.

## Critère de validation

- Test de rendu de la page Planning sur un référentiel vide et sur le seed.
