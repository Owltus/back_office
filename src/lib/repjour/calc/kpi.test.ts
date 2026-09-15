import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  computeProjeteMois,
  computeRealiseJour,
  computeRealiseMTD,
  reportToKPI,
} from '#/lib/repjour/calc/kpi.ts'
import { TOTAL_ROOMS } from '#/lib/repjour/constants.ts'
import type { ComparisonData, DailyReport, ForecastRow } from '#/lib/repjour/types.ts'

/*
 * Construit un ComparisonData minimal ; seuls `today`/`mtd` sont lus par
 * `computeRealiseJour`/`computeRealiseMTD`, `totalRevenueHT`/`vat` n'entrent
 * dans aucun calcul testé ici et sont donc mis à 0 sans conséquence.
 */
function comparison(nuitees: number, revenueTTC: number): ComparisonData {
  return {
    today: { occupiedRoomsExclComp: nuitees, totalRevenueHT: 0, totalRevenueTTC: revenueTTC, vat: 0 },
    mtd: { occupiedRoomsExclComp: nuitees, totalRevenueHT: 0, totalRevenueTTC: revenueTTC },
  }
}

// Nuitées réalistes : de 0 à l'inventaire complet (80 chambres). `computeRealiseJour`
// ne borne rien lui-même (c'est `validateCoherence` qui refuse le dépassement) : on
// reste donc à l'intérieur de l'inventaire pour raisonner sur des situations valides.
const arbNuitees = fc.integer({ min: 0, max: TOTAL_ROOMS })
const arbRevenue = fc.double({ min: 0, max: 50_000, noNaN: true })

describe('computeRealiseJour — taux d’occupation', () => {
  it('1. nuitées dans [0,80] ⇒ taux d’occupation dans [0,100] (occ = nuitées/80×100)', () => {
    fc.assert(
      fc.property(arbNuitees, arbRevenue, (nuitees, revenue) => {
        const kpi = computeRealiseJour(comparison(nuitees, revenue))
        expect(kpi.to).toBeGreaterThanOrEqual(0)
        expect(kpi.to).toBeLessThanOrEqual(100)
      }),
      { numRuns: 200 },
    )
  })
})

describe('computeRealiseJour — RevPAR', () => {
  it('2. RevPAR = chiffre d’affaires du jour / 80 chambres (relation exacte)', () => {
    fc.assert(
      fc.property(arbNuitees, arbRevenue, (nuitees, revenue) => {
        const kpi = computeRealiseJour(comparison(nuitees, revenue))
        expect(kpi.revpar).toBe(revenue / TOTAL_ROOMS)
      }),
      { numRuns: 200 },
    )
  })
})

describe('computeRealiseJour — prix moyen, division protégée', () => {
  it('3a. nuitées > 0 ⇒ prix moyen = CA / nuitées', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: TOTAL_ROOMS }), arbRevenue, (nuitees, revenue) => {
        const kpi = computeRealiseJour(comparison(nuitees, revenue))
        expect(kpi.pm).toBe(revenue / nuitees)
      }),
      { numRuns: 200 },
    )
  })

  it('3b. nuitées = 0 ⇒ prix moyen = 0, quel que soit le CA (division protégée)', () => {
    fc.assert(
      fc.property(arbRevenue, (revenue) => {
        const kpi = computeRealiseJour(comparison(0, revenue))
        expect(kpi.pm).toBe(0)
      }),
      { numRuns: 50 },
    )
  })
})

describe('computeRealiseJour — oracle croisé RevPAR = PM × TO / 100', () => {
  it('4. relation vérifiée à l’arrondi flottant près sur des entrées générées', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: TOTAL_ROOMS }), arbRevenue, (nuitees, revenue) => {
        const kpi = computeRealiseJour(comparison(nuitees, revenue))
        expect(kpi.revpar).toBeCloseTo((kpi.pm * kpi.to) / 100, 9)
      }),
      { numRuns: 200 },
    )
  })
})

