import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import {
  chapitresDisponibles,
  comparerEntrees,
  construireCorbeille,
} from '#/lib/classeur/corbeille.ts'
import type {
  ChapitreBrut,
  DonneesCorbeille,
  ElementBrut,
  EntreeCorbeille,
} from '#/lib/classeur/corbeille.ts'
import type { ItemKind } from '#/lib/classeur/types.ts'

/*
 * Corbeille (étape 6) — oracles INDÉPENDANTS : exemples écrits à la main,
 * et pour les propriétés un tri naïf par insertion qui ne réutilise pas
 * `comparerEntrees`.
 */

const KINDS: ItemKind[] = [
  'document',
  'tracking_sheet',
  'signature_sheet',
  'intercalaire',
]

const ch = (
  id: number,
  deleted_at: string | null,
  sort_order = id,
  label = `Ch${id}`,
): ChapitreBrut => ({ id, label, sort_order, deleted_at })

const el = (
  kind: ItemKind,
  id: number,
  chapter_id: number,
  deleted_at: string | null,
  title = `${kind}${id}`,
): ElementBrut => ({ kind, id, chapter_id, title, deleted_at })

describe('construireCorbeille — exemples', () => {
  it('liste chapitres et éléments supprimés, plus récent d’abord', () => {
    const r = construireCorbeille({
      chapitres: [ch(1, null), ch(2, '2026-09-02T10:00:00Z')],
      elements: [
        el('document', 10, 1, '2026-09-01T08:00:00Z'),
        el('document', 11, 1, null),
        el('intercalaire', 12, 2, '2026-09-03T08:00:00Z'),
        el('signature_sheet', 13, 2, null),
        el('tracking_sheet', 14, 2, null),
      ],
    })
    expect(r.map((e) => e.cle)).toEqual([
      'intercalaire:12',
      'chapitre:2',
      'document:10',
    ])
    expect(r[0]).toEqual({
      type: 'element',
      cle: 'intercalaire:12',
      kind: 'intercalaire',
      id: 12,
      titre: 'intercalaire12',
      deletedAt: '2026-09-03T08:00:00Z',
      chapitreId: 2,
      chapitreLabel: 'Ch2',
      orphelin: true,
    })
    // Deux éléments actifs reviennent avec le chapitre 2.
    expect(r[1]).toEqual({
      type: 'chapitre',
      cle: 'chapitre:2',
      id: 2,
      titre: 'Ch2',
      deletedAt: '2026-09-02T10:00:00Z',
      elements: 2,
    })
    expect(r[2]).toMatchObject({ orphelin: false, chapitreLabel: 'Ch1' })
  })

  it('chapitre supprimé sans élément actif : 0', () => {
    const r = construireCorbeille({
      chapitres: [ch(3, '2026-09-02T10:00:00Z')],
      elements: [el('document', 1, 3, '2026-09-01T00:00:00Z')],
    })
    expect(r.find((e) => e.type === 'chapitre')).toMatchObject({ elements: 0 })
  })

  it('compte les actifs PAR chapitre', () => {
    const r = construireCorbeille({
      chapitres: [ch(1, '2026-09-02T00:00:00Z'), ch(2, '2026-09-01T00:00:00Z')],
      elements: [
        el('document', 1, 1, null),
        el('document', 2, 2, null),
        el('document', 3, 2, null),
        el('document', 4, 2, null),
      ],
    })
    expect(r.map((e) => (e.type === 'chapitre' ? e.elements : -1))).toEqual([
      1, 3,
    ])
  })

  it('chapitre introuvable : orphelin sans nom', () => {
    const r = construireCorbeille({
      chapitres: [ch(1, null)],
      elements: [el('document', 5, 99, '2026-09-01T00:00:00Z')],
    })
    expect(r).toEqual([
      expect.objectContaining({
        cle: 'document:5',
        chapitreId: 99,
        chapitreLabel: null,
        orphelin: true,
      }),
    ])
  })

  it('rien de supprimé : liste vide', () => {
    expect(
      construireCorbeille({
        chapitres: [ch(1, null)],
        elements: [el('document', 1, 1, null)],
      }),
    ).toEqual([])
  })

  it('à date égale, ordre par clé ; formats de date différents comparés en instants', () => {
    const r = construireCorbeille({
      chapitres: [ch(1, null)],
      elements: [
        el('intercalaire', 2, 1, '2026-09-01T10:00:00+00:00'),
        el('document', 7, 1, '2026-09-01T10:00:00Z'),
        el('document', 3, 1, '2026-09-01T12:00:00+02:00'),
        el('document', 8, 1, '2026-09-01T10:00:01Z'),
      ],
    })
    expect(r.map((e) => e.cle)).toEqual([
      'document:8',
      'document:3',
      'document:7',
      'intercalaire:2',
    ])
  })
})

