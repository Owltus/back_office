import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import { SPOTS, hasOverlap } from '#/lib/parking/model.ts'
import type { Reservation, Status } from '#/lib/parking/model.ts'

/*
 * Tests basés sur les propriétés pour hasOverlap (model.ts).
 */

const STATUSES: Status[] = ['reserve', 'paye', 'checkout', 'employe', 'gratuite']

const reservationArb: fc.Arbitrary<Reservation> = fc.record({
  id: fc.uuid(),
  client: fc.string({ maxLength: 20 }),
  spot: fc.integer({ min: 1, max: SPOTS }),
  startDay: fc.integer({ min: -200, max: 200 }),
  nights: fc.integer({ min: 1, max: 30 }),
  status: fc.constantFrom(...STATUSES),
  comment: fc.string({ maxLength: 20 }),
})

describe('hasOverlap — symétrie', () => {
  // Invariant mathématique : le chevauchement de deux intervalles est une
  // relation SYMÉTRIQUE — si A chevauche B (même place, intervalles qui se
  // touchent), alors B chevauche A. `hasOverlap` teste à la fois l'égalité de
  // place (symétrique par nature) et le chevauchement d'intervalles
  // (`arrivalSlot`/`departureSlot`, également symétrique) : le résultat doit
  // donc être identique en inversant candidat et référence.
  it('A chevauche B ⇔ B chevauche A', () => {
    fc.assert(
      fc.property(reservationArb, reservationArb, (a, b) => {
        fc.pre(a.id !== b.id)
        const aOverlapsB = hasOverlap([b], a.spot, a.startDay, a.nights)
        const bOverlapsA = hasOverlap([a], b.spot, b.startDay, b.nights)
        expect(aOverlapsB).toBe(bOverlapsA)
      }),
      { numRuns: 1000 },
    )
  })
})

describe('hasOverlap — exclusion de soi-même via ignoreId', () => {
  // Invariant : une réservation ne peut jamais se chevaucher elle-même quand
  // elle est exclue de la recherche par `ignoreId` (cas du déplacement/
  // redimensionnement d'une réservation existante, qui ne doit pas se heurter
  // à sa propre ligne dans le planning).
  it('une réservation exclue par ignoreId ne se heurte jamais à elle-même', () => {
    fc.assert(
      fc.property(reservationArb, (r) => {
        expect(hasOverlap([r], r.spot, r.startDay, r.nights, r.id)).toBe(false)
      }),
      { numRuns: 1000 },
    )
  })
})
