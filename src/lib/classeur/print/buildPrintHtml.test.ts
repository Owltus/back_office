// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  PRINT_CSS,
  buildPrintHtml,
} from '#/lib/classeur/print/buildPrintHtml.ts'
import { nomFichierImpression } from '#/lib/classeur/print/nomFichierImpression.ts'
import {
  attendreFeuilles,
  printViaIframe,
  titreTemporaire,
} from '#/lib/classeur/print/printIframe.ts'

/*
 * Le document imprimé doit être stylé comme la page qui affiche l'aperçu
 * (défaut du 26/09 : en dev, le `fetch()` d'une feuille Vite rendait du
 * JavaScript, donc AUCUN style dans l'iframe). Ces tests figent les trois
 * garanties : feuilles réémises telles quelles (jamais par fetch), thème de
 * la racine repris, bloc d'impression du classeur en dernier.
 *
 * Quatrième garantie (étape 9, D19 = A) : le `<title>` du document imprimé
 * est le nom de fichier proposé par « Enregistrer au format PDF ».
 */

function monterPage(): HTMLElement {
  document.head.innerHTML = `
    <link rel="stylesheet" href="/src/styles.css">
    <style>.pdf-prose a { text-decoration: underline }</style>
    <link rel="stylesheet" href="/assets/route.css" media="screen">
    <link rel="preload" href="/assets/font.woff2" as="font">
  `
  document.documentElement.className = 'dark'
  document.documentElement.setAttribute('data-theme', 'navy')
  const conteneur = document.createElement('div')
  conteneur.innerHTML = `
    <div class="a4-page"><div class="pdf-prose"><a href="https://x.test">lien</a></div></div>
    <div class="a4-page">2</div>
    <div class="autre">ignoré</div>
  `
  document.body.appendChild(conteneur)
  return conteneur
}

afterEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  document.documentElement.className = ''
  document.documentElement.removeAttribute('data-theme')
})

describe('buildPrintHtml — mêmes feuilles que la page', () => {
  it('réémet chaque <link rel=stylesheet> comme <link> (absolu, media conservé) et recopie les <style>', () => {
    const html = buildPrintHtml(monterPage())
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const links = Array.from(
      doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
    )
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      'http://localhost:3000/src/styles.css',
      'http://localhost:3000/assets/route.css',
    ])
    expect(links[1].getAttribute('media')).toBe('screen')
    // Le preload n'est pas une feuille : ignoré.
    expect(doc.querySelectorAll('link').length).toBe(2)
    const styles = Array.from(doc.querySelectorAll('style')).map(
      (s) => s.textContent,
    )
    expect(styles[0]).toContain('.pdf-prose a { text-decoration: underline }')
  })

  it('ne contient aucun module JavaScript inliné (le défaut du fetch en dev)', () => {
    const html = buildPrintHtml(monterPage())
    expect(html).not.toContain('createHotContext')
    expect(html).not.toMatch(/<style>[^<]*\bimport\s*\{/)
  })

  it('reprend la classe et les data-* de <html>, et pose une <base>', () => {
    const html = buildPrintHtml(monterPage())
    const doc = new DOMParser().parseFromString(html, 'text/html')
    expect(doc.documentElement.className).toBe('dark')
    expect(doc.documentElement.getAttribute('data-theme')).toBe('navy')
    expect(doc.documentElement.getAttribute('lang')).toBe('fr')
    expect(doc.querySelector('base')?.getAttribute('href')).toBe(
      document.baseURI,
    )
  })

  it('émet le bloc d’impression du classeur EN DERNIER (il l’emporte sur les @page des autres pages)', () => {
    const html = buildPrintHtml(monterPage())
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const styles = Array.from(doc.head.querySelectorAll('style, link'))
    const dernier = styles.at(-1)
    expect(dernier?.tagName).toBe('STYLE')
    expect(dernier?.textContent).toBe(PRINT_CSS)
    expect(PRINT_CSS).toContain('@page { size: 210mm 297mm; margin: 0; }')
  })

  it('ne copie que les .a4-page du conteneur, dans l’ordre', () => {
    const html = buildPrintHtml(monterPage())
    const doc = new DOMParser().parseFromString(html, 'text/html')
    expect(doc.body.querySelectorAll('.a4-page').length).toBe(2)
    expect(doc.body.querySelector('.autre')).toBeNull()
    expect(doc.body.querySelector('a')?.getAttribute('href')).toBe(
      'https://x.test',
    )
  })

  it('pose le <title> = nom du fichier PDF (« Classeur - Titre »)', () => {
    const cas: Array<[string, string, string]> = [
      ['Registre', 'Extincteurs', 'Registre - Extincteurs'],
      ['Procédures', 'Accueil : arrivée', 'Procédures - Accueil - arrivée'],
      [
        'Procédures',
        'Modifications depuis le 04/10/2026',
        'Procédures - Modifications depuis le 04-10-2026',
      ],
      ['Carnet', 'Le "bon" geste', 'Carnet - Le -bon- geste'],
    ]
    for (const [classeur, titre, attendu] of cas) {
      const html = buildPrintHtml(monterPage(), {
        nomFichier: nomFichierImpression({ classeur, titre }),
      })
      const doc = new DOMParser().parseFromString(html, 'text/html')
      expect(doc.title).toBe(attendu)
      expect(doc.head.querySelectorAll('title').length).toBe(1)
      document.body.innerHTML = ''
    }
  })

  it('sans nom : <title> « Classeur », jamais vide ni le titre de l’app', () => {
    document.title = 'Back Office'
    const html = buildPrintHtml(monterPage())
    const doc = new DOMParser().parseFromString(html, 'text/html')
    expect(doc.title).toBe('Classeur')
    // Un nom non nettoyé est nettoyé quand même.
    const html2 = buildPrintHtml(monterPage(), { nomFichier: 'a/b<c>' })
    expect(html2).toContain('<title>a-b-c</title>')
  })

  it('refuse un conteneur sans page', () => {
    const vide = document.createElement('div')
    expect(() => buildPrintHtml(vide)).toThrow('Aucune page A4 trouvée')
  })
})

