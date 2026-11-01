# Étape 5 — Écran Besoins simplifié

## Objectif

En tête de la page Besoins, le tableau de l'accueil (matin / soir / nuit × 7 jours, un chiffre par case) ; dessous, les onglets des seuls postes à part.

## Dépend de

2, 4.

## Fichier(s) impacté(s)

- `src/components/planning/parametres/BesoinsPage.tsx` (onglets l.459-507, textes l.430-451)
- `src/components/planning/parametres/besoins/PresenceMinimum.tsx` (un seul compteur)
- `src/components/planning/parametres/besoins/historique.ts`, `parametres/reglages/besoins.ts`
- `src/components/planning/semaine/Presence.tsx` (pastilles semaine et mois)
- `src/components/planning/parametres/PostesPage.tsx` l.393-402 (case « présence »)

## Travail à réaliser

1. Tableau de l'accueil : un compteur par case, écrit `minimum = maximum` par `reglerConsigne`.
2. Onglets : Réception, Club et Veille de nuit retirés ; restent Direction, Adjoint, Supervision, Technique.
3. Annuler / Rétablir gardé pour le tableau.
4. Pastilles : « 3 / 3 » vert, manque ou surplus en orange ; plus de « aucun minimum réglé ».
5. Textes réécrits : phrases courtes, sans « consigne », « minimum », « maximum ».

## Phase de test /martin

Tests de rendu (`BesoinsPage.test.tsx`, `Presence.test.tsx`) réécrits ; singe chaotique sur le tableau (clics rapides, Ctrl + Z) en local.

## Critère de validation

- Tests de rendu verts, `pnpm build` passe.
- Vérifié dans Chrome sur `localhost` avec un compte d'essai `@exemple.test` supprimé ensuite.
