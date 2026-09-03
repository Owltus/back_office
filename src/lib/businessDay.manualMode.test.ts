import { describe, expect, it } from 'vitest'

import { isManualImportOpen, isManualModeHour } from '#/lib/businessDay.ts'

/*
 * Mode manuel : ouvert hors de [02h, 03h[ tant que les données du cycle
 * n'arrivent pas. Dates locales (getHours), donc déterministes.
 */

describe('isManualModeHour', () => {
  it('fermé entre 02h et 03h : le pipeline est attendu', () => {
    expect(isManualModeHour(new Date('2026-09-03T02:00:00'))).toBe(false)
    expect(isManualModeHour(new Date('2026-09-03T02:59:00'))).toBe(false)
  })

  it('ouvert à partir de 03h', () => {
    expect(isManualModeHour(new Date('2026-09-03T03:00:00'))).toBe(true)
    expect(isManualModeHour(new Date('2026-09-03T14:00:00'))).toBe(true)
    expect(isManualModeHour(new Date('2026-09-03T23:59:00'))).toBe(true)
  })

  it('ouvert avant 02h : retard non résolu du cycle de la veille', () => {
    expect(isManualModeHour(new Date('2026-09-03T00:30:00'))).toBe(true)
    expect(isManualModeHour(new Date('2026-09-03T01:59:00'))).toBe(true)
  })
})

describe('isManualImportOpen', () => {
  it("fermé dès que les données du cycle sont là, quelle que soit l'heure", () => {
    expect(
      isManualImportOpen({
        now: new Date('2026-09-03T10:00:00'),
        dataReceived: true,
      }),
    ).toBe(false)
  })

  it('fermé avant 03h même sans données', () => {
    expect(
      isManualImportOpen({
        now: new Date('2026-09-03T02:30:00'),
        dataReceived: false,
      }),
    ).toBe(false)
  })

  it('ouvert à partir de 03h sans données', () => {
    expect(
      isManualImportOpen({
        now: new Date('2026-09-03T03:05:00'),
        dataReceived: false,
      }),
    ).toBe(true)
  })
})
