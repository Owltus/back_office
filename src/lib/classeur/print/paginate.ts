/*
 * Moteur de pagination — porté de Registre (`src/lib/print/paginate.ts`).
 * Découpe les enfants DOM d'un conteneur en pages selon une hauteur max.
 * Retourne le HTML de chaque page.
 *
 * Règles typographiques appliquées :
 * - Orphans/widows : un heading n'est jamais seul en bas de page (min 15 % de
 *   la hauteur de page réservé pour le contenu qui suit)
 * - TOUS les headings consécutifs en fin de page sont repoussés ensemble
 * - Les tableaux > 8 lignes sont découpés par lignes avec <thead> répété ;
 *   les petits tableaux (≤ 8 lignes) restent intacts
 * - Les listes > 5 items sont découpées par <li> avec numérotation préservée ;
 *   les petites listes (≤ 5 items) restent intactes
 * - Chaque fragment de table/liste contient au minimum 2 éléments
 * - <hr> = séparateur thématique, rendu comme un trait horizontal normal
 *
 * Seul écart avec la source : la mesure de hauteur est INJECTABLE
 * (troisième paramètre `mesure`), parce que jsdom n'a pas de layout —
 * `getBoundingClientRect()` y rend 0 — et qu'un moteur non testable n'est
 * pas un garde-fou. Par défaut, la mesure est celle de Registre (hauteur
 * rendue + marges verticales calculées).
 */

export interface PageData {
  html: string
}

/** Hauteur extérieure d'un élément (contenu + marges verticales), en px. */
export type Mesure = (el: Element) => number

/* ─── Seuils ─── */

/** Nombre minimum de lignes pour qu'un tableau soit découpable */
const MIN_TABLE_ROWS_TO_SPLIT = 8
/** Nombre minimum d'items pour qu'une liste soit découpable */
const MIN_LIST_ITEMS_TO_SPLIT = 5
/** Nombre minimum d'éléments par fragment (table ou liste) */
const MIN_ITEMS_PER_CHUNK = 2

/* ─── Utilitaires ─── */

/** Mesure par défaut : boîte rendue + marges verticales (navigateur réel). */
export function getOuterHeight(el: Element): number {
  const style = getComputedStyle(el)
  const marginTop = parseFloat(style.marginTop) || 0
  const marginBottom = parseFloat(style.marginBottom) || 0
  return el.getBoundingClientRect().height + marginTop + marginBottom
}

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

/** Échappe une chaîne pour l'utiliser telle quelle dans une RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

interface Chunk {
  html: string
  height: number
}

/* ─── Découpage des tableaux ─── */

function getTableRows(table: HTMLTableElement): HTMLTableRowElement[] {
  const tbody = table.querySelector('tbody')
  return tbody
    ? Array.from(tbody.querySelectorAll<HTMLTableRowElement>(':scope > tr'))
    : Array.from(table.querySelectorAll<HTMLTableRowElement>(':scope > tr'))
}

function splitTable(
  table: HTMLTableElement,
  firstAvailable: number,
  fullHeight: number,
  mesure: Mesure,
): Chunk[] {
  const rows = getTableRows(table)

  // Petit tableau → ne pas découper
  if (rows.length <= MIN_TABLE_ROWS_TO_SPLIT) {
    return [{ html: table.outerHTML, height: mesure(table) }]
  }

  const thead = table.querySelector('thead')
  const theadHtml = thead ? thead.outerHTML : ''
  const theadHeight = thead ? mesure(thead) : 0
  const tableOpen = buildOpenTag(table)

  const chunks: Chunk[] = []
  let currentRows: string[] = []
  let currentHeight = theadHeight
  let available = firstAvailable

  for (const row of rows) {
    const rowHeight = mesure(row)

    if (
      currentRows.length >= MIN_ITEMS_PER_CHUNK &&
      currentHeight + rowHeight > available
    ) {
      chunks.push({
        html: `${tableOpen}${theadHtml}<tbody>${currentRows.join('')}</tbody></table>`,
        height: currentHeight,
      })
      currentRows = []
      currentHeight = theadHeight
      available = fullHeight
    }

    currentRows.push(row.outerHTML)
    currentHeight += rowHeight
  }

  if (currentRows.length > 0) {
    // Si le dernier fragment n'a qu'1 élément et qu'il y a un fragment
    // précédent, fusionner avec le précédent plutôt que de laisser un orphelin
    if (currentRows.length < MIN_ITEMS_PER_CHUNK && chunks.length > 0) {
      const prev = chunks.pop()!
      // Reconstruire le fragment fusionné
      const mergedRows = prev.html
        .replace(/<\/tbody><\/table>$/, '')
        .replace(
          new RegExp(
            `^${escapeRegExp(tableOpen)}${escapeRegExp(theadHtml)}<tbody>`,
          ),
          '',
        )
      chunks.push({
        html: `${tableOpen}${theadHtml}<tbody>${mergedRows}${currentRows.join('')}</tbody></table>`,
        height: prev.height + currentHeight - theadHeight,
      })
    } else {
      chunks.push({
        html: `${tableOpen}${theadHtml}<tbody>${currentRows.join('')}</tbody></table>`,
        height: currentHeight,
      })
    }
  }

  return chunks
}

