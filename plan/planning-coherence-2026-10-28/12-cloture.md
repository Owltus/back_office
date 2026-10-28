# Étape 12 ⚠ — Vérification d'ensemble

## Objectif

Prouver que le parcours complet est simple et juste : régler un hôtel neuf de
zéro, générer, comprendre chaque place vide.

## Dépend de

Toutes.

## Travail à réaliser

1. Parcours navigateur sur `localhost:3001`, compte `*@exemple.test` supprimé ensuite : référentiel vide → guide → 4 étapes → génération → places à pourvoir → correction par les liens.
2. Relecture adverse (/borg) des étapes 2, 5, 9, 10.
3. /martin `--quick` sur `eligibilite.ts` et `coherence.ts` (mutation).
4. Bilan dans l'index : commits, chiffres avant / après (couverture, heures sup, points du contrôle sur les données de dev), décisions renversées.
5. Mise à jour de `CLAUDE.md` (section Planning) et de la mémoire.

## Critère de validation

- `npx tsc --noEmit`, `npx vitest run` complet, pgTAP, `pnpm lint` sur `src/**/planning/**`.

## Contrôle /borg

- Aucun texte de l'écran ne contredit le moteur (relecture des phrases de l'étape 1 face aux tests de l'étape 10).
- Aucune donnée réelle ni nom dans le dépôt.
