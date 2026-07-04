# Étape 9 — Validation globale

## Objectif

Vérifier que l'ensemble du chantier est un refactor sans régression : typecheck, lint, build, parcours manuel des pages, aperçus print, et contrôle de conformité aux conventions actées dans l'index.

## Fichier(s) impacté(s)

- Aucun (lecture seule ; corrections mineures éventuelles si un point de contrôle échoue)

## Travail à réaliser

### 1. Vérifications automatisées

```bash
npx tsc --noEmit
pnpm lint
pnpm build
```

### 2. Parcours manuel

Sur `pnpm dev` : les 7 pages se chargent ; Parking (drag/resize, chevauchements, menu contextuel), PDJ (import CSV, stats, impression A4), Affichage (templates, tailles auto, bascule EN, impression A3), navigation mobile (tiroir), menu utilisateur. Titres d'onglet corrects par page.

### 3. Contrôle des conventions

- Plus aucun métier pur dans `src/components/` (parsing, calculs, constantes de domaine).
- `lib/` sans classes Tailwind ni dépendance React (hors stores).
- `components/ui/` intact (aucun fichier shadcn modifié à la main).
- Aucun usage de l'alias `@/` ; imports `#/` avec extension explicite partout.
- `git diff` relu en entier : uniquement des déplacements et factorisations, pas de logique modifiée hors arbitrages D4 (afterprint PDJ) et D12 (titres).

## Ordre d'exécution

1. Commandes automatisées.
2. Parcours manuel.
3. Contrôle des conventions et revue du diff.

## Critère de validation

- Les trois commandes passent sans erreur ni warning nouveau.
- Aucun écart visuel ou fonctionnel constaté sur les pages actives, écran et print.

## Contrôle /borg

Étape critique (validation globale de fin de chantier). Audit :

- Cohérence de l'arborescence finale avec la section « Architecture cible » de l'index.
- Aucune duplication résiduelle parmi celles recensées (avatar, print, canvas, wrapper de page, types affiche).
- Aucun import mort ni fichier orphelin (`integrations/`, sous-composants extraits).
