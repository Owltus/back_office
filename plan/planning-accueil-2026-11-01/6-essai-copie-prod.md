# Étape 6 — Essai sur une copie de la prod

## Objectif

Prouver sur les vraies données de l'hôtel (copie locale) que le planning généré tient le tableau, sans casser les postes à part.

## Dépend de

5.

## Travail à réaliser

1. Copie de la prod en local (accord de l'utilisateur), migration jouée.
2. Saisir dans le tableau les chiffres voulus par l'utilisateur.
3. Générer 8 semaines : 0 infraction, chiffres tenus ou manques expliqués, aucun soutien seul, temps par semaine.
4. /martin en essaim (moteur, écran, base) ; vérification adverse de chaque échec.
5. Relecture adverse des correctifs avant de rendre la main.

## Critère de validation

- Rapport court : mesures avant / après, ce qui reste à décider.
- Aucun fichier lisant des données réelles commité.

## Contrôle /borg

Batterie complète : `pnpm build`, `npx tsc --noEmit`, `npx vitest run`, `supabase test db`.
