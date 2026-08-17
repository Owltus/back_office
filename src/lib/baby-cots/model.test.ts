import { describe, expect, it } from 'vitest'

import { hasOverlap, hasOverlapWithAny } from '#/lib/baby-cots/model.ts'
import type { CotAssignment } from '#/lib/baby-cots/types.ts'

describe('hasOverlap — chevauchement de deux périodes calendaires', () => {
  it('périodes identiques → chevauchement', () => {
    const a = { startDate: '2026-08-10', endDate: '2026-08-15' }
    const b = { startDate: '2026-08-10', endDate: '2026-08-15' }
    expect(hasOverlap(a, b)).toBe(true)
    expect(hasOverlap(b, a)).toBe(true)
  })

  it('chevauchement partiel (b démarre pendant a)', () => {
    const a = { startDate: '2026-08-10', endDate: '2026-08-15' }
    const b = { startDate: '2026-08-13', endDate: '2026-08-20' }
    expect(hasOverlap(a, b)).toBe(true)
    expect(hasOverlap(b, a)).toBe(true)
  })

  it('b entièrement incluse dans a → chevauchement', () => {
    const a = { startDate: '2026-08-01', endDate: '2026-08-31' }
    const b = { startDate: '2026-08-10', endDate: '2026-08-12' }
    expect(hasOverlap(a, b)).toBe(true)
    expect(hasOverlap(b, a)).toBe(true)
  })

  it('bascule le même jour (a part le 10, b arrive le 10) → AUCUN chevauchement (nuitées)', () => {
    // `endDate` est le jour de DÉPART, exclu : le lit se libère ce matin-là,
    // réutilisable dès le même jour par un autre enfant — comme à l'hôtel.
    const a = { startDate: '2026-08-05', endDate: '2026-08-10' }
    const b = { startDate: '2026-08-10', endDate: '2026-08-14' }
    expect(hasOverlap(a, b)).toBe(false)
    expect(hasOverlap(b, a)).toBe(false)
  })

  it('adjacentes avec un jour d’écart (a part le 10, b arrive le 11) → aucun chevauchement', () => {
    const a = { startDate: '2026-08-05', endDate: '2026-08-10' }
    const b = { startDate: '2026-08-11', endDate: '2026-08-14' }
    expect(hasOverlap(a, b)).toBe(false)
    expect(hasOverlap(b, a)).toBe(false)
  })

  it('périodes disjointes, écart de plusieurs jours → aucun chevauchement', () => {
    const a = { startDate: '2026-08-01', endDate: '2026-08-05' }
    const b = { startDate: '2026-09-01', endDate: '2026-09-05' }
    expect(hasOverlap(a, b)).toBe(false)
    expect(hasOverlap(b, a)).toBe(false)
  })

  it('assignations d\'une seule nuit : même nuit → chevauchement, nuits voisines → non', () => {
    const night = { startDate: '2026-08-10', endDate: '2026-08-11' }
    expect(hasOverlap(night, { startDate: '2026-08-10', endDate: '2026-08-11' })).toBe(true)
    expect(hasOverlap(night, { startDate: '2026-08-09', endDate: '2026-08-10' })).toBe(false)
    expect(hasOverlap(night, { startDate: '2026-08-11', endDate: '2026-08-12' })).toBe(false)
  })
})

describe('hasOverlapWithAny — chevauchement contre une liste, même lit seulement', () => {
  const mk = (over: Partial<CotAssignment>): CotAssignment => ({
    id: 'x',
    cotId: 'cot-1',
    label: '',
    startDate: '2026-08-10',
    endDate: '2026-08-12',
    comment: '',
    ...over,
  })

  it('chevauchement sur le même lit → true', () => {
    const list = [mk({ id: 'a1', cotId: 'cot-1', startDate: '2026-08-11', endDate: '2026-08-13' })]
    expect(
      hasOverlapWithAny(list, 'cot-1', { startDate: '2026-08-10', endDate: '2026-08-12' }),
    ).toBe(true)
  })

  it('même période mais lit différent → false (les lits sont indépendants)', () => {
    const list = [mk({ id: 'a1', cotId: 'cot-2', startDate: '2026-08-10', endDate: '2026-08-12' })]
    expect(
      hasOverlapWithAny(list, 'cot-1', { startDate: '2026-08-10', endDate: '2026-08-12' }),
    ).toBe(false)
  })

  it('periodes disjointes, même lit → false', () => {
    const list = [mk({ id: 'a1', cotId: 'cot-1', startDate: '2026-09-01', endDate: '2026-09-05' })]
    expect(
      hasOverlapWithAny(list, 'cot-1', { startDate: '2026-08-10', endDate: '2026-08-12' }),
    ).toBe(false)
  })

  it('excludeId ignore sa propre assignation (déplacement/redimensionnement)', () => {
    const list = [mk({ id: 'a1', cotId: 'cot-1', startDate: '2026-08-10', endDate: '2026-08-12' })]
    expect(
      hasOverlapWithAny(
        list,
        'cot-1',
        { startDate: '2026-08-11', endDate: '2026-08-13' },
        'a1',
      ),
    ).toBe(false)
  })

  it('excludeId ne masque pas le chevauchement avec une AUTRE assignation', () => {
    const list = [
      mk({ id: 'a1', cotId: 'cot-1', startDate: '2026-08-10', endDate: '2026-08-12' }),
      mk({ id: 'a2', cotId: 'cot-1', startDate: '2026-08-20', endDate: '2026-08-22' }),
    ]
    expect(
      hasOverlapWithAny(
        list,
        'cot-1',
        { startDate: '2026-08-21', endDate: '2026-08-25' },
        'a1',
      ),
    ).toBe(true)
  })

  it('liste vide → false', () => {
    expect(
      hasOverlapWithAny([], 'cot-1', { startDate: '2026-08-10', endDate: '2026-08-12' }),
    ).toBe(false)
  })
})
