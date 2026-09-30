/*
 * Moteur de pagination — porté de Registre (`src/lib/print/paginate.ts`),
 * RÉVISÉ le 2026-09-30 (retour utilisateur : « le contenu saute trop vite
 * d'une page à l'autre, j'aurais la place mais la mise en page ne me le
 * permet pas »). Découpe les enfants DOM d'un conteneur en pages selon une
 * hauteur max ; retourne le HTML de chaque page.
 *
 * Cinq rigidités de la source, corrigées ici :
 *  1. Un PARAGRAPHE n'était jamais coupé : s'il débordait d'une ligne, il
 *     partait entier et laissait un trou. Il est désormais coupé ENTRE deux
 *     lignes (au moins 2 lignes de chaque côté — veuves et orphelines) ;
 *     un encadré (`> `) aussi. Restent insécables : images, blocs de code,
 *     diagrammes.
 *  2. Un titre exigeait 15 % de la page libre sous lui (~7 lignes), quoi qu'il
 *     suive. Il exige maintenant ce que le bloc suivant demande VRAIMENT pour
 *     démarrer : 2 lignes de paragraphe, 2 éléments de liste, l'en-tête et 2
 *     lignes de tableau — ou le bloc entier s'il est insécable (image…).
 *  3. Une liste de 5 éléments ou un tableau de 8 lignes n'étaient jamais
 *     coupés : tout ce qui a au moins 4 éléments l'est (2 par morceau).
 *  4. Un grand bloc qui ne tenait pas après du texte partait sur une page
 *     NEUVE, laissant le bas de la page vide : il remplit d'abord la place.
 *  5. Les marges étaient ADDITIONNÉES alors que le navigateur les FUSIONNE
 *     (fin de paragraphe 0,3 cm + haut de titre 0,55 cm = 0,55 cm, pas
 *     0,85) ; et la marge haute d'un bloc en haut de page (annulée par la
 *     feuille de style) comme la marge basse du dernier bloc (qui ne prend
 *     pas de place) étaient comptées. Chaque page était jugée plus pleine
 *     qu'elle ne l'était.
 *
 * Règles conservées : un titre n'est jamais seul en bas de page, une suite de
 * titres part d'un bloc, `<thead>` répété, numérotation des listes
 * préservée (`start`), saut forcé `===`.
 *
 * Tout ce qui demande un navigateur est INJECTABLE (`OutilsPagination`),
 * parce que jsdom n'a pas de layout — et qu'un moteur non testable n'est pas
 * un garde-fou.
 */

export interface PageData {
  html: string
}

/** Hauteur extérieure d'un élément (boîte + marges verticales), en px. */
export type Mesure = (el: Element) => number

/** Marges verticales propres d'un élément, en px. */
export type Marges = (el: Element) => { haut: number; bas: number }

/**
 * Coupe un bloc de TEXTE (paragraphe) entre deux lignes : premier morceau au
 * plus `premier` px, les suivants au plus `plein` px. Rend `null` si le bloc
 * ne peut pas être coupé en respectant 2 lignes par morceau.
 */
export type CoupeTexte = (
  el: Element,
  premier: number,
  plein: number,
) => Chunk[] | null

export interface OutilsPagination {
  marges?: Marges
  /** Hauteur d'une ligne de texte de l'élément, en px (0 = inconnue). */
  hauteurLigne?: (el: Element) => number
  couperTexte?: CoupeTexte
}

/* ─── Seuils ─── */

/** Nombre minimum d'éléments (lignes de tableau, items, lignes de texte) par morceau. */
const MIN_PAR_MORCEAU = 2
/** Un bloc est coupable s'il permet au moins deux morceaux. */
const MIN_POUR_COUPER = MIN_PAR_MORCEAU * 2

/* ─── Mesures par défaut (navigateur réel) ─── */

/** Mesure par défaut : boîte rendue + marges verticales. */
export function getOuterHeight(el: Element): number {
  const m = margesCalculees(el)
  return el.getBoundingClientRect().height + m.haut + m.bas
}

function margesCalculees(el: Element): { haut: number; bas: number } {
  const style = getComputedStyle(el)
  return {
    haut: parseFloat(style.marginTop) || 0,
    bas: parseFloat(style.marginBottom) || 0,
  }
}

function hauteurLigneCalculee(el: Element): number {
  const style = getComputedStyle(el)
  const lh = parseFloat(style.lineHeight)
  if (Number.isFinite(lh) && lh > 0) return lh
  const fs = parseFloat(style.fontSize)
  return Number.isFinite(fs) && fs > 0 ? fs * 1.2 : 0
}

