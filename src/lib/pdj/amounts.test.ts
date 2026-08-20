import { describe, expect, it } from 'vitest'

import type { AddonProductionRow } from '#/lib/pdj/addon.ts'
import type { PdjAggRow } from '#/lib/pdj/service.ts'
import {
  computeAggBenchmarks,
  computeAggDailyTotals,
  computePdjAmounts,
  countCovers,
} from '#/lib/pdj/amounts.ts'

/*
 * Calcul des montants HT PDJ. Les revenus TTC de l'exemple : PDJ 817 (22
 * couverts), PDJBB 60 (3 couverts) → includedTtc 877. Conversion HT via
 * VAT_FACTOR (1,10) ; arrondi AU TOTAL uniquement.
 */

const ADDON: AddonProductionRow[] = [
  { code: 'PDJ', count: 22, revenue: 817 },
  { code: 'PDJBB', count: 3, revenue: 60 },
]

describe('countCovers', () => {
  it('ventile PDJ et PDJBB (PDJBB à part, PDJ ne l’inclut pas)', () => {
    const rows = [
      { addons: 'PDJ INCL', adults: 2, children: 0 },
      { addons: 'PDJ INCL', adults: 1, children: 1 },
      { addons: 'PDJBB', adults: 2, children: 0 },
      { addons: 'TAXE DE SEJOUR', adults: 3, children: 0 }, // pas de PDJ : ignoré
      { addons: null, adults: 4, children: 0 }, // pas d'addons : ignoré
    ]
    const covers = countCovers(rows)

    expect(covers.coversPDJ).toBe(4) // 2 + (1+1)
    expect(covers.coversPDJBB).toBe(2)
  })
})

describe('computePdjAmounts', () => {
  it('includedHT = round2(877 / 1,10) = 797.27 ; extras 0 → extrasHT 0', () => {
    const r = computePdjAmounts({
      addon: ADDON,
      covers: { coversPDJ: 22, coversPDJBB: 3 },
      extrasCount: 0,
    })

    expect(r.includedHT).toBe(797.27)
    expect(r.extrasHT).toBe(0)
    expect(r.totalHT).toBe(797.27)
    expect(r.warnings).toHaveLength(0)
  })

  it('extras valorisés au TARIF catalogue PDJ (19 € TTC) : 1 extra → 17.27 HT', () => {
    // Prix catalogue, PAS déduit des couverts : 19 / 1,10 = 17,2727… → 17.27.
    const r = computePdjAmounts({
      addon: [],
      covers: { coversPDJ: 0, coversPDJBB: 0 },
      extrasCount: 1,
    })

    expect(r.extrasHT).toBe(17.27)
    expect(r.includedHT).toBe(0)
    expect(r.totalHT).toBe(17.27)
  })

  it('coversPDJ = 0 : extras chiffrables au tarif (indépendant des couverts) + warning', () => {
    const r = computePdjAmounts({
      addon: [{ code: 'PDJ', count: 22, revenue: 817 }],
      covers: { coversPDJ: 0, coversPDJBB: 0 },
      extrasCount: 2,
    })

    // Extras valorisés au tarif (2 × 19 / 1,10) — plus jamais null.
    expect(r.extrasHT).toBe(34.55)
    // includedHT = round2(817/1,10) ; total = round2((817 + 38)/1,10).
    expect(r.includedHT).toBe(742.73)
    expect(r.totalHT).toBe(777.27)
    // Contrôle défensif : revenu PDJ facturé mais aucun couvert In-House.
    expect(r.warnings.some((w) => w.includes('sans couvert'))).toBe(true)
  })

  it('code facturé sans couvert In-House : warning défensif', () => {
    const r = computePdjAmounts({
      addon: ADDON,
      covers: { coversPDJ: 22, coversPDJBB: 0 }, // PDJBB facturé mais 0 couvert
      extrasCount: 0,
    })

    expect(r.warnings.some((w) => w.includes('PDJBB'))).toBe(true)
  })

  it('total = inclus + extras au tarif, arrondi AU TOTAL', () => {
    // 3 extras × 19 € TTC = 57 ; total TTC = 877 + 57 = 934 → round2(934/1,10).
    const r = computePdjAmounts({
      addon: ADDON,
      covers: { coversPDJ: 22, coversPDJBB: 3 },
      extrasCount: 3,
    })

    expect(r.totalHT).toBe(849.09)
  })
})

