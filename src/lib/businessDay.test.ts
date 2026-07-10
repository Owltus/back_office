import { describe, expect, it } from 'vitest'

import { businessDateStr } from '#/lib/businessDay.ts'

/*
 * Frontière du jour hôtelier à 02h. Les dates sans suffixe de fuseau sont
 * interprétées en heure LOCALE (comme getHours()), donc déterministes.
 */

describe('businessDateStr', () => {
  it('avant 02h : reste sur la veille', () => {
    expect(businessDateStr(new Date('2026-07-13T00:30:00'))).toBe('2026-07-12')
    expect(businessDateStr(new Date('2026-07-13T01:59:00'))).toBe('2026-07-12')
  })

  it('à 02h pile : bascule sur le jour même', () => {
    expect(businessDateStr(new Date('2026-07-13T02:00:00'))).toBe('2026-07-13')
  })

  it('en journée : jour courant', () => {
    expect(businessDateStr(new Date('2026-07-13T13:30:00'))).toBe('2026-07-13')
    expect(businessDateStr(new Date('2026-07-13T23:59:00'))).toBe('2026-07-13')
  })

  it('passage de mois : minuit du 1er reste au dernier jour du mois', () => {
    expect(businessDateStr(new Date('2026-08-01T01:00:00'))).toBe('2026-07-31')
  })
})
