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
 * Blocs d'images (2026-10-01, plan `classeur-images-blocs`) : une figure est
 * insécable ; une planche `:::photos` se coupe ENTRE deux rangées (une rangée
 * au moins par morceau) ; une étape `:::etape` est insécable, et se DÉROULE
 * (texte puis photos, en blocs normaux) si elle dépasse une page entière.
 * Les images flottantes (habillage) ont disparu avec leur double compte.
 *
 * Tout ce qui demande un navigateur est INJECTABLE (`OutilsPagination`),
 * parce que jsdom n'a pas de layout — et qu'un moteur non testable n'est pas
 * un garde-fou.
 */

export interface PageData {
  html: string
  /** Part de la hauteur utile occupée (0 à 1). */
  remplissage?: number
  /**
   * La page a été terminée par le n-ième saut de page `===` du document
   * (1 = premier) : la relecture signale une page presque vide à cause d'un
   * saut.
   */
  saut?: number
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
  /** Écart vertical entre deux rangées d'une planche de photos, en px. */
  ecartRangees?: (el: Element) => number
  /** Hauteur d'une ligne de texte de l'élément, en px (0 = inconnue). */
  hauteurLigne?: (el: Element) => number
  couperTexte?: CoupeTexte
}

/* ─── Seuils ─── */

/** Nombre minimum d'éléments (lignes de tableau, items, lignes de texte) par morceau. */
const MIN_PAR_MORCEAU = 2
/** Un bloc est coupable s'il permet au moins deux morceaux. */
const MIN_POUR_COUPER = MIN_PAR_MORCEAU * 2
/**
 * Un paragraphe de 3 lignes au plus (ou fini par « : ») qui précède une
 * figure ou une planche l'ANNONCE : il la suit sur la page suivante plutôt
 * que de rester seul en bas de page (2026-10-03 ; InDesign « conserver avec
 * la suivante », guide de style Google « introduire l'image »).
 */
const MAX_LIGNES_INTRODUCTION = 3

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

