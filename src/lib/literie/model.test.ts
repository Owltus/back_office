import { describe, expect, it } from 'vitest'

import { ALL_ROOMS } from '#/lib/hotel/rooms.ts'
import { beddingMap, FLOORS } from '#/lib/literie/model.ts'
import type { DbHotelRoom } from '#/lib/literie/types.ts'

function room(
  n: number,
  synthetic: boolean,
): DbHotelRoom {
  return {
    room: n,
    literie_synthetique: synthetic,
    updated_at: '2026-08-17T00:00:00Z',
    updated_by: null,
  }
}

describe('FLOORS — regroupement des 80 chambres par étage', () => {
  it('couvre exactement les 80 chambres de la source canonique, sans doublon', () => {
    const flattened = FLOORS.flatMap((f) => f.rooms)
    expect(flattened).toHaveLength(ALL_ROOMS.length)
    expect(new Set(flattened)).toEqual(new Set(ALL_ROOMS))
  })

  it('produit les 6 étages attendus, dans l’ordre croissant', () => {
    expect(FLOORS.map((f) => f.floor)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('trie les chambres de chaque étage par ordre croissant', () => {
    for (const { rooms } of FLOORS) {
      const sorted = [...rooms].sort((a, b) => a - b)
      expect(rooms).toEqual(sorted)
    }
  })

  it('respecte les tailles partielles des étages 1 et 6 (pas de 101, 621-631)', () => {
    const floor1 = FLOORS.find((f) => f.floor === 1)
    const floor6 = FLOORS.find((f) => f.floor === 6)
    expect(floor1?.rooms).toHaveLength(13)
    expect(floor1?.rooms).not.toContain(101)
    expect(floor6?.rooms).toHaveLength(11)
    expect(floor6?.rooms[0]).toBe(621)
  })
})

describe('beddingMap — état literie dérivé des lignes hotel_rooms', () => {
  it('marque synthétique uniquement les chambres reçues avec le flag à true', () => {
    const map = beddingMap([room(305, true), room(410, false)])
    expect(map.get(305)).toBe(true)
    expect(map.get(410)).toBe(false)
  })

  it('couvre les 80 chambres même si la table ne renvoie qu’un sous-ensemble', () => {
    // Cas défensif : une chambre du seed absente de la réponse (ne devrait pas
    // arriver, cf. supabase/hotel_rooms.sql) reste tout de même dans la Map,
    // par défaut à `false` (plume) — la grille ne doit jamais « perdre » une
    // chambre faute de ligne en base.
    const map = beddingMap([room(305, true)])
    expect(map.size).toBe(ALL_ROOMS.length)
    expect(map.get(102)).toBe(false)
  })

  it('une réponse vide retombe entièrement sur le défaut plume', () => {
    const map = beddingMap([])
    expect([...map.values()].every((v) => v === false)).toBe(true)
  })
})
