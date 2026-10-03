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
 * tel quel par Registre et par un LLM. Jusqu'à 6 chiffres par niveau
 * (décision utilisateur : « 1991 » doit pouvoir s'afficher ; les cases
 * s'élargissent, `classeur.css`) — une année suivie d'un point devient donc
 * un numéro. Un nombre sans point ni parenthèse (« 3 vannes ») reste du
 * texte ; les listes numérotées gardent leur numérotation propre.
 */

import { estElement } from '#/lib/classeur/print/rehypeFigures.ts'
import type { NoeudHast } from '#/lib/classeur/print/rehypeFigures.ts'

/** « 1. », « 1) », « 1.2 », « 1.2. » ou « 1.2) » suivi d'une espace. */
const NUMERO = /^(\d{1,6}(?:\.\d{1,6})+)[.)]?\s+|^(\d{1,6})[.)]\s+/
const TITRES = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']
/** Unité juste après le nombre : c'est une mesure, pas un numéro. */
const UNITE =
  /^(?:kg|g|t|tonnes?|m|cm|mm|km|l|litres?|ml|°c?|%|€|eur|h|min|s|bars?|kw|w|v|a)(?![\p{L}\p{N}])/iu

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
  const complet = noeuds.map((t) => t.value ?? '').join('')
  const m = NUMERO.exec(complet)
  if (!m) return
  // « 2.5 tonnes », « 1.5 m » : une MESURE, pas un numéro (audit du
  // 2026-10-04).
  if (UNITE.test(complet.slice(m[0].length))) return
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
    // Le reste du titre dans UN élément : un `##` numéroté est en flex
    // (`classeur.css`), et chaque morceau en gras ou en italique y serait
    // devenu une colonne, sans espaces (audit du 2026-10-04).
    {
      type: 'element',
      tagName: 'span',
      properties: { className: ['titre-texte'] },
      children: titre.children ?? [],
    },
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
