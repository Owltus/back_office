import { describe, expect, it } from 'vitest'

import type { PdjAddonRow, PdjDayRow } from '#/lib/pdj/service.ts'
import { pdjDaySummary } from '#/lib/pdj/summary.ts'

/*
 * Synthèse PDJ d'un jour. Réutilise countCovers + computePdjAmounts (déjà
 * couverts par amounts.test.ts) : ici on vérifie l'AGRÉGATION (volumes, captage,
 * branchement des extras et des inclus manuels).
 */

/** Fabrique une ligne In-House minimale (seuls les champs du calcul comptent). */
function row(partial: Partial<PdjDayRow>): PdjDayRow {
  return {
    service_date: '2026-08-10',
    room: 101,
    guest_name: null,
    status: 'CHECKED IN',
    vip: false,
    adults: 2,
    children: 0,
    guests: 2,
    no_of_nights: null,
    room_type: null,
    rate_plan: null,
    channel: null,
    company: null,
    guarantee: null,
    payment_type: null,
    addons: 'PDJ INCL',
    adr: null,
    arrival_date: null,
    departure_date: null,
    stay_count: 1,
    breakfasts_included: 2,
    source_file: 'test',
    manual_kind: null,
    id: 'id-101',
    breakfasts_served: 2,
    served: true,
    ...partial,
  }
}

describe('pdjDaySummary', () => {
  it('agrège volumes, captage et montants HT', () => {
    const rows: PdjDayRow[] = [
      row({ room: 101, guests: 2, breakfasts_included: 2, breakfasts_served: 2 }),
      row({ room: 102, guests: 3, breakfasts_included: 2, breakfasts_served: 3 }),
    ]
    const addon: PdjAddonRow[] = [
      {
        id: 'a1',
        service_date: '2026-08-10',
        code: 'PDJ',
        total_count: 2,
        revenue_ttc: 76, // 4 inclus × 19
        source_file: 'f',
      },
    ]

    const s = pdjDaySummary(rows, addon)

    expect(s.rooms).toBe(2)
    expect(s.guests).toBe(5) // 2 + 3
    expect(s.included).toBe(4) // 2 + 2
    expect(s.extrasCount).toBe(1) // chambre 102 : 3 servis − 2 inclus
    expect(s.hasAddon).toBe(true)
    // includedHT = round2(76 / 1,10)
    expect(s.includedHT).toBeCloseTo(69.09, 2)
    // extrasHT = round2(1 × 19 / 1,10)
    expect(s.extrasHT).toBeCloseTo(17.27, 2)
    // captage = (4 inclus + 1 extra) / 5 clients = 100 %
    expect(s.captage).toBeCloseTo(100, 5)
  })

  it('sans clients → captage null ; sans addon → hasAddon false', () => {
    const s = pdjDaySummary([], [])
    expect(s.rooms).toBe(0)
    expect(s.captage).toBeNull()
    expect(s.hasAddon).toBe(false)
    expect(s.totalHT).toBe(0)
  })

  it('inclus manuel (day-use) : valorisé au tarif, ajouté au HT inclus', () => {
    const rows: PdjDayRow[] = [
      row({
        room: 200,
        guests: 0,
        breakfasts_included: 1,
        breakfasts_served: 1,
        manual_kind: 'inclus',
        addons: null,
      }),
    ]
    const s = pdjDaySummary(rows, [])
    // includedTtc = 0 addon + 1 × 19 → includedHT = round2(19 / 1,10)
    expect(s.includedHT).toBeCloseTo(17.27, 2)
  })
})
