import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import { ALL_ROOMS } from '#/lib/hotel/rooms.ts'
import { SPOTS } from '#/lib/parking/model.ts'
import { stayKind } from '#/lib/pdj/csv.ts'
import {
  ALL_ROOMS as ALL_ROOMS_MONTRE,
  PARKING_TOTAL,
  stayKind as stayKindMontre,
} from '../../../supabase/functions/montre-resume/regles.ts'

/*
 * L'Edge Function `montre-resume` tourne sous Deno et ne peut pas importer
 * `src/` (alias `#/`) : elle porte une COPIE de l'inventaire des chambres et de
 * la règle des séjours. Ce test échoue au premier écart, pour que la montre
 * dise toujours la même chose que la page PDJ. S'il casse, reporter la
 * modification de l'autre côté, ne jamais ajuster ce test.
 */
describe('montre-resume — les copies Edge ne doivent pas diverger', () => {
  it('même inventaire des chambres', () => {
    expect(ALL_ROOMS_MONTRE).toEqual(ALL_ROOMS)
  })

  it('même nombre de places de parking', () => {
    expect(PARKING_TOTAL).toBe(SPOTS)
  })

  it('même nature de séjour pour les statuts connus', () => {
    for (const s of [
      'IN HOUSE',
      'DUE OUT',
      'CHECKED OUT',
      'DUE IN',
      'RESERVED',
      '',
    ])
      expect(stayKindMontre(s)).toBe(stayKind(s))
  })

  it('même nature de séjour pour tout statut', () => {
    const statut = fc.oneof(
      fc.string(),
      fc
        .tuple(
          fc.string(),
          fc.constantFrom('IN HOUSE', 'DUE OUT', 'CHECKED OUT'),
          fc.string(),
        )
        .map(([a, b, c]) => a + b + c),
    )
    fc.assert(
      fc.property(statut, (s) => stayKindMontre(s) === stayKind(s)),
      { numRuns: 1000 },
    )
  })
})
