# Étape 4 — RPC analytique RepJour (annuel + mensuel)

## Objectif

Ramener les huit lectures des deux pages analytiques RepJour à deux, sur le
patron validé par `public.repjour_dashboard(date)`.

## Contexte

### Vue annuelle — 4 allers-retours en 2 vagues

| clé | fonction | lit |
|---|---|---|
| `['repjour','budget-years']` | `fetchBudgetYears` | `budget`, `select('year')`, **aucun filtre** |
| `['repjour','year-analytics', year]` | `Promise.all([fetchYearAnalytics, fetchYearBudget])` | **3 requêtes** : `daily_reports` (11 colonnes, `eq year`), `forecast_days` (`eq year`), `budget` (`eq year`) |

Cascade : `budget-years` → `useAnnualYear` → `year` → `year-analytics`.
`useAnnualYear.ts:13-21` initialise `year = currentYear` **avant** l'arrivée des
années, donc la seconde requête part tout de suite ; mais si `currentYear` n'est
pas dans la liste, un `useEffect` recale sur `years.at(-1)` et **relance une
seconde vague de trois requêtes** sur une autre clé. Trois allers-retours jetés.

⚠ Ce double chargement est **déduit de la lecture du code, pas observé**. À
confirmer dans l'onglet réseau sur une année absente du budget avant d'en faire
un argument.

### Vue mensuelle — 4 allers-retours en 1 vague

| clé | fonction | lit |
|---|---|---|
| `['repjour','month-detail', year, month]` | `Promise.all([fetchUnifiedDays, fetchBudget])` | **3 requêtes** : `daily_reports` **`select('*')`** (~30 colonnes), `forecast_days` **`select('*')`**, `budget` |
| `['repjour','available-dates']` | `fetchAvailableDates` | `daily_reports`, jusqu'à **5 000 dates** |

`available-dates` n'est exploitée **que pour une valeur** :
`availableDates[length-1]`, la plus ancienne date, pour griser un chevron
(`AnalytiqueMoisBoard.tsx:209-216`). Un aller-retour complet pour un `min(date)`.

⚠ Le commentaire `AnalytiqueMoisBoard.tsx:201-204` affirme que cette clé est
partagée avec le tableau de bord. **C'est devenu faux** depuis `e83e354` : le
dashboard obtient `datesDisponibles` dans sa RPC. Cette clé n'a plus qu'un
consommateur — corriger le commentaire en même temps.

## Fichier(s) impacté(s)

- `supabase/repjour_analytique_rpc_2026-09-XX.sql` (nouveau : 2 fonctions)
- `src/lib/repjour/services/daily.ts` (modifié : + 2 `fetch`, anciens CONSERVÉS)
- `src/components/repjour/boards/AnalytiqueBoard.tsx` (modifié : 4 `useQuery` → 1)
- `src/components/repjour/boards/AnalytiqueMoisBoard.tsx` (modifié : 4 → 1)

## Travail à réaliser

### 1. Les cas limites à reproduire — le cœur de l'étape

`fetchYearAnalytics` (`daily.ts:335-455`) est le morceau difficile. Rien de ce
qui suit n'est cosmétique :

- **Toujours exactement 12 lignes**, mois 1→12, y compris les mois `'vide'` à
  zéro. Le tableau de l'UI itère dessus : un mois manquant **disparaîtrait**.
- **Priorité de source** : rapports présents ET `day_of_month = days_in_month`
  → `'realise'` (champs `rmtd_*`) ; rapports présents mais mois incomplet →
  `'projete'` (champs `pm_*` repris **tels quels**, sans recalcul) ; pas de
  rapport mais prévision → `'forecast'` ; sinon `'vide'`.
- **« Dernier jour importé » implicite** : `lastDayByMonth` exploite le
  `order('day_of_month', desc)` et garde le **premier vu**. En SQL :
  `distinct on (month) … order by month, day_of_month desc`. Si l'ordre
  disparaît, le résultat change **silencieusement**.
- **Dénominateur** : `days_in_month` de la base, avec repli calendrier JS
  `new Date(year, month, 0).getDate()`. Deux sources de vérité ; vérifier en
  base s'il existe des lignes où elles divergent.
- **`pm` vaut `0`, pas `null`**, quand `nuitees = 0` en annuel — alors que la
  même situation rend `null` en mensuel (`AnalytiqueMoisBoard.tsx:322`).
  Incohérence existante : la conserver ou la corriger **sciemment**.
- **`TOTAL_ROOMS = 80`** est une constante client (`constants.ts:1`). À figer
  dans le SQL ou à lire dans `hotel_config` — décider, ne pas dupliquer sans le
  dire.
