import { describe, expect, it } from 'vitest'

import {
  breakfastCode,
  computePdjCA,
  pdjRoomBreakdown,
  roomFinance,
} from '#/lib/pdj/breakdown.ts'

/*
 * Détail par chambre : dû (inclus) vs servi (réel), valorisés au TARIF DÉTECTÉ
 * (passé en argument, jamais dérivé par division). HT = tarif ÷ 1,10 par PDJ.
 */

const TARIFS = new Map([
  ['PDJ', 19],
  ['PDJBB', 10],
])

const ROWS = [
  { room: 105, addons: 'PDJ INCL', breakfasts_included: 2, breakfasts_served: 2, channel: 'Booking.com' },
  // no-show : 2 dûs, 1 seul servi.
  { room: 102, addons: 'PDJBB INCL', breakfasts_included: 2, breakfasts_served: 1, channel: 'Expedia' },
  // 1 inclus + 1 personne en plus servie.
  { room: 213, addons: 'PDJ INCL', breakfasts_included: 1, breakfasts_served: 2, channel: '' },
  // chambre sans PDJ au tarif, mais 2 servis = extras (valorisés PDJ).
  { room: 500, addons: 'TAXE', breakfasts_included: 0, breakfasts_served: 2, channel: null },
]

describe('breakfastCode', () => {
  it('GROUP puis PDJBB puis PDJ, sinon null', () => {
    expect(breakfastCode('PDJGROUP10 INCL')).toBe('PDJGROUP10')
    expect(breakfastCode('PDJBB INCL')).toBe('PDJBB')
    expect(breakfastCode('PDJ INCL')).toBe('PDJ')
    expect(breakfastCode('TAXE')).toBeNull()
  })
})

describe('pdjRoomBreakdown', () => {
  const addonDay = [
    { code: 'PDJ', revenue_ttc: 57 }, // 3 facturés = 3 dûs → cohérent
    { code: 'PDJBB', revenue_ttc: 20 }, // 2 facturés = 2 dûs → cohérent
  ]
  const bd = pdjRoomBreakdown(ROWS, TARIFS, addonDay)
  const room = (n: number) => bd.floors.flatMap((f) => f.rooms).find((r) => r.room === n)

  it('CA facturé par chambre : inclus (dû) + extras, au tarif détecté', () => {
    // htCa = inclus × tarif du code + extras × tarif PDJ (facturé, indépendant du servi).
    expect(room(105)).toMatchObject({ code: 'PDJ', included: 2, served: 2, htCa: 34.54 })
    expect(room(102)).toMatchObject({ code: 'PDJBB', included: 2, served: 1, htCa: 18.18 })
    expect(room(213)).toMatchObject({ code: 'PDJ', included: 1, served: 2, htCa: 34.54 }) // 17,27 inclus + 17,27 extra
    expect(room(500)).toMatchObject({ code: 'PDJ', included: 0, served: 2, htCa: 34.54 }) // walk-in : 2 extras
  })

  it('origine = OTA, Direct si vide/null', () => {
    expect(room(105)!.origin).toBe('Booking.com')
    expect(room(213)!.origin).toBe('Direct')
    expect(room(500)!.origin).toBe('Direct')
  })

  it('totaux dû / servi / extras / CA', () => {
    expect(bd.totalDuNb).toBe(5) // 2 + 2 + 1 + 0
    expect(bd.totalServiNb).toBe(7) // 2 + 1 + 2 + 2
    expect(bd.totalExtraNb).toBe(3) // 213 : 1 + 500 : 2
    expect(bd.totalCaHt).toBeCloseTo(121.8, 2) // = card CA PDJ
  })

  it('chambre occupée SANS PDJ = client potentiel (listée, htCa 0)', () => {
    const bd5 = pdjRoomBreakdown(
      [
        { room: 110, addons: 'PDJ INCL', breakfasts_included: 1, breakfasts_served: 0, channel: 'Direct' },
        { room: 111, addons: 'TAXE', breakfasts_included: 0, breakfasts_served: 0, channel: 'EXPEDIA' },
      ],
      TARIFS,
      [],
    )
    expect(bd5.sansPdj).toBe(1) // chambre 111
    const r111 = bd5.floors.flatMap((f) => f.rooms).find((r) => r.room === 111)
    expect(r111).toMatchObject({ code: null, included: 0, served: 0, htCa: 0 })
    // Chambre 110 : facturée (dû) même non cochée → htCa = 17,27.
    const r110 = bd5.floors.flatMap((f) => f.rooms).find((r) => r.room === 110)
    expect(r110!.htCa).toBeCloseTo(17.27, 2)
  })

  it('aligné → aucune alerte, aucun non-ventilé', () => {
    expect(bd.alerts).toEqual([])
    expect(bd.nonVentile).toEqual([])
  })

  it('facturé > en chambre (groupe posté en bloc) → ligne « non ventilé »', () => {
    const bd2 = pdjRoomBreakdown(ROWS, TARIFS, [{ code: 'PDJ', revenue_ttc: 190 }])
    // 190 / 19 = 10 facturés vs 3 en chambre → 7 non ventilés (pas une alerte).
    expect(bd2.nonVentile).toEqual([{ code: 'PDJ', nb: 7, ht: 120.91 }]) // round2(7 × 19 ÷ 1,1)
    expect(bd2.alerts).toEqual([])
    // Total facturé = dû chambres + non ventilé.
    expect(bd2.totalHtFacture).toBeCloseTo(bd2.totalHtDu + 120.91, 2)
  })

  it('en chambre > facturé (chambres sans facturation) → alerte', () => {
    const bd4 = pdjRoomBreakdown(
      [{ room: 101, addons: 'PDJ INCL', breakfasts_included: 5, breakfasts_served: 5, channel: null }],
      TARIFS,
      [{ code: 'PDJ', revenue_ttc: 19 }], // 1 facturé, 5 en chambre → écart 4
    )
    expect(bd4.alerts.some((a) => a.includes('sans facturation'))).toBe(true)
  })

  it('tarif manquant pour un code présent → alerte', () => {
    const bd3 = pdjRoomBreakdown(ROWS, new Map([['PDJBB', 10]]), [])
    expect(bd3.alerts.some((a) => a.includes('PDJ') && a.includes('non détecté'))).toBe(true)
  })
})

