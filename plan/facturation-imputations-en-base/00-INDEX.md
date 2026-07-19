# Plan — Référentiel des imputations en base + CRUD (facturation)

## Contexte

Le référentiel des imputations comptables (les ~55 lignes du plan analytique OKKO :
`code`, `label`, `category`, `hint`, `tags`) est aujourd'hui **en dur dans le
front**, dans `src/lib/facturation/constants.ts` (`BUDGET_LINES`). On veut le
**déplacer vers Supabase** : d'abord « à l'identique » (même comportement, mêmes
données), puis pouvoir **créer / éditer / supprimer** une imputation depuis le
modal « Imputations comptables ». Contraintes fortes de l'utilisateur : gérer
proprement les **clés étrangères** (le `code` est référencé dans 4 tables
`facturation_*`) et **interdire la suppression d'une imputation déjà utilisée**.

Base de **PRODUCTION live**, SQL **exécuté par l'utilisateur** dans le SQL Editor
(l'assistant propose les fichiers `supabase/*.sql`, ne les exécute pas). Écritures
applicatives via **RPC `SECURITY DEFINER`** à garde de rôle + RLS. La feature
facturation est déjà **admin-only** (route `/facturation`).

---

## Angles à clarifier

Décisions qui changent le contour du chantier. Une **option recommandée** est
proposée pour chacune ; à confirmer avant l'exécution (Phase 6).

- **D1 — Périmètre exact de la migration.** *Option A retenue (recommandée)* :
  migrer **uniquement `BUDGET_LINES`** (le référentiel). **Garder `SEED_RULES` et
  `TAGS` en dur.** Raisons : `SEED_RULES` alimente `seedPool()`, une graine qui
  doit rester **disponible à froid, hors ligne** (la migrer viderait l'amorçage au
  1er rendu) ; `TAGS` est un **vocabulaire fermé de 13 domaines** couplé au **type
  compile-time `Tag`**, aux **couleurs** (`GalaxyChart.DOMAIN_HEX`) et à **l'ordre**
  (`galaxy.DOMAIN_ORDER`) — le migrer supprime la vérification d'exhaustivité et
  duplique de la présentation. *Option B (écartée)* : tout migrer (SEED_RULES +
  TAGS) — casse l'invariant offline et la sûreté de type.

- **D2 — Intégrité référentielle : FK dures ou garde applicative ? (rodin)**
  *Option A retenue (recommandée)* : **pas de FK Postgres dures** ; intégrité par
  la **RPC de suppression** qui vérifie les 4 tables (`wordpool`, `issuer_codes`,
  `issuer_denylist`, `learned_docs`) et refuse si le code est utilisé. Raisons : des
  **codes orphelins appris en prod** (présents dans `wordpool` mais absents de
  `BUDGET_LINES`) **feraient échouer la création d'une FK** ; `learned_docs.codes`
  est un `text[]` → FK scalaire **impossible**. *Option B (écartée / différée)* :
  FK `NOT VALID` sur les 2 tables scalaires, après **audit des orphelins**.

- **D3 — CRUD : RPC-only ou RLS-write ?** *Option A retenue (recommandée)* :
  **RPC-only** (`upsert` + `delete` gardés par rôle), cohérent avec toute la feature
  facturation, et **nécessaire** pour le blocage « déjà utilisée » au DELETE.
  *Option B (écartée)* : policies RLS d'écriture directes (pattern `affiche_templates`) —
  une policy RLS ne peut pas inspecter proprement les 4 autres tables.

- **D4 — `budgetLabel`/`budgetHint` synchrones vs donnée devenue async. (rodin)**
  Ces helpers sont appelés **en plein render** (Revue ~10×, InvoicePanel, tooltip
  galaxie) et au **niveau module** dans des libs pures (`galaxy.TAG_BY_CODE`,
  `CodePicker.INDEX`). *Option A retenue (recommandée)* : un **registre en mémoire**
  (`budgetRegistry.ts`) peuplé par la query, **lecture synchrone** avec **repli sur
  le code brut** tant que le fetch n'a pas résolu ; `buildGalaxy` reçoit les lignes
  en **paramètre** (pas de course). Conséquence assumée : au tout 1er rendu (avant
  cache), les libellés montrent le code et la galaxie colore « Autre » brièvement.
  *Option B (écartée)* : garder une **copie de secours bundlée** de `BUDGET_LINES`
  pour le 1er rendu — **contredit « je veux plus qu'il soit présent dans le front en
  dur »**.

- **D5 — Le `code` est-il modifiable ? (rodin)** *Option A retenue (recommandée)* :
  **`code` immuable** en édition (c'est la PK **et** la FK dans 5 endroits — le
  renommer casserait tout silencieusement). On édite `label`/`category`/`hint`/`tags` ;
  la **création** valide l'**unicité** du code. *Option B (écartée)* : rename
  transactionnel propagé partout — lourd et risqué en prod.

- **D6 — Où vit le CRUD ?** *Option A retenue (recommandée)* : un **modal dédié
  « Gérer les imputations »** (gabarit `RevueDialog` : lignes + busy/erreur +
  `useConfirm`), ouvert depuis l'atelier facturation, **distinct** du `CodePicker`
  (sélection) pour ne pas mélanger « choisir » et « administrer ». *Option B* :
  mode édition inline **dans** `CodePicker` — plus compact mais surcharge un modal
  déjà dense.

---

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-table-seed-sql.md](./1-table-seed-sql.md) | Table `facturation_budget_lines` + RLS + seed idempotent (à l'identique) | — | P0 | 2h | table peuplée, comportement inchangé | ⚠ |
| 2 | [2-rpc-crud-garde-usage.md](./2-rpc-crud-garde-usage.md) | RPC `upsert`/`delete` `SECURITY DEFINER` + garde « déjà utilisée » + audit orphelins | 1 | P0 | 2h | CRUD serveur sûr | ⚠ |
| 3 | [3-service-registry-query.md](./3-service-registry-query.md) | Service `fetch`/RPC + registre dynamique + query, **retrait du hardcode** | 1, 2 | P0 | 2h30 | référentiel lu depuis Supabase | |
| 4 | [4-branchement-consommateurs.md](./4-branchement-consommateurs.md) | Brancher `galaxy`/`CodePicker`/tooltips/imports sur le registre | 3 | P1 | 2h | plus aucun `BUDGET_LINES` en dur | |
| 5 | [5-modal-crud-imputations.md](./5-modal-crud-imputations.md) | Modal « Gérer les imputations » (add/edit/delete gardé) | 3, 4 | P1 | 3h | CRUD complet côté UI | |
| 6 | [6-validation-globale.md](./6-validation-globale.md) | `tsc` + tests + build, adaptation des tests | 1‖2‖3‖4‖5 | P0 | 1h30 | tout au vert | ⚠ |

---

## Ordre d'exécution

Séquentiel : 1 → 2 → 3 → 4 → 5 → 6.

Les étapes **1 et 2 sont du SQL** : l'assistant produit les fichiers `supabase/*.sql`,
**l'utilisateur les exécute** dans le SQL Editor (dans l'ordre : table+seed, puis
RPC) avant que les étapes front (3+) ne s'appuient sur la donnée. Le front **dégrade
gracieusement** (table absente = référentiel vide + repli code), donc 3–5 peuvent
être développées sans attendre l'exécution SQL, mais ne sont « vraies » qu'une fois
1–2 exécutées.

