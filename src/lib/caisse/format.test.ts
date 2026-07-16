import { describe, expect, it } from 'vitest'

import { fmtEcart, fmtEcartBare } from '#/lib/caisse/format.ts'

/*
 * Formatage des écarts : le zéro (y compris le zéro négatif flottant `-0`) ne
 * doit JAMAIS s'afficher signé — ni « +0,00 », ni le trompeur « -0,00 » /
 * « +-0,00 » qui laissait croire à un mini-écart alors qu'il n'y en a pas.
 */
describe('fmtEcart / fmtEcartBare', () => {
  it('affiche un zéro nu, sans signe', () => {
    expect(fmtEcartBare(0)).toBe('0,00')
    expect(fmtEcart(0)).toBe('0,00 €')
  })

  it('neutralise le zéro négatif (plus de « +-0,00 »)', () => {
    expect(fmtEcartBare(-0)).toBe('0,00')
    expect(fmtEcart(-0)).toBe('0,00 €')
    // Résidu flottant infime → arrondit à zéro, donc nu lui aussi.
    expect(fmtEcartBare(-0.0001)).toBe('0,00')
  })

  it('garde le signe sur les vrais écarts', () => {
    expect(fmtEcartBare(12.5)).toBe('+12,50')
    expect(fmtEcart(12.5)).toBe('+12,50 €')
    expect(fmtEcartBare(-3)).toBe('-3,00')
    expect(fmtEcart(-3)).toBe('-3,00 €')
  })
})