describe('comparerEntrees', () => {
  const e = (cle: string, deletedAt: string): EntreeCorbeille => ({
    type: 'chapitre',
    cle,
    id: 1,
    titre: '',
    deletedAt,
    elements: 0,
  })
  it('plus récent d’abord, puis clé croissante, 0 si identiques', () => {
    expect(
      comparerEntrees(e('a', '2026-01-02'), e('a', '2026-01-01')),
    ).toBeLessThan(0)
    expect(
      comparerEntrees(e('a', '2026-01-01'), e('a', '2026-01-02')),
    ).toBeGreaterThan(0)
    expect(comparerEntrees(e('a', '2026-01-01'), e('b', '2026-01-01'))).toBe(-1)
    expect(comparerEntrees(e('b', '2026-01-01'), e('a', '2026-01-01'))).toBe(1)
    expect(comparerEntrees(e('a', '2026-01-01'), e('a', '2026-01-01'))).toBe(0)
  })
})

describe('chapitresDisponibles', () => {
  it('non supprimés seulement, ordre du classeur puis id', () => {
    const r = chapitresDisponibles([
      ch(5, null, 2),
      ch(1, '2026-09-01T00:00:00Z', 0),
      ch(3, null, 1),
      ch(4, null, 2),
    ])
    expect(r.map((c) => c.id)).toEqual([3, 4, 5])
  })
  it('ne modifie pas la liste reçue', () => {
    const l = [ch(2, null, 2), ch(1, null, 1)]
    chapitresDisponibles(l)
    expect(l.map((c) => c.id)).toEqual([2, 1])
  })
})

// ---------------------------------------------------------------------------
// Propriétés (numRuns 500)
// ---------------------------------------------------------------------------

const BASE = Date.UTC(2026, 0, 1)
// Peu d'instants distincts : les égalités (tri secondaire) sont fréquentes.
const arbDate = fc
  .integer({ min: 0, max: 6 })
  .map((m) => new Date(BASE + m * 60_000).toISOString())
const arbDeleted = fc.option(arbDate, { nil: null, freq: 2 })

const arbDonnees: fc.Arbitrary<DonneesCorbeille> = fc
  .uniqueArray(
    fc.record({ id: fc.integer({ min: 1, max: 12 }), deleted_at: arbDeleted }),
    { selector: (c) => c.id, maxLength: 6 },
  )
  .chain((chapitres) =>
    fc
      .uniqueArray(
        fc.record({
          kind: fc.constantFrom(...KINDS),
          id: fc.integer({ min: 1, max: 30 }),
          chapter_id: fc.integer({ min: 1, max: 13 }),
          title: fc.string({ maxLength: 4 }),
          deleted_at: arbDeleted,
        }),
        { selector: (e) => `${e.kind}:${e.id}`, maxLength: 25 },
      )
      .map((elements) => ({
        chapitres: chapitres.map((c) => ({
          ...c,
          label: `L${c.id}`,
          sort_order: c.id,
        })),
        elements,
      })),
  )

