# Étape 5 — Dashboard en lecture seule branché (premier livrable)

## Objectif

Livrer le premier incrément de valeur : convertir `/repjour` en layout à sous-routes (coquille Back Office + sous-navigation), brancher la lecture du Supabase partagé, et rendre le dashboard journalier (KPI, cartes de synthèse, alertes, mode détaillé). Aucune écriture.

## Contexte

C'est le point de validation de bout en bout du socle : auth (étape 4) + métier pur (étape 2) + fondations UI (étape 3) + vraie lecture Supabase. À l'issue de cette étape, un utilisateur connecté consulte le rapport du jour, exactement comme dans l'app standalone, mais dans le thème dark et sans aucune capacité d'écriture. La `Navigation` source est remplacée par la `Navbar` du Back Office plus une sous-nav d'onglet (D4) ; le namespace `/admin/*` est effondré (D5).

## Fichier(s) impacté(s)

- `src/routes/repjour.tsx` (modification : `ComingSoon` → layout `AuthProvider` + `RepjourNav` + `Outlet`, `ssr: false`)
- `src/routes/repjour/index.tsx` (nouveau — page dashboard)
- `src/components/repjour/RepjourNav.tsx` (nouveau — sous-nav gatée par rôle)
- `src/components/repjour/boards/DashboardBoard.tsx` (nouveau — orchestration lecture + rendu)
- `src/components/repjour/KPITable.tsx`, `SummaryCards.tsx`, `AlertBanner.tsx`, `KPIDetailPanel.tsx` (nouveaux)
- `src/lib/repjour/services/daily.ts`, `services/data.ts` (nouveaux — parties LECTURE uniquement à ce stade)
- `src/routeTree.gen.ts` (régénéré)
- Sources fork : `src/pages/DashboardPage.tsx`, `src/components/{KPITable,SummaryCards,AlertBanner,KPIDetailPanel,Navigation}.tsx`, `src/services/{daily,data}.ts`

## Travail à réaliser

### 1. Layout `/repjour`

Convertir `src/routes/repjour.tsx` en layout : `createFileRoute('/repjour')` avec `ssr: false` (D1), composant qui monte `<AuthProvider>` autour de `<RepjourNav />` + `<Outlet />`. Le layout ne porte pas de garde globale : chaque page enfant décide de son gating (la page login reste libre).

### 2. Sous-navigation

`RepjourNav.tsx` : liens de l'onglet repjour (Rapport, Analytique, Gestion, Import, Comptes) filtrés par rôle via `useAuth()` — reprend la logique du `switch(role)` de la `Navigation` source (D4), mais rendue avec les composants du Back Office et des `Link` TanStack Router vers les sous-routes `/repjour/*`.

### 3. Services en lecture

Porter `services/daily.ts` (`fetchLatestReport`, `fetchReportByDate`, `fetchAvailableDates`, `fetchMonthReports`, `fetchBudget`) et les lectures de `services/data.ts` (`fetchUnifiedDays`) en appels Supabase directs (D8). Ne pas porter les écritures/suppressions à cette étape (réservées 7 et 8). Envisager d'expliciter la gestion d'erreur des lectures (la source les avale silencieusement).

### 4. Composants du dashboard

Porter `KPITable` (en `<table>` HTML brut, mécanique responsive double-cellule préservée — D14), `SummaryCards` (barres multi-segments custom), `AlertBanner` (→ `Alert` shadcn), `KPIDetailPanel`. Remapper le thème clair → dark (D15) selon la table de correspondance de l'étape 3.

### 5. Board d'orchestration

`DashboardBoard.tsx` : reprend la logique de `DashboardPage` (sélection de date en état interne, chargement du rapport et du budget, calcul des KPI et écarts via `lib/repjour/calc`), sans les actions d'envoi email (réservées étape 9). Enveloppé par `ProtectedRoute` (tous rôles) dans `routes/repjour/index.tsx`.

## Ordre d'exécution

1. Services de lecture (`daily`, `data` lecture).
2. Composants (`KPITable`, `SummaryCards`, `AlertBanner`, `KPIDetailPanel`).
3. `RepjourNav`, layout `repjour.tsx`, `routes/repjour/index.tsx`, `DashboardBoard`.
4. Régénérer le routeTree, typecheck, test manuel.

## Critère de validation

- `npx tsc --noEmit` sans erreur ; `pnpm build` passe.
- Connecté, `/repjour` affiche le rapport journalier réel du Supabase partagé : KPI, cartes, alertes, mode détaillé, cohérents avec l'app standalone.
- La sous-nav n'affiche que les liens autorisés par le rôle courant.
- Aucune écriture possible depuis cette étape (aucun bouton d'édition/suppression/import branché).
- Rendu correct en dark navy ; responsive préservé (double-cellule du KPITable).

## Contrôle /borg

Étape critique (> 5 fichiers, première lecture branchée sur le Supabase partagé). Audit post-exécution :

- Aucune opération d'écriture ni de suppression n'est atteignable depuis le dashboard.
- Les lectures respectent les RLS (un rôle `utilisateur` voit ce qu'il doit voir, rien de plus).
- `ssr: false` est effectif sur l'îlot (aucun rendu serveur des composants client-only).
- Non-régression de l'app standalone : le port ne fait que lire, aucune donnée modifiée.
- Aucune migration, aucun DDL, aucun seed introduits.
