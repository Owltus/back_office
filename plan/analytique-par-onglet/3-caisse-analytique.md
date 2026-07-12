# Étape 3 — Caisse : page analytique + couche d'agrégation

## Objectif

Créer la page `/caisse/analytique` sur le gabarit établi à l'étape 1, en écrivant
d'abord une couche d'agrégation neuve (`lib/caisse/analytics.ts`), et ajouter le
bouton « Analytique » dans la barre d'action du `CaisseBoard`.

## Contexte

`routes/caisse.tsx` est une route feuille (`<PageContainer printBleed><CaisseBoard /></PageContainer>`).
La table `caisse_sheets` (clé `(report_date, shift)`, shifts matin/soir/nuit) porte
les données les plus riches et les plus directement exploitables du chantier :
attendus StayNTouch + Lightspeed, réels caisse/TPE, comptage du fond. Le service
`fetchSheets()` renvoie déjà TOUTES les feuilles (tri `report_date desc`). Les
écarts par mode ne sont pas stockés mais dérivables via `computeEcarts` (`calc.ts`)
sans relire d'autre table. Contrainte (D3) : il n'existe AUCUNE couche d'agrégation
caisse — à créer sur le modèle de `lib/rapro/monthly.ts`.

## Fichier(s) impacté(s)

- `src/routes/caisse.tsx` (modification : devient route layout `Outlet` + `ssr: false`)
- `src/routes/caisse/index.tsx` (nouveau : contenu actuel, `<PageContainer printBleed><CaisseBoard /></PageContainer>`)
- `src/routes/caisse/analytique.index.tsx` (nouveau : route `/caisse/analytique/`, garde `ProtectedRoute`)
- `src/lib/caisse/analytics.ts` (nouveau : agrégation par mois / shift / mode de paiement)
- `src/components/caisse/CaisseAnalytiqueBoard.tsx` (nouveau : board analytique)
- `src/components/caisse/CaisseBoard.tsx` (modification : bouton « Analytique »)

## Travail à réaliser

### 1. Créer `lib/caisse/analytics.ts` (métier pur + lecture)

Sur le modèle de `lib/rapro/monthly.ts`. Réutiliser `fetchSheets()` (ou un
`select` filtré par plage sur `report_date`), puis agréger en mémoire :

- Totaux par mois : montants réels par mode (cash / cb / cvac / adyen), attendus
  (SNT + LS), et **écarts** par mode via `computeEcarts` appliqué à chaque feuille.
- Ventilation par shift (matin / soir / nuit) via `SHIFT_ORDER` / `slotKey`.
- Écart du fond de caisse (`fundEcart`), part des feuilles clôturées vs draft.
- Types exportés (ex. `CaisseMonthlyRow`, `CaisseTotals`) pour typer le board.

Fonctions en lecture seule ; aucun `upsert`/`validate`/`reopen` ici.

### 2. Convertir `routes/caisse.tsx` en layout + créer `routes/caisse/index.tsx`

Même patron qu'à l'étape 1 (conserver `printBleed`). Parent = `Outlet` +
`ssr: false` + `head` ; `index.tsx` reprend le rendu actuel.

### 3. Créer `components/caisse/CaisseAnalytiqueBoard.tsx`

Structure gabarit repjour (cartes de synthèse + tableau par mois + `KpiLineChart`).
`useQuery` clé `['caisse','analytics', <période>]` sur `lib/caisse/analytics.ts`.
Métriques MVP : montants par mode et par shift, écarts (cible 0 €, signalés en
`text-destructive` si non nuls), écart du fond, série mensuelle. Réutiliser
`fmtEur`/`fmtEcart` (`lib/caisse/format.ts`) et `KpiLineChart`.

### 4. Créer la route `routes/caisse/analytique.index.tsx`

Modèle repjour : `ProtectedRoute` (utilisateur/super/admin) +
`<CaisseAnalytiqueBoard />`, `head` titre « Analytique — Caisse ».

### 5. Ajouter le bouton « Analytique » dans `CaisseBoard.tsx`

Insérer en premier dans `actions` du `PageHeader`, avant `PrintButton`, bloc
`Tip > Button asChild variant="outline" size="icon-sm" > Link to="/caisse/analytique" > LineChart`.
Imports à ajouter : `Link` (`@tanstack/react-router`) et `LineChart`
(`lucide-react`) ; `Tip` est déjà importé.

## Ordre d'exécution

1. `lib/caisse/analytics.ts`.
2. `CaisseAnalytiqueBoard.tsx`.
3. Conversion `caisse.tsx` en layout + `caisse/index.tsx`.
4. `caisse/analytique.index.tsx`.
5. Bouton dans `CaisseBoard.tsx`.
6. `pnpm generate-routes`.

## Critère de validation

- `npx tsc --noEmit` sans erreur ; `pnpm lint`.
- `/caisse` affiche toujours le `CaisseBoard` (saisie, autosave, clôture
  intactes), avec le nouveau bouton dans la barre.
- Le bouton mène à `/caisse/analytique` ; montants, écarts par mode et écart du
  fond s'affichent, cohérents avec `computeEcarts` sur les feuilles.
- `lib/caisse/analytics.ts` est strictement en lecture (aucun `upsert`).

## Contrôle /borg

Étape critique (>5 fichiers, nouvelle couche métier manipulant des montants).
`/borg` indisponible → audit manuel (D5) :

- Les écarts affichés correspondent bien à `(attendu SNT + LS) − réel` par mode
  (recouper un mois à la main avec `computeEcarts`).
- `web` traité seulement le soir (`isWebRelevant`), pas de double comptage.
- Aucune écriture ni appel de `validateSheet`/`reopenSheet` depuis l'analytique.
- `queryKey` versionnée `['caisse','analytics', ...]` ; agrégation cohérente avec
  `slotKey`/`SHIFT_ORDER` pour l'ordre chronologique.
