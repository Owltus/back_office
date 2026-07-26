/*
 * Impression PDF des pages analytique (annuelles ET mensuelles) — un SEUL
 * générateur pour les 10 pages, puisqu'elles partagent le même socle
 * (AnalytiqueShell : cartes de synthèse + tableau + graphiques).
 *
 * Même modèle que les autres PDF de l'app (caisse / repjour / rapro) : rendu
 * VECTORIEL via jsPDF chargé en import() DYNAMIQUE, style DOCUMENT sobre (en-tête
 * centré + filet, cartes en cellules bordées, tableau à filets fins), et le même
 * harnais d'impression — autoPrint + iframe caché recyclé, aucun téléchargement.
 *
 * Les données ne sont pas re-calculées : on LIT ce qui est déjà rendu à l'écran
 * (cartes via les classes stables `stat-tile__*`, tableau via <table>, graphes via
 * le <svg> Recharts). Ainsi le PDF colle toujours à la page, et toute page
 * analytique future en hérite sans code supplémentaire. Le graphe est intégré en
 * BEST-EFFORT (rasterisation du SVG) : s'il échoue, le PDF sort quand même, cartes
 * et tableau en tête.
 */

import type { jsPDF } from 'jspdf'

type RGB = [number, number, number]

// Palette DOCUMENT, identique aux autres PDF de l'app (cohérence inter-documents).
const INK: RGB = [26, 26, 26]
const GRAY: RGB = [110, 110, 110]
const GRAY2: RGB = [90, 90, 90]
const BORDER: RGB = [210, 210, 214]
const HAIR: RGB = [228, 228, 232]
const RULE: RGB = [51, 51, 51]
const POS: RGB = [18, 122, 46]
const NEG: RGB = [180, 35, 24]
const AMBER: RGB = [176, 120, 10]

const setDraw = (pdf: jsPDF, c: RGB) => pdf.setDrawColor(c[0], c[1], c[2])
const setText = (pdf: jsPDF, c: RGB) => pdf.setTextColor(c[0], c[1], c[2])

/** Les espaces fines / insécables (U+202F, U+00A0) des nombres fr-FR ne sont pas
 * connues des polices standard jsPDF : on les remplace par une espace ordinaire. */
const T = (s: string) => s.replace(/\s+/g, ' ').trim()

// --- Lecture de la page (DOM) ---------------------------------------------

type Tone = 'ink' | 'muted' | 'pos' | 'neg' | 'amber'

interface PdfCard {
  label: string
  value: string
  sub?: string
}
interface PdfCell {
  text: string
  tone: Tone
  bold: boolean
}
interface PdfTable {
  columns: string[]
  rows: PdfCell[][]
}
interface PdfChart {
  title: string
  dataUrl: string
  ratio: number
}
export interface AnalytiqueExtract {
  cards: PdfCard[]
  table: PdfTable | null
  charts: PdfChart[]
}

/** Déduit le ton d'une cellule/valeur à partir des classes de couleur Tailwind
 * portées par l'élément ou l'un de ses descendants (le PDF, sur fond blanc, ne
 * peut pas réutiliser les couleurs sombres de l'écran — on les REMAPPE). */
function toneOf(el: Element): Tone {
  const cls =
    el.className +
    ' ' +
    Array.from(el.querySelectorAll('*'))
      .map((e) => (e as HTMLElement).className || '')
      .join(' ')
  if (/destructive/.test(cls)) return 'neg'
  if (/emerald|green/.test(cls)) return 'pos'
  if (/amber|yellow/.test(cls)) return 'amber'
  if (/muted-foreground/.test(cls)) return 'muted'
  return 'ink'
}

function isBold(el: Element): boolean {
  const cls =
    el.className +
    ' ' +
    Array.from(el.querySelectorAll('*'))
      .map((e) => (e as HTMLElement).className || '')
      .join(' ')
  return /font-(medium|semibold|bold)/.test(cls)
}

/** Rasterise un <svg> (graphe Recharts) en PNG data URI, couleurs RÉSOLUES et
 * baked (les `var(--chart-*)` de l'écran ne survivraient pas hors du document),
 * sur fond BLANC (le PDF n'a pas de fond sombre). Best-effort : lève en cas de
 * souci, l'appelant ignore alors le graphe. */
