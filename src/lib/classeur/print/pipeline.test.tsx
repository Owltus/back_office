// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'

import {
  REHYPE_CLASSEUR,
  REMARK_CLASSEUR,
} from '#/lib/classeur/print/pipeline.ts'
import { colonnesPlanche } from '#/lib/classeur/print/rehypeBlocs.ts'

/*
 * Le pipeline RÉEL (celui de la page, de l'impression et de l'aide), rendu
 * en HTML puis interrogé comme un DOM.
 */
function rendre(md: string): HTMLElement {
  const div = document.createElement('div')
  div.innerHTML = renderToStaticMarkup(
    <ReactMarkdown
      remarkPlugins={REMARK_CLASSEUR}
      rehypePlugins={REHYPE_CLASSEUR}
    >
      {md}
    </ReactMarkdown>,
  )
  return div
}

const texte = (el: Element) => el.textContent.replace(/\s+/g, ' ').trim()

describe('directives : liste blanche, rien ne se perd', () => {
  it('garde les heures et les codes (`:mot` n’est pas une directive)', () => {
    const d = rendre('RDV à 10:30, code:4400 et salle:B.')
    expect(texte(d)).toBe('RDV à 10:30, code:4400 et salle:B.')
  })

  it('remet en texte une directive inconnue, son contenu reste mis en forme', () => {
    const d = rendre(':::attention\n**Fermer** la vanne.\n:::')
    expect(texte(d)).toContain(':::attention')
    expect(texte(d)).toContain(':::')
    expect(d.querySelector('strong')?.textContent).toBe('Fermer')
    expect(d.querySelector('[data-bloc]')).toBeNull()
  })

  it('remet en texte une directive de feuille', () => {
    const d = rendre('::video[Démo]{id=3}')
    expect(texte(d)).toBe('::video[Démo]{id=3}')
  })

  it('`::: photos` avec une espace n’est pas un bloc, mais rien n’est perdu', () => {
    const d = rendre('::: photos\n![Vanne A](1/a.webp)\n:::')
    expect(d.querySelector('[data-bloc]')).toBeNull()
    expect(texte(d)).toContain('::: photos')
    expect(d.querySelector('img')).not.toBeNull()
  })
})

describe('figures : image seule sur sa ligne', () => {
  it('image seule → figure légendée', () => {
    const d = rendre('![Vanne du by-pass](1/a.webp)')
    const f = d.querySelector('figure')
    expect(f?.querySelector('img')).not.toBeNull()
    expect(f?.querySelector('figcaption')?.textContent).toBe('Vanne du by-pass')
    expect(f?.getAttribute('data-ligne')).toBe('1')
  })

  it('légende générique (nom de fichier, « – capture N ») non imprimée', () => {
    for (const alt of ['PXL_20260930_090804989', 'Caisse – capture 3', '']) {
      const d = rendre(`![${alt}](1/a.webp)`)
      expect(d.querySelector('figure')).not.toBeNull()
      expect(d.querySelector('figcaption')).toBeNull()
    }
  })

  it('image à la ligne sous un paragraphe : le paragraphe est coupé', () => {
    const d = rendre('Ouvrir la porte.\n![Porte](1/a.webp)\nPuis entrer.')
    // (React 19 ajoute un `<link rel="preload">` par image : hors sujet.)
    const blocs = Array.from(d.children).filter((c) => c.tagName !== 'LINK')
    expect(blocs.map((c) => c.tagName.toLowerCase())).toEqual([
      'p',
      'figure',
      'p',
    ])
    expect(texte(blocs[0])).toBe('Ouvrir la porte.')
    expect(texte(blocs[2])).toBe('Puis entrer.')
  })

  it('image à la ligne sous une étape de liste : figure DANS l’étape', () => {
    const d = rendre(
      '1. Cliquer sur **NEW**.\n![Écran NEW](1/a.webp)\n2. Valider.',
    )
    const li = d.querySelectorAll('li')
    expect(li).toHaveLength(2)
    expect(li[0].querySelector('figure img')).not.toBeNull()
    expect(d.querySelector('p > figure')).toBeNull()
  })

  it('image en TÊTE d’une étape, texte à la ligne : figure (bord du parent)', () => {
    const d = rendre('- ![Écran](1/a.webp)\n  Puis valider.')
    expect(d.querySelector('li > figure img')).not.toBeNull()
  })

  it('image au fil d’une phrase : reste dans la phrase', () => {
    const d = rendre('Cliquer sur ![icône](1/a.webp) puis valider.')
    expect(d.querySelector('figure')).toBeNull()
    expect(d.querySelector('p img')).not.toBeNull()
  })
})

