// @vitest-environment jsdom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import { describe, expect, it, vi } from 'vitest'

import {
  assainirSansDomPurify,
  chargerAssainisseur,
} from '#/lib/classeur/print/assainir.ts'
import {
  REHYPE_CLASSEUR,
  REMARK_CLASSEUR,
} from '#/lib/classeur/print/pipeline.ts'

/*
 * Audit de sécurité du 2026-10-17 (front) : le Markdown saisi par un
 * utilisateur est rendu par le pipeline du Classeur, puis la pagination
 * SÉRIALISE le DOM (`outerHTML`) et le RÉINJECTE (`dangerouslySetInnerHTML`,
 * `iframeDoc.write`). Invariant figé : après ce double passage, aucun
 * gestionnaire d'événement, aucun script, aucune iframe, aucun lien
 * `javascript:` — y compris par KaTeX (MathML), directives et alertes.
 */

/*
 * Mermaid ne se dessine pas dans jsdom (pas de `getBBox`) : la bibliothèque
 * est remplacée par un faux qui rend, tel quel, le SVG que le code du schéma
 * désigne. C'est le pire cas : un libellé qui aurait contourné
 * `securityLevel: 'strict'`. Tout le reste (`mermaid.ts`, DOMPurify) est réel.
 */
const SVG_MERMAID = vi.hoisted(() => ({
  ordinaire:
    '<svg id="classeur-mermaid-x" width="100%" xmlns="http://www.w3.org/2000/svg" class="flowchart" style="max-width: 220px;" viewBox="0 0 220 120" role="graphics-document document" aria-roledescription="flowchart-v2"><style>#classeur-mermaid-x{font-size:12px;fill:#000;}#classeur-mermaid-x .node rect{stroke:#000;}</style><g><marker id="classeur-mermaid-x_flowchart-v2-pointEnd" class="marker flowchart-v2" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"></path></marker><filter id="ombre"><feGaussianBlur stdDeviation="1"></feGaussianBlur></filter><g class="root"><g class="edgePaths"><path d="M60,40L60,80" id="L_A_B_0" class="edge-thickness-normal flowchart-link" style="" marker-end="url(#classeur-mermaid-x_flowchart-v2-pointEnd)"></path></g><g class="nodes"><g class="node default" id="flowchart-A-0" data-look="classic" transform="translate(60, 20)"><rect class="basic label-container" style="" x="-50" y="-17" width="100" height="34" filter="url(#ombre)"></rect><g class="label" style="" transform="translate(-30, -9)"><rect></rect><foreignObject width="60" height="18"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>Arrivée</p></span></div></foreignObject></g></g></g></g></g></svg>',
  piege:
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)"><text>x</text></a><g class="node" onclick="alert(4)"><foreignObject width="60" height="18"><div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel"><img src="x" onerror="alert(5)"><iframe src="javascript:alert(6)"></iframe><a href="javascript:alert(7)">lien</a></span></div></foreignObject></g><animate attributeName="href" to="javascript:alert(8)"></animate><set attributeName="onmouseover" to="alert(9)"></set><use href="data:image/svg+xml,&lt;svg onload=alert(10)&gt;"></use></svg>',
}))

vi.mock('mermaid', () => ({
  default: {
    initialize: () => undefined,
    render: (_id: string, code: string) =>
      Promise.resolve({
        svg: code === 'piege' ? SVG_MERMAID.piege : SVG_MERMAID.ordinaire,
      }),
  },
}))

const { renderMermaid } = await import('#/lib/classeur/mermaid.ts')