/* --- Calcul « depuis la vue d'agrégation » (pdj_daily_agg) ------------------ */

function agg(
  partial: Partial<PdjAggRow> & { service_date: string },
): PdjAggRow {
  return {
    code: 'PDJ',
    rooms: 0,
    guests: 0,
    included: 0,
    served: 0,
    extra: 0,
    no_show: 0,
    ...partial,
  }
}

const TARIFS = new Map<string, number>([['PDJ', 19]])

describe('computeAggDailyTotals', () => {
  it('CA HT par jour = inclus (par code) + extras au tarif PDJ (17,27 HT)', () => {
    const rows: PdjAggRow[] = [
      agg({ service_date: '2026-08-10', included: 10 }), // 10 × 17,27 = 172,70
      agg({ service_date: '2026-08-11', included: 5 }), // 5 × 17,27 = 86,35
      // Bucket sans code : ne porte QUE des extras (walk-in) → 2 × 17,27 = 34,54.
      agg({ service_date: '2026-08-12', code: null, extra: 2 }),
    ]
    const totals = computeAggDailyTotals(rows, TARIFS)
    expect(totals.get('2026-08-10')).toBe(172.7)
    expect(totals.get('2026-08-11')).toBe(86.35)
    expect(totals.get('2026-08-12')).toBe(34.54)
  })

  it('exclut les jours au CA nul et le bucket null sans extra', () => {
    const rows: PdjAggRow[] = [
      agg({ service_date: '2026-08-13', code: null, included: 5, served: 0 }),
    ]
    expect(computeAggDailyTotals(rows, TARIFS).size).toBe(0)
  })

  it('les externes s’ajoutent au CA du jour, même un jour sans extra chambre', () => {
    const rows: PdjAggRow[] = [
      agg({ service_date: '2026-08-10', included: 10 }), // 172,70
      agg({ service_date: '2026-08-14', code: null, included: 0, extra: 0 }),
    ]
    const externals = new Map([
      ['2026-08-10', 2], // + 2 × 17,27 = 34,54
      ['2026-08-14', 1], // 0 → 17,27 (jour sans CA chambre, mais externe présent)
    ])
    const totals = computeAggDailyTotals(rows, TARIFS, externals)
    expect(totals.get('2026-08-10')).toBeCloseTo(207.24, 2)
    expect(totals.get('2026-08-14')).toBeCloseTo(17.27, 2)
  })
})

describe('computeAggBenchmarks', () => {
  it('total, captage et occupation calculés d’un coup depuis la vue', () => {
    const rows: PdjAggRow[] = [
      agg({ service_date: '2026-08-10', rooms: 2, guests: 20, included: 20, served: 25, extra: 5 }),
      agg({ service_date: '2026-08-11', rooms: 1, guests: 20, included: 10, served: 10 }),
      agg({ service_date: '2026-08-12', rooms: 1, guests: 8, included: 8, served: 0, no_show: 8 }),
    ]
    const b = computeAggBenchmarks(rows, TARIFS)
    // CA/jour : (431,75 + 172,70 + 138,16) / 3 = 247,54 sur 3 jours.
    expect(b.total).toEqual({ avgTotalHT: 247.54, days: 3 })
    // Captage : (125 + 50) / 2 = 87,5 ; le jour non saisi (servi 0) est exclu.
    expect(b.captage).toEqual({ avgCaptage: 87.5, days: 2 })
    // Occupation : chambres (4/3 = 1,33) et clients (48/3 = 16) sur 3 jours.
    expect(b.occupancy).toEqual({ avgRooms: 1.33, avgGuests: 16, days: 3 })
  })

  it('tout à null/0 sur un jeu vide', () => {
    expect(computeAggBenchmarks([], TARIFS)).toEqual({
      total: { avgTotalHT: null, days: 0 },
      captage: { avgCaptage: null, days: 0 },
      occupancy: { avgRooms: null, avgGuests: null, days: 0 },
    })
  })
})
