/*
 * NUMÉROS D'ÉTAPE EN PASTILLE (2026-10-03, décision utilisateur après la
 * revue visuelle : la signature des fiches iFixit). Un titre de niveau 2 à 4
 * qui commence par un numéro — « 1. Préparation », « 2) Intervention » —
 * affiche ce numéro dans un rond noir (`.etape-num`, `classeur.css`). Rien à
 * écrire de plus : le Markdown reste « ### 1. Préparation », lisible tel quel
 * par Registre et par un LLM. « 1.2 Sous-partie » (sans espace après le
 * point) et les années (« 2026. Bilan ») ne sont pas des étapes.
 */

import { estElement } from '#/lib/classeur/print/rehypeFigures.ts'
import type { NoeudHast } from '#/lib/classeur/print/rehypeFigures.ts'

const NUMERO = /^(\d{1,2})[.)]\s+/
const TITRES = ['h2', 'h3', 'h4']

function pastiller(titre: NoeudHast): void {
  const texte = titre.children?.[0]
  if (texte?.type !== 'text') return
  const m = NUMERO.exec(texte.value ?? '')
  if (!m) return
  // Une espace reste après la pastille : le texte copié ou lu à voix
  // haute garde « 1 Préparation ».
  texte.value = ' ' + (texte.value ?? '').slice(m[0].length)
  titre.properties = { ...titre.properties, dataEtape: m[1] }
  titre.children = [
    {
      type: 'element',
      tagName: 'span',
      properties: { className: ['etape-num'] },
      children: [{ type: 'text', value: m[1] }],
    },
    ...(titre.children ?? []),
  ]
}

function parcourir(n: NoeudHast): void {
  n.children?.forEach(parcourir)
  if (TITRES.some((t) => estElement(n, t))) pastiller(n)
}

/** Plugin rehype. */
export function rehypePastilles() {
  return (arbre: NoeudHast) => {
    parcourir(arbre)
  }
}