const CHARGES = [
  '<img src=x onerror=alert(1)>',
  '<script>alert(1)</script>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '<svg><style></style><img src=x onerror=alert(1)></svg>',
  '[a](javascript:alert(1)) [b](JaVaScRiPt:alert(1)) [c](&#106;avascript:alert(1)) <javascript:alert(1)> [d](vbscript:x) [e](data:text/html,x)',
  '![i](javascript:alert(1)) ![j](x "y\\" onerror=\\"alert(1)")',
  '$\\href{javascript:alert(1)}{x}$ $\\url{javascript:alert(1)}$ $\\htmlId{a}{b}$ $\\includegraphics{x}$',
  '$\\text{</annotation></semantics></math><img src=x onerror=alert(1)>}$',
  '$$\n\\text{<style><img src=x onerror=alert(1)></style>}\n$$',
  ':::etape{photo=gauche onclick="alert(1)" style="x" id="__proto__"}\ntexte <b onmouseover=alert(1)>b</b>\n:::',
  ':::photos{onload="alert(1)"}\n![a](a-inserer)\n:::',
  '> [!WARNING]\n> <img src=x onerror=alert(1)>',
  '| a | b |\n|---|---|\n| <img src=x onerror=alert(1)> | `</code><img src=x onerror=alert(1)>` |',
  'Note[^x].\n\n[^x]: <img src=x onerror=alert(1)>',
  '## 1. <img src=x onerror=alert(1)>',
]

function rendreMarkdown(md: string): string {
  return renderToStaticMarkup(
    createElement(
      ReactMarkdown,
      { remarkPlugins: REMARK_CLASSEUR, rehypePlugins: REHYPE_CLASSEUR },
      md,
    ),
  )
}

/** Ce que fait la pagination : `outerHTML` des blocs, puis réinjection. */
function reinjecter(html: string): HTMLElement {
  const premier = document.createElement('div')
  premier.innerHTML = html
  const second = document.createElement('div')
  second.innerHTML = Array.from(premier.children)
    .map((e) => e.outerHTML)
    .join('')
  return second
}

function rendreEtReinjecter(md: string): HTMLElement {
  return reinjecter(rendreMarkdown(md))
}

function dangers(racine: Element): string[] {
  const trouves: string[] = []
  for (const el of Array.from(racine.querySelectorAll('*'))) {
    const tag = el.tagName.toLowerCase()
    if (['script', 'iframe', 'object', 'embed'].includes(tag)) trouves.push(tag)
    for (const a of Array.from(el.attributes)) {
      if (/^on/i.test(a.name)) trouves.push(`${tag}[${a.name}]`)
      if (/^\s*(javascript|vbscript|data):/i.test(a.value))
        trouves.push(`${tag}[${a.name}=${a.value}]`)
    }
  }
  return trouves
}

describe('audit XSS — pipeline Markdown du Classeur + réinjection', () => {
  it.each(CHARGES)('neutralise %s', (md) => {
    expect(dangers(rendreEtReinjecter(md))).toEqual([])
  })

  it('le détecteur voit bien une vraie injection (témoin)', () => {
    const div = document.createElement('div')
    div.innerHTML = '<p><img src=x onerror=alert(1)></p>'
    expect(dangers(div)).not.toEqual([])
  })
})

/** Le bloc que `MermaidBlock` pose autour du SVG assaini. */
async function blocMermaid(code: string): Promise<string> {
  const rendu = await renderMermaid(code)
  return `<div class="classeur-mermaid" data-mermaid-status="rendered" data-affichage="${rendu.affichage}" style="--l: 220px; --r: 1.8333">${rendu.svg}</div>`
}

/** Forme canonique d'un fragment (sérialisation du navigateur). */
function canonique(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.innerHTML
}

