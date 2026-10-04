import { describe, expect, it } from 'vitest'

import {
  KO_PAR_PAGE,
  SECONDES_PAR_PAGE,
  SEUIL_AVERTISSEMENT_PAGES,
  avertissementLongPdf,
  dureeLisible,
  estimerPdf,
} from '#/lib/classeur/print/estimationPdf.ts'

describe('estimationPdf', () => {
  it('proportionnelle au nombre de pages, 0 pour une entrée invalide', () => {
    expect(estimerPdf(10)).toEqual({
      secondes: 10 * SECONDES_PAR_PAGE,
      mo: (10 * KO_PAR_PAGE) / 1024,
    })
    expect(estimerPdf(-3)).toEqual({ secondes: 0, mo: 0 })
    expect(estimerPdf(Number.NaN)).toEqual({ secondes: 0, mo: 0 })
  })

  it('durée lisible', () => {
    expect(dureeLisible(20)).toBe("moins d'une minute")
    expect(dureeLisible(59.9)).toBe("moins d'une minute")
    expect(dureeLisible(60)).toBe('environ 1 min')
    expect(dureeLisible(150)).toBe('environ 3 min')
  })

  it('avertissement au-delà du seuil seulement, sans guillemets ni tiret cadratin', () => {
    expect(avertissementLongPdf(SEUIL_AVERTISSEMENT_PAGES)).toBeNull()
    expect(avertissementLongPdf(0)).toBeNull()
    const texte = avertissementLongPdf(64)
    expect(texte).toContain('64 pages')
    expect(texte).toContain('Mo')
    expect(texte).not.toMatch(/[«»—]/)
    expect(avertissementLongPdf(SEUIL_AVERTISSEMENT_PAGES + 1)).toContain(
      `${SEUIL_AVERTISSEMENT_PAGES + 1} pages`,
    )
  })
})
