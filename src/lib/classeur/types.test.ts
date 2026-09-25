import { describe, expect, it } from 'vitest'

import { classeurKeys } from '#/lib/classeur/keys.ts'
import { estSensible } from '#/lib/queryPersist.ts'
import {
  computeStatus,
  flattenItems,
  ITEM_KINDS,
  ITEM_TABLE,
  type ChapterContent,
} from '#/lib/classeur/types.ts'

const base = {
  uuid: 'u',
  deleted_at: null,
  created_at: '2026-09-25T00:00:00Z',
  updated_at: '2026-09-25T00:00:00Z',
  chapter_id: 1,
}

describe('flattenItems', () => {
  it('fusionne les quatre familles et trie par sort_order puis id', () => {
    const contenu: ChapterContent = {
      documents: [
        { ...base, id: 10, title: 'D', description: '', content: '', sort_order: 3 },
      ],
      tracking_sheets: [
        { ...base, id: 20, title: 'S', periodicite_id: 1, sort_order: 1 },
      ],
      signature_sheets: [
        { ...base, id: 30, title: 'E', description: '', nombre: 14, sort_order: 2 },
      ],
      intercalaires: [
        { ...base, id: 5, title: 'I', description: '', sort_order: 2 },
      ],
    }
    expect(flattenItems(contenu).map((i) => `${i.kind}:${i.data.id}`)).toEqual([
      'tracking_sheet:20',
      'intercalaire:5',
      'signature_sheet:30',
      'document:10',
    ])
  })
})

describe('computeStatus', () => {
  it('un chapitre est conforme dès un élément', () => {
    expect(computeStatus(0)).toBe('a_verifier')
    expect(computeStatus(1)).toBe('conforme')
  })
})

describe('registres', () => {
  it('chaque nature a une table classeur_*', () => {
    for (const k of ITEM_KINDS) expect(ITEM_TABLE[k]).toMatch(/^classeur_/)
  })

  it('toutes les clés commencent par classeur et sont persistables', () => {
    const cles = [
      classeurKeys.list(),
      classeurKeys.one(1),
      classeurKeys.chapters(1),
      classeurKeys.chapter(2),
      classeurKeys.items(2),
      classeurKeys.classeurItems(1),
      classeurKeys.periodicites(),
      classeurKeys.mergeHistory(1),
    ]
    for (const c of cles) {
      expect(c[0]).toBe('classeur')
      // Aucune donnée nominative : le cache de secours a le droit de les écrire.
      expect(estSensible(c)).toBe(false)
    }
    expect(new Set(cles.map((c) => JSON.stringify(c))).size).toBe(cles.length)
  })
})