describe('audit XSS — schéma Mermaid (mermaid.ts, DOMPurify, réinjection)', () => {
  it('le témoin piégé est bien dangereux avant mermaid.ts', () => {
    const div = document.createElement('div')
    div.innerHTML = SVG_MERMAID.piege
    expect(dangers(div).length).toBeGreaterThan(3)
  })

  it('un libellé piégé (gestionnaires, foreignObject, javascript:) ne laisse rien', async () => {
    const page = reinjecter(await blocMermaid('piege'))
    expect(dangers(page)).toEqual([])
    expect(page.querySelector('animate, set')).toBeNull()
    // Le libellé HTML reste dans son foreignObject.
    expect(page.querySelector('foreignObject span.nodeLabel')).not.toBeNull()
  })

  it('un schéma ordinaire garde son SVG (style, marqueur, filtre, libellé HTML)', async () => {
    const page = reinjecter(await blocMermaid('graph TD; A-->B'))
    expect(dangers(page)).toEqual([])
    const svg = page.querySelector('svg')
    expect(svg?.querySelector('style')?.textContent).toContain('font-size:12px')
    expect(svg?.querySelector('marker path')).not.toBeNull()
    expect(svg?.querySelector('filter feGaussianBlur')).not.toBeNull()
    expect(svg?.querySelector('g.node[data-look="classic"]')).not.toBeNull()
    expect(
      svg?.querySelector('foreignObject div span.nodeLabel p')?.textContent,
    ).toBe('Arrivée')
  })
})

/*
 * DERNIER FILET (audit du 2026-11-18) : `usePagination` passe le HTML de
 * chaque page par DOMPurify (`assainir.ts`). Il doit retirer une injection
 * et laisser une page ORDINAIRE identique, caractère pour caractère, une
 * fois sérialisée par le navigateur.
 */
const PAGES_ORDINAIRES: [string, () => Promise<string> | string][] = [
  [
    'titres, pastilles, texte, listes, cases, liens, notes, code',
    () =>
      rendreMarkdown(
        '# 1. Partie\n\n## 2. Étape\n\n### 2.1 Sous-partie\n\nTexte **gras** *italique* ~~barré~~ `code` [lien](https://exemple.test/a?b=1#c) <mailto:a@exemple.test>.\n\n1. un\n2. deux\n\n- [ ] à faire\n- [x] fait\n\nNote[^n].\n\n[^n]: La note.\n\n```js\nconst a = 1\n```',
      ),
  ],
  [
    'encadrés typés',
    () =>
      rendreMarkdown(
        '> [!WARNING]\n> Attention.\n\n> [!TIP]\n> Astuce.\n\n> Encadré simple.',
      ),
  ],
  [
    'tableau (morceau paginé : colgroup figé, alignements)',
    () =>
      `<table data-ligne="3" style="table-layout: fixed;"><colgroup><col style="width: 120.5px;"><col style="width: 300px;"></colgroup>${rendreMarkdown(
        '| a | b |\n| :-: | --- |\n| 1 | 2 |',
      ).replace(/^<table[^>]*>|<\/table>$/g, '')}</table>`,
  ],
  [
    'figure, planche, étape, emplacement, saut de page',
    () =>
      rendreMarkdown(
        'Texte.\n\n![Une légende](a-inserer "moyenne")\n\n:::photos\n![a](a-inserer)\n![b](a-inserer)\n:::\n\n:::etape{photo=gauche}\nTourner la vanne.\n\n![Vanne](a-inserer "petite")\n:::',
      )
        // Préchargement que React pose au rendu SERVEUR seulement : la
        // pagination copie le DOM du navigateur, qui n'en a pas.
        .replace(/<link rel="preload"[^>]*>/g, '') +
      '<div data-page-break="true"></div>',
  ],
  [
    'image du bucket privé (URL blob:, cadre, variables CSS)',
    () =>
      '<figure data-ligne="4"><span class="classeur-image" data-taille="moyenne" data-genre="photo" data-ajustement="remplir" style="--r: 1.3333; --nat: 80mm; --cx: 10; --cy: 5; --cl: 80; --ch: 90;"><span class="classeur-image-cadre"><img src="blob:http://localhost:3000/0b0c5f7e-2f4a-4b8e-9d55-1f2e3d4c5b6a" alt="Vanne" data-image-status="rendered" data-taille="moyenne" data-genre="photo" data-chemin="2/0b0c5f7e-2f4a-4b8e-9d55-1f2e3d4c5b6a.webp"></span></span><figcaption>Vanne</figcaption></figure>' +
      '<span class="classeur-image classeur-a-inserer" data-taille="petite" data-a-inserer="true" role="img" aria-label="Image à insérer : x" style="--r: 1.3333;"><span class="classeur-image-cadre"><svg class="classeur-a-inserer-ombre" viewBox="0 0 48 36" aria-hidden="true"><circle cx="34" cy="10" r="4.5"></circle><path d="M2 34 L17 15 L27 27 L32 21 L46 34 Z"></path></svg><span class="classeur-a-inserer-texte">Image à insérer</span></span></span>',
  ],
  ['schéma Mermaid', () => blocMermaid('graph TD; A-->B')],
  [
    'schéma découpé (tranche décalée)',
    async () =>
      `<div class="classeur-schema-tranche" data-schema-tranche="1" style="height: 300px; overflow: hidden;"><div style="transform: translateY(-120px);">${await blocMermaid(
        'graph TD; A-->B',
      )}</div></div><div class="classeur-schema-suite">Suite page suivante ▼</div>`,
  ],
]

