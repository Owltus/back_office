// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { paginate } from '#/lib/classeur/print/paginate.ts'
import type { Mesure } from '#/lib/classeur/print/paginate.ts'

/*
 * jsdom n'a PAS de layout : `getBoundingClientRect()` y rend 0 pour tout.
 * Les hauteurs sont donc posées par un attribut `data-h` (px) et lues par
 * une mesure injectée — le paramètre `mesure` de `paginate` existe pour
 * cela. Un élément sans `data-h` vaut la somme de ses descendants mesurés
 * (un tableau = son thead + ses lignes).
 */
const mesure: Mesure = (el) => {
  const own = el.getAttribute('data-h')
  if (own !== null) return Number(own)
  let total = 0
  for (const child of el.querySelectorAll('[data-h]')) {
    total += Number(child.getAttribute('data-h'))
  }
  return total
}

function conteneur(html: string): HTMLElement {
  const div = document.createElement('div')
  div.innerHTML = html
  return div
}

function fragment(html: string): HTMLElement {
  return conteneur(html)
}

function paragraphes(n: number, h = 30, prefix = 'p'): string {
  return Array.from(
    { length: n },
    (_, i) => `<p data-h="${h}">${prefix}${i + 1}</p>`,
  ).join('')
}

function tableau(rows: number, rowH = 20, theadH = 20): string {
  const trs = Array.from(
    { length: rows },
    (_, i) => `<tr data-h="${rowH}"><td>L${i + 1}</td></tr>`,
  ).join('')
  return `<table><thead data-h="${theadH}"><tr><th>Col</th></tr></thead><tbody>${trs}</tbody></table>`
}