---

## Architecture cible

```
supabase/
  facturation_budget_lines.sql          (NOUVEAU) table + RLS lecture + seed idempotent + trigger updated_at
  facturation_budget_lines_rpc.sql      (NOUVEAU) RPC upsert / delete (garde rôle + garde « déjà utilisée ») + audit orphelins

src/lib/facturation/
  constants.ts        (MODIF)  retire BUDGET_LINES + budgetLabel/budgetHint ; garde TAGS, SEED_RULES, consts OCR
  budgetRegistry.ts   (NOUVEAU, pur) registre dynamique : setBudgetLines / allBudgetLines / budgetLabel / budgetHint / budgetTag (repli code)
  cloudService.ts     (MODIF)  fetchBudgetLines() + upsertBudgetLine()/deleteBudgetLine() (RPC)
  galaxy.ts           (MODIF)  TAG_BY_CODE + budgetLabel → via lignes passées en paramètre
  types.ts            (—)      BudgetLine inchangé (source de vérité du type)

src/components/facturation/
  useFacturationModel.ts        (MODIF)  6e query ['facturation','budgetLines'] → peuple le registre
  useBudgetLinesCuration.ts     (NOUVEAU) mutations upsert/delete + invalidation cache
  BudgetLinesManager.tsx        (NOUVEAU) modal « Gérer les imputations » (add/edit/delete gardé)
  CodePicker.tsx                (MODIF)  INDEX module-level → useMemo sur les lignes fetchées ; entrée vers le manager
  GalaxyChart.tsx / FacturationGalaxie.tsx / FacturationRevue.tsx / InvoicePanel.tsx (MODIF) imports budgetLabel/budgetHint → budgetRegistry

src/lib/facturation/
  facturation.test.ts (MODIF)  seed le registre pour les tests ; adapte les appels buildGalaxy
```

---

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| DB (SQL) | — | `supabase/facturation_budget_lines.sql`, `supabase/facturation_budget_lines_rpc.sql` |
| Métier (lib) | `constants.ts`, `cloudService.ts`, `galaxy.ts`, `facturation.test.ts` | `budgetRegistry.ts` |
| Composants (UI) | `useFacturationModel.ts`, `CodePicker.tsx`, `GalaxyChart.tsx`, `FacturationGalaxie.tsx`, `FacturationRevue.tsx`, `InvoicePanel.tsx` | `useBudgetLinesCuration.ts`, `BudgetLinesManager.tsx` |
| **Total** | **10 modifiés** | **4 nouveaux** |
