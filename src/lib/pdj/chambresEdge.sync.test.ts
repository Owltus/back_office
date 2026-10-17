import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import { ALL_ROOMS } from '#/lib/hotel/rooms.ts'
import {
  MAX_OCCUPANTS,
  csvToDbRows,
  lireChambre,
  lireOccupants,
  mergeCsvFiles,
} from '#/lib/pdj/csv.ts'
import * as edge from '../../../supabase/functions/_shared/chambres.ts'

/*
 * L'import In-House existe en deux exemplaires : manuel (`csv.ts`) et
 * nocturne (`import-report/pdj.ts`, Deno, qui ne peut pas importer `src/`).
 * Leur validation d'une ligne (audit du 2026-10-17) doit rester IDENTIQUE.
 * S'il casse, reporter la modification de l'autre côté.
 */
describe('validation des lignes In-House — les copies Edge ne divergent pas', () => {
  it('même inventaire des chambres et même plafond', () => {
    expect([...edge.ALL_ROOMS]).toEqual(ALL_ROOMS)
    expect(edge.MAX_OCCUPANTS).toBe(MAX_OCCUPANTS)
  })

  it('même lecture de chambre et d’occupants pour toute cellule', () => {
    const cellule = fc.oneof(
      fc.string(),
      fc.integer({ min: -100, max: 10_000 }).map(String),
      fc.constantFrom(
        '-7',
        '0x10',
        '1e3',
        '9001',
        ' 102 ',
        '101',
        '',
        '20',
        '21',
      ),
    )
    fc.assert(
      fc.property(cellule, (c) => {
        expect(edge.lireChambre(c)).toBe(lireChambre(c))
        expect(edge.lireOccupants(c)).toBe(lireOccupants(c))
      }),
    )
  })
})

describe('import manuel — lignes invalides écartées et comptées', () => {
  const ENTETE = 'Room,Status,Guest Name,VIP,Adults,Children,Addons,Rate'
  const NOM = 'In-House Guests _20200110120000.csv'

  it('refuse -7, 0x10, 1e3, 9001, 101 et des occupants absurdes', () => {
    const csv = [
      ENTETE,
      '-7,IN HOUSE,a,,1,0,,',
      '0x10,IN HOUSE,b,,1,0,,',
      '1e3,IN HOUSE,c,,1,0,,',
      '9001,IN HOUSE,c,,1,0,,',
      '101,IN HOUSE,c,,1,0,,',
      '103,IN HOUSE,c,,30000,0,PDJ,',
      '104,IN HOUSE,c,,-1,0,,',
      '102,IN HOUSE,d,,2,1,PDJ,',
      '105,IN HOUSE,e,,,,,',
    ].join('\n')
    expect(csvToDbRows(csv, NOM).map((r) => [r.room, r.guests])).toEqual([
      [102, 3],
      [105, 0],
    ])
    const lot = mergeCsvFiles([{ name: NOM, content: csv }])
    expect(lot.rows).toHaveLength(2)
    expect(lot.lignesEcartees).toBe(7)
    expect(lot.ignored).toEqual([])
  })

  it('toutes les chambres de l’inventaire sont acceptées', () => {
    for (const room of ALL_ROOMS) expect(lireChambre(String(room))).toBe(room)
    expect(lireOccupants(String(MAX_OCCUPANTS))).toBe(MAX_OCCUPANTS)
    expect(lireOccupants(String(MAX_OCCUPANTS + 1))).toBeNull()
  })
})
