import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { fromTTC, VAT_FACTOR } from '#/lib/repjour/constants.ts'

// Montants au CENTIME, comme ceux de l'app. Un `fc.double` libre tirait des
// flottants sous-normaux (7,4e-323) : deux voisins y deviennent égaux une fois
// divisés par 1,10, et la croissance « stricte » échouait sans aucun rapport
// avec un montant réel (échec aléatoire vu le 2026-10-14).
const arbMontant = fc
  .integer({ min: -100_000_000, max: 100_000_000 })
  .map((centimes) => centimes / 100)

// `toTTC` a disparu le 2026-10-31 : le rapport journalier est en HT, plus
// aucun montant n'y est converti. `fromTTC` reste pour les prix TTC du PDJ.
describe('fromTTC — monotonie, signe, facteur', () => {
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
        expect(Math.sign(fromTTC(x))).toBe(Math.sign(x))
      }),
      { numRuns: 200 },
    )
  })

  it('fromTTC divise par le facteur exact (TVA 10 % ⇒ ÷1,10)', () => {
    expect(VAT_FACTOR).toBe(1.1)
    expect(fromTTC(110)).toBeCloseTo(100, 9)
  })
})
