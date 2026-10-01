import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { describe, expect, it } from 'vitest'

import {
  ligneRendueVersSource,
  ligneSourceVersRendue,
  rehypeLignesSource,
} from '#/lib/classeur/print/lignesSource.ts'
import { preprocessPageBreaks } from '#/lib/classeur/print/preprocessPageBreaks.ts'

function rendu(md: string): string {
  return renderToStaticMarkup(
    createElement(
      ReactMarkdown,
      { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeLignesSource] },
      md,
    ),
  )
}

describe('rehypeLignesSource', () => {
  it('pose data-ligne sur titres, paragraphes, éléments de liste et lignes de tableau', () => {
    const html = rendu('# T\n\nPara\n\n- a\n- b\n\n| A |\n| --- |\n| 1 |')
    expect(html).toContain('<h1 data-ligne="1">')
    expect(html).toContain('<p data-ligne="3">')
    expect(html).toContain('<li data-ligne="6">')
    expect(html).toContain('<tr data-ligne="10">')
  })
})

describe('correspondance texte tapé ⇄ texte rendu (sauts de page)', () => {
  const source = 'a\n===\nb\n\n===\nc'
  const traite = preprocessPageBreaks(source)
  it('chaque ligne tapée retombe sur elle-même après aller-retour', () => {
    source.split('\n').forEach((_, i) => {
      const s = i + 1
      expect(
        ligneRendueVersSource(source, ligneSourceVersRendue(source, s)),
      ).toBe(s)
    })
  })
  it('la ligne rendue visée porte bien le même texte', () => {
    const rendues = traite.split('\n')
    for (const [s, texte] of [
      [1, 'a'],
      [3, 'b'],
      [6, 'c'],
    ] as const) {
      expect(rendues[ligneSourceVersRendue(source, s) - 1]).toBe(texte)
    }
  })
  it('sans saut de page : identité', () => {
    expect(ligneSourceVersRendue('x\ny\nz', 3)).toBe(3)
    expect(ligneRendueVersSource('x\ny\nz', 2)).toBe(2)
  })
})

describe('correspondance texte tapé ⇄ texte rendu (ancien `+++`)', () => {
  const source = 'a\n+++\nb\n===\nc'
  const traite = preprocessPageBreaks(source)
  it('un ancien `+++` compte UNE ligne (ligne vide), `===` trois', () => {
    source.split('\n').forEach((_, i) => {
      expect(
        ligneRendueVersSource(source, ligneSourceVersRendue(source, i + 1)),
      ).toBe(i + 1)
    })
    const rendues = traite.split('\n')
    for (const [s, texte] of [
      [1, 'a'],
      [2, ''],
      [3, 'b'],
      [5, 'c'],
    ] as const) {
      expect(rendues[ligneSourceVersRendue(source, s) - 1]).toBe(texte)
    }
  })
})
