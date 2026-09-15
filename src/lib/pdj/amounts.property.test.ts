import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import { computePdjAmounts } from '#/lib/pdj/amounts.ts'
import type { CoversByCode, PdjAmountsInput } from '#/lib/pdj/amounts.ts'
import type { AddonProductionRow } from '#/lib/pdj/addon.ts'

/*
 * Tests basés sur les propriétés pour computePdjAmounts (amounts.ts).
 *
 * Monotonie : `totalHT` = round2(fromTTC(includedTtc + extrasCount ×
 * PDJ_EXTRA_TTC)) (cf. l'en-tête du fichier source). PDJ_EXTRA_TTC > 0 et
 * `fromTTC`/`round2` sont des fonctions non décroissantes de leur entrée : à
 * `addon`, `covers` et `manualIncludedCount` fixés, augmenter `extrasCount` ne
 * peut donc jamais faire BAISSER `totalHT` — un couvert supplémentaire servi
 * ne peut pas faire baisser la facture.
 */

const addonRowArb = fc.record({
  code: fc.constantFrom('PDJ', 'PDJBB', 'PDJGROUP10'),
  count: fc.integer({ min: 0, max: 100 }),
  revenue: fc.double({ min: 0, max: 5000, noNaN: true }),
})

const addonArb: fc.Arbitrary<AddonProductionRow[]> = fc.array(addonRowArb, {
  minLength: 0,
  maxLength: 5,
})

const coversArb: fc.Arbitrary<CoversByCode> = fc.record({
  coversPDJ: fc.integer({ min: 0, max: 200 }),
  coversPDJBB: fc.integer({ min: 0, max: 200 }),
})

describe('computePdjAmounts — monotonie en extrasCount', () => {
  it('augmenter extrasCount ne peut jamais faire baisser totalHT', () => {
    fc.assert(
      fc.property(
        addonArb,
        coversArb,
        fc.integer({ min: 0, max: 50 }), // extrasCount de base
        fc.integer({ min: 0, max: 50 }), // delta ajouté (toujours ≥ 0)
        fc.integer({ min: 0, max: 20 }), // manualIncludedCount, fixé
        (addon, covers, base, delta, manualIncludedCount) => {
          const inputBase: PdjAmountsInput = {
            addon,
            covers,
            extrasCount: base,
            manualIncludedCount,
          }
          const inputPlus: PdjAmountsInput = {
            addon,
            covers,
            extrasCount: base + delta,
            manualIncludedCount,
          }
          const a = computePdjAmounts(inputBase)
          const b = computePdjAmounts(inputPlus)
          expect(b.totalHT).toBeGreaterThanOrEqual(a.totalHT)
        },
      ),
      { numRuns: 1000 },
    )
  })
})
