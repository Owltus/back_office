import { describe, expect, it } from 'vitest'

import {
  aggregateParkingDaily,
  aggregateParkingMonthly,
  captageIndex,
  yearsFromParkingDates,
} from '#/lib/parking/analytics.ts'
import type {
  ParkingArrivalsRow,
  ParkingDailyOccRow,
} from '#/lib/parking/service.ts'

/*
 * Captage parking = occupation du parking client ÷ occupation de l'hôtel, en %,
 * BORNÉ 0–100 %. 100 % = parking au moins aussi rempli, en proportion, que
 * l'hôtel ; <100 % = parking en retrait ; 0 % = clients mais parking vide.
 * Voir en-tête de analytics.ts. (12 places client, 80 chambres.)
 */

describe('captageIndex', () => {
  it('100 % quand parking et hôtel sont aussi remplis l’un que l’autre', () => {
    // Parking à 50 % (6/12), hôtel à 50 % (40/80) → parité.
    expect(captageIndex(6, 40)).toBeCloseTo(100, 6)
  })

  it('plafonné à 100 % quand le parking est plus tendu que l’hôtel', () => {
    // Parking plein (12/12), hôtel à 25 % (20/80) → division 400 %, ramené à 100 %.
    expect(captageIndex(12, 20)).toBe(100)
  })

  it('faible quand le parking traîne derrière un hôtel plein', () => {
    // Parking à 17 % (2/12), hôtel plein (80/80) → 16,67 %.
    expect(captageIndex(2, 80)).toBeCloseTo(16.67, 2)
  })

  it('0 % quand des clients sont présents mais le parking est vide', () => {
    expect(captageIndex(0, 56)).toBe(0)
  })

  it('en retrait quand le parking est moins rempli que l’hôtel', () => {
    // Parking à 33 % (4/12), hôtel à 70 % (56/80) → 47,6 %.
    expect(captageIndex(4, 56)).toBeCloseTo(47.62, 2)
  })

  it('null quand l’occupation hôtel est inconnue (dénominateur nul)', () => {
    expect(captageIndex(4, 0)).toBeNull()
    expect(captageIndex(0, 0)).toBeNull()
  })
})

describe('aggregateParkingMonthly (vue arrivées)', () => {
  it('somme par mois d’arrivée, ignore les autres années', () => {
    const arrivals: ParkingArrivalsRow[] = [
      { start_date: '2026-08-10', reservations: 3, nights: 7, client_nights: 5, paid: 2, reserved: 1, unpaid: 0 },
      { start_date: '2026-08-20', reservations: 1, nights: 2, client_nights: 2, paid: 0, reserved: 0, unpaid: 1 },
      { start_date: '2026-07-05', reservations: 1, nights: 1, client_nights: 1, paid: 1, reserved: 0, unpaid: 0 },
      { start_date: '2025-08-01', reservations: 5, nights: 10, client_nights: 8, paid: 5, reserved: 0, unpaid: 0 },
    ]
    const months = aggregateParkingMonthly(arrivals, 2026)
    expect(months).toHaveLength(12)
    const aug = months[7]
    expect(aug.reservations).toBe(4) // 3 + 1
    expect(aug.nights).toBe(9) // 7 + 2
    expect(aug.clientNights).toBe(7) // 5 + 2
    expect(aug.paid).toBe(2)
    expect(aug.reserved).toBe(1)
    expect(aug.unpaid).toBe(1)
    // Occupation = nuits-places TOUTES places / (12 × jours du mois).
    expect(aug.occupancyRate).toBeCloseTo((9 / (12 * 31)) * 100)
    expect(months[6].reservations).toBe(1) // juillet
    expect(months[0].reservations).toBe(0) // janvier vide (2025 ignoré)
  })
})

describe('aggregateParkingDaily (vue occupation)', () => {
  it('remplit tous les jours du mois, zéros pour les jours absents', () => {
    const occ: ParkingDailyOccRow[] = [
      { date: '2026-08-01', occupied: 3, occupied_client: 2, arrivals: 1, departures: 0 },
      { date: '2026-08-03', occupied: 13, occupied_client: 12, arrivals: 2, departures: 1 },
    ]
    const days = aggregateParkingDaily(occ, 2026, 8)
    expect(days).toHaveLength(31)
    expect(days[0]).toEqual({
      date: '2026-08-01', day: 1, occupied: 3, occupiedClient: 2,
      occupancy: (3 / 12) * 100, arrivals: 1, departures: 0,
    })
    // Jour 2 absent de la vue → tout à zéro.
    expect(days[1]).toEqual({
      date: '2026-08-02', day: 2, occupied: 0, occupiedClient: 0,
      occupancy: 0, arrivals: 0, departures: 0,
    })
    // Places tampon prises → occupation > 100 % (13/12).
    expect(days[2].occupancy).toBeCloseTo((13 / 12) * 100)
  })

  it('ignore les lignes hors du mois demandé', () => {
    const occ: ParkingDailyOccRow[] = [
      { date: '2026-09-05', occupied: 5, occupied_client: 4, arrivals: 0, departures: 0 },
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
