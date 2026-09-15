import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import { captageIndex } from '#/lib/parking/analytics.ts'

/*
 * Test basé sur les propriétés pour captageIndex (analytics.ts).
 *
 * Domaine réaliste : `clientOccupied` (places-nuits client occupées) est
 * toujours ≥ 0 — on ne peut pas occuper un nombre négatif de places. Sous
 * cette contrainte, le commentaire du code l'affirme explicitement (« Jamais
 * négatif », cf. l'en-tête de captageIndex) et la formule (÷ CLIENT_SPOTS ÷
 * (hotelRooms / TOTAL_ROOMS) × 100, plafonnée par `Math.min(100, ratio)`) le
 * garantit : jamais de résultat hors de [0, 100], jamais NaN ni Infinity.
 * `hotelRooms` peut être nul ou négatif (occupation hôtel inconnue) → `null`.
 */

const clientOccupiedArb = fc.integer({ min: 0, max: 5000 })
const hotelRoomsArb = fc.integer({ min: -20, max: 500 })

describe('captageIndex — bornes [0, 100] ou null', () => {
  it('jamais NaN/Infinity, toujours dans [0, 100] ou null', () => {
    fc.assert(
      fc.property(clientOccupiedArb, hotelRoomsArb, (clientOccupied, hotelRooms) => {
        const result = captageIndex(clientOccupied, hotelRooms)
        if (hotelRooms <= 0) {
          expect(result).toBeNull()
          return
        }
        expect(result).not.toBeNull()
        expect(Number.isFinite(result)).toBe(true)
        expect(result as number).toBeGreaterThanOrEqual(0)
        expect(result as number).toBeLessThanOrEqual(100)
      }),
      { numRuns: 1000 },
    )
  })
})

describe('captageIndex — monotonie en clientOccupied', () => {
  // Monotonie : à occupation hôtel fixée, occuper PLUS de places client ne
  // peut jamais faire BAISSER le captage (la formule est une fonction
  // croissante — plafonnée — de `clientOccupied`).
  it('augmenter clientOccupied ne peut jamais faire baisser le captage', () => {
    fc.assert(
      fc.property(
        clientOccupiedArb,
        fc.integer({ min: 0, max: 500 }), // delta ≥ 0
        fc.integer({ min: 1, max: 500 }), // hotelRooms strictement positif
        (base, delta, hotelRooms) => {
          const a = captageIndex(base, hotelRooms)
          const b = captageIndex(base + delta, hotelRooms)
          expect(b as number).toBeGreaterThanOrEqual(a as number)
        },
      ),
      { numRuns: 1000 },
    )
  })
})
