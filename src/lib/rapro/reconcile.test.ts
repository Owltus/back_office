import { describe, expect, it } from 'vitest'

import { reconcile } from '#/lib/rapro/reconcile.ts'
import type { RoomStatus } from '#/lib/rapro/types.ts'

const map = (entries: Array<[number, RoomStatus]>) => new Map(entries)
const set = (...rooms: number[]) => new Set(rooms)

describe('reconcile — balance du ménage', () => {
  it('une vendue sans couleur est nettoyée par défaut (fait)', () => {
    expect(reconcile(map([]), set(101), set(101))).toEqual({
      due: 1,
      clean: 1,
      settled: 0,
      pending: 0,
    })
  })

  it('une vendue explicitement bloquée reste en attente', () => {
    const r = reconcile(map([[101, 'non_nettoyee']]), set(101), set(101))
    expect(r.clean).toBe(0)
    expect(r.pending).toBe(1)
  })

  it('un refus est hors charge (settled), pas en attente', () => {
    expect(reconcile(map([[101, 'refus']]), set(101), set(101))).toEqual({
      due: 1,
      clean: 0,
      settled: 1,
      pending: 0,
    })
  })

  it('une reportée non vendue laissée GRISE est un dû non fait (pending)', () => {
    // 305 due (reportée) mais NI vendue NI colorée → à traiter aujourd'hui.
    expect(reconcile(map([]), set(305), set())).toEqual({
      due: 1,
      clean: 0,
      settled: 0,
      pending: 1,
    })
  })

  it('une reportée non vendue nettoyée à la main (vert explicite) est faite', () => {
    expect(reconcile(map([[305, 'nettoyee']]), set(305), set())).toEqual({
      due: 1,
      clean: 1,
      settled: 0,
      pending: 0,
    })
  })

  it('mélange vendues + reportée grise', () => {
    // 101 vendue nettoyée (défaut) ; 102 vendue bloquée ; 305 reportée grise.
    const due = set(101, 102, 305)
    const sold = set(101, 102)
    expect(reconcile(map([[102, 'non_nettoyee']]), due, sold)).toEqual({
      due: 3,
      clean: 1,
      settled: 0,
      pending: 2,
    })
  })
})
