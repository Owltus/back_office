# Étape 6 — Clés transverses : « première date » figée, dates PDJ unifiées

## Objectif

Supprimer les refetchs à 60 s de valeurs qui ne changent jamais (date la
plus ancienne de chaque historique) et la double requête des dates PDJ
sous deux clés différentes.

## Contexte

- « Première date » à `staleTime` 60 s par défaut : `fetchOldestDay`
  (`RaproBoard.tsx:147`, `RaproMonthlyBoard.tsx:79`,
  `RaproAnalytiqueBoard.tsx:51`, `DayCrossSummary.tsx:298`),
  `fetchOldestServiceDate` (`CaisseBoard.tsx:212`), `fetchOldestSlot`
  (`CaisseBoard.tsx:205`). Coût unitaire faible (4 ms), volume inutile.
- `fetchServiceDates` montée sous `['pdj','dates']` (`BreakfastBoard.tsx:247`,
  `PdjAnalytiqueBoard.tsx:54`) ET `['rapro','service-dates']`
  (`RaproBoard.tsx:153`) : la seule requête lourde du projet (248 ms) part
  deux fois si les deux pages sont visitées.
- `EasterEggs.tsx:19-22` : lecture `easter_eggs` à chaque montage post-60 s.
- La requête `pdj_breakfasts order by service_date desc, room asc`
  (17 713 appels dans `pg_stat_statements`) est l'ANCIENNE version de
  `fetchServiceDates`, remplacée par la vue le 2026-08-13 : rien à faire.

## Fichier(s) impacté(s)

- `src/components/rapro/RaproBoard.tsx` (modifié)
- `src/components/rapro/RaproMonthlyBoard.tsx` (modifié)
- `src/components/rapro/RaproAnalytiqueBoard.tsx` (modifié)
- `src/components/repjour/DayCrossSummary.tsx` (modifié)
- `src/components/caisse/CaisseBoard.tsx` (modifié)
- `src/components/pdj/BreakfastBoard.tsx` (modifié)
- `src/components/pdj/PdjAnalytiqueBoard.tsx` (modifié)
- `src/components/shared/EasterEggs.tsx` (modifié)

## Travail à réaliser

### 1. Bornes historiques figées

Sur les six `useQuery` « première date » : `staleTime: Infinity`,
`gcTime: 60 * 60_000`. Une borne ne recule qu'en cas de purge ou d'import
rétroactif : ajouter `invalidateQueries` sur ces clés à la fin des imports
concernés (rapro : aucun import ; PDJ : import In-House ; caisse : création
de feuille) uniquement si l'exécutant trouve le point d'accroche évident,
sinon accepter qu'un rechargement de page suffise.

### 2. Clé unique pour les dates PDJ

`RaproBoard.tsx:152-153` : `queryKey: ['pdj', 'dates']`, mêmes options que
`BreakfastBoard.tsx:247`. Extraire une constante `PDJ_DATES_KEY` dans
`src/lib/pdj/service.ts` (ou `keys.ts`) utilisée par les trois appelants.
`staleTime` 5 min sur les trois (les dates ne changent qu'à l'import ;
`invalidateQueries(['pdj'])` existant à la fin de l'import couvre le cas).

### 3. Easter eggs

`staleTime: 60 * 60_000`. La page admin `/easter-eggs` invalide déjà (ou
doit invalider) `['easter-eggs']` après modification : vérifier.

## Ordre d'exécution

1. Point 2 (le plus rentable), puis 1, puis 3.
2. `npx tsc --noEmit`.

## Critère de validation

- Visiter `/pdj` puis `/rapro` : UNE seule requête `pdj_daily_agg?select=
  service_date` dans l'onglet Réseau.
- Naviguer entre `/rapro`, `/rapro/2026/09`, analytique rapro pendant plus
  d'une minute : aucune nouvelle requête `order=report_date.asc&limit=1`.
- Les sélecteurs de date (PDJ, rapro, caisse) proposent les mêmes bornes
  qu'avant.
- `npx tsc --noEmit` vert.

## Contrôle qualité (revue)

Étape marquée critique (8 fichiers). `/borg` n'étant pas installé, revue
manuelle ciblée : (1) aucune clé modifiée n'est ciblée par un
`invalidateQueries` exact ailleurs (grep `'service-dates'`) ; (2) les
`enabled` et `select` existants sont conservés ; (3) aucune valeur affichée
ne change.
