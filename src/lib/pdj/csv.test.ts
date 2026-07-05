import { describe, expect, it } from 'vitest'

import { csvToDbRows } from '#/lib/pdj/csv.ts'

/*
 * Vérifie la règle RGPD (D2) et le parsing daté de csvToDbRows.
 *
 * Données ANONYMISÉES inline (aucun vrai export PMS versionné : les exports
 * bruts contiennent des PII et sont gitignorés). Le CSV de test est daté du
 * passé : aucun nom ne doit être stocké, mais toutes les stats exploitables si.
 */

const HEADER =
  'Room,Status,Guest Name,VIP,Adults,Children,Addons,Rate,Room Type,No of Nights,TravelAgent,Company,Guarantee,Payment Type,Adr,Arrival,Departure,Stay Count'

const PAST_CSV =
  `${HEADER}\n` +
  '102,IN HOUSE,"TEST, Alice",,2,0,PDJ INCL;TAXE DE SEJOUR 5.72,BOOKING - NR - PDJ INCLUS 2 PAX,Chambre confort,3,BOOKING.COM,,Deposit Received,Credit Card,96.62,01-01-2020 02:00 PM,04-01-2020 02:00 PM,0\n' +
  '205,DUE OUT,"TEST, Bob",,1,0,TAXE DE SEJOUR 5.72,CLUB BE - NR - CH SEULE,Chambre classique,1,EXPEDIA,,,Credit Card,82.66,03-01-2020 03:00 PM,04-01-2020 02:00 PM,2\n'

describe('csvToDbRows', () => {
  it('date passée : aucun nom stocké, service_date = date du fichier, stats présentes', () => {
    const rows = csvToDbRows(PAST_CSV, 'In-House Guests _20200101120000.csv')

    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.service_date === '2020-01-01')).toBe(true)
    // RGPD : date passée -> le nom n'est jamais stocké.
    expect(rows.every((r) => r.guest_name === null)).toBe(true)
    // Données exploitables conservées.
    expect(rows.some((r) => r.room_type)).toBe(true)
    expect(rows.some((r) => r.channel === 'BOOKING.COM')).toBe(true)
    expect(rows.some((r) => r.no_of_nights === 3)).toBe(true)
    expect(rows.some((r) => r.breakfasts_included > 0)).toBe(true)
    // Dates arrivée/départ en date seule (heure écartée).
    expect(rows[0].arrival_date).toBe('2020-01-01')
    expect(rows[0].departure_date).toBe('2020-01-04')
    // Aucune colonne ultra-sensible dans la forme produite.
    const keys = Object.keys(rows[0])
    for (const forbidden of [
      'reservation_id',
      'confirm_no',
      'balance',
      'accompanying',
      'vehicle',
      'res_notes',
      'guest_notes',
      'notes',
    ]) {
      expect(keys).not.toContain(forbidden)
    }
  })

  it('date du jour : le nom du client est conservé', () => {
    const now = new Date()
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    const mini =
      'Room,Status,Guest Name,VIP,Adults,Children,Addons,Rate\n' +
      '102,IN HOUSE,"DOE, John",,2,0,PDJ INCL,BOOKING - NR - BB2PAX\n'

    const rows = csvToDbRows(mini, `In-House Guests _${stamp}.csv`)

    expect(rows).toHaveLength(1)
    expect(rows[0].guest_name).toBe('DOE, John')
    expect(rows[0].guests).toBe(2)
    expect(rows[0].breakfasts_included).toBe(2)
  })

  it('tarif BB1PAX : un seul PDJ inclus', () => {
    const now = new Date()
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    const mini =
      'Room,Status,Guest Name,VIP,Adults,Children,Addons,Rate\n' +
      '102,IN HOUSE,"SOLO, Sam",,2,0,PDJ INCL,OFFER - NR - BB1PAX\n'

    const rows = csvToDbRows(mini, `In-House Guests _${stamp}.csv`)

    expect(rows[0].breakfasts_included).toBe(1)
  })

  it('nom de fichier sans date : erreur explicite', () => {
    expect(() => csvToDbRows('Room,Status\n', 'export.csv')).toThrow(
      /Date non extractible/,
    )
  })
})
