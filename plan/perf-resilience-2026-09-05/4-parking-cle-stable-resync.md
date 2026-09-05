# Étape 4 — Parking : colonnes explicites, clé stable, resync coalescé

## Objectif

Réduire la fréquence et le poids de `fetchReservations` sans toucher au
modèle de mise à jour optimiste du planning (état local fusionné par id,
undo/redo, drag, Realtime).

## Contexte

- `src/lib/parking/service.ts:104-125` : `select('*')` sur 9 colonnes ;
  `toReservation` (76-89) n'en lit que 7 (`id, spot, client, start_date,
  nights, status, comment`).
- `ParkingBoard.tsx:388-400` : fenêtre `[J-135, J+180]` calculée sur
  `new Date()` : la `queryKey` (429-438) change chaque jour civil, cache
  froid tous les matins. `staleTime: 0` (437).
- `ParkingBoard.tsx:484-543` : `hardResync()` sur `visibilitychange`,
  `window focus` ET `online` : un retour d'onglet = 2 refetchs complets.
- Le board garde un `useState<Reservation[]>` (334) alimenté par fusion par
  id (457-469) : NE PAS dériver l'affichage du cache Query. `hardResync`
  (459-462) REMPLACE l'état par la fenêtre : rétrécir la fenêtre ferait
  disparaître des lignes.
- Mesure : la requête coûte 6 ms pour 528 lignes. Le problème est la
  fréquence, pas le volume unitaire.

## Fichier(s) impacté(s)

- `src/lib/parking/service.ts` (modifié)
- `src/components/parking/ParkingBoard.tsx` (modifié)

## Travail à réaliser

### 1. Colonnes explicites (`service.ts:104-125`)

`select('id,spot,client,start_date,nights,status,comment')`. Aligner le
type `DbReservation` (65-73) : retirer `created_at` / `updated_at` s'ils y
figurent. Le Realtime (`ParkingBoard.tsx:504`) reçoit la ligne complète et
passe par le même `toReservation` : inchangé.

### 2. Clé stable au mois (`ParkingBoard.tsx:388-400` et 656-692)

Un helper pur dans `src/lib/parking/model.ts` (ou `service.ts`) :

```ts
/** Arrondit une fenêtre aux bornes de mois : la queryKey ne change plus
 *  chaque jour civil, seulement au changement de mois. La fenêtre chargée
 *  ne peut que s'ÉLARGIR par rapport à la demande (jamais rétrécir). */
export function snapRangeToMonths(from: Date, to: Date): { from: Date; to: Date }
```

Appliqué à la fenêtre initiale ET dans l'effet d'agrandissement (656-692),
sinon les deux logiques se contredisent et bouclent. Test unitaire du helper
(`model.test.ts` existant ou nouveau).

### 3. `staleTime` et miroir Realtime dans le cache

- `staleTime: 30_000` au lieu de 0 : un aller-retour rapide sur `/parking`
  ne repaie plus la fenêtre.
- Pour que le cache ne serve pas une image périmée après des événements
  Realtime reçus pendant le montage précédent : dans le handler du canal
  (`ParkingBoard.tsx:494-528`), en plus du patch de l'état local, miroiter
  la ligne dans le cache : `queryClient.setQueryData(key, (rows) => upsert
  par id / retrait sur DELETE)`. La clé est celle de la fenêtre courante.
- Repli (angle 5 de l'index) : si l'exécutant juge le miroir risqué, garder
  `staleTime: 0` et ne livrer que le point 4.

### 4. `hardResync` coalescé et gaté (484-543)

- Un seul déclencheur : `visibilitychange` (visible), `focus` et `online`
  appellent `requestResync()` qui **debounce à 2 s** (trailing) et ignore
  l'appel si `backendHealth.shouldSkip()`.
- Le refetch reste `refetchReservations()` (fusion par id inchangée).

## Ordre d'exécution

1. Point 1, `npx tsc --noEmit`.
2. Point 2 avec test du helper.
3. Point 4, puis point 3 en dernier (le plus délicat).
4. Test manuel : deux onglets, créer, déplacer (drag), copier une
   réservation, Ctrl+Z / Ctrl+Y, changer d'onglet et revenir, passer hors
   ligne puis en ligne.

## Critère de validation

- Onglet Réseau : au retour d'onglet, UNE requête `parking_reservations`
  (pas deux) ; aucune requête au retour sur `/parking` dans les 30 s.
- La clé de cache est identique d'un jour à l'autre au sein d'un mois
  (vérifier dans les DevTools TanStack ou en loggant `range`).
- Scénario deux onglets : une modification dans l'onglet A apparaît dans
  l'onglet B ; après retour d'onglet, aucune ligne ne disparaît ni ne
  revient à un état antérieur ; undo/redo intacts.
- `npx vitest run` vert (tests parking existants + helper), `npx tsc
  --noEmit` vert.
