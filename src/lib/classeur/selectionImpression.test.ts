import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { cleRef } from '#/lib/classeur/ordre.ts'
import type { CleRef } from '#/lib/classeur/ordre.ts'
import { elementsAImprimer } from '#/lib/classeur/selectionImpression.ts'
import { ITEM_KINDS, flattenItems } from '#/lib/classeur/types.ts'
import type {
  ChapterContent,
  ChapterItem,
  ItemKind,
} from '#/lib/classeur/types.ts'

/*
 * Oracle INDÉPENDANT : un filtre naïf de la liste complète du chapitre
 * (`flattenItems`), premier exemplaire de chaque clé, supprimés exclus.
 * Il ne partage avec le code que la notion de clé `kind:id`.
 */

const DATE = '2026-10-04T00:00:00Z'

function ligne(id: number, sort_order: number, supprime: boolean) {
  return {
    id,
    uuid: `u-${id}`,
    chapter_id: 1,
    title: `T${id}`,
    description: '',
    sort_order,
    deleted_at: supprime ? DATE : null,
    created_at: DATE,
    updated_at: DATE,
  }
}

function item(
  kind: ItemKind,
  id: number,
  sort_order = id,
  supprime = false,
): ChapterItem {
  const base = ligne(id, sort_order, supprime)
  switch (kind) {
    case 'document':
      return { kind, data: { ...base, content: '' } }
    case 'tracking_sheet':
      return { kind, data: { ...base, periodicite_id: 1 } }
    case 'signature_sheet':
      return { kind, data: { ...base, nombre: 5 } }
    case 'intercalaire':
      return { kind, data: base }
  }
}

function contenuDe(items: ChapterItem[]): ChapterContent {
  const c: ChapterContent = {
    documents: [],
    tracking_sheets: [],
    signature_sheets: [],
    intercalaires: [],
  }
  for (const el of items) {
    if (el.kind === 'document') c.documents.push(el.data)
    else if (el.kind === 'tracking_sheet') c.tracking_sheets.push(el.data)
    else if (el.kind === 'signature_sheet') c.signature_sheets.push(el.data)
    else c.intercalaires.push(el.data)
  }
  return c
}

const cle = (el: ChapterItem) => cleRef(el.kind, el.data.id)

function oracle(liste: ChapterItem[], cles: Iterable<string>): ChapterItem[] {
  const voulues = [...cles]
  const resultat: ChapterItem[] = []
  for (const el of liste) {
    if (!voulues.includes(cle(el))) continue
    if (el.data.deleted_at !== null) continue
    if (resultat.some((r) => cle(r) === cle(el))) continue
    resultat.push(el)
  }
  return resultat
}

/** Un chapitre : ids uniques PAR nature, ordre et suppressions quelconques. */
const arbChapitre = fc
  .uniqueArray(
    fc.record({
      kind: fc.constantFrom(...ITEM_KINDS),
      id: fc.integer({ min: 1, max: 30 }),
      sort_order: fc.integer({ min: 0, max: 20 }),
      supprime: fc.boolean(),
    }),
    { selector: (r) => `${r.kind}:${r.id}`, maxLength: 25 },
  )
  .map((rs) =>
    flattenItems(
      contenuDe(rs.map((r) => item(r.kind, r.id, r.sort_order, r.supprime))),
    ),
  )

/** Chapitre + cochage dans un ordre quelconque, avec doublons et intrus. */
const arbCas = arbChapitre.chain((liste) =>
  fc.record({
    liste: fc.constant(liste),
    cles: fc.array(
      fc.oneof(
        liste.length > 0
          ? fc.constantFrom(...liste.map(cle))
          : fc.constant<CleRef>('document:999'),
        fc
          .tuple(
            fc.constantFrom(...ITEM_KINDS),
            fc.integer({ min: 1, max: 40 }),
          )
          .map(([k, i]) => cleRef(k, i)),
      ),
      { maxLength: 30 },
    ),
  }),
)

const PARAMS = { numRuns: 1000, seed: 20261004 }

/** `sous` est une sous-suite de `liste` (ordre conservé, identité). */
function estSousSuite(sous: ChapterItem[], liste: ChapterItem[]): boolean {
  let i = 0
  for (const el of liste) if (i < sous.length && sous[i] === el) i++
  return i === sous.length
}

