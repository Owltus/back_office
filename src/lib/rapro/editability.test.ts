import { describe, expect, it } from 'vitest'

import { canReconcileDay, isDayWithinGrace } from '#/lib/rapro/editability.ts'
import { addDays } from '#/lib/rapro/day.ts'

const TODAY = '2026-08-03'
const J1 = addDays(TODAY, -1)
const J2 = addDays(TODAY, -2) // borne basse de la fenêtre
const J3 = addDays(TODAY, -3) // hors fenêtre
const FUTUR = addDays(TODAY, 1)

describe('isDayWithinGrace — fenêtre J-0..J-2', () => {
  it('aujourd’hui, J-1, J-2 sont dans la fenêtre', () => {
    expect(isDayWithinGrace(TODAY, TODAY)).toBe(true)
    expect(isDayWithinGrace(J1, TODAY)).toBe(true)
    expect(isDayWithinGrace(J2, TODAY)).toBe(true)
  })

  it('J-3 est hors fenêtre', () => {
    expect(isDayWithinGrace(J3, TODAY)).toBe(false)
  })

  it('le futur est dans la fenêtre (borne basse seulement)', () => {
    expect(isDayWithinGrace(FUTUR, TODAY)).toBe(true)
  })
})

describe('canReconcileDay — niveau + fenêtre', () => {
  it('lecture : jamais, quel que soit le jour', () => {
    expect(canReconcileDay(TODAY, TODAY, 'lecture')).toBe(false)
    expect(canReconcileDay(J1, TODAY, 'lecture')).toBe(false)
  })

  it('null/undefined : jamais', () => {
    expect(canReconcileDay(TODAY, TODAY, null)).toBe(false)
    expect(canReconcileDay(TODAY, TODAY, undefined)).toBe(false)
  })

  it('ecriture : oui dans la fenêtre (jusqu’à J-2), non au-delà', () => {
    expect(canReconcileDay(TODAY, TODAY, 'ecriture')).toBe(true)
    expect(canReconcileDay(J2, TODAY, 'ecriture')).toBe(true)
    expect(canReconcileDay(J3, TODAY, 'ecriture')).toBe(false)
  })

  it('gestion : oui partout, même loin dans le passé', () => {
    expect(canReconcileDay(TODAY, TODAY, 'gestion')).toBe(true)
    expect(canReconcileDay(J3, TODAY, 'gestion')).toBe(true)
    expect(canReconcileDay(addDays(TODAY, -400), TODAY, 'gestion')).toBe(true)
  })
})
