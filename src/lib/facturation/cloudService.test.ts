import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  fetchClouds,
  fetchIssuerCodes,
  fetchIssuerMemory,
  fetchIssuers,
  fetchJournal,
} from '#/lib/facturation/cloudService.ts'

/*
 * Client simulé : chaque table sert `rows[table]`, découpées par `.range()`.
 * On enregistre les tris demandés pour vérifier que toute lecture paginée
 * trie sur une clé UNIQUE (sinon lignes sautées ou doublées d'une page à
 * l'autre).
 */
const rows: Record<string, unknown[]> = {}
const orders: Record<string, string[]> = {}

vi.mock('#/lib/supabase.ts', () => ({
  supabase: {
    from: (table: string) => {
      orders[table] = []
      const chain = {
        select: () => chain,
        order: (col: string) => {
          orders[table].push(col)
          return chain
        },
        range: (from: number, to: number) =>
          Promise.resolve({
            data: (rows[table] ?? []).slice(from, to + 1),
            error: null,
          }),
      }
      return chain
    },
  },
}))

describe('lectures paginées de la facturation', () => {
  beforeEach(() => {
    for (const k of Object.keys(rows)) delete rows[k]
    for (const k of Object.keys(orders)) delete orders[k]
  })

  it('fetchIssuers lit au-delà de 1 000 émetteurs, trié par nom', async () => {
    rows.facturation_issuers = Array.from({ length: 2345 }, (_, i) => ({
      name: `e${String(i).padStart(4, '0')}`,
      display: `E${i}`,
      count: 1,
    }))
    const out = await fetchIssuers()
    expect(out).toHaveLength(2345)
    expect(orders.facturation_issuers).toEqual(['name'])
  })

  it('chaque lecture trie sur sa clé unique', async () => {
    await fetchClouds()
    await fetchIssuerCodes()
    await fetchJournal()
    await fetchIssuerMemory()
    expect(orders.facturation_wordpool).toEqual(['code', 'token'])
    expect(orders.facturation_issuer_codes).toEqual(['issuer', 'code'])
    expect(orders.facturation_learned_docs).toEqual(['hash'])
    expect(orders.facturation_issuer_memory).toEqual([
      'issuer',
      'code_analytique',
      'compte',
    ])
  })

  it('le journal paginé garde toutes les entrées', async () => {
    rows.facturation_learned_docs = Array.from({ length: 1500 }, (_, i) => ({
      hash: `h${i}`,
      issuer: null,
      codes: null,
      deltas: null,
      method: 'ocr',
      created_at: '2026-09-28',
    }))
    const { entries } = await fetchJournal()
    expect(entries).toHaveLength(1500)
    expect(entries[0]).toMatchObject({ codes: [], deltas: {}, method: 'ocr' })
  })
})