async function rasterizeChartSvg(
  svg: SVGSVGElement,
): Promise<{ dataUrl: string; ratio: number }> {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const orig = [svg, ...svg.querySelectorAll('*')]
  const copy = [clone, ...clone.querySelectorAll('*')]
  orig.forEach((o, i) => {
    const c = copy[i]
    if (!(o instanceof Element) || !(c instanceof Element)) return
    const cs = getComputedStyle(o)
    for (const prop of ['fill', 'stroke'] as const) {
      const v = cs.getPropertyValue(prop)
      if (v && v !== 'none') c.setAttribute(prop, v)
    }
    const sw = cs.getPropertyValue('stroke-width')
    if (sw) c.setAttribute('stroke-width', sw)
  })

  const rect = svg.getBoundingClientRect()
  const w = Math.max(1, Math.round(svg.clientWidth || rect.width || 520))
  const h = Math.max(1, Math.round(svg.clientHeight || rect.height || 240))
  clone.setAttribute('width', String(w))
  clone.setAttribute('height', String(h))

  const xml = new XMLSerializer().serializeToString(clone)
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('SVG du graphe illisible'))
      img.src = url
    })
    const scale = 3
    const canvas = document.createElement('canvas')
    canvas.width = w * scale
    canvas.height = h * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d indisponible')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return { dataUrl: canvas.toDataURL('image/png'), ratio: w / h }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Texte VISIBLE d'un élément : `innerText` ignore les nœuds masqués en CSS —
 * indispensable pour les en-têtes responsive qui contiennent deux libellés (un
 * long visible ≥ sm, un court caché), que `textContent` concaténerait. */
function readText(el: Element | null | undefined): string {
  if (!el) return ''
  const t = (el as HTMLElement).innerText
  return T(t != null && t !== '' ? t : (el.textContent ?? ''))
}

/** Lit les éléments analytique rendus sous `root` (cartes, tableau, graphes) et
 * en fait une structure prête pour le PDF. TOUTES les lignes sont conservées
 * (mois / jours sans donnée compris, en « — ») : le document reflète l'écran. */
export async function extractAnalytique(
  root: HTMLElement,
): Promise<AnalytiqueExtract> {
  // Cartes de synthèse.
  const cards: PdfCard[] = Array.from(
    root.querySelectorAll('.stat-tile'),
  ).map((tile) => {
    const label = readText(tile.querySelector('.stat-tile__label'))
    const valueEl = tile.querySelector('.stat-tile__value')
    // Carte en FRACTION (valeur / référence) : la valeur enveloppe plusieurs
    // spans (valeur, filet, référence) — on les sépare pour ne pas les coller,
    // la référence passant en sous-titre « / objectif » (comme le PDF repjour).
    if (valueEl && valueEl.children.length > 1) {
      const ref = readText(valueEl.lastElementChild)
      return {
        label,
        value: readText(valueEl.firstElementChild),
        sub: ref ? `/ ${ref}` : undefined,
      }
    }
    const sub = readText(valueEl?.nextElementSibling)
    return { label, value: readText(valueEl), sub: sub || undefined }
  })

  // Tableau.
  let table: PdfTable | null = null
  const tableEl = root.querySelector('table')
  if (tableEl) {
    const columns = Array.from(tableEl.querySelectorAll('thead th')).map(
      readText,
    )
    const rows: PdfCell[][] = []
    for (const tr of Array.from(tableEl.querySelectorAll('tbody tr'))) {
      const tds = Array.from(tr.querySelectorAll('td'))
      if (tds.length === 0) continue
      rows.push(
        tds.map((td, i) => ({
          text: readText(td),
          tone: i === 0 ? 'ink' : toneOf(td),
          bold: i === 0 ? true : isBold(td),
        })),
      )
    }
    table = { columns, rows }
  }

  // Graphes (best-effort, rasterisés). On écarte les petits <svg> de la LÉGENDE
  // (icônes ~14 px) qui portent aussi la classe `recharts-surface`.
  const charts: PdfChart[] = []
  const svgs = Array.from(
    root.querySelectorAll<SVGSVGElement>('svg.recharts-surface'),
  ).filter((svg) => (svg.clientWidth || 0) > 100)
  for (const svg of svgs) {
    const title = readText(svg.closest('.rounded-xl')?.querySelector('h3'))
    try {
      const { dataUrl, ratio } = await rasterizeChartSvg(svg)
      charts.push({ title, dataUrl, ratio })
    } catch {
      // Graphe ignoré : le PDF sort quand même avec cartes + tableau.
    }
  }

  return { cards, table, charts }
}

// --- Rendu du document -----------------------------------------------------

const LEFT = 15
const RIGHT = 195
const CENTER = 105
const CONTENT_W = RIGHT - LEFT
const PAGE_BOTTOM = 287

