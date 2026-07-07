import { describe, expect, it } from 'vitest'

import { csvToDbRows, mergeCsvFiles, parseGuestRows } from '#/lib/pdj/csv.ts'

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

describe('mergeCsvFiles', () => {
  const fileFor = (date: string, stamp: string) => ({
    name: `In-House Guests _${stamp}.csv`,
    content:
      `${HEADER}\n` +
      `102,IN HOUSE,"X, Y",,2,0,PDJ INCL,BOOKING - NR - BB2PAX,Chambre confort,1,BOOKING.COM,,,Credit Card,90,${date} 02:00 PM,${date} 02:00 PM,0\n`,
  })

  it('fusionne plusieurs jours et les trie du plus récent au plus ancien', () => {
    const result = mergeCsvFiles([
      fileFor('10-01-2020', '20200110120000'),
      fileFor('12-01-2020', '20200112120000'),
      fileFor('11-01-2020', '20200111120000'),
    ])

    expect(result.dates).toEqual(['2020-01-12', '2020-01-11', '2020-01-10'])
    expect(result.rows).toHaveLength(3)
    expect(result.imported).toHaveLength(3)
    expect(result.ignored).toHaveLength(0)
  })

  it('ignore les fichiers invalides sans bloquer les valides', () => {
    const result = mergeCsvFiles([
      fileFor('10-01-2020', '20200110120000'),
      { name: 'poubelle.csv', content: 'nawak,pas,des,colonnes\n1,2,3,4\n' },
      { name: 'sans-date.csv', content: `${HEADER}\n` },
    ])

    expect(result.dates).toEqual(['2020-01-10'])
    expect(result.rows).toHaveLength(1)
    expect(result.ignored).toHaveLength(2)
    expect(result.ignored.map((i) => i.name)).toContain('poubelle.csv')
  })

  it('même jour en double : la version la plus récente (par nom) gagne', () => {
    const result = mergeCsvFiles([
      fileFor('10-01-2020', '20200110080000'),
      fileFor('10-01-2020', '20200110190000'), // plus tard le même jour
    ])

    expect(result.dates).toEqual(['2020-01-10'])
    expect(result.rows).toHaveLength(1)
    expect(result.imported).toEqual(['In-House Guests _20200110190000.csv'])
    expect(result.ignored).toHaveLength(1)
    expect(result.ignored[0].name).toBe('In-House Guests _20200110080000.csv')
  })

  it('aucune clé (service_date, room) dupliquée dans le payload final', () => {
    const result = mergeCsvFiles([
      fileFor('10-01-2020', '20200110080000'),
      fileFor('10-01-2020', '20200110190000'),
      fileFor('11-01-2020', '20200111120000'),
    ])

    const keys = result.rows.map((r) => `${r.service_date}|${r.room}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('lot vide → résultat vide', () => {
    const result = mergeCsvFiles([])
    expect(result.rows).toHaveLength(0)
    expect(result.dates).toHaveLength(0)
    expect(result.imported).toHaveLength(0)
    expect(result.ignored).toHaveLength(0)
  })
})

describe('parseGuestRows — départs anticipés (rapport tiré tard)', () => {
  // Fichier du 10-01-2020 : 102 recouche, 205 va partir, 306 déjà parti CE
  // MATIN (départ 10-01), 307 parti la VEILLE (départ 09-01).
  const CSV =
    `${HEADER}\n` +
    '102,IN HOUSE,"KEEP, In",,1,0,PDJ INCL,BOOKING - NR - BB1PAX,Chambre confort,3,BOOKING.COM,,,Credit Card,96,08-01-2020 02:00 PM,12-01-2020 02:00 PM,0\n' +
    '205,DUE OUT,"KEEP, Due",,2,0,PDJ INCL,CLUB - NR - BB2PAX,Chambre classique,1,EXPEDIA,,,Credit Card,82,09-01-2020 03:00 PM,10-01-2020 02:00 PM,0\n' +
    '306,CHECKED OUT,"KEEP, Early",,1,0,PDJ INCL,EBR - FLEX - PDJ INCLUS,Chambre classique,1,EXPEDIA,,,Credit Card,90,09-01-2020 05:00 PM,10-01-2020 05:20 AM,0\n' +
    '307,CHECKED OUT,"DROP, Late",,2,0,PDJ INCL,BOOKING - NR - BB2PAX,Chambre classique,1,BOOKING.COM,,,Credit Card,90,08-01-2020 05:00 PM,09-01-2020 10:00 AM,0\n'

  it('garde le CHECKED OUT parti le jour du service, jette celui de la veille', () => {
    const rows = parseGuestRows(CSV, '2020-01-10')
    const rooms = rows.map((r) => r.room)

    expect(rooms).toContain(306) // parti ce matin -> compte au PDJ
    expect(rooms).not.toContain(307) // parti la veille -> service d'hier
    expect(rows).toHaveLength(3)

    const early = rows.find((r) => r.room === 306)!
    expect(early.status).toBe('CHECKED OUT')
    expect(early.breakfastsIncluded).toBe(1)
  })

  it('sans serviceDate : comportement historique (aucun CHECKED OUT gardé)', () => {
    const rooms = parseGuestRows(CSV).map((r) => r.room)
    expect(rooms).toEqual([102, 205])
  })

  it('csvToDbRows applique la règle via la date du nom de fichier', () => {
    const rows = csvToDbRows(CSV, 'In-House Guests _20200110120000.csv')
    expect(rows.map((r) => r.room).sort((a, b) => a - b)).toEqual([
      102, 205, 306,
    ])
  })

  it('fichier archive (aucun statut actif) : tous les statuts conservés', () => {
    const archive =
      `${HEADER}\n` +
      '306,CHECKED OUT,"A, A",,1,0,PDJ INCL,EBR - FLEX - PDJ INCLUS,Chambre classique,1,EXPEDIA,,,Credit Card,90,09-01-2020 05:00 PM,10-01-2020 05:20 AM,0\n' +
      '307,CHECKED OUT,"B, B",,1,0,PDJ INCL,EBR - FLEX - PDJ INCLUS,Chambre classique,1,EXPEDIA,,,Credit Card,90,03-01-2020 05:00 PM,05-01-2020 10:00 AM,0\n'
    const rooms = parseGuestRows(archive, '2020-01-10').map((r) => r.room)
    expect(rooms.sort((a, b) => a - b)).toEqual([306, 307])
  })
})
