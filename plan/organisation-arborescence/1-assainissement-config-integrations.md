# Étape 1 — Assainissement de la configuration et des intégrations

## Objectif

Supprimer les pièges de configuration (alias `@/` fantôme, export default mort) et appliquer la règle unique « toute intégration tierce vit dans `lib/` » (arbitrage D1, option A), afin que les étapes suivantes partent d'un socle cohérent.

## Fichier(s) impacté(s)

- `tsconfig.json` (modification : suppression de l'alias `@/*`)
- `src/lib/query.ts` (nouveau — contenu déplacé depuis `integrations/`)
- `src/integrations/tanstack-query/root-provider.tsx` (supprimé, ainsi que le dossier `src/integrations/`)
- `src/router.tsx` (modification : import mis à jour)
- `components.json` (relecture — alias `hooks` conservé, convention actée)

## Travail à réaliser

### 1. Suppression de l'alias `@/*`

Dans `tsconfig.json`, retirer l'entrée `"@/*": ["./src/*"]` de `compilerOptions.paths` en conservant `"#/*"`. Justification : `@/` n'est déclaré ni dans `package.json#imports` ni utilisé nulle part (0 occurrence vérifiée) ; un import `@/...` passerait le typecheck mais casserait au build Vite.

### 2. Déplacement de l'intégration TanStack Query

Créer `src/lib/query.ts` avec le contenu de `src/integrations/tanstack-query/root-provider.tsx`, en supprimant au passage l'`export default TanstackQueryProvider() {}` vide (code mort de scaffold). Seul `getContext()` est conservé et exporté. Mettre à jour l'import dans `src/router.tsx`. Supprimer ensuite `src/integrations/` intégralement.

### 3. Convention hooks (documentation)

Aucun fichier créé : la convention « les hooks custom vont dans `src/hooks/`, dossier créé au premier hook » est actée (l'alias `hooks: #/hooks` de `components.json` reste valide pour un futur `shadcn add`).

## Ordre d'exécution

1. Modifier `tsconfig.json`.
2. Créer `src/lib/query.ts`, mettre à jour `src/router.tsx`, supprimer `src/integrations/`.
3. Vérifier le typecheck.

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- `pnpm dev` démarre et la page d'accueil répond (le routeur consomme `getContext()`).
- Aucune occurrence restante de `integrations/` dans `src/` (recherche textuelle).