function toneColor(t: Tone): RGB {
  switch (t) {
    case 'muted':
      return GRAY
    case 'pos':
      return POS
    case 'neg':
      return NEG
    case 'amber':
      return AMBER
    default:
      return INK
  }
}

/** Dessine un graphe (titre + image rasterisée) dans la boîte (x, y, w) et renvoie
 * la hauteur totale consommée. L'image est bornée à `maxH` (centrée si bornée). */
function drawChartBlock(
  pdf: jsPDF,
  chart: PdfChart,
  x: number,
  y: number,
  w: number,
  maxH: number,
): number {
  let ty = y
  if (chart.title) {
    setText(pdf, GRAY2)
    pdf.setFont('helvetica', 'bold').setFontSize(7.5)
    pdf.text(chart.title.toUpperCase(), x, ty, { charSpace: 0.3, maxWidth: w })
    ty += 3.5
  }
  let iw = w
  let ih = iw / chart.ratio
  if (ih > maxH) {
    ih = maxH
    iw = ih * chart.ratio
  }
  pdf.addImage(chart.dataUrl, 'PNG', x + (w - iw) / 2, ty, iw, ih)
  return ty - y + ih
}

/** Pose un texte CENTRÉ sur (cx, y), garanti sur UNE seule ligne : la police
 * démarre à `base` et est réduite (jusqu'à `min`) pour tenir dans `maxW`. jsPDF
 * étant linéaire en taille, `base * maxW / largeur` donne la taille exacte qui
 * remplit la largeur ; on la borne à `min` (léger débord toléré au pire). */
function fitCenteredText(
  pdf: jsPDF,
  text: string,
  cx: number,
  y: number,
  maxW: number,
  base: number,
  min: number,
): void {
  pdf.setFontSize(base)
  const w = pdf.getTextWidth(text)
  if (w > maxW) pdf.setFontSize(Math.max(min, (base * maxW) / w))
  pdf.text(text, cx, y, { align: 'center' })
}

