import { describe, expect, it } from 'vitest'

import type { AddonProductionRow } from '#/lib/pdj/addon.ts'
import {
  computeCaptageBenchmark,
  computeDailyBenchmark,
  computeOccupancyBenchmark,
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

describe('computeDailyBenchmark', () => {
  it('moyenne par jour = CA PAR CHAMBRE au tarif détecté (jours In-House)', () => {
    // Revenus PDJ tous multiples de 19 → tarif détecté 19 € → HT unitaire 17,27.
    const addon = [
      { service_date: '2026-08-10', code: 'PDJ', revenue: 190 },
      { service_date: '2026-08-11', code: 'PDJ', revenue: 95 },
      { service_date: '2026-08-12', code: 'PDJ', revenue: 57 },
    ]
    const inHouse = [
      { service_date: '2026-08-10', addons: 'PDJ INCL', adults: 10, children: 0, guests: 10, breakfasts_served: 0, breakfasts_included: 10 },
      { service_date: '2026-08-11', addons: 'PDJ INCL', adults: 5, children: 0, guests: 5, breakfasts_served: 0, breakfasts_included: 5 },
      // Le tarif est global : ce jour compte même sans ligne Addon propre.
      { service_date: '2026-08-13', addons: 'PDJ INCL', adults: 4, children: 0, guests: 4, breakfasts_served: 0, breakfasts_included: 4 },
    ]
    // 10 : 10×17,27=172,70 ; 11 : 5×17,27=86,35 ; 13 : 4×17,27=69,08 → moy 109,38, 3 jours.
    expect(computeDailyBenchmark(addon, inHouse)).toEqual({
      avgTotalHT: 109.38,
      days: 3,
    })
  })

  it('null si aucun jour valide', () => {
    expect(computeDailyBenchmark([], [])).toEqual({ avgTotalHT: null, days: 0 })
  })
})

describe('computeCaptageBenchmark', () => {
  it('moyenne des taux (inclus + extras)/clients sur les jours servis', () => {
    const inHouse = [
      // jour 10 : inclus 20, extras 5 (servi 25), clients 20 → (20+5)/20 = 125 %.
      { service_date: '2026-08-10', addons: 'PDJ INCL', adults: 20, children: 0, guests: 20, breakfasts_served: 25, breakfasts_included: 20 },
      // jour 11 : inclus 10, extras 0 (servi 10), clients 20 → (10+0)/20 = 50 %.
      { service_date: '2026-08-11', addons: 'PDJ INCL', adults: 20, children: 0, guests: 20, breakfasts_served: 10, breakfasts_included: 10 },
      // jour 12 : AUCUN servi → exclu (pas de vraie donnée).
      { service_date: '2026-08-12', addons: 'PDJ INCL', adults: 8, children: 0, guests: 8, breakfasts_served: 0, breakfasts_included: 8 },
    ]
    // moyenne des taux = (125 + 50) / 2 = 87.5 ; 2 jours.
    expect(computeCaptageBenchmark(inHouse)).toEqual({
      avgCaptage: 87.5,
      days: 2,
    })
  })

  it('null si aucun jour servi', () => {
    expect(computeCaptageBenchmark([])).toEqual({ avgCaptage: null, days: 0 })
  })
})

describe('computeOccupancyBenchmark', () => {
  it('moyennes chambres et clients par jour', () => {
    const inHouse = [
      // jour 10 : 2 chambres, 3 clients.
      { service_date: '2026-08-10', addons: null, adults: 2, children: 0, guests: 2, breakfasts_served: 0, breakfasts_included: 0 },
      { service_date: '2026-08-10', addons: null, adults: 1, children: 0, guests: 1, breakfasts_served: 0, breakfasts_included: 0 },
      // jour 11 : 1 chambre, 3 clients.
      { service_date: '2026-08-11', addons: null, adults: 3, children: 0, guests: 3, breakfasts_served: 0, breakfasts_included: 0 },
    ]
    // avgRooms = (2 + 1) / 2 = 1.5 ; avgGuests = (3 + 3) / 2 = 3 ; 2 jours.
    expect(computeOccupancyBenchmark(inHouse)).toEqual({
      avgRooms: 1.5,
      avgGuests: 3,
      days: 2,
    })
  })

  it('null si aucun jour', () => {
    expect(computeOccupancyBenchmark([])).toEqual({
      avgRooms: null,
      avgGuests: null,
      days: 0,
    })
  })
})