/* ─── Utilitaires ─── */

function isHeading(tag: string): boolean {
  return /^h[1-6]$/i.test(tag)
}

/**
 * Échappe les caractères spéciaux HTML dans une valeur d'attribut
 * pour prévenir les injections XSS via les attributs.
 */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function buildOpenTag(el: Element, overrides?: Record<string, string>): string {
  const tag = el.tagName.toLowerCase()
  const attrs: string[] = []
  for (const a of Array.from(el.attributes)) {
    if (overrides && a.name in overrides) continue
    attrs.push(`${a.name}="${escapeAttr(a.value)}"`)
  }
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      attrs.push(`${k}="${escapeAttr(v)}"`)
    }
  }
  return attrs.length > 0 ? `<${tag} ${attrs.join(' ')}>` : `<${tag}>`
}

/* ─── Chunk : fragment d'un élément découpé ─── */

export interface Chunk {
  html: string
  /** Hauteur de la BOÎTE du fragment (sans marges), en px. */
  height: number
}

/* ─── Découpage des tableaux ─── */

function getTableRows(table: HTMLTableElement): HTMLTableRowElement[] {
  const tbody = table.querySelector('tbody')
  return tbody
    ? Array.from(tbody.querySelectorAll<HTMLTableRowElement>(':scope > tr'))
    : Array.from(table.querySelectorAll<HTMLTableRowElement>(':scope > tr'))
}

/**
 * Regroupe des éléments de hauteurs connues en morceaux : le premier au plus
 * `premier` px, les suivants au plus `plein` px, `socle` px répétés en tête
 * de chaque morceau (en-tête de tableau), au moins `MIN_PAR_MORCEAU` éléments
 * par morceau (un dernier morceau trop court est fusionné au précédent).
 */
function grouper(
  hauteurs: number[],
  socle: number,
  premier: number,
  plein: number,
): number[][] {
  const groupes: number[][] = []
  let courant: number[] = []
  let hauteur = socle
  let dispo = premier
  hauteurs.forEach((h, i) => {
    if (courant.length >= MIN_PAR_MORCEAU && hauteur + h > dispo) {
      groupes.push(courant)
      courant = []
      hauteur = socle
      dispo = plein
    }
    courant.push(i)
    hauteur += h
  })
  if (courant.length > 0 && groupes.length > 0) {
    // Dernier morceau trop court : on RÉÉQUILIBRE (le précédent cède des
    // éléments tant qu'il en garde assez) plutôt que de tout recoller — le
    // morceau recollé ne tenait plus dans sa page, et le bloc entier
    // repartait sur la page suivante.
    const precedent = groupes[groupes.length - 1]
    while (
      courant.length < MIN_PAR_MORCEAU &&
      precedent.length > MIN_PAR_MORCEAU
    ) {
      courant.unshift(precedent.pop()!)
    }
    if (courant.length < MIN_PAR_MORCEAU) precedent.push(...courant)
    else groupes.push(courant)
  } else if (courant.length > 0) {
    groupes.push(courant)
  }
  return groupes
}

function splitTable(
  table: HTMLTableElement,
  premier: number,
  plein: number,
  mesure: Mesure,
): Chunk[] {
  const rows = getTableRows(table)
  const thead = table.querySelector('thead')
  const theadHtml = thead ? thead.outerHTML : ''
  const theadHeight = thead ? mesure(thead) : 0
  const tableOpen = buildOpenTag(table)
  const hauteurs = rows.map((r) => mesure(r))
  return grouper(hauteurs, theadHeight, premier, plein).map((g) => ({
    html: `${tableOpen}${theadHtml}<tbody>${g.map((i) => rows[i].outerHTML).join('')}</tbody></table>`,
    height: theadHeight + g.reduce((s, i) => s + hauteurs[i], 0),
  }))
}

/* ─── Découpage des listes ─── */

function getListItems(
  list: HTMLUListElement | HTMLOListElement,
): HTMLLIElement[] {
  return Array.from(list.querySelectorAll<HTMLLIElement>(':scope > li'))
}

function splitList(
  list: HTMLUListElement | HTMLOListElement,
  premier: number,
  plein: number,
  mesure: Mesure,
): Chunk[] {
  const tag = list.tagName.toLowerCase()
  const items = getListItems(list)
  const baseStart =
    tag === 'ol' ? parseInt(list.getAttribute('start') || '1', 10) : 0
  const hauteurs = items.map((it) => mesure(it))
  return grouper(hauteurs, 0, premier, plein).map((g) => {
    const overrides =
      tag === 'ol' && g[0] > 0 ? { start: String(baseStart + g[0]) } : undefined
    return {
      html: `${buildOpenTag(list, overrides)}${g.map((i) => items[i].outerHTML).join('')}</${tag}>`,
      height: g.reduce((s, i) => s + hauteurs[i], 0),
    }
  })
}

