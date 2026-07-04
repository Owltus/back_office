# Étape 7 — PageContainer, routes et titres de page

## Objectif

Absorber le wrapper de page dupliqué dans les 7 routes (`flex flex-1 flex-col p-4 md:p-6` + variantes) dans un composant `PageContainer`, et donner à chaque page un titre d'onglet distinct (arbitrage D12 — changement visible assumé).

## Contexte

Les routes sont des wrappers fins homogènes ; seules les className divergent : `pdj.tsx` ajoute `print:p-0`, `affichage.tsx` ajoute `min-h-0` et `print:p-0`. Aucune route ne définit de `head`, le titre navigateur reste « Back Office » partout. Contrainte TanStack : `src/routes/`, `__root.tsx`, `router.tsx` et `routeTree.gen.ts` ne bougent pas.

## Fichier(s) impacté(s)

- `src/components/shared/PageContainer.tsx` (nouveau)
- `src/routes/index.tsx`, `repjour.tsx`, `rapro.tsx`, `caisse.tsx`, `parking.tsx`, `pdj.tsx`, `affichage.tsx` (modification ×7)
- `src/routeTree.gen.ts` (régénéré automatiquement, non édité)

## Travail à réaliser

### 1. `PageContainer`

Composant avec les props `printBleed?: boolean` (ajoute `print:p-0`) et `fillHeight?: boolean` (ajoute `min-h-0`), base `flex flex-1 flex-col p-4 md:p-6`, `children`. Reproduction exacte des trois combinaisons observées.

### 2. Adoption dans les 7 routes

Remplacer le `<div>` wrapper de chaque route par `PageContainer` (`printBleed` pour pdj et affichage, `fillHeight` pour affichage). Structure conservée : `export const Route` seul export, fonction page privée.

### 3. Titres par page

Ajouter à chaque route un `head: () => ({ meta: [{ title: '<Label> — Back Office' }] })` (API TanStack Router), avec les labels de `NAV_ITEMS` : Dashboard, RepJour, Parking, Rapro, Affichage, PDJ, Caisse. Le titre global de `__root.tsx` reste le fallback. Point d'attention : `printWithTitle` (étape 2) restaure `document.title` vers le titre courant de la page, pas vers un libellé codé en dur — vérifier l'interaction.

## Ordre d'exécution

1. Créer `PageContainer.tsx`.
2. Basculer les 7 routes, laisser la génération mettre à jour `routeTree.gen.ts`.
3. Typecheck et vérification de chaque page.

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- Chaque page affiche son padding et son comportement print inchangés (aperçu print PDJ et affiche).
- Le titre d'onglet change en naviguant (« PDJ — Back Office », etc.) et redevient correct après une impression.

## Contrôle /borg

Étape critique (8 fichiers touchés simultanément). Audit post-exécution :

- Les trois variantes de wrapper sont reproduites à l'identique (comparaison des className calculées).
- `routeTree.gen.ts` régénéré sans diff parasite.
- Aucun changement de layout visible (scroll, hauteur `min-h-0` d'affichage notamment).
