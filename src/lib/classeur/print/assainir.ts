import type { Config } from 'dompurify'

import type { PageData } from '#/lib/classeur/print/paginate.ts'

/*
 * DERNIER FILET avant l'affichage des pages A4 (audit de sécurité du
 * 2026-11-18, étape 6 du plan `securite-audit-run2-2026-11-18`).
 *
 * La pagination SÉRIALISE le DOM rendu (`outerHTML`) et le RÉINJECTE
 * (`dangerouslySetInnerHTML` des pages, puis l'iframe d'impression). Le
 * pipeline Markdown ne laisse passer aucun HTML brut et Mermaid est déjà
 * assaini (`mermaid.ts`), mais la CSP garde `'unsafe-inline'` : un seul
 * passage de DOMPurify sur le HTML de CHAQUE page, au moment où la liste
 * des pages est construite (jamais à chaque rendu).
 *
 * Ce qui doit survivre tel quel (le moteur et la feuille `classeur.css` en
 * dépendent) : `class`, `style` (variables `--r`, `--cx`…, largeurs des
 * `colgroup`), tous les `data-*` (`data-ligne`, `data-bloc`, `data-cote`,
 * `data-largeur`, `data-genre`, `data-chemin`, `data-image-status`,
 * `data-encadre`, `data-etape`, `data-page-break`…), `aria-*`, le SVG des
 * schémas Mermaid (styles, marqueurs, filtres, libellés HTML dans
 * `foreignObject`), et les images du bucket privé, affichées par une URL
 * `blob:` locale. Seule perte voulue : l'enveloppe `semantics` / la
 * source TeX (`annotation`) du MathML de KaTeX, que DOMPurify refuse par
 * principe ; ce MathML est masqué à l'écran (`.katex-mathml`), le rendu
 * visible (`.katex-html`) ne change pas.
 */

/**
 * URL permises : celles de DOMPurify par défaut, plus `blob:` (images du
 * document, `urlObjetImage`). `javascript:`, `vbscript:` et `data:` (hors
 * image) restent refusés.
 */
const URI_PERMISES =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i

export const CONFIG_ASSAINISSEMENT: Config = {
  USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
  ADD_TAGS: ['foreignObject'],
  HTML_INTEGRATION_POINTS: { foreignobject: true },
  // La source TeX n'est pas hissée dans le `<math>` quand l'élément part.
  ADD_FORBID_CONTENTS: ['annotation'],
  ALLOWED_URI_REGEXP: URI_PERMISES,
  ALLOW_DATA_ATTR: true,
  ALLOW_ARIA_ATTR: true,
}

export type Assainisseur = (html: string) => string

let chargement: Promise<Assainisseur> | null = null

/**
 * Charge DOMPurify à la demande (même découpage que Mermaid : hors du
 * chunk d'entrée). Un échec de chargement n'est pas gardé : la pagination
 * suivante retente ; celle-ci passe par `assainirSansDomPurify`.
 */
export function chargerAssainisseur(): Promise<Assainisseur> {
  if (!chargement) {
    chargement = import('dompurify')
      .then(({ default: DOMPurify }) => {
        const purify: Assainisseur = (html) =>
          DOMPurify.sanitize(html, CONFIG_ASSAINISSEMENT)
        return purify
      })
      .catch((err: unknown) => {
        chargement = null
        console.error(
          '[classeur] Assainissement des pages : DOMPurify indisponible, filet minimal.',
          err,
        )
        return assainirSansDomPurify
      })
  }
  return chargement
}

/** Applique l'assainisseur au HTML de chaque page (autres champs gardés). */
export function assainirPages(
  pages: readonly PageData[],
  assainir: Assainisseur,
): PageData[] {
  return pages.map((page) => ({ ...page, html: assainir(page.html) }))
}

const BALISES_INTERDITES = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'frame',
  'frameset',
  'base',
  'meta',
  'link',
])

/**
 * Repli quand DOMPurify ne se charge pas (réseau) : arbre inerte
 * (`<template>`), balises actives retirées, gestionnaires `on*` et URL
 * `javascript:` / `vbscript:` / `data:` hors image ôtés. Moins complet que
 * DOMPurify, mais jamais rien d'exécutable.
 */
export function assainirSansDomPurify(html: string): string {
  const modele = document.createElement('template')
  modele.innerHTML = html
  const elements = Array.from(modele.content.querySelectorAll('*'))
  for (const el of elements) {
    const tag = el.localName.toLowerCase()
    if (BALISES_INTERDITES.has(tag)) {
      el.remove()
      continue
    }
    for (const a of Array.from(el.attributes)) {
      const nom = a.name.toLowerCase()
      // eslint-disable-next-line no-control-regex -- les ôter est le but
      const valeur = a.value.replace(/[\s\u0000-\u001f]/g, '').toLowerCase()
      const urlActive =
        /^(javascript|vbscript):/.test(valeur) ||
        (valeur.startsWith('data:') && !valeur.startsWith('data:image/'))
      if (nom.startsWith('on') || urlActive) el.removeAttribute(a.name)
    }
  }
  return modele.innerHTML
}