/* ─── Découpage des paragraphes (navigateur réel) ─── */

interface Ligne {
  haut: number
  bas: number
}

/**
 * Lignes rendues d'un bloc de texte, relatives au haut de sa boîte. Les
 * rectangles sont lus NŒUD DE TEXTE par nœud de texte : ceux d'un Range
 * posé sur tout le bloc incluent la boîte ENTIÈRE de chaque bloc enfant
 * (le `<p>` d'un encadré), qui fusionnait toutes les lignes en une seule.
 */
function lignesRendues(el: Element): Ligne[] {
  const range = document.createRange()
  // Sans moteur de rendu (jsdom), pas de lignes : bloc non coupable.
  if (typeof range.getClientRects !== 'function') return []
  const origine = el.getBoundingClientRect().top
  const rects: DOMRect[] = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
    range.selectNodeContents(n)
    for (const r of Array.from(range.getClientRects()))
      if (r.height > 0) rects.push(r)
  }
  rects.sort((a, b) => a.top - b.top)
  const lignes: Ligne[] = []
  for (const r of rects) {
    const haut = r.top - origine
    const bas = r.bottom - origine
    const derniere = lignes[lignes.length - 1] as Ligne | undefined
    // Chevauchement vertical = même ligne (morceaux gras, liens…).
    if (derniere !== undefined && haut < derniere.bas - 1) {
      derniere.haut = Math.min(derniere.haut, haut)
      derniere.bas = Math.max(derniere.bas, bas)
    } else {
      lignes.push({ haut, bas })
    }
  }
  return lignes
}

/** Positions caractère par caractère du texte d'un élément. */
function positionsTexte(el: Element): Array<{ node: Text; offset: number }> {
  const out: Array<{ node: Text; offset: number }> = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
    const t = n as Text
    for (let i = 0; i < t.length; i++) out.push({ node: t, offset: i })
  }
  return out
}

/**
 * Coupe par défaut, dans un navigateur : lignes lues sur le rendu, coupure
 * au premier caractère de la ligne qui commence le morceau suivant, balisage
 * préservé (`Range.cloneContents` referme proprement un gras coupé en deux).
 */
export function couperTexteDom(
  el: Element,
  premier: number,
  plein: number,
): Chunk[] | null {
  const lignes = lignesRendues(el)
  if (lignes.length < MIN_POUR_COUPER) return null
  const boite = el.getBoundingClientRect().height
  // Frontière entre la ligne k-1 et la ligne k : milieu de l'interligne.
  const frontiere = (k: number) =>
    k >= lignes.length ? boite : (lignes[k - 1].bas + lignes[k].haut) / 2

  // Lignes de coupe (index de la première ligne de chaque morceau suivant).
  const coupes: number[] = []
  let debut = 0
  let origine = 0
  let dispo = premier
  while (lignes.length - debut > 0) {
    let k = debut
    while (k < lignes.length && frontiere(k + 1) - origine <= dispo) k += 1
    if (k >= lignes.length) break // tout le reste tient
    // Veuves et orphelines : 2 lignes au moins de chaque côté.
    k = Math.min(k, lignes.length - MIN_PAR_MORCEAU)
    if (k - debut < MIN_PAR_MORCEAU) {
      if (coupes.length === 0 && debut === 0) return null
      k = Math.min(debut + MIN_PAR_MORCEAU, lignes.length - MIN_PAR_MORCEAU)
      if (k <= debut) break
    }
    coupes.push(k)
    origine = frontiere(k)
    debut = k
    dispo = plein
  }
  if (coupes.length === 0) return null

  // Ligne → position dans le texte : premier caractère visible dont le haut
  // atteint la ligne de coupe.
  const positions = positionsTexte(el)
  const range = document.createRange()
  const origineY = el.getBoundingClientRect().top
  const bornes: Array<{ node: Text; offset: number }> = []
  let i = 0
  for (const k of coupes) {
    const seuil = lignes[k].haut - 1
    for (; i < positions.length; i++) {
      range.setStart(positions[i].node, positions[i].offset)
      range.setEnd(positions[i].node, positions[i].offset + 1)
      const r = range.getBoundingClientRect()
      if (r.height > 0 && r.top - origineY >= seuil) break
    }
    if (i >= positions.length) return null
    bornes.push(positions[i])
  }

  const ouvrante = buildOpenTag(el)
  const fermante = `</${el.tagName.toLowerCase()}>`
  const morceaux: Chunk[] = []
  const serialiser = (frag: DocumentFragment) => {
    const div = document.createElement('div')
    div.appendChild(frag)
    return div.innerHTML
  }
  let depart: { node: Node; offset: number } = { node: el, offset: 0 }
  let yDepart = 0
  bornes.forEach((b, n) => {
    range.setStart(depart.node, depart.offset)
    range.setEnd(b.node, b.offset)
    const y = frontiere(coupes[n])
    morceaux.push({
      html: `${ouvrante}${serialiser(range.cloneContents())}${fermante}`,
      height: y - yDepart,
    })
    depart = b
    yDepart = y
  })
  range.setStart(depart.node, depart.offset)
  range.setEnd(el, el.childNodes.length)
  morceaux.push({
    html: `${ouvrante}${serialiser(range.cloneContents())}${fermante}`,
    height: boite - yDepart,
  })
  return morceaux
}

