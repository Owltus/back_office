# Étape 3 — Primitives applyCreate / applyDelete / applyUpdate (refactor iso-comportement)

## Objectif

Extraire dans `ParkingBoard.tsx` trois primitives — `applyCreate`, `applyDelete`,
`applyUpdate` — qui centralisent « état local optimiste + persistance Supabase +
garde temporelle + anti-chevauchement », et router les handlers existants au
travers. Cette étape ne change AUCUN comportement visible : elle prépare le
terrain pour que l'undo (étape 4) réutilise exactement les mêmes chemins d'écriture.

## Contexte

Inventaire des mutations actuelles (rapport de reconnaissance) et champ(s)
touché(s) :

| Handler | Champs | Persistance actuelle |
|---------|--------|----------------------|
| `insertReservation` (helper) | tous (nouvelle ligne) | `createReservation` + rollback |
| `addReservation` | crée vide (`nights:1`, `status:'reserve'`) | via `insertReservation` |
| `pasteReservation` | crée depuis presse-papier | via `insertReservation` |
| `remove` | suppression | `deleteReservation` |
| `rename` | `client` | `updateReservation(id, {client})` |
| `setStatus` (hors checkout) | `status` | `updateReservation(id, {status})` |
| `saveComment` | `comment` (+ `status` si `pendingStatus`) | `updateReservation` |
| drag `onUp` | `spot`, `startDay`→`start_date`, `nights` | `updateReservation` |

Gardes déjà présentes et à conserver : `canEdit`, `canCreateReservation`
(création/collage, borne sur l'arrivée), `canEditReservation` (édition, borne sur
la date de fin), `hasOverlap`. La conversion `startDay`→`start_date` se fait via
`startDayToDate(startDay, startDate)`.

Cas particulier du **drag** : le déplacement optimiste continu se fait déjà dans
`applyPosition` (avec `clampSpanToEditable` + `hasOverlap`) ; `onUp` ne fait que
persister l'état final. On **ne route donc PAS** le drag par `applyUpdate` pour
son sens direct (l'état local est déjà à jour) — `applyUpdate` servira à l'undo/redo
du drag. `onUp` conserve son `updateReservation` bespoke ; l'enregistrement
`record` viendra à l'étape 4.

## Fichier(s) impacté(s)

- `src/components/parking/ParkingBoard.tsx` (modification : primitives + routage
  des handlers ; `insertReservation` absorbé dans `applyCreate`)

## Travail à réaliser

### 1. Helper de conversion patch domaine → patch base

```ts
// Reservation (startDay relatif) → patch DbReservation (start_date absolu).
// Ne convertit que les clés présentes.
function toDbPatch(patch: ReservationPatch, ref: Date): Partial<Omit<DbReservation, 'id'>> {
  const out: Partial<Omit<DbReservation, 'id'>> = {}
  if (patch.client != null) out.client = patch.client
  if (patch.spot != null) out.spot = patch.spot
  if (patch.nights != null) out.nights = patch.nights
  if (patch.status != null) out.status = patch.status
  if (patch.comment != null) out.comment = patch.comment
  if (patch.startDay != null) out.start_date = startDayToDate(patch.startDay, ref)
  return out
}
```

### 2. Les trois primitives (renvoient un booléen « appliqué »)

```ts
// Insère une réservation (nouvelle, collée, ou ré-insérée par un undo de delete).
// false si la place/plage est déjà prise ou l'arrivée dans le passé verrouillé.
function applyCreate(res: Reservation): boolean {
  if (!startDate) return false
  if (!canCreateReservation(res.startDay, todayOffset, level)) return false
  if (hasOverlap(reservationsRef.current, res.spot, res.startDay, res.nights)) return false
  setReservations((prev) => (prev.some((r) => r.id === res.id) ? prev : [...prev, res]))
  createReservation({
    id: res.id, spot: res.spot, client: res.client,
    start_date: startDayToDate(res.startDay, startDate),
    nights: res.nights, status: res.status, comment: res.comment,
  }).catch((err) => {
    console.error(err)
    setReservations((prev) => prev.filter((r) => r.id !== res.id))
  })
  return true
}

// Supprime une réservation. false si déjà disparue ou passé verrouillé.
function applyDelete(id: string): boolean {
  const target = reservationsRef.current.find((r) => r.id === id)
  if (!target) return false
  if (!canEditReservation(target, todayOffset, level)) return false
  setReservations((prev) => prev.filter((r) => r.id !== id))
  deleteReservation(id).catch(console.error)
  return true
}

// Patche les seuls champs fournis. false si disparue, passé verrouillé, ou (si
// la géométrie change) chevauchement.
function applyUpdate(id: string, patch: ReservationPatch): boolean {
  if (!startDate) return false
  const target = reservationsRef.current.find((r) => r.id === id)
  if (!target) return false
  if (!canEditReservation(target, todayOffset, level)) return false
  const geometry = patch.spot != null || patch.startDay != null || patch.nights != null
  if (geometry) {
    const spot = patch.spot ?? target.spot
    const startDay = patch.startDay ?? target.startDay
    const nights = patch.nights ?? target.nights
    if (hasOverlap(reservationsRef.current, spot, startDay, nights, id)) return false
  }
  setReservations((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  updateReservation(id, toDbPatch(patch, startDate)).catch(console.error)
  return true
}
```

Note : `reservationsRef.current` (miroir déjà maintenu) est lu au lieu de
`reservations` pour voir l'état le plus frais, comme le fait déjà `onUp` du drag.

### 3. Router les handlers existants au travers

- `addReservation` : construire `res` (id `crypto.randomUUID()`, champs vides),
  puis `if (applyCreate(res)) setEditingId(res.id)`. Les gardes
  `canCreateReservation`/`hasOverlap` disparaissent du handler (déjà dans
  `applyCreate`).
- `pasteReservation` : construire `res` depuis `clipboard`, appeler `applyCreate`.
- `remove` : `applyDelete(id)`.
- `rename` : `applyUpdate(id, { client: value.trim() })` (ne rien faire si inchangé).
- `setStatus` (hors `checkout`) : `applyUpdate(id, { status })`.
- `saveComment` : `applyUpdate(id, status ? { comment, status } : { comment })`.
- drag `onUp` : **inchangé** pour cette étape (persistance bespoke conservée).
- `insertReservation` : supprimé (son rôle est repris par `applyCreate`).

Aucun `record` à cette étape : on ne fait que refactorer. Le comportement reste
strictement identique.

## Ordre d'exécution

1. Ajouter `toDbPatch` + les trois primitives dans `ParkingBoard.tsx`.
2. Router `addReservation`, `pasteReservation`, `remove`, `rename`, `setStatus`,
   `saveComment` au travers ; supprimer `insertReservation`.
3. Laisser le drag `onUp` tel quel.
4. `npx tsc --noEmit` puis `pnpm build`.

## Critère de validation

- `npx tsc --noEmit` propre, `pnpm lint` propre, `pnpm build` OK.
- Comportement **identique** à avant, à vérifier à la main : créer, coller,
  déplacer, redimensionner, renommer, changer le statut (dont le passage « Non
  payé » qui exige toujours un motif), commenter, supprimer ; les gardes du passé
  verrouillé (rôle `ecriture`) et l'anti-chevauchement fonctionnent comme avant.
- Aucune écriture Supabase nouvelle (mêmes appels `create/update/delete`).
