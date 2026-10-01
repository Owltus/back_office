/*
 * Image seule SUR SA LIGNE → figure légendée (2026-10-01), la convention
 * Pandoc `implicit_figures` : `![légende](chemin)` devient
 * `<figure><img><figcaption>légende</figcaption></figure>`. Une image au
 * milieu d'une phrase reste dans sa phrase.
 *
 * « Sur sa ligne » et pas seulement « seule dans son paragraphe » : dans les
 * procédures réelles, 44 captures suivent directement une étape de liste
 * (`- Cliquer sur…` puis `![…](…)` à la ligne), ce que Markdown range DANS
 * l'étape. Elles deviennent des figures à leur place : dans l'élément de
 * liste, ou en coupant le paragraphe en deux (une figure ne peut pas vivre
 * dans un `<p>`).
 *
 * La figure reprend la position de l'image (`data-ligne` du lien aperçu ⇄
 * texte, `rehypeLignesSource`, placé APRÈS ce plugin) ; la légende n'est
 * posée que si elle en est une vraie (`legendeAffichable`).
 */

import { legendeAffichable } from '#/lib/classeur/legende.ts'

export interface NoeudHast {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: NoeudHast[]
  position?: unknown
}

export function estElement(n: NoeudHast | undefined, tag?: string): boolean {
  return (
    n !== undefined &&
    n.type === 'element' &&
    (tag === undefined || n.tagName === tag)
  )
}

/** Enfants significatifs (sans les blancs entre balises). */
export function significatifs(n: NoeudHast): NoeudHast[] {
  return (n.children ?? []).filter(
    (c) => !(c.type === 'text' && (c.value ?? '').trim() === ''),
  )
}

function figure(img: NoeudHast): NoeudHast {
  const legende = legendeAffichable(
    typeof img.properties?.alt === 'string' ? img.properties.alt : '',
  )
  return {
    type: 'element',
    tagName: 'figure',
    properties: {},
    position: img.position,
    children: legende
      ? [
          img,
          {
            type: 'element',
            tagName: 'figcaption',
            properties: {},
            children: [{ type: 'text', value: legende }],
          },
        ]
      : [img],
  }
}

/** Texte (ou rien) qui finit par un retour à la ligne : l'image commence sa ligne. */
function finDeLigne(n: NoeudHast | undefined): boolean {
  if (n === undefined) return true
  return n.type === 'text' && /\n[ \t]*$/.test(n.value ?? '')
}

function debutDeLigne(n: NoeudHast | undefined): boolean {
  if (n === undefined) return true
  return n.type === 'text' && /^[ \t]*\n/.test(n.value ?? '')
}

/** Index des images seules sur leur ligne parmi les enfants. */
function imagesSurLeurLigne(enfants: NoeudHast[]): number[] {
  const index: number[] = []
  enfants.forEach((c, i) => {
    if (!estElement(c, 'img')) return
    // Les blancs autour d'une image ne comptent pas ; un retour, si.
    let a = i - 1
    while (
      a >= 0 &&
      enfants[a].type === 'text' &&
      /^[ \t]*$/.test(enfants[a].value ?? '')
    )
      a--
    let b = i + 1
    while (
      b < enfants.length &&
      enfants[b].type === 'text' &&
      /^[ \t]*$/.test(enfants[b].value ?? '')
    )
      b++
    // Hors bornes = bord du parent (pas `at(-1)`, qui lirait le dernier).
    const avant = a >= 0 ? enfants[a] : undefined
    const apres = b < enfants.length ? enfants[b] : undefined
    if (finDeLigne(avant) && debutDeLigne(apres)) index.push(i)
  })
  return index
}

/** Retire les retours à la ligne laissés en bord de morceau. */
function rogner(enfants: NoeudHast[]): NoeudHast[] {
  const out = [...enfants]
  const premier = out[0] as NoeudHast | undefined
  if (premier?.type === 'text')
    out[0] = { ...premier, value: (premier.value ?? '').replace(/^\s+/, '') }
  const n = out.length - 1
  const dernier = out[n] as NoeudHast | undefined
  if (dernier?.type === 'text')
    out[n] = { ...dernier, value: (dernier.value ?? '').replace(/\s+$/, '') }
  return out.filter((c) => !(c.type === 'text' && (c.value ?? '') === ''))
}

/**
 * Paragraphe : coupé en morceaux `p`, `figure`, `p`… Rend la liste des nœuds
 * qui le remplacent (lui-même s'il n'y a rien à faire).
 */
function couperParagraphe(p: NoeudHast): NoeudHast[] {
  const enfants = p.children ?? []
  const index = imagesSurLeurLigne(enfants)
  if (index.length === 0) return [p]
  const sortie: NoeudHast[] = []
  let depuis = 0
  const fermerTexte = (jusqua: number, premier: boolean) => {
    const morceau = rogner(enfants.slice(depuis, jusqua))
    if (morceau.length > 0)
      sortie.push({
        ...p,
        position: premier ? p.position : morceau[0].position,
        children: morceau,
      })
  }
  index.forEach((i, n) => {
    fermerTexte(i, n === 0)
    sortie.push(figure(enfants[i]))
    depuis = i + 1
  })
  fermerTexte(enfants.length, false)
  return sortie
}

/** Élément de liste « serré » (sans `<p>`) : figures posées à leur place. */
function figuresEnPlace(parent: NoeudHast): void {
  const enfants = parent.children ?? []
  const index = new Set(imagesSurLeurLigne(enfants))
  if (index.size === 0) return
  parent.children = enfants.map((c, i) => (index.has(i) ? figure(c) : c))
}

function parcourir(n: NoeudHast): void {
  if (!n.children) return
  if (estElement(n, 'li')) figuresEnPlace(n)
  const sortie: NoeudHast[] = []
  for (const c of n.children) {
    if (estElement(c, 'p')) {
      sortie.push(...couperParagraphe(c))
    } else {
      parcourir(c)
      sortie.push(c)
    }
  }
  n.children = sortie
}

/** Plugin rehype. */
export function rehypeFigures() {
  return (arbre: NoeudHast) => {
    parcourir(arbre)
  }
}
