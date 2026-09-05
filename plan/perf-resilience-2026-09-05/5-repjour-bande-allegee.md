# Étape 5 — RepJour : bande de synthèse allégée, debounce Realtime

## Objectif

Ramener les 13 à 15 requêtes que `DayCrossSummary` déclenche au montage de
`/repjour` à un volume proportionné (environ 9), avec des `select`
minimaux, et empêcher qu'un import de N lignes déclenche N × 8 refetchs par
client.

## Contexte

`src/components/repjour/DayCrossSummary.tsx` (monté par
`DashboardBoard.tsx:909-912`), toutes les requêtes à `staleTime` 60 s :

- 171-175 `['pdj','addon-all']` : `pdj_addon_production?select=*` TOUT
  l'historique (586 lignes, 41 ms), uniquement pour `detectTarifs()`.
- 216-222 `['parking','hotel-month',year,month]` × 1 à 2 mois :
  `fetchUnifiedDays` (`src/lib/repjour/services/data.ts:33-44`) charge
  `daily_reports?select=*` ET `forecast_days?select=*` alors que seul
  `rj_nuitees` est lu (223-231) et que `forecast_days` n'est jamais consommé.
  `fetchUnifiedDays` a trois autres appelants qui ont besoin des lignes
  complètes (`AnalytiqueMoisBoard.tsx:59`, `DataContent.tsx:247`,
  `ParkingAnalytiqueMoisBoard.tsx:74`) : ne PAS la modifier.
- 306-312 `['rapro','day',d]` × 7 jours (fenêtre de roulement) : 7 requêtes
  pour la carte « Bloquées de la veille ».
- `DashboardBoard.tsx:250-266` : le canal Realtime `repjour-daily-reports`
  appelle `invalidateQueries({ queryKey: ['repjour'] })` PAR ligne modifiée.

## Fichier(s) impacté(s)

- `src/components/repjour/DayCrossSummary.tsx` (modifié)
- `src/components/repjour/boards/DashboardBoard.tsx` (modifié)
- `src/lib/repjour/services/data.ts` (modifié, ajout seulement)
- `src/lib/rapro/service.ts` (modifié, ajout seulement)

## Travail à réaliser

### 1. Lecteur dédié des nuitées (`data.ts`, nouveau, à côté de `fetchUnifiedDays`)

```ts
/** Nuitées réalisées par jour d'un mois : `date` + `rj_nuitees` seulement.
 *  Sert la bande de synthèse RepJour (taux de captage PDJ et parking), qui
 *  n'a besoin d'aucune autre colonne, et ne lit pas `forecast_days`. */
export async function fetchNuiteesByMonth({ year, month }): Promise<Array<{ date: string; rj_nuitees: number | null }>>
```

Clé dans `DayCrossSummary` : `['repjour','nuitees-month',year,month]`,
`staleTime` 5 min (les nuitées d'un jour passé ne bougent qu'à l'import ;
l'invalidation par préfixe `['repjour']` du canal Realtime la couvre).

### 2. `addon-all` (171-175)

`staleTime: 60 * 60_000`, `gcTime: 2 * 60 * 60_000`. Les tarifs détectés
sont stables sur des mois ; l'import Addon d'un nouveau jour n'a pas
d'effet visible avant une heure, ce qui est acceptable (à défaut, ajouter
`invalidateQueries(['pdj','addon-all'])` à la fin de l'import Addon dans
`BreakfastBoard` / `PdjAnalytiqueBoard`, à la discrétion de l'exécutant).

### 3. Fenêtre de roulement rapro en une lecture (306-312)

Nouveau `fetchRoomsRange(from, to)` dans `src/lib/rapro/service.ts`
(`select('report_date,room,status,carried_manual,materialized')`,
`gte/lte report_date`), clé `['rapro','days-range',from,to]`. Le calcul
existant (`carryoverWindow` et `isResolved`) est alimenté par un
regroupement par `report_date` des lignes reçues, en conservant strictement
la même logique métier (fonctions pures de `src/lib/rapro/`). Les clés
`['rapro','day',d]` restent la propriété de `RaproBoard`.

### 4. Debounce des invalidations (`DashboardBoard.tsx:250-266`)

```ts
const invalidateRef = useRef<number | null>(null)
const scheduleInvalidate = () => {
  if (invalidateRef.current) window.clearTimeout(invalidateRef.current)
  invalidateRef.current = window.setTimeout(() => {
    invalidateRef.current = null
    void queryClient.invalidateQueries({ queryKey: ['repjour'] })
  }, 500)
}
```

Nettoyage du timer au démontage. Un import de 31 lignes = 1 invalidation.

## Ordre d'exécution

1. Point 1 puis rebranchement dans `DayCrossSummary` (retirer
   `fetchUnifiedDays` de ses imports).
2. Point 3 avec un test unitaire du regroupement si une fonction pure est
   extraite.
3. Points 2 et 4.
4. `npx tsc --noEmit`, `npx vitest run`, vérification visuelle de la bande
   (valeurs identiques avant/après sur un même jour).

## Critère de validation

- Onglet Réseau au montage de `/repjour` : plus de `forecast_days` depuis la
  bande, `daily_reports` avec `select=date,rj_nuitees`, UNE requête
  `rapro_rooms` pour la fenêtre de roulement (au lieu de 7),
  `pdj_addon_production` absent lors d'un second montage dans l'heure.
- Les 12 tuiles de la bande affichent exactement les mêmes valeurs qu'avant
  sur trois dates (un jour passé, hier, un jour futur).
- Import manuel d'un fichier Comparison en mode manuel : une seule
  invalidation observée (log temporaire ou onglet Réseau).
- `npx vitest run` vert, `npx tsc --noEmit` vert.

## Contrôle qualité (revue)

Étape marquée critique (4 fichiers dont deux services partagés, logique
métier de roulement rapro déplacée). `/borg` n'étant pas installé, revue
manuelle ciblée : (1) `fetchUnifiedDays` et ses trois autres appelants sont
intacts ; (2) le regroupement par jour reproduit `isResolved = statut !==
non_nettoyee` et « absence de ligne = résolue » (mémoire rapprochement) ;
(3) aucune tuile ne change de valeur ; (4) le timer de debounce est
nettoyé au démontage.
