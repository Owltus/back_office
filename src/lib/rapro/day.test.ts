import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import { addDays, clampDay } from '#/lib/rapro/day.ts'

/*
 * Tests basés sur les propriétés pour day.ts (jusqu'ici sans aucun test).
 */

/** 'YYYY-MM-DD' local — même convention que `addDays`/`today` (day.ts). */
function ymd(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

// Plage large (1990-2100) pour traverser de nombreux changements d'heure d'été
// ainsi que plusieurs années bissextiles.
const dateArb = fc
  .date({
    min: new Date(1990, 0, 1),
    max: new Date(2100, 11, 31),
    noInvalidDate: true,
  })
  .map(ymd)

describe('addDays — round-trip', () => {
  // Round-trip : avancer de n jours puis reculer de n jours redonne la date de
  // départ, quel que soit n (y compris à travers un changement de mois,
  // d'année, ou d'heure d'été/hiver — `addDays` ne manipule que des composantes
  // de date locales à minuit, jamais des millisecondes UTC).
  it('addDays(addDays(d, n), -n) === d pour n dans [-400, 400]', () => {
    fc.assert(
      fc.property(dateArb, fc.integer({ min: -400, max: 400 }), (d, n) => {
        expect(addDays(addDays(d, n), -n)).toBe(d)
      }),
      { numRuns: 1000 },
    )
  })

  // Invariant complémentaire : avancer de 0 jour est un no-op.
  it('addDays(d, 0) === d', () => {
    fc.assert(
      fc.property(dateArb, (d) => {
        expect(addDays(d, 0)).toBe(d)
      }),
      { numRuns: 1000 },
    )
  })

  // Relation métamorphique : avancer de n puis de m jours équivaut à avancer
  // directement de n + m jours (composition des décalages).
  it('addDays(addDays(d, n), m) === addDays(d, n + m)', () => {
    fc.assert(
      fc.property(
        dateArb,
        fc.integer({ min: -200, max: 200 }),
        fc.integer({ min: -200, max: 200 }),
        (d, n, m) => {
          expect(addDays(addDays(d, n), m)).toBe(addDays(d, n + m))
        },
      ),
      { numRuns: 1000 },
    )
  })
})

describe('clampDay — bornage', () => {
  // Invariant : le résultat est TOUJOURS dans [min, max] (comparaison lexicale
  // = chronologique pour des dates 'YYYY-MM-DD').
  it('le résultat reste toujours dans [min, max]', () => {
    fc.assert(
      fc.property(dateArb, dateArb, dateArb, (d, b1, b2) => {
        const min = b1 <= b2 ? b1 : b2
        const max = b1 <= b2 ? b2 : b1
        const result = clampDay(d, min, max)
        expect(result >= min).toBe(true)
        expect(result <= max).toBe(true)
      }),
      { numRuns: 1000 },
    )
  })

  // Invariant : une date déjà dans les bornes ressort inchangée (clampDay ne
  // doit pas « déplacer » une date qui n'a pas besoin de l'être).
  it('une date déjà dans les bornes n’est pas modifiée', () => {
    fc.assert(
      fc.property(dateArb, dateArb, dateArb, (d, b1, b2) => {
        const min = b1 <= b2 ? b1 : b2
        const max = b1 <= b2 ? b2 : b1
        if (d >= min && d <= max) {
          expect(clampDay(d, min, max)).toBe(d)
        }
      }),
      { numRuns: 1000 },
    )
  })
})
