import { describe, expect, it } from 'vitest'

import {
  canActOnCaisseDay,
  isCaisseDayWithinGrace,
} from '#/lib/caisse/editability.ts'
import { addDays } from '#/lib/caisse/shift.ts'

const TODAY = '2026-08-03'
const J1 = addDays(TODAY, -1) // borne basse de la fenêtre (dernier jour éditable)
const J2 = addDays(TODAY, -2) // hors fenêtre

describe('isCaisseDayWithinGrace — fenêtre J-0..J-1 (plus courte que rapro)', () => {
  it('aujourd’hui et J-1 sont dans la fenêtre', () => {
    expect(isCaisseDayWithinGrace(TODAY, TODAY)).toBe(true)
    expect(isCaisseDayWithinGrace(J1, TODAY)).toBe(true)
  })

  it('J-2 est déjà hors fenêtre', () => {
    expect(isCaisseDayWithinGrace(J2, TODAY)).toBe(false)
  })
})

describe('canActOnCaisseDay — niveau + fenêtre', () => {
  it('lecture / null : jamais', () => {
    expect(canActOnCaisseDay(TODAY, TODAY, 'lecture')).toBe(false)
    expect(canActOnCaisseDay(TODAY, TODAY, null)).toBe(false)
  })

  it('ecriture : oui aujourd’hui et J-1, non dès J-2', () => {
    expect(canActOnCaisseDay(TODAY, TODAY, 'ecriture')).toBe(true)
    expect(canActOnCaisseDay(J1, TODAY, 'ecriture')).toBe(true)
    expect(canActOnCaisseDay(J2, TODAY, 'ecriture')).toBe(false)
  })

  it('gestion : oui partout, même loin dans le passé', () => {
    expect(canActOnCaisseDay(J2, TODAY, 'gestion')).toBe(true)
    expect(canActOnCaisseDay(addDays(TODAY, -400), TODAY, 'gestion')).toBe(true)
  })
})
