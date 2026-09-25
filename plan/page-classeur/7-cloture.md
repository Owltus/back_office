# Étape 7 — Clôture

## Objectif

Rendre le chantier conforme aux règles transverses et vérifiable.

## Travail à réaliser

1. **Squelettes** : silhouettes `FormeClasseurListe`, `FormeClasseurDashboard`,
   `FormeChapitre`, `FormeDetail` dans `PageShapes.tsx`, relevées sur le DOM
   réel ; variante `classeur` dans `RouteSkeleton` + `VARIANTES_DIVERGENTES`
   + tests qui comptent.
2. **Cache persisté** : vérifier dans le navigateur que les clés `classeur`
   sont bien écrites (objets nus) et qu'aucune n'est refusée par
   `survitAuJson`.
3. **Doc** : `CLAUDE.md` (section Classeur : tables, droits, format JSON,
   moteur d'impression, bibliothèques lourdes chargées à l'usage), mémoire.
4. **Vérifications** : `tsc`, lint, tests, build (poids des chunks : la
   route `/classeur` ne doit pas alourdir l'entrée), `verif_advisor.sql`,
   `verif_audit_2026-09-06.sql`.
5. **Revue adverse** : un agent relit RLS + service + fusion avec la grille
   de `martin --secu` (jamais sur la prod en écriture).

## Critère de validation

- Tout vert ; contrôle en production avec le compte admin selon la liste de
  l'index.