describe('paginate', () => {
  it('(1) un contenu vide rend exactement une page vide', () => {
    const pages = paginate(conteneur(''), 300, mesure)
    expect(pages).toEqual([{ html: '' }])
  })

  it('(2) 40 paragraphes de 30 px sur 300 px → plusieurs pages, aucune vide, rien perdu', () => {
    const pages = paginate(conteneur(paragraphes(40)), 300, mesure)
    expect(pages.length).toBeGreaterThan(1)
    for (const page of pages) {
      expect(page.html).not.toBe('')
      const nb = fragment(page.html).querySelectorAll('p').length
      expect(nb).toBeGreaterThan(0)
      expect(nb * 30).toBeLessThanOrEqual(300)
    }
    const total = pages.reduce(
      (acc, page) => acc + fragment(page.html).querySelectorAll('p').length,
      0,
    )
    expect(total).toBe(40)
    // 10 paragraphes par page exactement : 4 pages pleines
    expect(pages).toHaveLength(4)
  })

  it('(3) un titre en fin de page est repoussé sur la page suivante avec son paragraphe', () => {
    // 8 × 30 = 240 px occupés ; le h2 (30 px) tiendrait, mais il ne
    // resterait que 30 px après lui, sous les 15 % (45 px) exigés.
    const html = `${paragraphes(8)}<h2 data-h="30">Titre</h2>${paragraphes(1, 30, 'suite')}`
    const pages = paginate(conteneur(html), 300, mesure)
    expect(pages).toHaveLength(2)
    expect(fragment(pages[0].html).querySelector('h2')).toBeNull()
    const page2 = fragment(pages[1].html)
    expect(page2.firstElementChild?.tagName).toBe('H2')
    expect(page2.querySelectorAll('p')).toHaveLength(1)
  })

  it("(3 bis) une SUITE de titres en fin de page part d'un bloc", () => {
    // 7 × 30 = 210 ; h1 + h2 (60) → 270, reste 30 < 45 : les deux montent.
    const html = `${paragraphes(7)}<h1 data-h="30">A</h1><h2 data-h="30">B</h2>${paragraphes(1)}`
    const pages = paginate(conteneur(html), 300, mesure)
    expect(pages).toHaveLength(2)
    expect(fragment(pages[0].html).querySelector('h1, h2')).toBeNull()
    const tags = Array.from(fragment(pages[1].html).children).map(
      (el) => el.tagName,
    )
    expect(tags).toEqual(['H1', 'H2', 'P'])
  })

  it('(4) un tableau de 20 lignes est découpé, avec <thead> répété dans chaque fragment', () => {
    // thead 20 + 20 × 20 = 420 px > 300 : sur une page vide, le tableau est
    // découpé. 1er fragment : thead + 14 lignes (300), 2e : thead + 6.
    const pages = paginate(conteneur(tableau(20)), 300, mesure)
    expect(pages).toHaveLength(2)
    let lignes = 0
    for (const page of pages) {
      const frag = fragment(page.html)
      expect(frag.querySelectorAll('table')).toHaveLength(1)
      expect(frag.querySelectorAll('thead')).toHaveLength(1)
      expect(frag.querySelector('thead th')?.textContent).toBe('Col')
      lignes += frag.querySelectorAll('tbody > tr').length
    }
    expect(lignes).toBe(20)
    expect(fragment(pages[0].html).querySelectorAll('tbody > tr')).toHaveLength(
      14,
    )
    expect(fragment(pages[1].html).querySelectorAll('tbody > tr')).toHaveLength(
      6,
    )
  })

  it('(4 bis) un grand tableau qui ne tient plus après du texte part sur une page NEUVE, puis est découpé', () => {
    // 5 × 30 = 150 occupés ; le tableau (420) ne tient pas. Le moteur (fidèle
    // à Registre) clôt la page courante AVANT de découper : le découpage ne
    // remplit la place restante que sur une page vide ou occupée par des
    // titres seuls. Donc : p1 = 5 paragraphes, p2 = thead + 14, p3 = thead + 6.
    const html = `${paragraphes(5)}${tableau(20)}`
    const pages = paginate(conteneur(html), 300, mesure)
    expect(pages).toHaveLength(3)
    const p1 = fragment(pages[0].html)
    expect(p1.querySelectorAll('p')).toHaveLength(5)
    expect(p1.querySelector('table')).toBeNull()
    for (const page of pages.slice(1)) {
      expect(fragment(page.html).querySelectorAll('thead')).toHaveLength(1)
    }
    expect(fragment(pages[1].html).querySelectorAll('tbody > tr')).toHaveLength(
      14,
    )
    expect(fragment(pages[2].html).querySelectorAll('tbody > tr')).toHaveLength(
      6,
    )
  })

  it('(4 ter) un grand tableau qui suit un titre seul remplit la place restante sous le titre', () => {
    // Un h2 (30) seul sur la page : le tableau ne peut pas le laisser
    // orphelin, il est découpé à partir des 270 px restants :
    // thead 20 + 12 lignes = 260 ≤ 270 ; la 13e (280) déborde.
    const html = `<h2 data-h="30">Titre</h2>${tableau(20)}`
    const pages = paginate(conteneur(html), 300, mesure)
    expect(pages).toHaveLength(2)
    const p1 = fragment(pages[0].html)
    expect(p1.firstElementChild?.tagName).toBe('H2')
    expect(p1.querySelectorAll('thead')).toHaveLength(1)
    expect(p1.querySelectorAll('tbody > tr')).toHaveLength(12)
    expect(fragment(pages[1].html).querySelectorAll('tbody > tr')).toHaveLength(
      8,
    )
  })

  it('(5) un tableau de 3 lignes reste intact, déplacé entier sur la page suivante', () => {
    // 10 × 30 = 300 : page pleine ; le tableau (20 + 60 = 80) ne tient pas
    // et, petit (≤ 8 lignes), il n'est jamais découpé.
    const html = `${paragraphes(10)}${tableau(3)}`
    const pages = paginate(conteneur(html), 300, mesure)
    expect(pages).toHaveLength(2)
    expect(fragment(pages[0].html).querySelector('table')).toBeNull()
    const p2 = fragment(pages[1].html)
    expect(p2.querySelectorAll('table')).toHaveLength(1)
    expect(p2.querySelectorAll('thead')).toHaveLength(1)
    expect(p2.querySelectorAll('tbody > tr')).toHaveLength(3)
  })

  it('un saut de page forcé (`data-page-break`) coupe même une page presque vide', () => {
    const html = `${paragraphes(1)}<div data-page-break="true"></div>${paragraphes(1)}`
    const pages = paginate(conteneur(html), 300, mesure)
    expect(pages).toHaveLength(2)
    expect(
      fragment(pages[0].html).querySelector('[data-page-break]'),
    ).toBeNull()
  })

  it('une liste ordonnée découpée conserve sa numérotation via `start`', () => {
    // 8 items de 50 px = 400 > 300 ; > 5 items → découpable.
    const lis = Array.from(
      { length: 8 },
      (_, i) => `<li data-h="50">item ${i + 1}</li>`,
    ).join('')
    const pages = paginate(conteneur(`<ol>${lis}</ol>`), 300, mesure)
    expect(pages).toHaveLength(2)
    expect(fragment(pages[0].html).querySelectorAll('li')).toHaveLength(6)
    const ol2 = fragment(pages[1].html).querySelector('ol')
    expect(ol2?.getAttribute('start')).toBe('7')
    expect(ol2?.querySelectorAll('li')).toHaveLength(2)
  })
})
