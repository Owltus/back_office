import { describe, expect, it } from 'vitest'

import type { PdjDayRow } from '#/lib/pdj/service.ts'
import { pdjDaySummary } from '#/lib/pdj/summary.ts'

/*
 * Synthèse PDJ d'un jour. Réutilise computePdjCA (déjà couvert par breakdown.test)
 * : ici on vérifie l'AGRÉGATION (volumes, captage, branchement des extras et des
 * inclus manuels) au TARIF DÉTECTÉ (passé en Map, PDJ 19 €).
 */

const TARIFS = new Map([['PDJ', 19]])

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
    const s = pdjDaySummary(rows, TARIFS)

    expect(s.rooms).toBe(2)
    expect(s.guests).toBe(5) // 2 + 3
    expect(s.included).toBe(4) // 2 + 2
    expect(s.extrasCount).toBe(1) // chambre 102 : 3 servis − 2 inclus
    expect(s.hasAddon).toBe(true)
    // includedHT = 4 inclus × round2(19/1,10) = 4 × 17,27
    expect(s.includedHT).toBeCloseTo(69.08, 2)
    // extrasHT = round2(1 × 19 / 1,10)
    expect(s.extrasHT).toBeCloseTo(17.27, 2)
    // captage = (4 inclus + 1 extra) / 5 clients = 100 %
    expect(s.captage).toBeCloseTo(100, 5)
  })

  it('sans clients → captage null ; sans addon → hasAddon false', () => {
    const s = pdjDaySummary([], new Map())
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
    const s = pdjDaySummary(rows, TARIFS)
    // inclus manuel valorisé au tarif détecté : 1 × round2(19 / 1,10)
    expect(s.includedHT).toBeCloseTo(17.27, 2)
  })
})
