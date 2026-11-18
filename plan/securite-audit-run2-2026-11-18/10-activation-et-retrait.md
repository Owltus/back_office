# Étape 10 — Hotel Code imposé, puis retrait de l'ancien contrôle

## Objectif

Une fois les observations propres, passer en mode strict, un changement par nuit.

## Travail à réaliser

### 1. Hotel Code imposé

Après les 3 nuits propres de l'étape 9 : secret `HOTEL_CODE_ENFORCE=true`. Aucun code ne change. Observer une nuit.

### 2. Retrait de `senderAuthPassed`

- Dans le Worker, retirer `senderAuthPassed` et la lecture de `SENDER_AUTH_ALIGNEE`.
- Inverser les cas du test qui attendaient l'ancien comportement.
- Mettre à jour les commentaires de `wrangler.toml`.

Désormais, le retour arrière passe par un retour de version Cloudflare. Observer une nuit avec le même protocole qu'à l'étape 9.

## Critère de validation

- Une nuit propre après chaque changement.
- La mémoire et CLAUDE.md disent que le Worker est en mode strict seul.

## Contrôle /borg

- Le retour de version est noté avant le déploiement.
