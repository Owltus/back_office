import { describe, expect, it } from 'vitest'

import { groupRowsByDay, toRaproDay } from '#/lib/rapro/dayRows.ts'
import type { DatedRaproRoomRow } from '#/lib/rapro/dayRows.ts'
import { carryOver } from '#/lib/rapro/carryover.ts'
import type { RoomStatus } from '#/lib/rapro/types.ts'

function row(
  report_date: string,
  room: number,
  status: RoomStatus | null,
  flags: { carried?: boolean; materialized?: boolean } = {},
): DatedRaproRoomRow {
  return {
    report_date,
    room,
    status,
    carried_manual: flags.carried ?? false,
    materialized: flags.materialized ?? false,
  }
}

describe('toRaproDay — lignes d’un jour → état du jour', () => {
  it('ne garde en statuts que les couleurs explicites', () => {
    const day = toRaproDay('2026-09-01', [
      row('2026-09-01', 101, 'non_nettoyee'),
      // Ligne « liseré seul » : status null → hors de la map, mais dans carriedManual.
      row('2026-09-01', 102, null, { carried: true }),
      row('2026-09-01', 103, 'nettoyee', { materialized: true }),
    ])
    expect(day.reportDate).toBe('2026-09-01')
    expect([...day.statuses]).toEqual([
      [101, 'non_nettoyee'],
      [103, 'nettoyee'],
    ])
    expect(day.carriedManual).toEqual(new Set([102]))
    expect(day.materialized).toEqual(new Set([103]))
  })

  it('ramène un statut inconnu à refus (défense)', () => {
    const day = toRaproDay('2026-09-01', [
      row('2026-09-01', 101, 'bidule' as RoomStatus),
    ])
    expect(day.statuses.get(101)).toBe('refus')
  })
})

describe('groupRowsByDay — regroupement de la fenêtre de roulement', () => {
  it('produit un instantané par jour demandé, dans l’ordre, vide si aucune ligne', () => {
    const days = ['2026-09-01', '2026-09-02', '2026-09-03']
    const snaps = groupRowsByDay(days, [
      row('2026-09-03', 305, 'refus'),
      row('2026-09-01', 305, 'non_nettoyee'),
      // Hors fenêtre : ignorée.
      row('2026-08-31', 305, 'non_nettoyee'),
    ])
    expect(snaps.map((s) => s.reportDate)).toEqual(days)
    expect(snaps[0].statuses.get(305)).toBe('non_nettoyee')
    expect(snaps[1].statuses.size).toBe(0)
    expect(snaps[1].carriedManual.size).toBe(0)
    expect(snaps[2].statuses.get(305)).toBe('refus')
  })

  it('reproduit « absence de ligne = résolue » une fois passé à carryOver', () => {
    // J-2 bloquée, J-1 sans ligne → la chambre cesse de rouler (cas chambre 414).
    const resolved = groupRowsByDay(
      ['2026-09-01', '2026-09-02'],
      [row('2026-09-01', 414, 'non_nettoyee')],
    )
    expect(carryOver(resolved)).toEqual(new Set())

    // J-2 bloquée, J-1 encore bloquée → roule toujours.
    const stillDue = groupRowsByDay(
      ['2026-09-01', '2026-09-02'],
      [
        row('2026-09-01', 414, 'non_nettoyee'),
        row('2026-09-02', 414, 'non_nettoyee'),
      ],
    )
    expect(carryOver(stillDue)).toEqual(new Set([414]))

    // Liseré manuel seul (status null) à J-1 → origine de roulement.
    const manual = groupRowsByDay(
      ['2026-09-02'],
      [row('2026-09-02', 208, null, { carried: true })],
    )
    expect(carryOver(manual)).toEqual(new Set([208]))
  })

  it('renvoie un tableau vide pour une fenêtre vide', () => {
    expect(groupRowsByDay([], [row('2026-09-01', 101, 'refus')])).toEqual([])
  })
})