describe('dernier filet — DOMPurify sur le HTML des pages', () => {
  it.each(PAGES_ORDINAIRES)(
    'page ordinaire inchangée : %s',
    async (_nom, page) => {
      const assainir = await chargerAssainisseur()
      const html = canonique(await page())
      expect(canonique(assainir(html))).toBe(html)
    },
  )

  it('formules KaTeX : rendu visible inchangé, seule la source TeX (MathML masqué) part', async () => {
    const assainir = await chargerAssainisseur()
    const html = canonique(
      rendreMarkdown('Aire $x^2$.\n\n$$\n\\frac{a}{b}\n$$'),
    )
    const avant = document.createElement('div')
    avant.innerHTML = html
    const apres = document.createElement('div')
    apres.innerHTML = assainir(html)
    const visible = (d: HTMLElement) =>
      Array.from(d.querySelectorAll('.katex-html')).map((e) => e.outerHTML)
    expect(visible(apres)).toEqual(visible(avant))
    expect(visible(apres)).toHaveLength(2)
    expect(apres.querySelectorAll('.katex-mathml math')).toHaveLength(2)
    expect(apres.querySelector('annotation, semantics')).toBeNull()
    expect(
      apres.querySelector('.katex-mathml math')?.textContent,
    ).not.toContain('x^2')
  })

  it.each([
    '<p data-ligne="1">Texte<img src="x" onerror="alert(1)"></p>',
    '<p>a</p><script>alert(1)</script>',
    '<div class="classeur-mermaid"><svg><g onclick="alert(1)"><foreignObject><div><img src=x onerror=alert(1)></div></foreignObject></g></svg></div>',
    '<a href="javascript:alert(1)">x</a><a href=" jav&#x09;ascript:alert(1)">y</a>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe><object data="x"></object><embed src="x">',
    '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)></style></mglyph></table></mtext></math>',
    '<svg><style><img src=x onerror=alert(1)></style></svg>',
  ])('retire une injection : %s', async (html) => {
    const assainir = await chargerAssainisseur()
    const page = reinjecter(assainir(html))
    expect(dangers(page)).toEqual([])
    expect(page.querySelector('script, iframe, object, embed')).toBeNull()
  })

  it('le témoin : sans le filet, ces pages seraient dangereuses', () => {
    const page = reinjecter(
      '<p data-ligne="1">Texte<img src="x" onerror="alert(1)"></p><script>alert(1)</script>',
    )
    expect(dangers(page)).not.toEqual([])
  })

  it('repli sans DOMPurify (chargement impossible) : rien d’exécutable', () => {
    const html =
      '<p onclick="alert(1)">a<img src=x onerror=alert(1)><a href=" JAVASCRIPT:alert(1)">b</a><a href="data:text/html,x">c</a></p><script>alert(1)</script><iframe></iframe><img src="blob:http://localhost/x" data-chemin="2/x.webp" style="--r: 1">'
    const page = reinjecter(assainirSansDomPurify(html))
    expect(dangers(page)).toEqual([])
    expect(page.querySelector('img[src^="blob:"][data-chemin]')).not.toBeNull()
  })
})
