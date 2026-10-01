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

  it('(3) un titre reste en bas de page si le début de ce qui suit tient avec lui', () => {
    // 8 × 30 = 240 ; h2 30 → 270 ; le paragraphe suivant (30) tient : 300.
    // (Avant le 2026-09-30, la règle des 15 % le repoussait quand même.)
    const html = `${paragraphes(8)}<h2 data-h="30">Titre</h2>${paragraphes(1, 30, 'suite')}`
    const pages = paginate(conteneur(html), 300, mesure)
    expect(pages).toHaveLength(1)
  })

  it('(3 bis) un titre est repoussé avec son paragraphe si le début de celui-ci ne tient pas', () => {
    // 8 × 30 = 240 ; h2 30 → 270 ; le paragraphe suivant (60, lignes de
    // 20 px) exige 2 lignes = 40 : 310 > 300, le titre part avec lui.
    const html = `${paragraphes(8)}<h2 data-h="30">Titre</h2><p data-h="60">suite</p>`
    const pages = paginate(conteneur(html), 300, mesure, {
      hauteurLigne: () => 20,
    })
    expect(pages).toHaveLength(2)
    expect(fragment(pages[0].html).querySelector('h2')).toBeNull()
    const tags = Array.from(fragment(pages[1].html).children).map(
      (el) => el.tagName,
    )
    expect(tags).toEqual(['H2', 'P'])
  })

  it("(3 ter) une SUITE de titres en fin de page part d'un bloc", () => {
    // 7 × 30 = 210 ; h1 + h2 (60) → 270 ; + 2 lignes du paragraphe (40) =
    // 310 > 300 : les deux titres montent avec le paragraphe.
    const html = `${paragraphes(7)}<h1 data-h="30">A</h1><h2 data-h="30">B</h2><p data-h="60">x</p>`
    const pages = paginate(conteneur(html), 300, mesure, {
      hauteurLigne: () => 20,
    })
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

  it('(4 bis) un grand tableau après du texte REMPLIT la place restante avant de continuer', () => {
    // 5 × 30 = 150 occupés ; reste 150 : thead 20 + 6 lignes (140). Avant le
    // 2026-09-30, le tableau partait entier sur une page neuve (150 px vides).
    const html = `${paragraphes(5)}${tableau(20)}`
    const pages = paginate(conteneur(html), 300, mesure)
    expect(pages).toHaveLength(2)
    const p1 = fragment(pages[0].html)
    expect(p1.querySelectorAll('p')).toHaveLength(5)
    expect(p1.querySelectorAll('tbody > tr')).toHaveLength(6)
    expect(fragment(pages[1].html).querySelectorAll('tbody > tr')).toHaveLength(
      14,
    )
    for (const page of pages) {
      expect(fragment(page.html).querySelectorAll('thead')).toHaveLength(1)
    }
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
    // et, avec moins de 4 lignes, il n'est jamais découpé (2 par morceau).
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
    // 8 items de 50 px = 400 > 300 → découpable.
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

  it('(6) une petite liste (4 éléments) est coupée plutôt que de laisser un trou', () => {
    // 4 × 30 = 120 occupés ; liste 4 × 50 = 200 > 180 restants. 3 tiendraient,
    // mais le 4e resterait seul : 2 + 2. Avant : moins de 6 éléments =
    // jamais coupée, la liste partait entière.
    const lis = Array.from(
      { length: 4 },
      (_, i) => `<li data-h="50">item ${i + 1}</li>`,
    ).join('')
    const pages = paginate(
      conteneur(`${paragraphes(4)}<ul>${lis}</ul>`),
      300,
      mesure,
    )
    expect(pages).toHaveLength(2)
    expect(fragment(pages[0].html).querySelectorAll('li')).toHaveLength(2)
    expect(fragment(pages[1].html).querySelectorAll('li')).toHaveLength(2)
  })

  it('(7) un paragraphe est COUPÉ entre deux lignes pour remplir la page', () => {
    // 8 × 30 = 240 ; paragraphe de 10 lignes × 20 = 200. La coupe (injectée,
    // jsdom n'a pas de rendu) garde 3 lignes (60) ici, 7 lignes ensuite.
    const couperTexte = (el: Element, premier: number) => {
      const lignes = Math.floor(premier / 20)
      if (lignes < 2) return null
      return [
        { html: `<p>début de ${el.textContent}</p>`, height: lignes * 20 },
        { html: `<p>fin de ${el.textContent}</p>`, height: 200 - lignes * 20 },
      ]
    }
    const html = `${paragraphes(8)}<p data-h="200">long</p>`
    const pages = paginate(conteneur(html), 300, mesure, { couperTexte })
    expect(pages).toHaveLength(2)
    expect(fragment(pages[0].html).textContent).toContain('début de long')
    expect(fragment(pages[1].html).textContent).toContain('fin de long')
  })

  it('(7 bis) un paragraphe non coupable part entier sur la page suivante', () => {
    const html = `${paragraphes(8)}<p data-h="200">long</p>`
    const pages = paginate(conteneur(html), 300, mesure, {
      couperTexte: () => null,
    })
    expect(pages).toHaveLength(2)
    expect(fragment(pages[1].html).querySelectorAll('p')).toHaveLength(1)
  })

  it('(8) les marges sont FUSIONNÉES entre deux blocs, pas additionnées', () => {
    // 5 paragraphes : boîte 50, marge basse 10, marge haute 10.
    // Additionnées : 5 × 70 = 350 > 300 (2 pages). Fusionnées et sans la
    // marge haute du premier ni la basse du dernier : 5 × 50 + 4 × 10 = 290.
    const html = Array.from(
      { length: 5 },
      (_, i) => `<p data-h="70">p${i + 1}</p>`,
    ).join('')
    const pages = paginate(conteneur(html), 300, mesure, {
      marges: () => ({ haut: 10, bas: 10 }),
    })
    expect(pages).toHaveLength(1)
  })

  it('(9) une figure est insécable : elle part ENTIÈRE sur la page suivante', () => {
    const html = `${paragraphes(8)}<figure data-h="120"><img alt=""><figcaption>Vanne</figcaption></figure>`
    const pages = paginate(conteneur(html), 300, mesure)
    expect(pages).toHaveLength(2)
    expect(fragment(pages[0].html).querySelector('figure')).toBeNull()
    expect(
      fragment(pages[1].html).querySelector('figcaption')?.textContent,
    ).toBe('Vanne')
  })

  it('(10) une planche se coupe ENTRE deux rangées, jamais au milieu', () => {
    // 2 colonnes, 6 photos de 100 → 3 rangées, écart 10 : 320 au total.
    // Après un paragraphe (30), il reste 270 : deux rangées (100 + 10 + 100).
    const photos = Array.from(
      { length: 6 },
      (_, i) => `<figure data-h="100"><img alt="${String(i + 1)}"></figure>`,
    ).join('')
    const html = `${paragraphes(1)}<div data-bloc="photos" data-colonnes="2" data-h="320">${photos}</div>`
    const pages = paginate(conteneur(html), 300, mesure, {
      ecartRangees: () => 10,
    })
    expect(pages).toHaveLength(2)
    const morceaux = pages.map((p) =>
      fragment(p.html).querySelector('[data-bloc="photos"]')!,
    )
    expect(morceaux[0].querySelectorAll('figure')).toHaveLength(4)
    expect(morceaux[1].querySelectorAll('figure')).toHaveLength(2)
    // Chaque morceau garde sa grille (mêmes colonnes) et rien n'est perdu.
    expect(morceaux[1].getAttribute('data-colonnes')).toBe('2')
    expect(
      morceaux.flatMap((m) =>
        Array.from(m.querySelectorAll('img')).map((i) => i.alt),
      ),
    ).toEqual(['1', '2', '3', '4', '5', '6'])
  })

  it('(11) une étape plus haute qu’une page se DÉROULE : texte puis photo, rien de perdu', () => {
    const texte = paragraphes(9, 30, 'geste')
    const html = `<div data-bloc="etape" data-photos="1" data-h="400"><div class="etape-texte">${texte}</div><div class="etape-photos"><figure data-h="100"><img alt="photo"></figure></div></div>`
    const c = conteneur(html)
    const pages = paginate(c, 300, mesure)
    const tout = pages.map((p) => fragment(p.html))
    // Plus aucun bloc étape dans les pages : des blocs normaux.
    expect(tout.some((f) => f.querySelector('[data-bloc]') !== null)).toBe(
      false,
    )
    expect(tout.reduce((n, f) => n + f.querySelectorAll('p').length, 0)).toBe(9)
    expect(
      tout.reduce((n, f) => n + f.querySelectorAll('figure').length, 0),
    ).toBe(1)
    // La photo vient APRÈS le texte.
    expect(tout[tout.length - 1].querySelector('figure')).not.toBeNull()
    // La copie de mesure a été retirée du conteneur (il appartient à React).
    expect(c.querySelector('[data-deroule]')).toBeNull()
    expect(c.children).toHaveLength(1)
  })

  it('(12) une étape qui tient sur une page reste ENTIÈRE (insécable)', () => {
    const html = `${paragraphes(5)}<div data-bloc="etape" data-photos="1" data-h="200"><div class="etape-texte">${paragraphes(2)}</div><div class="etape-photos"><figure data-h="200"><img alt=""></figure></div></div>`
    const pages = paginate(conteneur(html), 300, mesure)
    expect(pages).toHaveLength(2)
    expect(
      fragment(pages[1].html).querySelector('[data-bloc="etape"]'),
    ).not.toBeNull()
  })
})
