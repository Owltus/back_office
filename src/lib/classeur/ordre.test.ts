import { describe, expect, it } from 'vitest'

import {
  appliquerOrdre,
  cleRef,
  deplacer,
  parseCleRef,
  refsDe,
} from '#/lib/classeur/ordre.ts'
import { flattenItems } from '#/lib/classeur/types.ts'
import type { ChapterContent } from '#/lib/classeur/types.ts'

const HORODATAGE = {
  uuid: 'u',
  chapter_id: 1,
  deleted_at: null,
  created_at: '2026-09-25T10:00:00Z',
  updated_at: '2026-09-25T10:00:00Z',
}

const contenu: ChapterContent = {
  documents: [
    {
      ...HORODATAGE,
      id: 1,
      title: 'Doc A',
      description: '',
      content: '',
      sort_order: 1,
    },
    {
      ...HORODATAGE,
      id: 2,
      title: 'Doc B',
      description: '',
      content: '',
      sort_order: 3,
    },
  ],
  tracking_sheets: [
    { ...HORODATAGE, id: 1, title: 'Suivi', periodicite_id: 1, sort_order: 2 },
  ],
  signature_sheets: [],
  intercalaires: [
    { ...HORODATAGE, id: 9, title: 'Inter', description: '', sort_order: 4 },
  ],
}

describe('cleRef / parseCleRef', () => {
  it('fait l aller-retour pour les quatre natures', () => {
    expect(parseCleRef(cleRef('document', 12))).toEqual({
      kind: 'document',
      id: 12,
    })
    expect(parseCleRef(cleRef('tracking_sheet', 3))).toEqual({
      kind: 'tracking_sheet',
      id: 3,
    })
    expect(parseCleRef(cleRef('signature_sheet', 0))).toEqual({
      kind: 'signature_sheet',
      id: 0,
    })
    expect(parseCleRef(cleRef('intercalaire', 7))).toEqual({
      kind: 'intercalaire',
      id: 7,
    })
  })

  it('refuse une clé de chapitre, un nombre ou une nature inconnue', () => {
    expect(parseCleRef('chapter:4')).toBeNull()
    expect(parseCleRef(4)).toBeNull()
    expect(parseCleRef('document:abc')).toBeNull()
    expect(parseCleRef('sans-deux-points')).toBeNull()
  })
})

describe('deplacer', () => {
  it('déplace un élément vers l avant et vers l arrière', () => {
    expect(deplacer(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(deplacer(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('rend une copie inchangée sur un index hors bornes', () => {
    const src = ['a', 'b']
    const out = deplacer(src, 0, 5)
    expect(out).toEqual(src)
    expect(out).not.toBe(src)
  })
})

describe('appliquerOrdre', () => {
  it('réécrit les sort_order dans l ordre des références, toutes natures confondues', () => {
    const items = flattenItems(contenu)
    // Ordre initial : Doc A(1), Suivi(2), Doc B(3), Inter(4)
    expect(items.map((el) => el.data.title)).toEqual([
      'Doc A',
      'Suivi',
      'Doc B',
      'Inter',
    ])
    // On remonte l intercalaire en tête.
    const refs = refsDe(deplacer(items, 3, 0))
    const apres = flattenItems(appliquerOrdre(contenu, refs))
    expect(apres.map((el) => el.data.title)).toEqual([
      'Inter',
      'Doc A',
      'Suivi',
      'Doc B',
    ])
    expect(apres.map((el) => el.data.sort_order)).toEqual([1, 2, 3, 4])
  })

  it('laisse intacts les éléments absents des références et ne mute pas l entrée', () => {
    const avant = JSON.stringify(contenu)
    const out = appliquerOrdre(contenu, [{ kind: 'document', id: 2 }])
    expect(out.documents.find((d) => d.id === 2)?.sort_order).toBe(1)
    expect(out.documents.find((d) => d.id === 1)?.sort_order).toBe(1)
    expect(out.intercalaires[0].sort_order).toBe(4)
    expect(JSON.stringify(contenu)).toBe(avant)
  })
})
