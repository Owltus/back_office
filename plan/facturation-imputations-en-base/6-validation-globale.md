# Étape 6 — Validation globale

## Objectif

Garantir que la migration ne casse rien : typecheck, tests et build au vert, tests
adaptés au registre dynamique, et vérification manuelle du flux complet (lecture +
CRUD + garde suppression).

## Contexte

`facturation.test.ts` s'appuie sur des données jusqu'ici synchrones : `budgetLabel('FMELECoooo')
=== 'Electricité'`, `SEED_RULES`, `seedPool()`, plusieurs `buildGalaxy(...)`. Avec le
registre vide par défaut, ces tests doivent **peupler le registre** (fixtures) et
**passer les lignes** à `buildGalaxy`.

## Fichier(s) impacté(s)

- `src/lib/facturation/facturation.test.ts` (modif)
- (contrôle transverse sur les 14 fichiers du chantier)

## Travail à réaliser

### 1. Adapter les tests

- **Registre** : avant les tests dépendant de `budgetLabel`, appeler
  `setBudgetLines([...fixtures])` (ou reconstruire un jeu minimal contenant
  `FMELECoooo → Electricité`). Sans ça, `budgetLabel` renvoie le code brut.
- **`buildGalaxy`** : ajouter l'argument `lines` aux appels de test qui vérifient la
  coloration/catégorie (sinon `TAG_BY_CODE` vide → tout « Autre »). Les appels qui ne
  testent que la structure des nœuds peuvent passer `[]`.
- **`SEED_RULES`/`seedPool`** : inchangés (restent en dur, D1) → tests conservés tels quels.

### 2. Contrôles transverses

- `grep -rn "BUDGET_LINES" src` → n'apparaît que dans `types`/tests, plus dans le code applicatif.
- Vérifier qu'aucun import ne pointe encore `budgetLabel`/`budgetHint` depuis `constants.ts`.
- Dégradation gracieuse : simuler table absente (query en erreur → `retry:false` →
  `budgetLines = []`) : l'app fonctionne, libellés = codes bruts, aucune exception.

### 3. Commandes

```bash
npx tsc --noEmit
npx vitest run src/lib/facturation
pnpm build
npx prettier --write <fichiers modifiés>
```

### 4. Vérification manuelle (une fois le SQL exécuté par l'utilisateur)

- Recharger `/facturation` : libellés/tooltips corrects (galaxie colorée, `CodePicker` peuplé).
- Créer / éditer / supprimer une imputation ; tenter de supprimer une imputation
  utilisée (doit être bloquée avec motif).

## Ordre d'exécution

1. Adapter `facturation.test.ts` (registre + `buildGalaxy`).
2. `npx tsc --noEmit`, `npx vitest run src/lib/facturation`, `pnpm build`.
3. `npx prettier --write` sur les fichiers touchés.
4. Vérification manuelle du flux (après exécution SQL).

## Critère de validation

- `tsc`, `vitest`, `build` : tout vert.
- Aucun `BUDGET_LINES` applicatif résiduel ; imports `budgetLabel`/`budgetHint`
  uniquement depuis `budgetRegistry`.
- Flux manuel complet OK : lecture, CRUD, blocage de suppression d'une imputation utilisée.

## Contrôle /borg

- **Non-régression** : détection/imputation identique à l'avant-migration une fois la
  table peuplée (mêmes libellés, mêmes tags, même galaxie).
- **Dégradation gracieuse** : table absente / query KO → app fonctionnelle, repli code,
  aucune exception non gérée.
- **Sécurité** : écritures uniquement via RPC gardées par rôle ; garde « déjà utilisée »
  effective côté serveur (pas seulement l'UI).
- **Cohérence du référentiel** : `SEED_RULES`/`TAGS` toujours en dur et cohérents avec
  les codes en base (pas de règle pointant un code inexistant).
- **Aucune donnée perdue** : seed additif, RPC idempotentes, aucune FK dure posée sans
  audit préalable des orphelins.