describe('elementsAImprimer — exemples écrits à la main', () => {
  const d1 = item('document', 1, 0)
  const s2 = item('signature_sheet', 2, 1)
  const d3 = item('document', 3, 2)
  const i4 = item('intercalaire', 4, 3, true)
  const liste = [d1, s2, d3, i4]

  it("suit l'ordre du chapitre, pas celui du cochage", () => {
    expect(
      elementsAImprimer(liste, [
        'document:3',
        'document:1',
        'signature_sheet:2',
      ]),
    ).toEqual([d1, s2, d3])
  })
  it('ignore un supprimé et une clé absente', () => {
    expect(
      elementsAImprimer(liste, ['intercalaire:4', 'document:99', 'document:3']),
    ).toEqual([d3])
  })
  it('accepte des références { kind, id }', () => {
    expect(
      elementsAImprimer(liste, [
        { kind: 'document', id: 3 },
        { kind: 'signature_sheet', id: 2 },
      ]),
    ).toEqual([s2, d3])
  })
  it('même id, autre nature : pas confondus', () => {
    expect(elementsAImprimer(liste, ['intercalaire:1'])).toEqual([])
  })
  it('aucune clé : liste vide', () => {
    expect(elementsAImprimer(liste, [])).toEqual([])
    expect(elementsAImprimer([], ['document:1'])).toEqual([])
  })
  it('un doublon dans la liste ne sort qu’une fois', () => {
    expect(elementsAImprimer([d1, d1, s2], ['document:1'])).toEqual([d1])
  })
  it('accepte un Set (la sélection de useSelection)', () => {
    expect(
      elementsAImprimer(liste, new Set<CleRef>(['document:3', 'document:1'])),
    ).toEqual([d1, d3])
  })
})

describe('elementsAImprimer — propriétés (oracle naïf)', () => {
  it('égale le filtre naïf de la liste complète', () => {
    fc.assert(
      fc.property(arbCas, ({ liste, cles }) => {
        expect(elementsAImprimer(liste, cles)).toEqual(oracle(liste, cles))
      }),
      PARAMS,
    )
  })
  it('sortie = sous-suite de flattenItems', () => {
    fc.assert(
      fc.property(arbCas, ({ liste, cles }) =>
        estSousSuite(elementsAImprimer(liste, cles), liste),
      ),
      PARAMS,
    )
  })
  it('aucun doublon, aucun supprimé, que des éléments cochés', () => {
    fc.assert(
      fc.property(arbCas, ({ liste, cles }) => {
        const sortie = elementsAImprimer(liste, cles)
        const vues = sortie.map(cle)
        expect(new Set(vues).size).toBe(vues.length)
        for (const el of sortie) {
          expect(el.data.deleted_at).toBeNull()
          expect(cles).toContain(cle(el))
        }
      }),
      PARAMS,
    )
  })
  it('tout élément coché, présent et non supprimé, est imprimé', () => {
    fc.assert(
      fc.property(arbCas, ({ liste, cles }) => {
        const sortie = elementsAImprimer(liste, cles).map(cle)
        for (const el of liste)
          if (el.data.deleted_at === null && cles.includes(cle(el)))
            expect(sortie).toContain(cle(el))
      }),
      PARAMS,
    )
  })
  it('cocher deux fois = cocher une fois ; ordre de cochage indifférent', () => {
    fc.assert(
      fc.property(arbCas, ({ liste, cles }) => {
        const une = elementsAImprimer(liste, cles)
        expect(elementsAImprimer(liste, [...cles, ...cles])).toEqual(une)
        expect(elementsAImprimer(liste, [...cles].reverse())).toEqual(une)
      }),
      PARAMS,
    )
  })
  it('idempotence : réimprimer la sortie rend la sortie', () => {
    fc.assert(
      fc.property(arbCas, ({ liste, cles }) => {
        const une = elementsAImprimer(liste, cles)
        expect(elementsAImprimer(une, une.map(cle))).toEqual(une)
        expect(elementsAImprimer(liste, une.map(cle))).toEqual(une)
      }),
      PARAMS,
    )
  })
})
