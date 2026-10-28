# Étape 8 — Places à pourvoir qui disent où agir

## Objectif

Chaque place restée vide dit pourquoi, en clair, et mène au réglage qui la
débloque. C'est là qu'on fait mieux que les logiciels du marché.

## Dépend de

5.

## Fichier(s) impacté(s)

- `src/lib/planning/verificateur.ts:453-491` (`raisonsBlocage`), `semaine.ts:733-754`.
- `src/components/planning/attention.ts:96-204`, `semaine/PanneauAlertes.tsx:165-219`.

## Travail à réaliser

1. Traduire chaque raison de `raisonsBlocage` en une phrase et un lien : « Personne d'autre n'est titulaire Club » → fiche ou Postes ; « 48 h atteintes » → rien à régler, dire « limite légale » ; « en repos fixe » → fiche, semaine type ; « contrat déjà plein » → aucun lien, dire « au-delà de son contrat ».
2. Regrouper les places identiques (même poste, même code, plusieurs jours) en une ligne « Club, M1 : lundi, mardi, jeudi ».
3. Bouton « Placer quelqu'un » qui ouvre le menu du jour sur la case, avec en tête les personnes possibles (déjà calculées).

## Phase de test /martin

Chaque raison possible a une phrase et un lien ou la mention « limite légale » (test exhaustif sur l'énumération).

## Critère de validation

- `attention.test.ts` à jour ; vérification navigateur sur une semaine de dev avec trous.