describe('planche :::photos', () => {
  it('colonnes selon le nombre de photos', () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(colonnesPlanche)).toEqual([
      1, 2, 3, 2, 3, 3, 3,
    ])
  })

  it('4 photos (lignes consécutives) → 2 × 2, une légende chacune', () => {
    const md = [
      ':::photos',
      '![Manchette 1](1/a.webp)',
      '![Manchette 2](1/b.webp)',
      '![Manchette 3](1/c.webp)',
      '![Manchette 4](1/d.webp)',
      ':::',
    ].join('\n')
    const d = rendre(md)
    const p = d.querySelector('[data-bloc="photos"]')
    expect(p?.getAttribute('data-colonnes')).toBe('2')
    expect(p?.querySelectorAll(':scope > figure')).toHaveLength(4)
    expect(
      Array.from(p?.querySelectorAll('figcaption') ?? []).map(
        (c) => c.textContent,
      ),
    ).toEqual(['Manchette 1', 'Manchette 2', 'Manchette 3', 'Manchette 4'])
    expect(p?.getAttribute('data-ligne')).toBe('1')
  })

  it('du texte dans une planche occupe une rangée entière, jamais perdu', () => {
    const d = rendre(':::photos\nRepérage :\n\n![A](1/a.webp)\n:::')
    const hors = d.querySelector('[data-bloc="photos"] > .photos-hors')
    expect(hors?.textContent).toBe('Repérage :')
  })

  it('planche non fermée : tout le contenu reste affiché', () => {
    const d = rendre(':::photos\n![A](1/a.webp)\n\nSuite du texte.')
    expect(texte(d)).toContain('Suite du texte.')
  })
})

describe('étape illustrée :::etape', () => {
  it('texte à gauche, photos à droite', () => {
    const md = [
      ':::etape',
      'Appuyer sur le **bouton rouge** :',
      '',
      '1. Un appui court.',
      '2. Un appui long.',
      '',
      '![Boîtier du ballon](1/a.webp)',
      ':::',
    ].join('\n')
    const e = rendre(md).querySelector('[data-bloc="etape"]')
    expect(e?.getAttribute('data-photos')).toBe('1')
    const [gauche, droite] = Array.from(e?.children ?? [])
    expect(gauche.className).toBe('etape-texte')
    expect(gauche.querySelector('ol')?.children).toHaveLength(2)
    expect(gauche.querySelector('figure')).toBeNull()
    expect(droite.className).toBe('etape-photos')
    expect(droite.querySelectorAll('figure')).toHaveLength(1)
  })

  it('sans photo : reste du texte simple', () => {
    const e = rendre(':::etape\nRien à montrer.\n:::').querySelector(
      '[data-bloc="etape"]',
    )
    expect(e?.hasAttribute('data-photos')).toBe(false)
    expect(e?.querySelector('.etape-texte')).toBeNull()
    expect(e?.textContent).toBe('Rien à montrer.')
  })
})

describe('encadrés typés', () => {
  it('`> [!WARNING]` : type posé, mot en tête, repère retiré', () => {
    const b = rendre(
      '> [!WARNING]\n> Ne jamais fermer les vannes.',
    ).querySelector('blockquote')
    expect(b?.getAttribute('data-encadre')).toBe('attention')
    expect(b?.querySelector('.encadre-titre')?.textContent).toBe('Attention')
    expect(texte(b!)).toBe('Attention Ne jamais fermer les vannes.')
  })
  it('repère seul sur sa ligne puis paragraphe', () => {
    const b = rendre('> [!TIP]\n>\n> Astuce utile.').querySelector('blockquote')
    expect(b?.getAttribute('data-encadre')).toBe('astuce')
    expect(b?.querySelectorAll('p')).toHaveLength(2)
  })
  it('encadré ordinaire et type inconnu : inchangés', () => {
    expect(
      rendre('> **Attention :** texte').querySelector('[data-encadre]'),
    ).toBeNull()
    const b = rendre('> [!FOO]\n> texte').querySelector('blockquote')
    expect(b?.hasAttribute('data-encadre')).toBe(false)
    expect(texte(b!)).toContain('[!FOO]')
  })
})
