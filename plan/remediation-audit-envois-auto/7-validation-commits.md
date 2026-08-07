# Étape 7 — Validation globale + commits propres

## Objectif

Valider l'ensemble des correctifs (compilation Deno + TypeScript + build) puis
produire des commits propres et organisés sur `main` (sans push, sauf demande).

## Fichier(s) impacté(s)

- Aucun nouveau ; commit des étapes 1 à 6.

## Travail à réaliser

### 1. Validation technique

```bash
deno check --node-modules-dir=auto supabase/functions/import-report/index.ts
npx tsc --noEmit
pnpm build
```

Corriger toute erreur avant de committer.

### 2. Commits organisés (sans push)

Un commit par correctif cohérent :

- `fix(edge): libere la reservation d'envoi auto sur echec Resend (RepJour + PDJ)` — étape 1
- `fix(edge): borne le candidat d'envoi auto au cycle courant` — étape 4
- `fix(edge): retente l'envoi auto RepJour apres une abstention transitoire` — étape 3
- `fix(edge): ignore les chambres hors inventaire dans les stats PDJ auto` — étape 5
- `fix(ui): message d'import RepJour aligne sur l'ingestion automatique` — étape 6
- `chore(sql): script de reset imported_at (fenetre transitoire)` — étape 2
- `docs(plan): remediation de l'audit des envois auto` — plan/

Chaque message termine par la ligne Co-Authored-By habituelle.

## Ordre d'exécution

1. Lancer les 3 validations.
2. Committer par lot cohérent.
3. Rappeler à l'utilisateur : (a) exécuter le SQL de l'étape 2, (b) redéployer
   `import-report` avec `--no-verify-jwt`.

## Critère de validation

- `deno check`, `npx tsc --noEmit`, `pnpm build` : tous OK.
- `git status` propre après commits ; historique lisible.

## Contrôle /borg

Étape critique (validation globale de fin de chantier). Vérifier :
- Aucune régression introduite par les 6 correctifs (relecture croisée des diffs).
- L'idempotence de l'envoi auto reste correcte malgré le rollback (étape 1) et la
  double tentative (étape 3) : pas de double envoi possible.
- Le build produit un découpage de chunks cohérent (pas de régression perf).