/* ─── Paginateur principal ─── */

interface PageEl {
  html: string
  tag: string
  /** Hauteur de la boîte, sans marges. */
  box: number
  mt: number
  mb: number
}

/** Espace occupé par une suite de blocs : boîtes + marges FUSIONNÉES entre eux. */
function hauteurUtilisee(els: PageEl[]): number {
  let h = 0
  els.forEach((e, i) => {
    h += e.box
    if (i > 0) h += Math.max(els[i - 1].mb, e.mt)
  })
  return h
}

/** Espace à ajouter pour poser `el` après `els` (marge fusionnée + boîte). */
function ajout(els: PageEl[], mt: number, box: number): number {
  const dernier = els[els.length - 1] as PageEl | undefined
  return (dernier === undefined ? 0 : Math.max(dernier.mb, mt)) + box
}

/**
 * Découpe les enfants directs de `container` en pages de `maxHeightPx` au
 * plus. `mesure` rend la hauteur extérieure d'un élément (par défaut la
 * mesure réelle du navigateur ; injectée par les tests), `outils` le reste.
 */
export function paginate(
  container: Element,
  maxHeightPx: number,
  mesure: Mesure = getOuterHeight,
  outils: OutilsPagination = {},
): PageData[] {
  const marges = outils.marges ?? margesCalculees
  const hauteurLigne = outils.hauteurLigne ?? hauteurLigneCalculee
  const couperTexte = outils.couperTexte ?? couperTexteDom

  const children = Array.from(container.children)
  if (children.length === 0) return [{ html: '' }]

  const pages: PageData[] = []
  let els: PageEl[] = []

  const infos = (el: Element) => {
    const m = marges(el)
    return {
      box: Math.max(0, mesure(el) - m.haut - m.bas),
      mt: m.haut,
      mb: m.bas,
    }
  }

  function finalizePage() {
    if (els.length > 0) pages.push({ html: els.map((e) => e.html).join('') })
    els = []
  }

  function isOnlyHeadings(): boolean {
    return els.length > 0 && els.every((e) => isHeading(e.tag))
  }

  function removeTrailingHeadings(): PageEl[] {
    const orphans: PageEl[] = []
    while (els.length > 0 && isHeading(els[els.length - 1].tag)) {
      if (isOnlyHeadings()) break
      orphans.unshift(els.pop()!)
    }
    return orphans
  }

  /** Nouvelle page en y emportant les titres qui terminaient la précédente. */
  function nouvellePageAvecTitres() {
    const orphans = removeTrailingHeadings()
    finalizePage()
    els.push(...orphans)
  }

  function kind(el: Element): 'table' | 'liste' | 'texte' | null {
    const tag = el.tagName.toLowerCase()
    if (tag === 'table') return 'table'
    if (tag === 'ul' || tag === 'ol') return 'liste'
    // Paragraphe, et encadré (`> `) : coupés entre deux lignes. Pas les blocs
    // de code : leur marge INTÉRIEURE haute et basse se répète sur chaque
    // morceau et fausserait la hauteur calculée.
    if (tag === 'p' || tag === 'blockquote') return 'texte'
    return null
  }

  function morceaux(
    el: Element,
    premier: number,
    plein: number,
  ): Chunk[] | null {
    switch (kind(el)) {
      case 'table': {
        if (getTableRows(el as HTMLTableElement).length < MIN_POUR_COUPER)
          return null
        return splitTable(el as HTMLTableElement, premier, plein, mesure)
      }
      case 'liste': {
        if (getListItems(el as HTMLUListElement).length < MIN_POUR_COUPER)
          return null
        return splitList(el as HTMLUListElement, premier, plein, mesure)
      }
      case 'texte':
        return couperTexte(el, premier, plein)
      default:
        return null
    }
  }

  /**
   * Ce que le bloc `el` exige pour DÉMARRER sur une page (boîte seule, sans
   * sa marge haute) : 2 lignes d'un paragraphe, 2 éléments d'une liste,
   * l'en-tête et 2 lignes d'un tableau, sinon le bloc entier.
   */
  function debutMinimal(el: Element): number {
    const { box } = infos(el)
    switch (kind(el)) {
      case 'texte': {
        const ligne = hauteurLigne(el)
        return ligne > 0 ? Math.min(box, MIN_PAR_MORCEAU * ligne) : box
      }
      case 'liste': {
        const items = getListItems(el as HTMLUListElement)
        if (items.length < MIN_POUR_COUPER) return box
        return items
          .slice(0, MIN_PAR_MORCEAU)
          .reduce((s, it) => s + mesure(it), 0)
      }
      case 'table': {
        const t = el as HTMLTableElement
        const rows = getTableRows(t)
        if (rows.length < MIN_POUR_COUPER) return box
        const thead = t.querySelector('thead')
        return (
          (thead ? mesure(thead) : 0) +
          rows.slice(0, MIN_PAR_MORCEAU).reduce((s, r) => s + mesure(r), 0)
        )
      }
      default:
        return box
    }
  }

  /**
   * Espace exigé SOUS le titre d'index `i` pour qu'il ne reste pas seul :
   * le début minimal de ce qui suit (une suite de titres compte en entier).
   */
  function besoinApresTitre(i: number): number {
    let besoin = 0
    let precedentMb = infos(children[i]).mb
    for (let j = i + 1; j < children.length; j++) {
      const suivant = children[j]
      if ((suivant as HTMLElement).dataset.pageBreak) return besoin
      const s = infos(suivant)
      const gap = Math.max(precedentMb, s.mt)
      if (!isHeading(suivant.tagName))
        return besoin + gap + debutMinimal(suivant)
      besoin += gap + s.box
      precedentMb = s.mb
    }
    return besoin
  }

  /** Pose les morceaux d'un bloc coupé : le premier sur la page courante. */
  function poserMorceaux(chunks: Chunk[], tag: string, mt: number, mb: number) {
    chunks.forEach((c, n) => {
      if (n > 0) finalizePage()
      els.push({
        html: c.html,
        tag,
        box: c.height,
        mt: n === 0 ? mt : 0,
        mb: n === chunks.length - 1 ? mb : 0,
      })
    })
  }

  children.forEach((child, index) => {
    const tag = child.tagName.toLowerCase()

    // ─── Saut de page forcé (`===` seul sur une ligne) ───
    if ((child as HTMLElement).dataset.pageBreak) {
      finalizePage()
      return
    }

    const { box, mt, mb } = infos(child)
    const pageEl: PageEl = { html: child.outerHTML, tag, box, mt, mb }

    // ─── Titre : jamais seul en bas de page ───
    if (isHeading(tag) && els.length > 0) {
      const apres = besoinApresTitre(index)
      if (hauteurUtilisee(els) + ajout(els, mt, box) + apres > maxHeightPx) {
        nouvellePageAvecTitres()
      }
      els.push(pageEl)
      return
    }

    // ─── Le bloc tient sur la page courante ───
    const utilise = hauteurUtilisee(els)
    if (utilise + ajout(els, mt, box) <= maxHeightPx) {
      els.push(pageEl)
      return
    }

    // ─── Il ne tient pas : le couper dans la place RESTANTE si possible ───
    const reste =
      maxHeightPx -
      utilise -
      (els.length > 0 ? Math.max(els[els.length - 1].mb, mt) : 0)
    const coupe = morceaux(child, reste, maxHeightPx)
    if (coupe !== null && coupe.length > 1 && coupe[0].height <= reste) {
      poserMorceaux(coupe, tag, mt, mb)
      return
    }

    // ─── Sinon, page suivante (avec ses titres), coupé si trop grand ───
    if (els.length > 0 && !isOnlyHeadings()) nouvellePageAvecTitres()
    const dispo =
      maxHeightPx -
      hauteurUtilisee(els) -
      (els.length > 0 ? Math.max(els[els.length - 1].mb, mt) : 0)
    if (dispo < box) {
      const coupe2 = morceaux(child, dispo, maxHeightPx)
      if (coupe2 !== null && coupe2.length > 1) {
        poserMorceaux(coupe2, tag, mt, mb)
        return
      }
    }
    els.push(pageEl)
  })

  finalizePage()
  return pages
}