function renderDocument(
  pdf: jsPDF,
  printTitle: string,
  { cards, table, charts }: AnalytiqueExtract,
): void {
  let y = 18

  // En-tête : petit label + titre (période) + filet.
  setText(pdf, GRAY2)
  pdf.setFont('helvetica', 'normal').setFontSize(10)
  pdf.text('ANALYTIQUE', CENTER, y, { align: 'center', charSpace: 0.6 })
  y += 8
  setText(pdf, INK)
  pdf.setFont('helvetica', 'bold').setFontSize(18)
  pdf.text(T(printTitle), CENTER, y, { align: 'center' })
  y += 5
  setDraw(pdf, RULE)
  pdf.setLineWidth(0.4).line(LEFT, y, RIGHT, y)
  y += 9

  // Cartes de synthèse (cellules bordées) : tout CENTRÉ — titre sur une seule
  // ligne en haut, valeur au centre, sous-texte dessous.
  if (cards.length > 0) {
    const gap = 3
    const cw = (CONTENT_W - gap * (cards.length - 1)) / cards.length
    const ch = 18
    const usable = cw - 4 // marge latérale intérieure
    // Taille de titre UNIFORME sur toute la rangée = celle qui fait tenir le titre
    // le plus long sur une ligne (rangée homogène plutôt que des tailles panachées).
    pdf.setFont('helvetica', 'bold')
    let titleSize = 6.4
    for (const c of cards) {
      pdf.setFontSize(6.4)
      const w = pdf.getTextWidth(c.label.toUpperCase())
      if (w > usable) titleSize = Math.min(titleSize, Math.max(4.4, (6.4 * usable) / w))
    }
    cards.forEach((c, i) => {
      const cx = LEFT + i * (cw + gap)
      const mid = cx + cw / 2
      setDraw(pdf, BORDER)
      pdf.setLineWidth(0.25).rect(cx, y, cw, ch)
      // Titre centré, une seule ligne, taille uniforme.
      setText(pdf, GRAY)
      pdf.setFont('helvetica', 'bold').setFontSize(titleSize)
      pdf.text(c.label.toUpperCase(), mid, y + 5, { align: 'center' })
      // Valeur centrée, en gras (réduite si très longue, ex. « 1 469 736 € »).
      setText(pdf, INK)
      pdf.setFont('helvetica', 'bold')
      fitCenteredText(pdf, c.value, mid, c.sub ? y + 11.8 : y + 12.6, usable, 12, 8)
      // Sous-texte centré (part du total / objectif).
      if (c.sub) {
        setText(pdf, GRAY)
        pdf.setFont('helvetica', 'normal')
        fitCenteredText(pdf, c.sub, mid, y + 15.6, usable, 6.8, 5)
      }
    })
    y += ch + 9
  }

  // Tableau : TOUS les mois / jours (avec données ou non), comme à l'écran.
  if (table && table.columns.length > 0) {
    const firstW = 26
    const valCols = Math.max(1, table.columns.length - 1)
    const colW = (RIGHT - (LEFT + firstW)) / valCols
    const colRight = (i: number) => LEFT + firstW + colW * (i + 1) - 2

    const header = () => {
      setText(pdf, GRAY2)
      pdf.setFont('helvetica', 'bold').setFontSize(7)
      pdf.text((table.columns[0] ?? '').toUpperCase(), LEFT, y)
      for (let i = 1; i < table.columns.length; i++) {
        pdf.text(table.columns[i].toUpperCase(), colRight(i - 1), y, {
          align: 'right',
          maxWidth: colW - 1,
        })
      }
      y += 2
      setDraw(pdf, RULE)
      pdf.setLineWidth(0.25).line(LEFT, y, RIGHT, y)
      y += 5
    }

    header()
    const rowH = 6.6
    for (const row of table.rows) {
      if (y + rowH > PAGE_BOTTOM) {
        pdf.addPage()
        y = 18
        header()
      }
      const first = row[0]
      setText(pdf, INK)
      pdf.setFont('helvetica', first?.bold ? 'bold' : 'normal').setFontSize(8)
      pdf.text(first?.text ?? '', LEFT, y)
      for (let i = 1; i < row.length; i++) {
        const cell = row[i]
        setText(pdf, toneColor(cell.tone))
        pdf.setFont('helvetica', cell.bold ? 'bold' : 'normal').setFontSize(8)
        pdf.text(cell.text, colRight(i - 1), y, { align: 'right' })
      }
      setDraw(pdf, HAIR)
      pdf.setLineWidth(0.15).line(LEFT, y + 2.3, RIGHT, y + 2.3)
      y += rowH
    }
    y += 4
  }

  // Graphes EN BAS, côte à côte (une seule colonne si un seul graphe). On n'AJOUTE
  // JAMAIS de page pour eux : s'ils ne tiennent pas sous le tableau sur la page
  // courante, on les OMET — le document doit rester d'une seule page (cartes +
  // tableau priment). Ils reviennent dès que la place le permet (vues annuelles).
  if (charts.length > 0) {
    const gap = 6
    const maxH = 55
    const colW = charts.length === 1 ? CONTENT_W : (CONTENT_W - gap) / 2
    const rowHeight = (a: PdfChart, b?: PdfChart) =>
      4 +
      Math.max(
        Math.min(colW / a.ratio, maxH),
        b ? Math.min(colW / b.ratio, maxH) : 0,
      ) +
      6
    let need = 0
    for (let i = 0; i < charts.length; i += 2)
      need += rowHeight(charts[i], charts[i + 1])

    if (y + need <= PAGE_BOTTOM) {
      for (let i = 0; i < charts.length; i += 2) {
        const a = charts[i]
        const b = charts[i + 1]
        const dA = drawChartBlock(pdf, a, LEFT, y, colW, maxH)
        const dB = b
          ? drawChartBlock(pdf, b, LEFT + colW + gap, y, colW, maxH)
          : 0
        y += Math.max(dA, dB) + 6
      }
    }
  }
}

/** Construit le document PDF analytique (sans l'imprimer). */
export async function buildAnalytiquePdf(
  extract: AnalytiqueExtract,
  printTitle: string,
): Promise<jsPDF> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  pdf.setProperties({ title: printTitle })
  renderDocument(pdf, printTitle, extract)
  return pdf
}

/**
 * Lit la page analytique sous `root`, en construit le PDF et ouvre la fenêtre
 * d'impression du navigateur (autoPrint + iframe caché, aucun téléchargement).
 */
export async function printAnalytique(
  root: HTMLElement,
  printTitle: string,
): Promise<void> {
  const extract = await extractAnalytique(root)
  const pdf = await buildAnalytiquePdf(extract, printTitle)
  pdf.autoPrint()
  const blobUrl = pdf.output('bloburl').toString()
  document.getElementById('analytique-print-frame')?.remove()
  const iframe = document.createElement('iframe')
  iframe.id = 'analytique-print-frame'
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  iframe.src = blobUrl
  document.body.appendChild(iframe)
}