/* ─── Découpage des listes ─── */

function getListItems(
  list: HTMLUListElement | HTMLOListElement,
): HTMLLIElement[] {
  return Array.from(list.querySelectorAll<HTMLLIElement>(':scope > li'))
}

function splitList(
  list: HTMLUListElement | HTMLOListElement,
  firstAvailable: number,
  fullHeight: number,
  mesure: Mesure,
): Chunk[] {
  const tag = list.tagName.toLowerCase()
  const items = getListItems(list)

  // Petite liste → ne pas découper
  if (items.length <= MIN_LIST_ITEMS_TO_SPLIT) {
    return [{ html: list.outerHTML, height: mesure(list) }]
  }

  const baseStart =
    tag === 'ol' ? parseInt(list.getAttribute('start') || '1', 10) : 0

  const chunks: Chunk[] = []
  let currentItems: string[] = []
  let currentHeight = 0
  let available = firstAvailable
  let itemOffset = 0

  for (const item of items) {
    const itemHeight = mesure(item)

    if (
      currentItems.length >= MIN_ITEMS_PER_CHUNK &&
      currentHeight + itemHeight > available
    ) {
      const overrides =
        tag === 'ol' ? { start: String(baseStart + itemOffset) } : undefined
      chunks.push({
        html: `${buildOpenTag(list, overrides)}${currentItems.join('')}</${tag}>`,
        height: currentHeight,
      })
      itemOffset += currentItems.length
      currentItems = []
      currentHeight = 0
      available = fullHeight
    }

    currentItems.push(item.outerHTML)
    currentHeight += itemHeight
  }

  if (currentItems.length > 0) {
    // Fusionner avec le fragment précédent si orphelin
    if (currentItems.length < MIN_ITEMS_PER_CHUNK && chunks.length > 0) {
      const prev = chunks.pop()!
      const prevOffset = itemOffset - (prev.html.match(/<li/g) || []).length
      const prevOverrides =
        tag === 'ol' ? { start: String(baseStart + prevOffset) } : undefined
      const allItems = prev.html
        .replace(new RegExp(`</${tag}>$`), '')
        .replace(
          new RegExp(`^${escapeRegExp(buildOpenTag(list, prevOverrides))}`),
          '',
        )
      chunks.push({
        html: `${buildOpenTag(list, prevOverrides)}${allItems}${currentItems.join('')}</${tag}>`,
        height: prev.height + currentHeight,
      })
    } else {
      const overrides =
        tag === 'ol' && itemOffset > 0
          ? { start: String(baseStart + itemOffset) }
          : undefined
      chunks.push({
        html: `${buildOpenTag(list, overrides)}${currentItems.join('')}</${tag}>`,
        height: currentHeight,
      })
    }
  }

  return chunks
}

/* ─── Dispatch de découpage ─── */

/**
 * Vérifie si un élément est découpable ET assez grand pour justifier un
 * découpage.
 */
function canSplit(el: Element): boolean {
  const tag = el.tagName.toLowerCase()
  if (tag === 'table')
    return getTableRows(el as HTMLTableElement).length > MIN_TABLE_ROWS_TO_SPLIT
  if (tag === 'ul' || tag === 'ol')
    return (
      getListItems(el as HTMLUListElement | HTMLOListElement).length >
      MIN_LIST_ITEMS_TO_SPLIT
    )
  return false
}

function splitElement(
  el: Element,
  firstAvailable: number,
  fullHeight: number,
  mesure: Mesure,
): Chunk[] {
  const tag = el.tagName.toLowerCase()
  if (tag === 'table')
    return splitTable(
      el as HTMLTableElement,
      firstAvailable,
      fullHeight,
      mesure,
    )
  if (tag === 'ul' || tag === 'ol')
    return splitList(
      el as HTMLUListElement | HTMLOListElement,
      firstAvailable,
      fullHeight,
      mesure,
    )
  return [{ html: el.outerHTML, height: mesure(el) }]
}