/** Des pages A4 sans <link> : jsdom ne charge jamais une feuille. */
function pagesSansFeuille(): HTMLElement {
  const conteneur = document.createElement('div')
  conteneur.innerHTML = '<div class="a4-page">1</div>'
  document.body.appendChild(conteneur)
  return conteneur
}

describe('titre du document parent pendant l’impression', () => {
  it('titreTemporaire pose le titre puis remet l’ancien, une seule fois', () => {
    document.title = 'Back Office'
    const remettre = titreTemporaire(document, 'Registre - Extincteurs')
    expect(document.title).toBe('Registre - Extincteurs')
    remettre()
    expect(document.title).toBe('Back Office')
    document.title = 'Autre page'
    remettre()
    expect(document.title).toBe('Autre page')
  })

  it('ne remet pas l’ancien titre si l’app l’a changé entre-temps', () => {
    document.title = 'Back Office'
    const remettre = titreTemporaire(document, 'X')
    document.title = 'Nouvelle page'
    remettre()
    expect(document.title).toBe('Nouvelle page')
  })

  it('printViaIframe : iframe et parent portent le nom au moment de print(), puis le parent est remis', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'requestAnimationFrame'] })
    try {
      document.title = 'Back Office'
      const vus: Array<[string, string]> = []
      const original = document.body.appendChild.bind(document.body)
      const espion = vi
        .spyOn(document.body, 'appendChild')
        .mockImplementation(<T extends Node>(n: T): T => {
          const r = original(n)
          if (n instanceof HTMLIFrameElement && n.contentWindow) {
            const win = n.contentWindow
            Object.defineProperty(win.document, 'fonts', {
              value: { ready: Promise.resolve() },
              configurable: true,
            })
            win.print = () => {
              vus.push([win.document.title, document.title])
            }
            win.requestAnimationFrame = (cb) => {
              cb(0)
              return 0
            }
          }
          return r
        })
      await printViaIframe(pagesSansFeuille(), {
        nomFichier: nomFichierImpression({
          classeur: 'Registre',
          titre: 'Extincteurs',
        }),
      })
      espion.mockRestore()
      expect(vus).toEqual([
        ['Registre - Extincteurs', 'Registre - Extincteurs'],
      ])
      vi.advanceTimersByTime(1000)
      expect(document.title).toBe('Back Office')
      expect(document.querySelector('iframe')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('printViaIframe : le titre du parent est remis même en cas d’erreur', async () => {
    document.title = 'Back Office'
    // jsdom n'a pas `document.fonts` : l'attente des polices lève.
    await expect(
      printViaIframe(pagesSansFeuille(), { nomFichier: 'Registre - X' }),
    ).rejects.toThrow()
    expect(document.title).toBe('Back Office')
    expect(document.querySelector('iframe')).toBeNull()
  })
})

describe('attendreFeuilles', () => {
  it('résout sans feuille, et attend load/error de chaque <link>', async () => {
    const doc = document.implementation.createHTMLDocument('x')
    await expect(attendreFeuilles(doc)).resolves.toBeUndefined()

    const a = doc.createElement('link')
    a.rel = 'stylesheet'
    a.href = 'http://localhost:3000/a.css'
    const b = doc.createElement('link')
    b.rel = 'stylesheet'
    b.href = 'http://localhost:3000/b.css'
    doc.head.append(a, b)

    let resolu = false
    const attente = attendreFeuilles(doc).then(() => {
      resolu = true
    })
    await Promise.resolve()
    expect(resolu).toBe(false)
    a.dispatchEvent(new Event('load'))
    await Promise.resolve()
    expect(resolu).toBe(false)
    b.dispatchEvent(new Event('error'))
    await attente
    expect(resolu).toBe(true)
  })
})
