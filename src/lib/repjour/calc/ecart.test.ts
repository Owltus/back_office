import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { computeEcart } from '#/lib/repjour/calc/ecart.ts'
import type { KPIBlock, MonthBudget } from '#/lib/repjour/types.ts'

const arbKPI = fc.record<KPIBlock>({
  nuitees: fc.double({ min: -1000, max: 1000, noNaN: true }),
  to: fc.double({ min: -1000, max: 1000, noNaN: true }),
  pm: fc.double({ min: -1000, max: 1000, noNaN: true }),
  revpar: fc.double({ min: -1000, max: 1000, noNaN: true }),
  roomRevenue: fc.double({ min: -100_000, max: 100_000, noNaN: true }),
})

// `computeEcart` ne lit que les cinq champs numériques du budget listés ici ;
// `id`/`year`/`month` sont hors calcul et fixés à des valeurs neutres.
function budgetFrom(k: KPIBlock): MonthBudget {
  return {
    id: 1,
    year: 2026,
    month: 9,
    nuitees: k.nuitees,
    taux_occupation: k.to,
    prix_moyen: k.pm,
    revpar: k.revpar,
    room_revenue: k.roomRevenue,
  }
}

describe('computeEcart — écart nul quand projeté = budget', () => {
  it('7. projeté égal au budget ⇒ les cinq écarts sont nuls', () => {
    fc.assert(
      fc.property(arbKPI, (kpi) => {
        const ecart = computeEcart(kpi, budgetFrom(kpi))
        expect(ecart.nuitees).toBe(0)
        expect(ecart.to).toBe(0)
        expect(ecart.pm).toBe(0)
        expect(ecart.revpar).toBe(0)
        expect(ecart.roomRevenue).toBe(0)
      }),
      { numRuns: 200 },
    )
  })
})

describe('computeEcart — additivité sur le projeté', () => {
  it('8. augmenter le projeté d’une quantité d augmente l’écart de d, exactement, terme à terme', () => {
    fc.assert(
      fc.property(
        arbKPI,
        arbKPI,
        fc.double({ min: -500, max: 500, noNaN: true }),
        (projete, budgetKpi, d) => {
          const budget = budgetFrom(budgetKpi)
          const avant = computeEcart(projete, budget)
          const apres = computeEcart({ ...projete, nuitees: projete.nuitees + d }, budget)
          expect(apres.nuitees - avant.nuitees).toBeCloseTo(d, 9)
          // Les autres champs, non modifiés, restent inchangés.
          expect(apres.to).toBe(avant.to)
          expect(apres.pm).toBe(avant.pm)
          expect(apres.revpar).toBe(avant.revpar)
          expect(apres.roomRevenue).toBe(avant.roomRevenue)
        },
      ),
      { numRuns: 200 },
    )
  })
})