describe('computeRealiseMTD — occupation ramenée au nombre de jours écoulés', () => {
  it('5a. to = nuitées / (80 × jour écoulé) × 100', () => {
    fc.assert(
      fc.property(
        arbNuitees,
        arbRevenue,
        fc.integer({ min: 1, max: 31 }),
        (nuitees, revenue, dayOfMonth) => {
          const kpi = computeRealiseMTD(comparison(nuitees, revenue), dayOfMonth)
          expect(kpi.to).toBeCloseTo((nuitees / (TOTAL_ROOMS * dayOfMonth)) * 100, 9)
          expect(kpi.revpar).toBeCloseTo(revenue / (TOTAL_ROOMS * dayOfMonth), 9)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('5b. dayOfMonth = 0 ⇒ taux et RevPAR à 0 (division protégée)', () => {
    fc.assert(
      fc.property(arbNuitees, arbRevenue, (nuitees, revenue) => {
        const kpi = computeRealiseMTD(comparison(nuitees, revenue), 0)
        expect(kpi.to).toBe(0)
        expect(kpi.revpar).toBe(0)
      }),
      { numRuns: 50 },
    )
  })
})

describe('reportToKPI — projection des cinq champs par préfixe', () => {
  const report: DailyReport = {
    id: 1,
    date: '2026-09-15',
    month: 9,
    year: 2026,
    day_of_month: 15,
    days_in_month: 30,
    rj_nuitees: 10,
    rj_to: 12.5,
    rj_pm: 100,
    rj_revpar: 12.5,
    rj_room_revenue: 1000,
    rmtd_nuitees: 150,
    rmtd_to: 20,
    rmtd_pm: 90,
    rmtd_revpar: 18,
    rmtd_room_revenue: 13500,
    pm_nuitees: 2000,
    pm_to: 83,
    pm_pm: 95,
    pm_revpar: 79,
    pm_room_revenue: 190000,
    imported_at: '2026-09-15T02:00:00Z',
    imported_by: 'test',
    alerts: [],
  }

  it('6a. préfixe rj → bloc du jour réalisé', () => {
    expect(reportToKPI(report, 'rj')).toEqual({
      nuitees: 10,
      to: 12.5,
      pm: 100,
      revpar: 12.5,
      roomRevenue: 1000,
    })
  })

  it('6b. préfixe rmtd → bloc réalisé cumulé (month to date)', () => {
    expect(reportToKPI(report, 'rmtd')).toEqual({
      nuitees: 150,
      to: 20,
      pm: 90,
      revpar: 18,
      roomRevenue: 13500,
    })
  })

  it('6c. préfixe pm → bloc projeté mois', () => {
    expect(reportToKPI(report, 'pm')).toEqual({
      nuitees: 2000,
      to: 83,
      pm: 95,
      revpar: 79,
      roomRevenue: 190000,
    })
  })
})

describe('computeProjeteMois — agrégation forecast', () => {
  it('somme les occ/revenus du mois et applique la même relation croisée', () => {
    const rows: ForecastRow[] = [
      { date: '2026-09-01', month: 9, year: 2026, occ: 40, revHT: 3600, revTTC: 3960 },
      { date: '2026-09-02', month: 9, year: 2026, occ: 50, revHT: 4500, revTTC: 4950 },
    ]
    const kpi = computeProjeteMois(rows, 30)
    expect(kpi.nuitees).toBe(90)
    expect(kpi.roomRevenue).toBe(8910)
    expect(kpi.to).toBeCloseTo((90 / (TOTAL_ROOMS * 30)) * 100, 9)
    expect(kpi.revpar).toBeCloseTo(8910 / (TOTAL_ROOMS * 30), 9)
    expect(kpi.revpar).toBeCloseTo((kpi.pm * kpi.to) / 100, 9)
  })

  it('daysInMonth = 0 ⇒ taux et RevPAR à 0 (division protégée)', () => {
    const kpi = computeProjeteMois([], 0)
    expect(kpi.to).toBe(0)
    expect(kpi.revpar).toBe(0)
    expect(kpi.pm).toBe(0)
  })
})
