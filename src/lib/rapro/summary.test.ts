import { describe, expect, it } from 'vitest'

import type { RaproOccupancyRow } from '#/lib/rapro/service.ts'
import type { RoomStatus } from '#/lib/rapro/types.ts'
import { raproDaySummary } from '#/lib/rapro/summary.ts'

/*
 * Synthèse ménage d'un jour. Réutilise countStats (déjà couvert) : ici on vérifie
 * le branchement occupation ↔ statuts (défaut nettoyée, refus, bloquée, rattrapage
 * hors occupation, non vendue retirée) et le report (carried → bloquées de la veille).
 */

function occ(rooms: number[]): RaproOccupancyRow[] {
  return rooms.map((room) => ({ room, adr: 100, manual_kind: null }))
}

function statuses(map: Record<number, RoomStatus>): Map<number, RoomStatus> {
  return new Map(Object.entries(map).map(([r, s]) => [Number(r), s]))
}

describe('raproDaySummary', () => {
  it('défaut nettoyée : occupée sans ligne = nettoyée', () => {
    const s = raproDaySummary(occ([101, 102, 103]), new Map(), new Set())
    expect(s.vendues).toBe(3)
    expect(s.nettoyees).toBe(3)
    expect(s.refus).toBe(0)
    expect(s.bloqueesJour).toBe(0)
    expect(s.bloqueesVeille).toBe(0)
  })

  it('partitionne refus et bloquées, le reste en nettoyées', () => {
    const s = raproDaySummary(
      occ([101, 102, 103, 104]),
      statuses({ 102: 'refus', 103: 'non_nettoyee' }),
      new Set(),
    )
    expect(s.vendues).toBe(4)
    expect(s.refus).toBe(1)
    expect(s.bloqueesJour).toBe(1)
    expect(s.nettoyees).toBe(2) // 101 + 104 (défaut)
  })

  it('« non vendue » sort des vendues', () => {
    const s = raproDaySummary(occ([101, 102]), statuses({ 102: 'non_vendue' }), new Set())
    expect(s.vendues).toBe(1)
    expect(s.nettoyees).toBe(1)
  })

  it('rattrapage sur reportée : compté en nettoyées, pas en vendues', () => {
    const s = raproDaySummary(
      occ([101]),
      statuses({ 410: 'rattrapage' }),
      new Set([410]),
    )
    expect(s.vendues).toBe(1) // 410 reportée → hors vendues
    expect(s.nettoyees).toBe(2) // 101 (défaut) + 410 (rattrapage)
    expect(s.bloqueesVeille).toBe(1) // carried = {410}
  })

  it('bloquées de la veille = taille du report (carried)', () => {
    const s = raproDaySummary(occ([101]), new Map(), new Set([301, 302]))
    expect(s.bloqueesVeille).toBe(2)
    expect(s.vendues).toBe(1) // les reportées non occupées ne sont pas vendues
  })
})
