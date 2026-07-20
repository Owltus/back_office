import { describe, expect, it } from 'vitest'

import { isValidIsoDate, parseDateSearch } from '#/lib/shared/searchParams.ts'

describe('isValidIsoDate', () => {
  it('accepte une date ISO réelle', () => {
    expect(isValidIsoDate('2026-07-20')).toBe(true)
    expect(isValidIsoDate('2024-02-29')).toBe(true) // année bissextile
  })

  it('refuse les formats non ISO', () => {
    expect(isValidIsoDate('20/07/2026')).toBe(false)
    expect(isValidIsoDate('2026-7-2')).toBe(false)
    expect(isValidIsoDate('lol')).toBe(false)
    expect(isValidIsoDate('')).toBe(false)
    expect(isValidIsoDate(undefined)).toBe(false)
    expect(isValidIsoDate(42)).toBe(false)
  })

  /*
   * Le piège que la regex seule ne voit pas : en JS, `new Date('2026-02-31')`
   * ne renvoie pas Invalid Date, il bascule au 3 mars. Sans le contrôle par
   * reformatage, ces dates passeraient et le board afficherait un autre jour
   * que celui demandé, sans rien signaler.
   */
  it('refuse les dates qui n’existent pas au calendrier', () => {
    expect(isValidIsoDate('2026-02-31')).toBe(false)
    expect(isValidIsoDate('2026-13-01')).toBe(false)
    expect(isValidIsoDate('2026-00-10')).toBe(false)
    expect(isValidIsoDate('2025-02-29')).toBe(false) // 2025 n’est pas bissextile
  })
})

describe('parseDateSearch', () => {
  it('laisse passer une date valide', () => {
    expect(parseDateSearch({ date: '2026-07-20' })).toEqual({
      date: '2026-07-20',
    })
  })

  /*
   * Repli silencieux volontaire : `?date=lol` renvoie {} plutôt que de lever,
   * ce qui ouvre le board sur le jour courant. C'est exactement le cas qui
   * cassait la grille du parking (NaN propagé dans les offsets).
   */
  it('retombe sur {} pour toute entrée douteuse', () => {
    expect(parseDateSearch({ date: 'lol' })).toEqual({})
    expect(parseDateSearch({ date: '2026-02-31' })).toEqual({})
    expect(parseDateSearch({ date: 123 })).toEqual({})
    expect(parseDateSearch({})).toEqual({})
  })
})
