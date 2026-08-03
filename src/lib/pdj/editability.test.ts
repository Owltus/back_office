import { describe, expect, it } from 'vitest'

import { canEditPdjDay, isPdjDayWithinGrace } from '#/lib/pdj/editability.ts'

const TODAY = '2026-08-03'
const J3 = '2026-07-31' // aujourd'hui - 3 : dernier jour dans la fenêtre
const J4 = '2026-07-30' // aujourd'hui - 4 : hors fenêtre

describe('isPdjDayWithinGrace — fenêtre J-0..J-3', () => {
  it('aujourd’hui et jusqu’à J-3 sont dans la fenêtre', () => {
    expect(isPdjDayWithinGrace(TODAY, TODAY)).toBe(true)
    expect(isPdjDayWithinGrace('2026-08-02', TODAY)).toBe(true)
    expect(isPdjDayWithinGrace(J3, TODAY)).toBe(true)
  })

  it('J-4 est hors fenêtre', () => {
    expect(isPdjDayWithinGrace(J4, TODAY)).toBe(false)
  })
})

describe('canEditPdjDay — niveau + fenêtre', () => {
  it('lecture / null : jamais', () => {
    expect(canEditPdjDay(TODAY, TODAY, 'lecture')).toBe(false)
    expect(canEditPdjDay(TODAY, TODAY, null)).toBe(false)
  })

  it('ecriture : oui jusqu’à J-3, non dès J-4', () => {
    expect(canEditPdjDay(TODAY, TODAY, 'ecriture')).toBe(true)
    expect(canEditPdjDay(J3, TODAY, 'ecriture')).toBe(true)
    expect(canEditPdjDay(J4, TODAY, 'ecriture')).toBe(false)
  })

  it('gestion : oui partout, même loin dans le passé', () => {
    expect(canEditPdjDay(J4, TODAY, 'gestion')).toBe(true)
    expect(canEditPdjDay('2025-01-01', TODAY, 'gestion')).toBe(true)
  })
})
