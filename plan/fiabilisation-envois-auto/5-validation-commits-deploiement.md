# Étape 5 — Validation + commits + déploiement

## Objectif

Valider l'ensemble (compilation Deno + TypeScript + build), committer proprement, puis
guider le déploiement.

## Fichier(s) impacté(s)

- Aucun nouveau ; commit des étapes 1 à 4.

## Travail à réaliser

### 1. Validation technique

```bash
deno check --node-modules-dir=auto supabase/functions/import-report/index.ts
deno check --node-modules-dir=auto supabase/functions/send-report/index.ts
npx tsc --noEmit
pnpm build
```

Corriger toute erreur avant de committer.

### 2. Commits organisés (sans push sauf demande)

- `feat(edge): l'envoi manuel pose le marqueur d'envoi (send-report)` — étape 1
- `fix(edge): RepJour part aux jonctions mois/année + horloge unique par requête` — étape 2
- `fix(edge): envoi robuste (retry 5 stop-au-succès + rollback sur toute erreur)` — étape 3
- `feat(ui): bandeau « pas encore envoyé » sur RepJour et PDJ` — étape 4
- `docs(plan): fiabilisation des envois auto` — plan/

### 3. Déploiement (par l'utilisateur)

```bash
supabase functions deploy import-report --no-verify-jwt
supabase functions deploy send-report
```
(`send-report` garde verify_jwt ON — ne PAS mettre --no-verify-jwt.)

## Ordre d'exécution

1. Lancer les validations.
2. Committer par lot cohérent.
3. Donner les commandes de déploiement.

## Critère de validation

- `deno check` (x2), `npx tsc --noEmit`, `pnpm build` : tous OK.
- `git status` propre après commits.

## Contrôle /borg

Étape critique (validation globale de fin de chantier). Vérifier :
- Pas de régression sur l'idempotence (le retry ne crée pas de double envoi ; le rollback
  ne libère jamais un envoi réussi).
- La règle jonction : le dernier jour du mois/année part bien ; le milieu de mois garde
  le filet « forecast frais » ; pas d'envoi de mauvais chiffres.
- Le marqueur posé par le manuel n'entre pas en conflit avec la réservation atomique de
  l'auto (un envoi manuel avant l'auto doit empêcher l'auto de renvoyer).
- Le bandeau reflète fidèlement l'état réel (pas de faux positif / faux négatif).
