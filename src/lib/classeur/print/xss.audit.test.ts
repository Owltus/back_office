// @vitest-environment jsdom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import { describe, expect, it } from 'vitest'

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

function rendreEtReinjecter(md: string): HTMLElement {
  const premier = document.createElement('div')
  premier.innerHTML = renderToStaticMarkup(
    createElement(
      ReactMarkdown,
      { remarkPlugins: REMARK_CLASSEUR, rehypePlugins: REHYPE_CLASSEUR },
      md,
    ),
  )
  // Ce que fait la pagination : outerHTML de chaque bloc, puis innerHTML.
  const second = document.createElement('div')
  second.innerHTML = Array.from(premier.children)
    .map((e) => e.outerHTML)
    .join('')
  return second
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
