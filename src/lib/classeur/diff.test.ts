import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { bilan, comparerLignes, segmenter } from '#/lib/classeur/diff.ts'
import type { LigneDiff } from '#/lib/classeur/diff.ts'

/** Reconstitue les deux versions à partir du diff : l'oracle de base. */
function reconstruire(d: readonly LigneDiff[]) {
  const avant = d.filter((l) => l.type !== 'ajout').map((l) => l.texte)
  const apres = d.filter((l) => l.type !== 'retrait').map((l) => l.texte)
  return { avant, apres }
}

const lignes = (s: string) => (s === '' ? [] : s.split('\n'))

describe('comparerLignes', () => {
  it('une retouche au milieu : une ligne retirée, une ajoutée, le reste égal', () => {
    const d = comparerLignes('a\nb\nc\nd', 'a\nb\nC\nd')
    expect(d.map((l) => `${l.type[0]}${l.texte}`)).toEqual([
      'ea',
      'eb',
      'rc',
      'aC',
      'ed',
    ])
    expect(bilan(d)).toEqual({ ajouts: 1, retraits: 1 })
  })
  it('numéros de ligne avant / après justes', () => {
    const d = comparerLignes('a\nx\nb', 'a\nb\ny')
    expect(d).toEqual([
      { type: 'egal', texte: 'a', avant: 1, apres: 1 },
      { type: 'retrait', texte: 'x', avant: 2 },
      { type: 'egal', texte: 'b', avant: 3, apres: 2 },
      { type: 'ajout', texte: 'y', apres: 3 },
    ])
  })
  it('textes vides', () => {
    expect(comparerLignes('', '')).toEqual([])
    expect(bilan(comparerLignes('', 'a\nb'))).toEqual({
      ajouts: 2,
      retraits: 0,
    })
    expect(bilan(comparerLignes('a', ''))).toEqual({ ajouts: 0, retraits: 1 })
  })
  it('propriété : le diff reconstitue EXACTEMENT les deux versions, et il est minimal pour des textes égaux', () => {
    const ligne = fc.constantFrom('a', 'b', 'c', '', '# T', '- x')
    const texte = fc.array(ligne, { maxLength: 30 }).map((l) => l.join('\n'))
    fc.assert(
      fc.property(texte, texte, (x, y) => {
        const d = comparerLignes(x, y)
        const r = reconstruire(d)
        expect(r.avant).toEqual(lignes(x))
        expect(r.apres).toEqual(lignes(y))
        if (x === y) expect(bilan(d)).toEqual({ ajouts: 0, retraits: 0 })
      }),
      { numRuns: 500, seed: 20260927 },
    )
  })
})

describe('segmenter', () => {
  it('replie les longues suites inchangées, garde 3 lignes de contexte', () => {
    const avant = Array.from({ length: 20 }, (_, i) => `l${String(i)}`)
    const apres = [...avant]
    apres[10] = 'CHANGE'
    const s = segmenter(comparerLignes(avant.join('\n'), apres.join('\n')))
    expect(s.map((x) => x.type)).toEqual(['replie', 'lignes', 'replie'])
    expect(s[0]).toMatchObject({ type: 'replie', nombre: 7 })
    const visibles = s[1].lignes.map((l) => l.texte)
    expect(visibles).toEqual([
      'l7',
      'l8',
      'l9',
      'l10',
      'CHANGE',
      'l11',
      'l12',
      'l13',
    ])
  })
  it('sans changement : un seul bloc replié', () => {
    expect(
      segmenter(comparerLignes('a\nb', 'a\nb')).map((s) => s.type),
    ).toEqual(['replie'])
  })
})
