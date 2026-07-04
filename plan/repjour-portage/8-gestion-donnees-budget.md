# Étape 8 — Gestion admin : données et budget

## Objectif

Porter la page Gestion (onglets Données et Budget), incluant les éditions manuelles et les suppressions destructives, gatées sur `admin`. Ajouter une garde client à `deleteYearBudget` (D17). Confirmer l'existence de la table `postes` avant de porter son service (D7).

## Contexte

La source monte deux sous-composants non routés (`DataContent`, `BudgetContent`) dans `GestionPage`, via un toggle d'onglets. Les opérations destructives (`deleteReport`, `deleteDayData`, `deleteMonthData`, `deleteYearBudget`) sont soumises aux RLS admin ; les triggers `BEFORE DELETE` journalisent automatiquement dans `audit_log` — le port hérite de ce comportement sans rien faire côté schéma. La table `postes` est absente des migrations (drift) : à confirmer en lecture seule sur la base live, sinon différer.

## Fichier(s) impacté(s)

- `src/routes/repjour/gestion.tsx` (nouveau)
- `src/components/repjour/boards/GestionBoard.tsx` (nouveau — coquille à onglets)
- `src/components/repjour/boards/DataContent.tsx`, `BudgetContent.tsx` (nouveaux)
- `src/lib/repjour/services/data.ts` (modification : `updateReport`, `updateForecast`, `deleteReport`, `deleteDayData`, `deleteMonthData`, `assertWriteRole`)
- `src/lib/repjour/services/daily.ts` (modification : `upsertBudget`, `deleteYearBudget` + garde ajoutée)
- `src/lib/repjour/services/postes.ts` (nouveau — conditionnel D7)
- `src/routeTree.gen.ts` (régénéré)
- Sources fork : `src/pages/{GestionPage,DataPage,BudgetContent}.tsx`, `src/services/{data,daily,postes}.ts`

## Travail à réaliser

### 1. Confirmation de la table `postes` (lecture seule)

Avant de porter `services/postes.ts`, vérifier sur la base live que la table existe, par un `select ... limit 1` (jamais de `create`). Si absente, différer la feature postes et ne pas créer le service. Documenter le résultat.

### 2. Services d'écriture et de suppression

Porter les éditions (`updateReport`, `updateForecast`) et les suppressions (`deleteReport`, `deleteDayData`, `deleteMonthData`) avec `assertWriteRole`. Porter `upsertBudget` et `deleteYearBudget` — **ajouter `assertWriteRole` à `deleteYearBudget`** (D17), qui en manque dans la source.

### 3. Onglets Données et Budget

Porter `DataContent` (édition jour par jour via modal → `Dialog` shadcn, suppressions gardées par `readOnly`) et `BudgetContent` (grille d'édition budget par année/mois). Toggle d'onglets → `Tabs`/`ToggleGroup`. Restyler en dark.

### 4. Route

`routes/repjour/gestion.tsx`, enveloppée par `ProtectedRoute` (`admin` pour l'édition ; les autres rôles voient la page en `readOnly` conformément à la source).

## Ordre d'exécution

1. Confirmer `postes` (lecture seule).
2. Services d'écriture/suppression (+ garde sur `deleteYearBudget`).
3. `DataContent`, `BudgetContent`, `GestionBoard`.
4. Route + régénération, typecheck, tests prudents.

## Critère de validation

- `npx tsc --noEmit` sans erreur ; `pnpm build` passe.
- Édition d'un jour et d'un budget : les modifications sont persistées et relues correctement.
- Une suppression déclenche bien la journalisation `audit_log` (via les triggers existants) — vérifiable en lecture.
- `deleteYearBudget` refuse l'appel pour un rôle non autorisé côté client (garde ajoutée) ET côté RLS.
- Un rôle non-admin voit la gestion en lecture seule.

## Contrôle /borg

Étape critique (opérations DESTRUCTIVES + gating admin + > 5 fichiers). Audit post-exécution :

- Toutes les suppressions passent par `assertWriteRole` côté client ET restent barrées par la RLS ; `deleteYearBudget` a bien reçu sa garde (D17).
- Les triggers `audit_log` fonctionnent (journalisation automatique) — aucune tentative de les contourner ou de les modifier.
- La table `postes` n'a été ni créée ni modifiée ; si absente, la feature est différée proprement.
- Aucune migration, aucun DDL, aucun seed. Non-régression de l'app standalone vérifiée.