describe('roomFinance', () => {
  it('origine (OTA), code affiché et prix HT facturé (dû + extras)', () => {
    // 1 inclus + 1 extra au tarif PDJ → (17,27 + 17,27) = 34,54.
    expect(roomFinance(ROWS[2], TARIFS)).toEqual({ origin: 'Direct', code: 'PDJ', htCa: 34.54 })
    // PDJBB, 2 dûs facturés même si 1 seul servi → 2 × 9,09 = 18,18.
    expect(roomFinance(ROWS[1], TARIFS)).toEqual({ origin: 'Expedia', code: 'PDJBB', htCa: 18.18 })
    // Chambre sans PDJ mais 2 servis (walk-in) → code PDJ, 34,54.
    expect(roomFinance(ROWS[3], TARIFS)).toEqual({ origin: 'Direct', code: 'PDJ', htCa: 34.54 })
  })

  it('chambre occupée sans PDJ ni extra → code null, prix 0', () => {
    expect(
      roomFinance(
        { addons: 'TAXE', breakfasts_included: 0, breakfasts_served: 0, channel: 'EXPEDIA' },
        TARIFS,
      ),
    ).toEqual({ origin: 'EXPEDIA', code: null, htCa: 0 })
  })
})

describe('computePdjCA', () => {
  it('CA = inclus + extra par chambre (groupe roomé compris, batch exclu)', () => {
    const ca = computePdjCA(ROWS, TARIFS)
    expect(ca.inclusNb).toBe(5) // 2 (105) + 2 (102) + 1 (213)
    expect(ca.extraNb).toBe(3) // 213: 1 + 500: 2
    expect(ca.includedHt).toBeCloseTo(69.99, 2) // 34,54 + 18,18 + 17,27
    expect(ca.extrasHt).toBeCloseTo(51.81, 2) // 3 × 17,27
    expect(ca.totalHt).toBeCloseTo(121.8, 2)
  })
})