- **`hasOvercapacity`** croise rapports et prévisions indépendamment de la
  source retenue (voir D3 de l'index). **Ne pas trancher ici.**

`fetchUnifiedDays` (`data.ts:27-74`) :

- **Génère tous les jours du mois** (28→31), `report: null` / `forecast: null`
  quand absent. `rows.length` n'est donc jamais 0 — c'est ce qui garantit que
  `dailyBudget = budget.room_revenue / rows.length` ne divise jamais par zéro.
  Une RPC qui ne renverrait que les jours porteurs **introduirait une division
  par zéro**.
- `fetchBudget` → `.maybeSingle()` → **`null`** sans budget (correctif documenté
  `daily.ts:94-97`, remplace un `.single()` qui levait un 406).

### 2. Les agrégations à NE PAS unifier

- **Annuel : moyennes PONDÉRÉES par la capacité**
  (`capacity = 80 × Σ jours des mois couverts`).
- **Mensuel : moyennes ARITHMÉTIQUES SIMPLES** (`somme / nombre de jours
  porteurs`).

Les deux formules sont différentes et c'est **délibéré** (commentaire
`AnalytiqueBoard.tsx:104-105`). Les unifier changerait des chiffres affichés.

### 3. Le découpage retenu

Deux fonctions `security invoker`, dans `public`, sur le patron de
`repjour_dashboard` :

- `public.repjour_analytique_annuelle(p_annee int, p_aujourdhui date)`
  → `{ annees, mois[12], budgets }`
- `public.repjour_analytique_mensuelle(p_annee int, p_mois int, p_aujourdhui date)`
  → `{ jours, budget, premiereDate }`

`p_aujourdhui` vient du client (D1 option A) : une seule horloge, celle de
l'utilisateur. `premiereDate` remplace les 5 000 dates par le `min(date)` qui
est seul utilisé.

Renvoyer `annees` **dans** la réponse annuelle casse la cascade d'un coup.

⚠ **Les clés doivent rester sous `['repjour', …]`** : cinq
`invalidateQueries({ queryKey: ['repjour'] })` (`DashboardBoard.tsx:259, 298,
568, 591, 974`) et un `invalidateQueries(['repjour','year-analytics'])`
(`AnalytiqueBoard.tsx:201-203`, après import Forecast) en dépendent. Vérifier
que le second attrape bien la nouvelle clé, sinon l'élargir.

### 4. Fonctions à CONSERVER exportées

`fetchBudgetYears` et `fetchYearBudget` sont appelées **hors react-query** par
`BudgetContent.tsx:75, 96, 132, 148` ; `fetchUnifiedDays` par
`DataContent.tsx:247`. Elles ne peuvent pas être supprimées, seulement
contournées par les boards analytiques — même discipline que les huit fonctions
conservées pour `repjour_dashboard`.

### 5. Discipline d'application

1. Écrire `supabase/repjour_analytique_rpc_2026-09-XX.sql` avec l'en-tête
   complet (SYMPTÔME, CAUSE, CORRECTIF, SÉCURITÉ, ÉQUIVALENCE, INNOCUITÉ,
   GAIN MESURÉ, VÉRIFICATION).
2. **Commiter le fichier AVANT de l'appliquer** (règle `CLAUDE.md:29-35`).
3. Essayer en `begin … rollback` et lire le résultat.
4. Appliquer avec `supabase db query --linked -f`.
5. **Prouver l'équivalence AVANT de toucher au client**, année par année sur
   tout l'historique, champ par champ, avec un compte d'écarts à zéro.
6. Seulement ensuite, modifier les composants.

## Ordre d'exécution

1. Confirmer le double chargement de la cascade annuelle (onglet réseau).
2. Vérifier en base si `days_in_month` diverge jamais du calendrier.
3. Écrire et commiter le SQL, l'essayer en `rollback`, l'appliquer.
4. Prouver l'équivalence sur toutes les années.
5. Écrire les deux `fetch` dans `daily.ts`.
6. Réécrire les deux boards.
7. `npx tsc --noEmit` + `npx vitest run` + `pnpm build`.
8. Mesurer les deux pages selon le protocole de l'étape 1.

## Critère de validation

- Écarts SQL↔TS à **zéro** sur toutes les années présentes en base, champ par
  champ, y compris les mois `'vide'` et les mois à prévision seule.
- Vue annuelle : **1** requête au lieu de 4, aucune cascade.
- Vue mensuelle : **1** requête au lieu de 4.
- `prosecdef = false`, `has_function_privilege('anon', …) = false`,
  `search_path` figé, pour les deux fonctions.
- Après un import Forecast, les deux pages se rafraîchissent toujours.
- tsc propre, tests verts, build inchangé.

## Contrôle qualité (revue)

Étape critique (création de fonctions en base, 4 fichiers touchés dont 2 boards
complets). `/borg` n'étant pas installé, revue manuelle : (1) relire les deux
en-têtes SQL et vérifier que chaque cas limite de la section « Travail à
réaliser » y figure nommément ; (2) vérifier `prosecdef`, les grants et le
`search_path` des deux fonctions par requête sur `pg_proc`, pas à l'œil ;
(3) confirmer qu'aucune clé n'est sortie du préfixe `['repjour', …]` ;
(4) confirmer que `fetchBudgetYears`, `fetchYearBudget` et `fetchUnifiedDays`
sont toujours exportées et que leurs appelants hors react-query compilent ;
(5) comparer à l'écran, sur deux années dont une incomplète, chaque cellule du
tableau annuel avant/après.
