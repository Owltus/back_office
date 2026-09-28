import { describe, expect, it } from 'vitest'

import { fitCommentLines, maxCommentLines } from '#/lib/rapro/commentFit.ts'

describe('commentaire du PDF coupé à la hauteur du cadre', () => {
  it('compte les lignes qui tiennent', () => {
    // cadre de 20 mm, 1re ligne à 5 mm, 2 mm de marge : 13 mm → 4 lignes de 3,65
    expect(maxCommentLines(20, 5, 3.65, 2)).toBe(4)
    expect(maxCommentLines(4, 5, 3.65, 2)).toBe(0)
  })

  it('laisse un texte court intact', () => {
    expect(fitCommentLines(['a', 'b'], 3, () => true)).toEqual(['a', 'b'])
  })

  it('coupe un texte long et finit par une ellipse', () => {
    const lines = ['un', 'deux', 'trois', 'quatre']
    expect(fitCommentLines(lines, 2, () => true)).toEqual(['un', 'deux…'])
  })

  it('raccourcit la dernière ligne pour que l’ellipse tienne', () => {
    const fits = (s: string) => s.length <= 5
    expect(fitCommentLines(['abcde', 'fghij', 'k'], 2, fits)).toEqual([
      'abcde',
      'fghi…',
    ])
  })
})
