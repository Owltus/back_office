# Étape 4 — Lib analytics + service (gratuité + CA en TS)

## Objectif

Faire remonter en TypeScript les nouvelles colonnes SQL (`free`,
`free_nights`, `ca_ht`, `ca_ttc`, `occupied_free`) jusqu'aux types
`ParkingMonthStats`/`ParkingDayStats`, en respectant exactement le pattern
d'agrégation déjà en place pour `paid`/`reserved`/`unpaid`.

## Fichier(s) impacté(s)

- `src/lib/parking/service.ts` (modifié)
- `src/lib/parking/analytics.ts` (modifié)

## Travail à réaliser

### 1. Étendre les interfaces de lignes SQL brutes

`src/lib/parking/service.ts:23-47` :

```ts
export interface ParkingArrivalsRow {
  start_date: string
  reservations: number
  nights: number
  client_nights: number
  paid: number
  reserved: number
  unpaid: number
  free: number
  free_nights: number
  ca_ht: number
  ca_ttc: number
}
export interface ParkingDailyOccRow {
  date: string
  occupied: number
  occupied_client: number
  occupied_free: number
  arrivals: number
  departures: number
}
```

### 2. Étendre `ParkingMonthStats` et son agrégation

`src/lib/parking/analytics.ts:68-94` — ajouter au type :

```ts
export interface ParkingMonthStats {
  month: number
  reservations: number
  nights: number
  clientNights: number
  occupancyRate: number
  paid: number
  reserved: number
  unpaid: number
  /** Réservations au statut « gratuité ». */
  free: number
  /** Nuits cumulées des réservations « gratuité ». */
  freeNights: number
  /** CA HT du mois (nuitées reserve/paye/checkout uniquement, au tarif en
   *  vigueur à la date d'arrivée de chaque réservation). */
  caHt: number
  /** CA TTC du mois (même périmètre). */
  caTtc: number
}
```

Dans la boucle d'agrégation (`analytics.ts:136-142`), ajouter, en miroir de
`s.paid += r.paid` etc. :

```ts
s.free += r.free
s.freeNights += r.free_nights
s.caHt += r.ca_ht
s.caTtc += r.ca_ttc
```

Initialiser ces quatre champs à `0` dans la construction du tableau des 12
mois (même endroit que `paid: 0, reserved: 0, unpaid: 0` actuellement).

### 3. Étendre `ParkingDayStats` et son agrégation

`src/lib/parking/analytics.ts:155-173` — ajouter :

```ts
export interface ParkingDayStats {
  date: string
  day: number
  occupied: number
  occupiedClient: number
  /** Places occupées en « gratuité » ce jour-là. */
  occupiedFree: number
  occupancy: number
  arrivals: number
  departures: number
}
```

Dans `aggregateParkingDaily` (`analytics.ts:196-206`), mapper
`r.occupied_free` → `occupiedFree`, avec le même repli à `0` que les autres
champs pour un jour absent de la vue.

## Ordre d'exécution

1. Étendre `service.ts` (interfaces de lignes brutes).
2. Étendre `analytics.ts` (types + boucles d'agrégation), dans cet ordre
   pour que TypeScript guide (les erreurs de compilation sur `analytics.ts`
   signaleront tout oubli une fois `service.ts` à jour).
3. `npx tsc --noEmit`.

## Critère de validation

- `npx tsc --noEmit` : vert.
- `npx vitest run src/lib/parking/analytics.test.ts` : vert avec les tests
  existants inchangés (avant d'écrire les nouveaux tests de l'étape 8) —
  confirme que l'extension des types n'a rien cassé sur les champs
  existants.
- Aucun champ optionnel introduit (`free`, `freeNights`, `caHt`, `caTtc`,
  `occupiedFree` sont tous requis et initialisés à `0`, jamais `undefined`)
  — cohérent avec le reste des interfaces existantes.
