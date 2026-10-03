/*
 * NUMÉROS EN PASTILLE (2026-10-03, décision utilisateur après la revue
 * visuelle : la signature des fiches iFixit). Un titre de N'IMPORTE QUEL
 * niveau (`#` à `######`, élargi le même jour à la demande de
 * l'utilisateur : « peu importe le titre, que ça fonctionne dans tous les
 * cas ») qui commence par un numéro affiche ce numéro dans un rond noir
 * (`.etape-num`, `classeur.css`) :
 *   « 1. Préparation », « 2) Intervention », « 1.2 Sous-partie »,
 *   « 1.2. Sous-partie », et aussi « **1.** Préparation » (numéro en gras).
 * Rien à écrire de plus : le Markdown reste « ### 1. Préparation », lisible
 * tel quel par Registre et par un LLM. Les années (« 2026. Bilan », plus de
 * deux chiffres) ne sont pas des numéros ; les listes numérotées gardent
 * leur numérotation propre.
 */

import { estElement } from '#/lib/classeur/print/rehypeFigures.ts'
import type { NoeudHast } from '#/lib/classeur/print/rehypeFigures.ts'

/** « 1. », « 1) », « 1.2 », « 1.2. » ou « 1.2) » suivi d'une espace. */
const NUMERO = /^(\d{1,2}(?:\.\d{1,2})+)[.)]?\s+|^(\d{1,2})[.)]\s+/
const TITRES = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']

/** Nœuds texte du titre, dans l'ordre (le numéro peut être en gras…). */
function textes(n: NoeudHast, out: NoeudHast[] = []): NoeudHast[] {
  for (const c of n.children ?? []) {
    if (c.type === 'text') out.push(c)
    else if (estElement(c, 'strong') || estElement(c, 'em')) textes(c, out)
    else break
  }
  return out
}

/** Retire les éléments vidés par l'extraction du numéro (« **1.** »). */
function nettoyer(n: NoeudHast): void {
  n.children = (n.children ?? []).filter((c) => {
    if (c.type === 'text') return true
    nettoyer(c)
    return !(
      (estElement(c, 'strong') || estElement(c, 'em')) &&
      (c.children ?? []).every(
        (x) => x.type === 'text' && (x.value ?? '').trim() === '',
      )
    )
  })
}

function pastiller(titre: NoeudHast): void {
  // Le titre lu comme UN texte, quelle que soit sa mise en forme.
  const noeuds = textes(titre)
  const m = NUMERO.exec(noeuds.map((t) => t.value ?? '').join(''))
  if (!m) return
  const numero = m[1] || m[2]
  // Le numéro (et l'espace qui le suit) est retiré, nœud après nœud.
  let reste = m[0].length
  for (const t of noeuds) {
    const v = t.value ?? ''
    const pris = Math.min(reste, v.length)
    t.value = v.slice(pris)
    reste -= pris
    if (reste === 0) break
  }
  nettoyer(titre)
  // Une espace reste après la pastille : le texte copié ou lu à voix
  // haute garde « 1 Préparation ».
  titre.children = [
    {
      type: 'element',
      tagName: 'span',
      properties: { className: ['etape-num'] },
      children: [{ type: 'text', value: numero }],
    },
    { type: 'text', value: ' ' },
    ...(titre.children ?? []),
  ]
  titre.properties = { ...titre.properties, dataEtape: numero }
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
