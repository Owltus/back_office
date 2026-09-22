import { describe, expect, it } from 'vitest'

import {
  aggregateParkingDaily,
  aggregateParkingMonthly,
  yearsFromParkingDates,
} from '#/lib/parking/analytics.ts'
import type {
  ParkingArrivalsRow,
  ParkingDailyOccRow,
} from '#/lib/parking/service.ts'

/*
 * Occupation parking = places occupées ÷ 14 places (tampon 13 & 14 compris).
 * Numérateur et dénominateur portent sur le même périmètre : le taux
 * journalier ne peut pas dépasser 100 %. Voir en-tête de analytics.ts.
 */

describe('aggregateParkingMonthly (vue arrivées)', () => {
  it('somme par mois d’arrivée, ignore les autres années', () => {
    const arrivals: ParkingArrivalsRow[] = [
      { start_date: '2026-08-10', reservations: 3, nights: 7, client_nights: 5, paid: 2, reserved: 1, unpaid: 0, free: 0, free_nights: 0, ca_ht: 63.64, ca_ttc: 70 },
      { start_date: '2026-08-20', reservations: 1, nights: 2, client_nights: 2, paid: 0, reserved: 0, unpaid: 1, free: 0, free_nights: 0, ca_ht: 18.18, ca_ttc: 20 },
      { start_date: '2026-07-05', reservations: 1, nights: 1, client_nights: 1, paid: 1, reserved: 0, unpaid: 0, free: 0, free_nights: 0, ca_ht: 9.09, ca_ttc: 10 },
      { start_date: '2025-08-01', reservations: 5, nights: 10, client_nights: 8, paid: 5, reserved: 0, unpaid: 0, free: 0, free_nights: 0, ca_ht: 90.9, ca_ttc: 100 },
    ]
    const months = aggregateParkingMonthly(arrivals, 2026)
    expect(months).toHaveLength(12)
    const aug = months[7]
    expect(aug.reservations).toBe(4) // 3 + 1
    expect(aug.nights).toBe(9) // 7 + 2
    expect(aug.paid).toBe(2)
    expect(aug.reserved).toBe(1)
    expect(aug.caHt).toBeCloseTo(81.82) // 63.64 + 18.18
    expect(aug.caTtc).toBe(90) // 70 + 20
    // Occupation = nuits-places TOUTES places / (14 × jours du mois).
    expect(aug.occupancyRate).toBeCloseTo((9 / (14 * 31)) * 100)
    expect(months[6].reservations).toBe(1) // juillet
    expect(months[0].reservations).toBe(0) // janvier vide (2025 ignoré)
  })

  it('gratuité : comptée dans les nuitées générales, jamais dans le CA', () => {
    const arrivals: ParkingArrivalsRow[] = [
      // Réservation gratuité pure : nuits comptées, CA nul.
      { start_date: '2026-08-10', reservations: 1, nights: 2, client_nights: 2, paid: 0, reserved: 0, unpaid: 0, free: 1, free_nights: 2, ca_ht: 0, ca_ttc: 0 },
      // Réservation payante le même jour : CA non nul.
      { start_date: '2026-08-10', reservations: 1, nights: 1, client_nights: 1, paid: 1, reserved: 0, unpaid: 0, free: 0, free_nights: 0, ca_ht: 18.18, ca_ttc: 20 },
    ]
    const months = aggregateParkingMonthly(arrivals, 2026)
    const aug = months[7]
    expect(aug.reservations).toBe(2) // gratuité comptée dans le total général
    expect(aug.nights).toBe(3) // 2 + 1, gratuité comptée dans les nuitées générales
    expect(aug.free).toBe(1)
    expect(aug.freeNights).toBe(2)
    expect(aug.caTtc).toBe(20) // la ligne gratuité ne contribue rien au CA
  })
})

describe('aggregateParkingDaily (vue occupation)', () => {
  it('remplit tous les jours du mois, zéros pour les jours absents', () => {
    const occ: ParkingDailyOccRow[] = [
      { date: '2026-08-01', occupied: 3, occupied_client: 2, occupied_free: 1, arrivals: 1, departures: 0 },
      { date: '2026-08-03', occupied: 13, occupied_client: 12, occupied_free: 0, arrivals: 2, departures: 1 },
    ]
    const days = aggregateParkingDaily(occ, 2026, 8)
    expect(days).toHaveLength(31)
    expect(days[0]).toEqual({
      date: '2026-08-01', day: 1, occupied: 3, occupiedFree: 1,
      occupancy: (3 / 14) * 100, arrivals: 1, departures: 0,
    })
    // Jour 2 absent de la vue → tout à zéro.
    expect(days[1]).toEqual({
      date: '2026-08-02', day: 2, occupied: 0, occupiedFree: 0,
      occupancy: 0, arrivals: 0, departures: 0,
    })
    // Treize places prises sur quatorze : le taux reste SOUS 100 %. C'est le
    // sens du passage au dénominateur de 14 places (2026-09-22) — avant, ce
    // même jour affichait 108 % (13/12).
    expect(days[2].occupancy).toBeCloseTo((13 / 14) * 100)
    expect(days[2].occupancy).toBeLessThan(100)
  })

  it('parking complet : exactement 100 %, jamais au-dessus', () => {
    const occ: ParkingDailyOccRow[] = [
      { date: '2026-08-01', occupied: 14, occupied_client: 12, occupied_free: 0, arrivals: 0, departures: 0 },
    ]
    const days = aggregateParkingDaily(occ, 2026, 8)
    expect(days[0].occupancy).toBe(100)
  })

  it('ignore les lignes hors du mois demandé', () => {
    const occ: ParkingDailyOccRow[] = [
      { date: '2026-09-05', occupied: 5, occupied_client: 4, occupied_free: 0, arrivals: 0, departures: 0 },
    ]
    const days = aggregateParkingDaily(occ, 2026, 8)
    expect(days.every((d) => d.occupied === 0)).toBe(true)
  })
})

describe('yearsFromParkingDates', () => {
  it('années distinctes triées + fallback', () => {
    expect(
      yearsFromParkingDates(['2026-08-10', '2024-01-02', '2026-12-31'], 2025),
    ).toEqual([2024, 2025, 2026])
  })
})
