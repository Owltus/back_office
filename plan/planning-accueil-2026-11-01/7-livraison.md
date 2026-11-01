# Étape 7 — Livraison

## Objectif

Mettre en ligne quand l'utilisateur dit « push ».

## Travail à réaliser

1. `PROD_CONFIRME=1 node scripts/livrer.mjs --essai`, résumé à l'utilisateur.
2. La migration écrit du contenu (alignement des consignes) : `--avec-donnees` seulement après accord explicite.
3. `PROD_CONFIRME=1 node scripts/livrer.mjs --confirme=<empreinte> --avec-donnees`.
4. Lecture seule en prod après coup : consignes alignées, contrôle des réglages rejoué.

## Critère de validation

- « Livré. Poste délié de la prod. »
- Les 8 points de présence ont disparu en prod.

## Contrôle /borg

`verif_advisor.sql` et `verif_classeur_acces.sql` OK après livraison.
