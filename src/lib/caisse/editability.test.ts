import { describe, expect, it } from 'vitest'

import {
  caisseWindowToday,
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

describe('caisseWindowToday — borne calendaire, pas la date du shift', () => {
  it('à 08h, J-2 calendaire est hors fenêtre (la nuit affichée est datée J-1)', () => {
    const now = new Date(2026, 8, 28, 8, 0) // 28/09 à 08h : shift = nuit du 27
    const today = caisseWindowToday(now)
    expect(today).toBe('2026-09-28')
    expect(canActOnCaisseDay('2026-09-26', today, 'ecriture')).toBe(false)
    expect(canActOnCaisseDay('2026-09-27', today, 'ecriture')).toBe(true)
  })

  it('à 01h (soir de la veille), la borne reste le jour calendaire', () => {
    const now = new Date(2026, 8, 28, 1, 0)
    expect(caisseWindowToday(now)).toBe('2026-09-28')
  })
})
