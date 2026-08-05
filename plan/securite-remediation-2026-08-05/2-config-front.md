# Étape 2 — [ASSISTANT] Durcissement config / front

## Objectif

Corriger les findings de config qui ne dépendent que de fichiers du dépôt (aucune
base). L'assistant fait tout, commit et pousse ; le déploiement Vercel est
automatique au push.

## Findings couverts

- **A6** — HSTS absent : ajouter l'en-tête `Strict-Transport-Security`.
- **B11** — CSP `script-src 'unsafe-inline'` : remplacer par l'empreinte `sha256` du script de thème (statique) pour retirer `'unsafe-inline'`.
- **B12** — Dépendances de prod en `latest` : figer sur des plages/versions du lockfile.
- **I3** — Source map Tesseract servie : la retirer de `public/tesseract/`.

## Fichiers impactés

- `vercel.json` (A6, B11)
- `package.json` (B12)
- `src/lib/theme.ts` (référence pour calculer le hash CSP de B11)
- `public/tesseract/worker.min.js.map` (I3, suppression)

## Travail à réaliser

### 1. HSTS (A6)
Dans `vercel.json`, bloc `headers` : ajouter
`{ "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" }`.

### 2. CSP hash (B11)
Calculer le `sha256` du contenu exact de `THEME_INIT_SCRIPT` (et du bootstrap TanStack si nécessaire), remplacer `'unsafe-inline'` par `'sha256-...'` dans `script-src`. Conserver `'wasm-unsafe-eval'` (tesseract/pdf.js). Vérifier le rendu (thème + app) après build.

### 3. Figer les deps (B12)
Remplacer les `"latest"` de `package.json` (paquets `@tanstack/*`) par les versions résolues dans `pnpm-lock.yaml` (plages `^x.y.z`). `pnpm install` pour recaler le lockfile.

### 4. Source map (I3)
Supprimer `public/tesseract/worker.min.js.map` s'il existe (cosmétique).

## Ordre d'exécution

1. Éditer `vercel.json`, `package.json`, supprimer le `.map`.
2. `pnpm install` (lockfile), `npx tsc --noEmit`, `pnpm build` (vérifier que la CSP hash ne casse pas le rendu).
3. Committer + pousser.

## Critère de validation

- `pnpm build` OK ; l'app se charge, thème appliqué (pas de blocage CSP en console).
- `curl -sI` sur la prod montre `Strict-Transport-Security` (contrôle en fiche 8).
- Plus de `"latest"` dans `package.json`.