function ecartRangeesCalcule(el: Element): number {
  return parseFloat(getComputedStyle(el).rowGap) || 0
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
  min: number = MIN_PAR_MORCEAU,
): number[][] {
  const groupes: number[][] = []
  let courant: number[] = []
  let hauteur = socle
  let dispo = premier
  hauteurs.forEach((h, i) => {
    if (courant.length >= min && hauteur + h > dispo) {
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
    while (courant.length < min && precedent.length > min) {
      courant.unshift(precedent.pop()!)
    }
    if (courant.length < min) precedent.push(...courant)
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

/* ─── Découpage des planches de photos ─── */

/** Vrai pour une planche `:::photos` (`rehypeBlocs`). */
function estPlanche(el: Element): boolean {
  return el.getAttribute('data-bloc') === 'photos'
}

/** Vrai pour une étape illustrée `:::etape` qui a des photos. */
function estEtape(el: Element): boolean {
  return (
    el.getAttribute('data-bloc') === 'etape' && el.hasAttribute('data-photos')
  )
}

/**
 * Rangées d'une planche : les photos par `data-colonnes`, tout autre contenu
 * (`photos-hors`) sur une rangée à lui.
 */
function rangeesPlanche(el: Element): Element[][] {
  const colonnes = Math.max(
    1,
    parseInt(el.getAttribute('data-colonnes') ?? '1', 10) || 1,
  )
  const rangees: Element[][] = []
  let courante: Element[] = []
  for (const c of Array.from(el.children)) {
    if (c.tagName.toLowerCase() !== 'figure') {
      if (courante.length > 0) rangees.push(courante)
      courante = []
      rangees.push([c])
      continue
    }
    courante.push(c)
    if (courante.length === colonnes) {
      rangees.push(courante)
      courante = []
    }
  }
  if (courante.length > 0) rangees.push(courante)
  return rangees
}

function splitPlanche(
  el: Element,
  premier: number,
  plein: number,
  mesure: Mesure,
  ecartRangee: number,
): Chunk[] {
  const rangees = rangeesPlanche(el)
  const hauteurs = rangees.map((r) => Math.max(...r.map((c) => mesure(c))))
  // L'écart est compté AVANT chaque rangée pour grouper (léger excès sur la
  // première rangée d'un morceau : sûr), puis exactement par morceau.
  const avecEcart = hauteurs.map((h, i) => (i > 0 ? h + ecartRangee : h))
  const ouvrante = buildOpenTag(el)
  return grouper(avecEcart, 0, premier, plein, 1).map((g) => ({
    html: `${ouvrante}${g
      .flatMap((i) => rangees[i].map((c) => c.outerHTML))
      .join('')}</div>`,
    height:
      g.reduce((s, i) => s + hauteurs[i], 0) + ecartRangee * (g.length - 1),
  }))
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
  /** Paragraphe court qui ANNONCE ce qui suit (voir `estIntroduction`). */
  intro?: boolean
}

/** Espace occupé par une suite de blocs : boîtes + marges FUSIONNÉES. */
function pile(els: PageEl[]): number {
  let somme = 0
  els.forEach((e, i) => {
    if (i > 0) somme += Math.max(els[i - 1].mb, e.mt)
    somme += e.box
  })
  return somme
}

/** Marge fusionnée entre le dernier bloc posé et un bloc de marge haute `mt`. */
function ecart(els: PageEl[], mt: number): number {
  const dernier = els[els.length - 1] as PageEl | undefined
  return dernier === undefined ? 0 : Math.max(dernier.mb, mt)
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
  const ecartRangees = outils.ecartRangees ?? ecartRangeesCalcule

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

  let sauts = 0
  function finalizePage(saut?: number) {
    if (els.length > 0)
      pages.push({
        html: els.map((e) => e.html).join(''),
        remplissage: pile(els) / maxHeightPx,
        ...(saut !== undefined ? { saut } : {}),
      })
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

  /**
   * Nouvelle page en y emportant les titres qui terminaient la précédente ;
   * avant une figure ou une planche (`annonce`), aussi le court paragraphe
   * qui l'annonce et ses titres — jamais au point de vider la page.
   */
  function nouvellePageAvecTitres(annonce = false) {
    let intro: PageEl[] = []
    const dernier = els.at(-1)
    if (annonce && dernier?.intro) {
      const sansIntro = els.slice(0, -1)
      let k = sansIntro.length
      while (k > 0 && isHeading(sansIntro[k - 1].tag)) k--
      if (k > 0) {
        intro = els.splice(k)
      }
    }
    const orphans = intro.length > 0 ? intro : removeTrailingHeadings()
    finalizePage()
    els.push(...orphans)
  }

  /** Paragraphe court ou fini par « : » : il annonce le bloc qui suit. */
  function estIntroduction(el: Element, box: number): boolean {
    if (el.tagName.toLowerCase() !== 'p') return false
    if (el.querySelector('img, figure')) return false
    if ((el.textContent ?? '').trim().endsWith(':')) return true
    const ligne = hauteurLigne(el)
    return ligne > 0 && box <= MAX_LIGNES_INTRODUCTION * ligne + 1
  }

  function kind(
    el: Element,
  ): 'table' | 'liste' | 'texte' | 'planche' | 'etape' | null {
    const tag = el.tagName.toLowerCase()
    if (estPlanche(el)) return 'planche'
    if (estEtape(el)) return 'etape'
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
      case 'planche': {
        if (rangeesPlanche(el).length < 2) return null
        return splitPlanche(el, premier, plein, mesure, ecartRangees(el))
      }
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
      case 'planche': {
        const premiere = rangeesPlanche(el)[0] as Element[] | undefined
        return premiere ? Math.max(...premiere.map((c) => mesure(c))) : box
      }
      case 'etape': {
        // Plus haute qu'une page : elle sera déroulée, son début suffit.
        if (box <= maxHeightPx) return box
        const ligne = hauteurLigne(el)
        return ligne > 0 ? MIN_PAR_MORCEAU * ligne : box
      }
      default:
        return box
    }
  }

  /**
   * Espace exigé SOUS le titre d'index `i` pour qu'il ne reste pas seul :
   * le début minimal de ce qui suit (une suite de titres compte en entier).
   */
  function besoinApresTitre(liste: Element[], i: number): number {
    let besoin = 0
    let precedentMb = infos(liste[i]).mb
    for (let j = i + 1; j < liste.length; j++) {
      const suivant = liste[j]
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

  /**
   * Étape illustrée plus haute qu'une page : une COPIE marquée
   * `data-deroule` (texte puis photos en blocs normaux, `classeur.css`) est
   * posée à côté pour être mesurée, et ses blocs sont paginés un à un. Les
   * copies sont retirées avant de rendre la main (le conteneur appartient à
   * React).
   */
  const copies: Element[] = []
  function derouler(etape: Element): Element[] {
    const copie = etape.cloneNode(true) as Element
    copie.setAttribute('data-deroule', 'true')
    etape.after(copie)
    copies.push(copie)
    return Array.from(
      copie.querySelectorAll(
        ':scope > .etape-texte > *, :scope > .etape-photos > *',
      ),
    )
  }

  function traiterListe(liste: Element[]) {
    liste.forEach((child, index) => {
      const tag = child.tagName.toLowerCase()

      // ─── Saut de page forcé (`===` seul sur une ligne) ───
      if ((child as HTMLElement).dataset.pageBreak) {
        sauts += 1
        finalizePage(sauts)
        return
      }

      const { box, mt, mb } = infos(child)
      const pageEl: PageEl = { html: child.outerHTML, tag, box, mt, mb }

      // ─── Titre : jamais seul en bas de page ───
      if (isHeading(tag) && els.length > 0) {
        const apres = besoinApresTitre(liste, index)
        if (pile([...els, pageEl]) + apres > maxHeightPx) {
          nouvellePageAvecTitres()
        }
        els.push(pageEl)
        return
      }

      // ─── Le bloc tient sur la page courante ───
      if (pile([...els, pageEl]) <= maxHeightPx) {
        if (estIntroduction(child, box)) pageEl.intro = true
        els.push(pageEl)
        return
      }

      // ─── Étape plus haute qu'une page entière : déroulée ───
      if (kind(child) === 'etape' && box > maxHeightPx) {
        traiterListe(derouler(child))
        return
      }

      // ─── Il ne tient pas : le couper dans la place RESTANTE si possible ───
      const reste = maxHeightPx - pile(els) - ecart(els, mt)
      const coupe = morceaux(child, reste, maxHeightPx)
      if (coupe !== null && coupe.length > 1 && coupe[0].height <= reste) {
        poserMorceaux(coupe, tag, mt, mb)
        return
      }

      // ─── Sinon, page suivante (avec ses titres), coupé si trop grand ───
      if (els.length > 0 && !isOnlyHeadings())
        nouvellePageAvecTitres(tag === 'figure' || kind(child) === 'planche')
      const dispo = maxHeightPx - pile(els) - ecart(els, mt)
      if (dispo < box) {
        const coupe2 = morceaux(child, dispo, maxHeightPx)
        if (coupe2 !== null && coupe2.length > 1) {
          poserMorceaux(coupe2, tag, mt, mb)
          return
        }
      }
      els.push(pageEl)
    })
  }

  try {
    traiterListe(children)
  } finally {
    copies.forEach((c) => c.remove())
  }

  finalizePage()
  return pages
}
