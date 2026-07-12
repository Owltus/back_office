# Étape 5 — Validation globale

## Objectif

Vérifier que les quatre onglets exposent leur page analytique via une URL enfant
cohérente, que les boutons « Analytique » sont homogènes, qu'aucune route existante
n'a régressé, et que le build passe.

## Contexte

Le chantier a converti quatre routes feuilles en routes layout, ajouté trois boards
analytique neufs (PDJ, Parking, Caisse), réutilisé le board Rapro migré, et ajouté
un bouton dans chaque board principal. Cette étape consolide l'ensemble : routes
régénérées, vérifications automatisées, parcours manuel.

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

Vérifier au `build` le découpage des chunks (les nouveaux boards analytique
doivent être code-splittés par route, recharts chargé côté client uniquement).

### 2. Parcours manuel des quatre onglets

- `/pdj` → bouton `LineChart` → `/pdj/analytique` (cartes, tableau, graphiques).
- `/parking` → bouton → `/parking/analytique` (occupation, statuts, pas de €).
- `/caisse` → bouton → `/caisse/analytique` (montants, écarts, fond).
- `/rapro` → bouton → `/rapro/analytique` (vue existante migrée, PDF ELIOR).
- Vérifier que `/repjour/analytique` fonctionne toujours (non touché).
- Vérifier que `/rapro-mois` renvoie 404 (supprimé) sans lien orphelin.

### 3. Contrôle des conventions

- Boutons homogènes : même `Tip`, `variant="outline"`, `size="icon-sm"`, icône
  `LineChart`, placés en premier dans `actions`, StepNav toujours à droite.
- Exports nommés partout, alias `#/` avec extension explicite, `ssr: false` sur les
  quatre nouvelles routes layout, `head` sur chaque route.
- `queryKey` versionnées `['<onglet>','analytics', ...]`.
- Aucune écriture Supabase introduite sur l'ensemble du chantier (que des `select`).

## Critère de validation

- `npx tsc --noEmit`, `pnpm lint`, `pnpm build` passent.
- Les quatre boutons mènent aux quatre pages analytique ; les quatre boards
  principaux rendent toujours sans régression.
- `/repjour/analytique` intact ; `/rapro-mois` supprimé sans lien orphelin.
- Découpage des chunks correct au build.

## Contrôle /borg

Étape critique (validation globale de fin de chantier). `/borg` indisponible →
audit manuel (D5) via le skill `/verify` et le parcours ci-dessus :

- Aucune régression sur les boards principaux (drag parking, autosave caisse,
  ménage rapro, import PDJ).
- Aucune route existante cassée ; `routeTree.gen.ts` cohérent.
- Backend partagé intact : relecture des diffs pour confirmer zéro `insert`,
  `update`, `upsert`, `delete`, ni DDL.
