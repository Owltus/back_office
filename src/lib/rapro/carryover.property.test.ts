import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import { carryOver } from '#/lib/rapro/carryover.ts'
import type { DaySnapshot } from '#/lib/rapro/carryover.ts'
import type { RoomStatus } from '#/lib/rapro/types.ts'

/*
 * Test basé sur les propriétés pour carryOver (carryover.ts).
 *
 * Idempotence : `carryOver` est une fonction PURE d'une fenêtre d'instantanés
 * déjà chargés (aucun horodatage courant, aucun aléa, aucun effet de bord) —
 * appeler deux fois sur EXACTEMENT la même entrée doit donc rendre EXACTEMENT
 * le même ensemble de chambres reportées.
 */

const ROOM_NUMBERS = [101, 102, 103, 210, 211, 305, 414, 512]
const STATUSES: RoomStatus[] = [
  'nettoyee',
  'non_nettoyee',
  'refus',
  'rattrapage',
  'non_vendue',
]

const statusEntryArb = fc.tuple(
  fc.constantFrom(...ROOM_NUMBERS),
  fc.constantFrom(...STATUSES),
)

const snapshotArb: fc.Arbitrary<DaySnapshot> = fc.record({
  statuses: fc
    .uniqueArray(statusEntryArb, { selector: (e) => e[0], maxLength: 8 })
    .map((entries) => new Map(entries)),
  carriedManual: fc
    .uniqueArray(fc.constantFrom(...ROOM_NUMBERS), { maxLength: 8 })
    .map((rooms) => new Set(rooms)),
})

const pastArb = fc.array(snapshotArb, { minLength: 0, maxLength: 10 })

describe('carryOver — idempotence', () => {
  it('appeler deux fois sur la même fenêtre rend le même Set', () => {
    fc.assert(
      fc.property(pastArb, (past) => {
        const first = carryOver(past)
        const second = carryOver(past)
        expect(second).toEqual(first)
      }),
      { numRuns: 1000 },
    )
  })
})
