import { describe, expect, it } from 'vitest'

import { nextFill } from '#/lib/rapro/constants.ts'

describe('nextFill — cycle du clic gauche', () => {
  it('chambre vendue : vert(null) → refus → bloquée → vert', () => {
    expect(nextFill(null, true)).toBe('refus')
    expect(nextFill('refus', true)).toBe('non_nettoyee')
    expect(nextFill('non_nettoyee', true)).toBe(null)
  })

  it('chambre vendue : une nettoyée explicite repart comme le vert par défaut', () => {
    expect(nextFill('nettoyee', true)).toBe('refus')
  })

  it('chambre non vendue, non reportée : gris(null) → vert → refus → bloquée → gris', () => {
    expect(nextFill(null, false)).toBe('nettoyee')
    expect(nextFill('nettoyee', false)).toBe('refus')
    expect(nextFill('refus', false)).toBe('non_nettoyee')
    expect(nextFill('non_nettoyee', false)).toBe(null)
  })

  it('reportée non vendue : gris(null) → rattrapage → bloquée → gris (pas de refus)', () => {
    expect(nextFill(null, false, true)).toBe('rattrapage')
    expect(nextFill('rattrapage', false, true)).toBe('non_nettoyee')
    expect(nextFill('non_nettoyee', false, true)).toBe(null)
  })

  it('reportée MAIS occupée = vraie vente → cycle vendue, jamais de rattrapage', () => {
    expect(nextFill(null, true, true)).toBe('refus')
    expect(nextFill('non_nettoyee', true, true)).toBe(null)
  })
})
