# Étape 4 — Apprentissage par émetteur étendu au couple (code + compte)

## Objectif

Étendre l'apprentissage émetteur pour qu'il mémorise et propose des COUPLES `(code, compte)`, et non plus des codes seuls. À l'issue, quand un émetteur revient, l'app propose les couples déjà utilisés pour lui, classés par fréquence.

## Contexte

`issuerCodes.ts` porte `perIssuer[key] = {code: count}`. La cible : `{ "code|compte": count }`. `issuerDenylist.ts` et la table `facturation_issuer_codes` (PK `(issuer, code)`) suivent. Décision D6 : les compteurs actuels pointent sur des codes inventés → on repart propre (vidage) plutôt que de migrer.

## Fichier(s) impacté(s)

- `src/lib/facturation/issuerCodes.ts` (modification : clé couple)
- `src/lib/facturation/issuerDenylist.ts` (modification : couple)
- `src/lib/facturation/cloudService.ts` (modification : learn/fetch au couple)
- `supabase/facturation_issuer_codes_compte.sql` (nouveau : colonne `compte` + PK `(issuer, code_analytique, compte)`)

## Travail à réaliser

### 1. Modèle

`perIssuer[key] = Record<imputationKey, count>` ; adapter `issuerPrior`, `bumpIssuerCodes`, `issuerMaturity`, `issuerOutliers` au couple. Garder l'immutabilité (retour d'un nouvel objet).

### 2. DB

Étendre `facturation_issuer_codes` : ajouter `compte`, recomposer la PK en `(issuer, code_analytique, compte)`. Vider les lignes existantes (codes inventés, D6). Garde de rôle + `search_path` sur les RPC modifiées.

### 3. Service

`learnIssuerCodes` / `fetchIssuerCodes` / `forgetIssuerCode` au couple.

## Ordre d'exécution

1. Modèle métier (`issuerCodes`, `issuerDenylist`).
2. Service (`cloudService`).
3. L'utilisateur exécute `facturation_issuer_codes_compte.sql` dans Supabase.

## Critère de validation

- `npx tsc --noEmit` + `pnpm build` + tests couple verts.
- Une imputation validée incrémente le bon couple pour l'émetteur.
- `fetchIssuerCodes` renvoie des couples, classés par fréquence.

## Contrôle /borg

Étape critique (schéma `facturation_issuer_codes` en PRODUCTION, PK modifiée + vidage). Audit post-exécution :
- Le vidage ne touche QUE `facturation_issuer_codes` (D6 assumé : données sur codes inventés).
- La recomposition de PK est cohérente (pas de doublon `(issuer, code, compte)`).
- Garde de rôle + `set search_path = public` sur chaque RPC modifiée.
