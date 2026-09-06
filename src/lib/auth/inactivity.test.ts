import { describe, expect, it } from 'vitest'

import {
  INACTIVITY_LIMIT_MS,
  isInactiveTooLong,
} from '#/lib/auth/inactivity.ts'

const H = 60 * 60_000

describe('isInactiveTooLong', () => {
  it('aucune activité connue = pas d expiration (premier passage)', () => {
    expect(isInactiveTooLong(null, 1_000_000)).toBe(false)
  })

  it('moins de 24 h = session conservée', () => {
    const now = 100 * H
    expect(isInactiveTooLong(now - 23 * H, now)).toBe(false)
    expect(isInactiveTooLong(now - INACTIVITY_LIMIT_MS, now)).toBe(false)
  })

  it('plus de 24 h = session expirée', () => {
    const now = 100 * H
    expect(isInactiveTooLong(now - 24 * H - 1, now)).toBe(true)
    expect(isInactiveTooLong(now - 60 * 24 * H, now)).toBe(true)
  })

  it('valeur corrompue = pas d expiration', () => {
    expect(isInactiveTooLong(Number.NaN, 5)).toBe(false)
  })

  it('limite personnalisable', () => {
    expect(isInactiveTooLong(0, 10, 5)).toBe(true)
    expect(isInactiveTooLong(0, 4, 5)).toBe(false)
  })
})
