import { describe, expect, it } from 'vitest'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  decouperLigne,
  ecrireTableau,
  grilleVide,
  normaliser,
  trouverTableau,
} from '#/lib/classeur/tableauMarkdown.ts'

/** Rendu par le VRAI moteur des pages : l'oracle « c'est bien un tableau ». */
function html(md: string): string {
  return renderToStaticMarkup(
    createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, md),
  )
}

describe('ecrireTableau — Markdown officiel uniquement', () => {
  it('écrit en-tête, séparateur et lignes', () => {
    expect(
      ecrireTableau({
        entete: ['Élément', 'Détail'],
        lignes: [['Premier', 'Texte']],
        alignements: ['aucun', 'aucun'],
      }),
    ).toBe('| Élément | Détail |\n| --- | --- |\n| Premier | Texte |')
  })
  it('protège les barres et aplatit les retours à la ligne', () => {
    const md = ecrireTableau({
      entete: ['A', 'B'],
      lignes: [['x | y', 'ligne 1\nligne 2']],
      alignements: [],
    })
    expect(md.split('\n')[2]).toBe('| x \\| y | ligne 1 ligne 2 |')
    // Le moteur de rendu voit bien 2 cases, avec la barre dans la première.
    const tds = html(md).match(/<td>(.*?)<\/td>/g)
    expect(tds).toEqual(['<td>x | y</td>', '<td>ligne 1 ligne 2</td>'])
  })
  it('conserve l’alignement des colonnes', () => {
    const md = ecrireTableau({
      entete: ['A', 'B', 'C', 'D'],
      lignes: [],
      alignements: ['gauche', 'centre', 'droite', 'aucun'],
    })
    expect(md.split('\n')[1]).toBe('| :--- | :---: | ---: | --- |')
  })
  it('la grille vide produit un tableau que le moteur rend', () => {
    const h = html(ecrireTableau(grilleVide()))
    expect(h).toContain('<table>')
    expect(h.match(/<tr>/g)).toHaveLength(3)
  })
})

describe('decouperLigne / normaliser', () => {
  it('bords facultatifs, barre protégée, espaces retirées', () => {
    expect(decouperLigne('| a | b \\| c |')).toEqual(['a', 'b | c'])
    expect(decouperLigne('a|b')).toEqual(['a', 'b'])
    expect(decouperLigne('|  |x|')).toEqual(['', 'x'])
  })
  it('complète les lignes courtes, ne tronque jamais', () => {
    const g = normaliser({
      entete: ['A', 'B'],
      lignes: [['1', '2', '3'], ['4']],
      alignements: ['centre'],
    })
    expect(g.entete).toEqual(['A', 'B', ''])
    expect(g.lignes).toEqual([
      ['1', '2', '3'],
      ['4', '', ''],
    ])
    expect(g.alignements).toEqual(['centre', 'aucun', 'aucun'])
  })
})

describe('trouverTableau — le tableau sous le curseur', () => {
  const doc =
    'Intro\n\n| A | B |\n| :--- | --- |\n| 1 | x \\| y |\n| 2 |\n\nFin'
  it('trouve le bloc, ses bornes exactes et son contenu', () => {
    const t = trouverTableau(doc, doc.indexOf('| 1'))!
    expect(doc.slice(t.debut, t.fin)).toBe(
      '| A | B |\n| :--- | --- |\n| 1 | x \\| y |\n| 2 |',
    )
    expect(t.entete).toEqual(['A', 'B'])
    expect(t.lignes).toEqual([
      ['1', 'x | y'],
      ['2', ''],
    ])
    expect(t.alignements).toEqual(['gauche', 'aucun'])
  })
  it('curseur sur l’en-tête ou en fin de dernière ligne : même tableau', () => {
    const a = trouverTableau(doc, doc.indexOf('| A'))!
    const b = trouverTableau(doc, doc.indexOf('| 2 |') + 5)!
    expect([a.debut, a.fin]).toEqual([b.debut, b.fin])
  })
  it('hors tableau, ou lignes à barres sans séparateur : rien', () => {
    expect(trouverTableau(doc, 2)).toBeNull()
    expect(trouverTableau(doc, doc.length)).toBeNull()
    expect(trouverTableau('a | b\nc | d', 1)).toBeNull()
  })
  it('aller-retour : relire puis réécrire garde le contenu', () => {
    const t = trouverTableau(doc, doc.indexOf('| 1'))!
    const reecrit = ecrireTableau(t)
    const t2 = trouverTableau(reecrit, 0)!
    expect(t2.entete).toEqual(t.entete)
    expect(t2.lignes).toEqual(t.lignes)
    expect(t2.alignements).toEqual(t.alignements)
  })
})
