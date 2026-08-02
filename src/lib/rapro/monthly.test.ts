import { describe, expect, it } from 'vitest'

import { cleaned, sumCounts, vendues } from '#/lib/rapro/monthly.ts'
import type { DayStatusCounts } from '#/lib/rapro/monthly.ts'

const counts = (c: Partial<DayStatusCounts>): DayStatusCounts => ({
  nettoyee: 0,
  rattrapage: 0,
  bloquee: 0,
  refus: 0,
  ...c,
})

describe('vendues / cleaned — vente vs facture ELIOR', () => {
  it('vendues = nettoyées + bloquées + refus, SANS les rattrapages', () => {
    // Un rattrapage est un ménage fait sur une reportée non vendue : il ne doit
    // JAMAIS gonfler l'occupation (c'était le double-comptage à corriger).
    expect(vendues(counts({ nettoyee: 10, bloquee: 2, refus: 1, rattrapage: 3 }))).toBe(13)
  })

  it('cleaned (facture ELIOR) = nettoyées + rattrapages', () => {
    // La facture ménage inclut les rattrapages (le ménage a bien eu lieu).
    expect(cleaned(counts({ nettoyee: 10, bloquee: 2, refus: 1, rattrapage: 3 }))).toBe(13)
  })

  it('un jour avec un SEUL rattrapage : 0 vendue, 1 facturée', () => {
    const c = counts({ rattrapage: 1 })
    expect(vendues(c)).toBe(0)
    expect(cleaned(c)).toBe(1)
  })

  it('sumCounts additionne les quatre catégories, rattrapage compris', () => {
    const byDay = new Map<string, DayStatusCounts>([
      ['2026-08-01', counts({ nettoyee: 5, rattrapage: 1, bloquee: 1, refus: 0 })],
      ['2026-08-02', counts({ nettoyee: 3, rattrapage: 2, bloquee: 0, refus: 2 })],
    ])
    expect(sumCounts(byDay)).toEqual({
      nettoyee: 8,
      rattrapage: 3,
      bloquee: 1,
      refus: 2,
    })
  })
})