/** Oracle : tri par insertion, comparaison écrite à part. */
function triNaif(entrees: EntreeCorbeille[]): string[] {
  const avant = (a: EntreeCorbeille, b: EntreeCorbeille) => {
    const ta = new Date(a.deletedAt).getTime()
    const tb = new Date(b.deletedAt).getTime()
    if (ta !== tb) return ta > tb
    return a.cle < b.cle
  }
  const out: EntreeCorbeille[] = []
  for (const e of entrees) {
    let i = 0
    while (i < out.length && avant(out[i], e)) i++
    out.splice(i, 0, e)
  }
  return out.map((e) => e.cle)
}

describe('construireCorbeille — propriétés', () => {
  it('tri : plus récent d’abord, identique à un tri naïf', () => {
    fc.assert(
      fc.property(arbDonnees, (d) => {
        const r = construireCorbeille(d)
        expect(r.map((e) => e.cle)).toEqual(triNaif([...r].reverse()))
        for (let i = 1; i < r.length; i++) {
          expect(Date.parse(r[i - 1].deletedAt)).toBeGreaterThanOrEqual(
            Date.parse(r[i].deletedAt),
          )
        }
      }),
      { numRuns: 500, seed: 6 },
    )
  })

  it('chaque supprimé apparaît une fois, aucun non-supprimé', () => {
    fc.assert(
      fc.property(arbDonnees, (d) => {
        const r = construireCorbeille(d)
        const attendus = [
          ...d.chapitres
            .filter((c) => c.deleted_at !== null)
            .map((c) => `chapitre:${c.id}`),
          ...d.elements
            .filter((e) => e.deleted_at !== null)
            .map((e) => `${e.kind}:${e.id}`),
        ].sort()
        expect(r.map((e) => e.cle).sort()).toEqual(attendus)
        expect(new Set(r.map((e) => e.cle)).size).toBe(r.length)
        for (const e of r) expect(e.deletedAt).not.toBeNull()
      }),
      { numRuns: 500, seed: 7 },
    )
  })

  it('orphelin ⇔ chapitre supprimé ou introuvable ; nom du chapitre repris', () => {
    fc.assert(
      fc.property(arbDonnees, (d) => {
        for (const e of construireCorbeille(d)) {
          if (e.type !== 'element') continue
          const c = d.chapitres.find((x) => x.id === e.chapitreId)
          expect(e.orphelin).toBe(c === undefined || c.deleted_at !== null)
          expect(e.chapitreLabel).toBe(c ? c.label : null)
          const brut = d.elements.find(
            (x) => x.kind === e.kind && x.id === e.id,
          )
          expect(brut?.chapter_id).toBe(e.chapitreId)
          expect(brut?.title).toBe(e.titre)
          expect(brut?.deleted_at).toBe(e.deletedAt)
        }
      }),
      { numRuns: 500, seed: 8 },
    )
  })

  it('un chapitre compte ses éléments actifs, jamais les supprimés', () => {
    fc.assert(
      fc.property(arbDonnees, (d) => {
        for (const e of construireCorbeille(d)) {
          if (e.type !== 'chapitre') continue
          const n = d.elements.filter(
            (x) => x.chapter_id === e.id && x.deleted_at === null,
          ).length
          expect(e.elements).toBe(n)
          expect(e.titre).toBe(`L${e.id}`)
        }
      }),
      { numRuns: 500, seed: 9 },
    )
  })

  it('chapitresDisponibles : exactement les non supprimés, triés', () => {
    fc.assert(
      fc.property(arbDonnees, (d) => {
        const r = chapitresDisponibles(d.chapitres).map((c) => c.id)
        const attendu = d.chapitres
          .filter((c) => c.deleted_at === null)
          .map((c) => c.id)
          .sort((a, b) => a - b)
        expect(r).toEqual(attendu)
      }),
      { numRuns: 500, seed: 10 },
    )
  })
})
