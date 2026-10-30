import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { cycleDe } from '#/lib/planning/cycles.ts'
import { periodeLibre } from '#/lib/planning/presence.ts'
import type { Periode } from '#/lib/planning/types.ts'

/*
 * Cycle d'un shift (plan planning-cycles-2026-10-30). Oracle : la famille du
 * code quand elle existe, sinon `periodeLibre` de l'heure de début.
 */

const FAMILLES: Periode[] = ['matin', 'middle', 'soir', 'nuit', 'court']

const heure = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(
    ([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
  )

describe('cycleDe', () => {
  it('la famille du code passe avant l’heure de début', () => {
    fc.assert(
      fc.property(fc.constantFrom(...FAMILLES), heure, (famille, debut) => {
        expect(cycleDe({ periode: famille }, debut)).toBe(famille)
      }),
    )
  })

  it('sans code, le cycle est celui de l’heure de début', () => {
    fc.assert(
      fc.property(heure, (debut) => {
        expect(cycleDe(undefined, debut)).toBe(periodeLibre(debut))
      }),
    )
  })

  it('un code sans famille se range par son heure de début', () => {
    fc.assert(
      fc.property(heure, (debut) => {
        expect(cycleDe({ periode: null }, debut)).toBe(periodeLibre(debut))
      }),
    )
  })

  it('exemples : un middle reste un middle, un horaire libre de 23 h est une nuit', () => {
    expect(cycleDe({ periode: 'middle' }, '07:00')).toBe('middle')
    expect(cycleDe(undefined, '23:00')).toBe('nuit')
    expect(cycleDe(undefined, '06:30')).toBe('matin')
    expect(cycleDe(undefined, '14:00')).toBe('soir')
  })
})
