import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import { reconcile } from '#/lib/rapro/reconcile.ts'
import type { RoomStatus } from '#/lib/rapro/types.ts'

/*
 * Test basé sur les propriétés pour reconcile (reconcile.ts).
 *
 * Partition : `clean`, `settled` et `pending` sont par construction une
 * partition de `due` (cf. l'en-tête de reconcile.ts, « on répartit en trois
 * familles ») — chaque chambre due tombe dans EXACTEMENT une catégorie.
 * Invariants : due = clean + settled + pending, et les trois comptes restent
 * dans [0, due] (aucun débordement, jamais négatif).
 */

const ROOM_NUMBERS = Array.from({ length: 40 }, (_, i) => 101 + i)
const STATUSES: RoomStatus[] = [
  'nettoyee',
  'non_nettoyee',
  'refus',
  'rattrapage',
  'non_vendue',
]

const roomSetArb = (maxLength: number) =>
  fc
    .uniqueArray(fc.constantFrom(...ROOM_NUMBERS), { maxLength })
    .map((rooms) => new Set(rooms))

const statusesArb = fc
  .uniqueArray(fc.tuple(fc.constantFrom(...ROOM_NUMBERS), fc.constantFrom(...STATUSES)), {
    selector: (e) => e[0],
    maxLength: 40,
  })
  .map((entries) => new Map(entries))

describe('reconcile — partition de due', () => {
  it('due = clean + settled + pending, et chaque compte reste dans [0, due]', () => {
    fc.assert(
      fc.property(statusesArb, roomSetArb(40), roomSetArb(40), (statuses, due, sold) => {
        const r = reconcile(statuses, due, sold)
        expect(r.due).toBe(due.size)
        expect(r.clean + r.settled + r.pending).toBe(r.due)
        expect(r.clean).toBeGreaterThanOrEqual(0)
        expect(r.settled).toBeGreaterThanOrEqual(0)
        expect(r.pending).toBeGreaterThanOrEqual(0)
        expect(r.clean).toBeLessThanOrEqual(r.due)
        expect(r.settled).toBeLessThanOrEqual(r.due)
        expect(r.pending).toBeLessThanOrEqual(r.due)
      }),
      { numRuns: 1000 },
    )
  })
})
