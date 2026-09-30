import { describe, expect, it } from 'vitest'

import {
  PAGEBREAK_MARKER,
  SOUS_IMAGE_MARKER,
  preprocessPageBreaks,
} from '#/lib/classeur/print/preprocessPageBreaks.ts'

describe('preprocessPageBreaks', () => {
  it('remplace `===` seul sur une ligne par le marqueur', () => {
    const out = preprocessPageBreaks('Avant\n\n===\n\nAprès')
    expect(out).toContain(PAGEBREAK_MARKER)
    expect(out).not.toMatch(/^===\s*$/m)
  })

  it('tolère des espaces après `===`', () => {
    expect(preprocessPageBreaks('===   ')).toContain(PAGEBREAK_MARKER)
  })

  it('remplace chaque occurrence, pas seulement la première', () => {
    const out = preprocessPageBreaks('a\n===\nb\n===\nc')
    expect(out.split(PAGEBREAK_MARKER)).toHaveLength(3)
  })

  it('laisse `====` (quatre signes) intact', () => {
    const src = 'Titre\n====\n'
    expect(preprocessPageBreaks(src)).toBe(src)
  })

  it('laisse `a===` (précédé de texte) intact', () => {
    const src = 'a===\n'
    expect(preprocessPageBreaks(src)).toBe(src)
  })

  it('laisse `===` en milieu de ligne intact', () => {
    const src = 'x === y'
    expect(preprocessPageBreaks(src)).toBe(src)
  })

  it('ne touche pas un contenu sans marqueur', () => {
    const src = '# Titre\n\nParagraphe.\n'
    expect(preprocessPageBreaks(src)).toBe(src)
  })
})

describe('`+++` : reprendre sous l’image', () => {
  it('remplace `+++` seul sur une ligne par son repère, sur ses propres lignes', () => {
    expect(preprocessPageBreaks('a\n+++\nb')).toBe(
      `a\n\n${SOUS_IMAGE_MARKER}\n\nb`,
    )
    expect(preprocessPageBreaks('+++   ')).toContain(SOUS_IMAGE_MARKER)
  })
  it('laisse `++++`, `a+++` et `+++` en milieu de ligne intacts', () => {
    for (const t of ['++++', 'a+++', 'x +++ y', '++']) {
      expect(preprocessPageBreaks(t)).toBe(t)
    }
  })
  it('se combine avec `===`', () => {
    const r = preprocessPageBreaks('===\n+++')
    expect(r).toContain(PAGEBREAK_MARKER)
    expect(r).toContain(SOUS_IMAGE_MARKER)
  })
})
