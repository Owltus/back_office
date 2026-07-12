# Étape 4 — Validation

## Objectif

Confirmer que la factorisation n'a introduit AUCUNE régression : les 10 pages
analytique rendent comme avant, et le layout est désormais piloté par le socle
partagé.

## Contexte

Après migration, chaque board n'exprime plus que son contenu (cartes, colonnes,
lignes, graphes) ; le layout (coquille, tableau borné, cartes, graphes, squelette,
nav) vient de `components/analytique/`. Le test doit couvrir parentes ET enfants,
et les spécificités par onglet.

## Fichier(s) impacté(s)

- Aucun (lecture seule ; corrections mineures éventuelles si un critère échoue).

## Travail à réaliser

### 1. Vérifications automatisées

```bash
pnpm generate-routes
npx tsc --noEmit
pnpm lint
pnpm build
```

Vérifier au build que le découpage par route reste correct et qu'il ne subsiste
aucun import orphelin vers `repjour/charts/KpiLineChart`.

### 2. Parcours visuel des 10 pages

Pour chaque onglet (PDJ, Parking, Caisse, Rapro, RepJour) :
- Vue annuelle : cartes, tableau borné + scroll interne + en-tête collant, nav
  d'année par flèches (+ clavier ←/→ + Alt), clic sur un mois → détail.
- Détail mensuel : bouton retour, tableau plein mois + scroll, liens jour → board
  opérationnel positionné sur le jour, graphes (1 pour Rapro, 2 ailleurs), export
  PDF ELIOR (Rapro).
- État de chargement : squelette reflet du layout, sans saut à l'arrivée des
  données.

### 3. Contrôle des conventions et de la maintenabilité

- Socle sous `components/analytique/`, exports nommés, alias `#/` avec extension.
- Boards allégés : plus de `PageContainer`/`PageHeader`/`StepNav`/`BoardSkeleton`
  en dur dans les boards analytique ; une modification de layout ne touche QUE le
  socle (vérifier en changeant, à blanc, une classe du socle et en constatant la
  propagation aux 10 pages, puis revert).
- `BoardSkeleton` toujours présent pour le dashboard repjour (hors analytique).
- Aucune écriture Supabase introduite (chantier purement présentation).

## Critère de validation

- `npx tsc --noEmit`, `pnpm lint`, `pnpm build` passent.
- Les 10 pages sont iso-fonctionnelles à l'état d'avant migration.
- Le layout est mutualisé : une seule source de vérité par élément (coquille,
  tableau, cartes, graphes, squelette, nav).

## Contrôle /borg

Étape critique (validation de fin de chantier). `/borg` indisponible → audit manuel
via le skill `/verify` et le parcours ci-dessus, plus relecture des diffs pour
confirmer qu'aucune logique de données n'a été altérée pendant l'extraction (seuls
le layout et les imports doivent avoir bougé).
