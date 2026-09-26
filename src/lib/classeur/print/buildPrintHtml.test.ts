// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import {
  PRINT_CSS,
  buildPrintHtml,
} from '#/lib/classeur/print/buildPrintHtml.ts'
import { attendreFeuilles } from '#/lib/classeur/print/printIframe.ts'

/*
 * Le document imprimé doit être stylé comme la page qui affiche l'aperçu
 * (défaut du 26/09 : en dev, le `fetch()` d'une feuille Vite rendait du
 * JavaScript, donc AUCUN style dans l'iframe). Ces tests figent les trois
 * garanties : feuilles réémises telles quelles (jamais par fetch), thème de
 * la racine repris, bloc d'impression du classeur en dernier.
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

  it('refuse un conteneur sans page', () => {
    const vide = document.createElement('div')
    expect(() => buildPrintHtml(vide)).toThrow('Aucune page A4 trouvée')
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
