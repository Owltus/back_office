import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { fromTTC, toTTC, VAT_FACTOR } from '#/lib/repjour/constants.ts'

const arbMontant = fc.double({ min: -1_000_000, max: 1_000_000, noNaN: true })

describe('toTTC / fromTTC — aller-retour', () => {
  it('9. fromTTC(toTTC(x)) redonne x, à la tolérance flottante près', () => {
    // Égalité STRICTE impossible à garantir : `toTTC` multiplie par 1,10 puis
    // `fromTTC` redivise par 1,10, or 1,10 n'a pas de représentation binaire
    // exacte en IEEE 754 (double précision) — la multiplication suivie de la
    // division réintroduit une minuscule erreur d'arrondi (de l'ordre de
    // 10⁻¹³ à 10⁻¹⁰ selon la grandeur de x). `toBeCloseTo` absorbe cette
    // erreur ; `toBe` ferait échouer le test sur des cas parfaitement corrects.
    fc.assert(
      fc.property(arbMontant, (x) => {
        expect(fromTTC(toTTC(x))).toBeCloseTo(x, 9)
      }),
      { numRuns: 200 },
    )
  })
})

describe('toTTC / fromTTC — monotonie et signe', () => {
  it('10a. toTTC est strictement croissante (VAT_FACTOR > 1)', () => {
    fc.assert(
      fc.property(arbMontant, arbMontant, (a, b) => {
        fc.pre(a < b)
        expect(toTTC(a)).toBeLessThan(toTTC(b))
      }),
      { numRuns: 200 },
    )
  })

  it('10b. fromTTC est strictement croissante', () => {
    fc.assert(
      fc.property(arbMontant, arbMontant, (a, b) => {
        fc.pre(a < b)
        expect(fromTTC(a)).toBeLessThan(fromTTC(b))
      }),
      { numRuns: 200 },
    )
  })

  it('10c. le signe est conservé (positif reste positif, négatif reste négatif, zéro reste zéro)', () => {
    fc.assert(
      fc.property(arbMontant, (x) => {
        expect(Math.sign(toTTC(x))).toBe(Math.sign(x))
        expect(Math.sign(fromTTC(x))).toBe(Math.sign(x))
      }),
      { numRuns: 200 },
    )
  })

  it('vérifie le facteur exact attendu (TVA 10 % ⇒ ×1,10)', () => {
    expect(VAT_FACTOR).toBe(1.1)
  })
})
