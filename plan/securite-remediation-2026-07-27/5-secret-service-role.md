# Étape 5 — `service_role` hors du `.env` Vite + commentaire + rotation (M3)

## Objectif

Sortir la clé `SUPABASE_SERVICE_ROLE_KEY` du fichier `.env` chargé par le dev-server
Vite (risque latent de fuite maximale), corriger le commentaire qui affirme faussement
qu'elle n'y est pas, et **faire tourner la clé** puisqu'elle est désormais en clair sur
le poste et citée dans le rapport d'audit.

## Contexte

Vérifié : la clé ne fuite PAS aujourd'hui (`.env` gitignoré, absente du bundle, pas de
préfixe `VITE_`, pas de `define`/`loadEnv` dans `vite.config.ts`). Mais elle vit en clair
dans le fichier que Vite charge — un futur `define`, un plugin qui logge l'env, ou un
`git add -f .env` la divulguerait avec un impact total (contournement de toute la RLS).
Et `.env:2` dit « Aucune clé service_role ici. » — faux (ligne 5), piège de revue.

## Fichier(s) impacté(s)

- `.env` (non commité : retirer la `service_role` + corriger le commentaire)
- `supabase/.env` (déjà gitignoré) ou env shell/outillage : nouvelle localisation

## Travail à réaliser

### 1. Déplacer la clé

Retirer `SUPABASE_SERVICE_ROLE_KEY=...` de `.env` (chargé par Vite). La placer là où
seul l'outillage la lit :
- soit `supabase/.env` (déjà couvert par `.gitignore:40`) pour les scripts de maintenance,
- soit l'environnement shell / le gestionnaire de secrets local.

Vérifier qu'aucun code client ne la lit (elle ne doit servir qu'en maintenance locale ou
dans les Edge Functions, où elle est injectée par les secrets Supabase — pas par ce `.env`).

### 2. Corriger le commentaire trompeur `.env:2`

Remplacer « Aucune clé service_role ici. » par une mention exacte (p. ex. « service_role :
voir supabase/.env / gestionnaire de secrets, jamais ici ni avec préfixe VITE_ »).

### 3. Rotation (dashboard Supabase) — coordonnée

- Générer une nouvelle `service_role` dans le dashboard.
- Mettre à jour les **secrets des Edge Functions** (`create-user`, `delete-user`,
  `send-report`) et l'outillage local AVANT/pendant la bascule.
- Révoquer l'ancienne.

> Geste sensible : tant que les consommateurs ne sont pas mis à jour, ils cassent.
> Prévoir une courte fenêtre et tester une Edge Function juste après.

## Ordre d'exécution

1. Déplacer la clé + corriger le commentaire (local).
2. Rotation dashboard + mise à jour des secrets Edge Functions.
3. Test fumée : appeler une Edge Function admin → toujours 200.

## Critère de validation

- `grep -ri service_role .env` → 0 résultat dans le `.env` chargé par Vite.
- `pnpm build` puis recherche de la (nouvelle) signature de clé dans `dist/` → absente.
- Une Edge Function admin répond toujours après rotation (secrets à jour).
- L'ancienne clé ne fonctionne plus (révoquée).
