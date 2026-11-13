import { describe, expect, it } from 'vitest'

import {
  elementsModifies,
  empreinteElement,
  jamaisImprime,
  lireEmpreintes,
  ecrireEmpreintes,
  marquerImprimes,
} from '#/lib/classeur/impressionsSuivies.ts'
import type { ChapterItem, DbDocument } from '#/lib/classeur/types.ts'

const doc = (id: number, patch: Partial<DbDocument> = {}): ChapterItem => ({
  kind: 'document',
  data: {
    id,
    uuid: `u${String(id)}`,
    chapter_id: 1,
    title: `Doc ${String(id)}`,
    description: '',
    content: 'Texte',
    sort_order: id,
    deleted_at: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...patch,
  },
})

function memoire() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: () => null,
    length: 0,
  }
}

describe('documents modifiés depuis la dernière impression', () => {
  it('jamais imprimé : tout est à imprimer', () => {
    expect(jamaisImprime({})).toBe(true)
    expect(elementsModifies([doc(1), doc(2)], {})).toHaveLength(2)
  })

  it('imprimé puis inchangé : rien', () => {
    const e = marquerImprimes({}, [doc(1), doc(2)])
    expect(elementsModifies([doc(1), doc(2)], e)).toEqual([])
  })

  it('le texte change : seul ce document revient', () => {
    const e = marquerImprimes({}, [doc(1), doc(2)])
    const apres = [doc(1), doc(2, { content: 'Texte changé' })]
    expect(elementsModifies(apres, e).map((x) => x.data.id)).toEqual([2])
  })

  it('un réordonnancement (sort_order, updated_at) ne compte pas', () => {
    const e = marquerImprimes({}, [doc(1)])
    const apres = [doc(1, { sort_order: 9, updated_at: '2026-11-13' })]
    expect(elementsModifies(apres, e)).toEqual([])
  })

  it('un supprimé n est jamais à imprimer', () => {
    expect(
      elementsModifies([doc(1, { deleted_at: '2026-11-13' })], {}),
    ).toEqual([])
  })

  it('imprimer un chapitre garde les empreintes des autres', () => {
    const e = marquerImprimes({ 'document:9': 'abc' }, [doc(1)])
    expect(e['document:9']).toBe('abc')
    expect(e['document:1']).toBe(empreinteElement(doc(1)))
  })

  it('aller-retour par le stockage, par compte et par classeur', () => {
    const s = memoire()
    const e = marquerImprimes({}, [doc(1)])
    ecrireEmpreintes(s, 'a', 5, e)
    expect(lireEmpreintes(s, 'a', 5)).toEqual(e)
    expect(lireEmpreintes(s, 'b', 5)).toEqual({})
    expect(lireEmpreintes(s, 'a', 6)).toEqual({})
    expect(lireEmpreintes(null, 'a', 5)).toEqual({})
  })
})
