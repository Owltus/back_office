# Étape 5 — Validation

## Objectif

Confirmer que le chargement de TOUTES les pages est désormais lisse : en-tête
immédiat, squelette-reflet pendant le chargement, aucune « chose étrange » (flash
d'écran vide, saut de layout, valeurs par défaut corrigées après coup, double
spinner, fondu qui rejoue entre pages).

## Contexte

Le socle (étape 1) fournit les primitives ; la couche app/auth (étape 2) lisse boot
et transitions ; les boards (étape 3) et pages auxiliaires (étape 4) sont branchés
en squelette. Reste à valider l'ensemble en conditions de chargement réelles.

## Fichier(s) impacté(s)

- Aucun (lecture seule ; corrections mineures si un critère échoue).

## Travail à réaliser

### 1. Vérifications automatisées

```bash
npx tsc --noEmit
pnpm lint
pnpm build
```

### 2. Parcours de chargement throttlé

Avec un throttling réseau (Slow 3G) et cache vidé (premier accès), observer :
- Boot : squelette de layout (pas de spinner nu), identique SSR ↔ client.
- Navigation entre toutes les pages (repjour, pdj, parking, rapro, caisse,
  affichage, profil, gestion, comptes) : plus de flash d'écran vide entre pages ;
  chaque page montre son en-tête puis son squelette-reflet, puis les données.
- Première visite (rôle non caché) : plus de double spinner ; Navbar sans `?`/nom
  vide qui pop.
- `/login` en étant connecté : redirection sans flash du formulaire.
- Aucun saut de layout à la bascule squelette → contenu, sur chaque page.

### 3. Contrôle des conventions et non-régression

- Règle appliquée partout : en-tête hors branche loading, `loading` unique, squelette
  reflet des classes, distinction `undefined`/vide.
- « Auth non bloquante » préservée (`loading` levé par la session seule).
- Realtime / saisies optimistes (parking, caisse) intacts.
- Réglages TanStack Query inchangés (revisite dans les 60 s = pas de flash squelette).

## Critère de validation

- `npx tsc --noEmit`, `pnpm lint`, `pnpm build` passent.
- Parcours throttlé : aucune « chose étrange » résiduelle sur l'ensemble des pages.
- Comportement identique pour un utilisateur avec cache (chargement instantané) et
  gracieux (squelette) pour un premier accès.

## Contrôle /borg

Étape critique (validation de fin de chantier, couche auth touchée). `/borg`
indisponible → audit manuel via `/verify` et le parcours throttlé ci-dessus, plus
relecture des diffs pour confirmer : aucune logique de données/métier altérée (seuls
les états de CHARGEMENT changent), aucune divergence d'hydratation, aucune régression
de garde d'authentification/rôle.