/* ─── Paginateur principal ─── */

interface PageEl {
  html: string
  height: number
  tag: string
}

/**
 * Découpe les enfants directs de `container` en pages de `maxHeightPx` au
 * plus. `mesure` rend la hauteur extérieure d'un élément (par défaut la
 * mesure réelle du navigateur ; injectée par les tests).
 */
export function paginate(
  container: Element,
  maxHeightPx: number,
  mesure: Mesure = getOuterHeight,
): PageData[] {
  const children = Array.from(container.children)
  if (children.length === 0) return [{ html: '' }]

  /**
   * Espace minimum requis après un heading pour ne pas l'orpheliner.
   * 15 % de la hauteur de page ≈ 37mm ≈ 7 lignes de texte.
   */
  const MIN_AFTER_HEADING = maxHeightPx * 0.15

  const pages: PageData[] = []
  let els: PageEl[] = []
  let accHeight = 0

  function finalizePage() {
    if (els.length > 0) {
      pages.push({ html: els.map((e) => e.html).join('') })
    }
    els = []
    accHeight = 0
  }

  function addEl(html: string, height: number, tag: string) {
    els.push({ html, height, tag })
    accHeight += height
  }

  function isOnlyHeadings(): boolean {
    return els.length > 0 && els.every((e) => isHeading(e.tag))
  }

  function removeTrailingHeadings(): PageEl[] {
    const orphans: PageEl[] = []
    while (els.length > 0 && isHeading(els[els.length - 1].tag)) {
      if (isOnlyHeadings()) break
      const removed = els.pop()!
      accHeight -= removed.height
      orphans.unshift(removed)
    }
    return orphans
  }

  function handleSplittableOverflow(child: Element, tag: string) {
    const remaining = maxHeightPx - accHeight
    const chunks = splitElement(child, remaining, maxHeightPx, mesure)

    for (let c = 0; c < chunks.length; c++) {
      if (c === 0) {
        els.push({ html: chunks[c].html, height: chunks[c].height, tag })
        accHeight += chunks[c].height
        if (chunks.length > 1) {
          finalizePage()
        }
      } else if (c < chunks.length - 1) {
        pages.push({ html: chunks[c].html })
      } else {
        addEl(chunks[c].html, chunks[c].height, tag)
      }
    }
  }

  for (const child of children) {
    const tag = child.tagName.toLowerCase()

    // ─── Saut de page forcé (`===` seul sur une ligne) ───
    if ((child as HTMLElement).dataset.pageBreak) {
      finalizePage()
      continue
    }

    const childHeight = mesure(child)

    // ─── Page vide : premier élément ───
    if (accHeight === 0) {
      if (canSplit(child) && childHeight > maxHeightPx) {
        handleSplittableOverflow(child, tag)
        continue
      }
      addEl(child.outerHTML, childHeight, tag)
      continue
    }

    // ─── Proactif : heading avec pas assez d'espace pour du contenu après ───
    if (isHeading(tag)) {
      const remainingAfter = maxHeightPx - accHeight - childHeight
      if (remainingAfter < MIN_AFTER_HEADING) {
        const orphans = removeTrailingHeadings()
        finalizePage()
        for (const o of orphans) addEl(o.html, o.height, o.tag)
        addEl(child.outerHTML, childHeight, tag)
        continue
      }
    }

    // ─── L'élément tient sur la page courante ───
    if (accHeight + childHeight <= maxHeightPx) {
      addEl(child.outerHTML, childHeight, tag)
      continue
    }

    // ─── L'élément ne tient pas ───

    // Headings seuls sur la page — ne jamais les laisser seuls
    if (isOnlyHeadings()) {
      if (canSplit(child)) {
        handleSplittableOverflow(child, tag)
      } else {
        addEl(child.outerHTML, childHeight, tag)
      }
      continue
    }

    // Retirer TOUS les headings orphelins en fin de page
    const orphans = removeTrailingHeadings()
    finalizePage()
    for (const o of orphans) addEl(o.html, o.height, o.tag)

    // Élément découpable qui ne tient pas
    if (canSplit(child) && childHeight > maxHeightPx - accHeight) {
      handleSplittableOverflow(child, tag)
      continue
    }

    addEl(child.outerHTML, childHeight, tag)
  }

  finalizePage()
  return pages
}
