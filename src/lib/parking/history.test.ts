import { describe, expect, it } from 'vitest'

import { invert, restoreDeleted, restorePatch } from '#/lib/parking/history.ts'
import type { ParkingCommand } from '#/lib/parking/history.ts'
import type { Reservation } from '#/lib/parking/model.ts'

const RES: Reservation = {
  id: 'r1',
  client: 'Dupont',
  spot: 3,
  startDay: 2,
  nights: 2,
  status: 'reserve',
  comment: '',
}

describe('invert — inverse d\'une commande parking', () => {
  it('create devient delete, même snapshot', () => {
    const cmd: ParkingCommand = { kind: 'create', snapshot: RES }
    expect(invert(cmd)).toEqual({ kind: 'delete', snapshot: RES })
  })

  it('delete devient create, même snapshot', () => {
    const cmd: ParkingCommand = { kind: 'delete', snapshot: RES }
    expect(invert(cmd)).toEqual({ kind: 'create', snapshot: RES })
  })

  it('update échange before et after, garde l\'id', () => {
    const cmd: ParkingCommand = {
      kind: 'update',
      id: 'r1',
      before: { spot: 3 },
      after: { spot: 5 },
    }
    expect(invert(cmd)).toEqual({
      kind: 'update',
      id: 'r1',
      before: { spot: 5 },
      after: { spot: 3 },
    })
  })

  it('est une involution : invert(invert(cmd)) === cmd pour les trois formes', () => {
    const cmds: ParkingCommand[] = [
      { kind: 'create', snapshot: RES },
      { kind: 'delete', snapshot: RES },
      { kind: 'update', id: 'r1', before: { status: 'paye' }, after: { status: 'checkout' } },
    ]
    for (const cmd of cmds) {
      expect(invert(invert(cmd))).toEqual(cmd)
    }
  })
})

describe('retour arrière d’une écriture refusée par la base', () => {
  it('restorePatch ne reprend QUE les champs envoyés', () => {
    // Glisser refusé : la barre revient à sa place de départ, mais le nom
    // changé entre-temps par un collègue (temps réel) n'est pas écrasé.
    const avant = { spot: 3, startDay: 2, nights: 2 }
    const envoye = { spot: 5, startDay: 4, nights: 2 }
    const restore = restorePatch(envoye, avant)
    expect(restore).toEqual(avant)
    const affiche = { ...RES, ...envoye, client: 'Martin' }
    expect({ ...affiche, ...restore }).toEqual({ ...RES, client: 'Martin' })
  })

  it('restorePatch lit la source donnée (réservation entière ou position de départ)', () => {
    expect(restorePatch({ status: 'paye' }, RES)).toEqual({ status: 'reserve' })
  })

  it('restoreDeleted remet la réservation, sans doublon', () => {
    expect(restoreDeleted([], RES)).toEqual([RES])
    expect(restoreDeleted([RES], RES)).toEqual([RES])
  })
})
