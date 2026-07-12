/*
 * Génération d'un document PDF du rapport journalier, ouvert directement dans
 * la fenêtre d'impression du navigateur (aucun téléchargement).
 *
 * Rendu VECTORIEL via jsPDF, chargé en import() DYNAMIQUE (lib lourde, hors du
 * premier rendu — convention perf du projet). Même patron d'impression que la
 * caisse (`src/lib/caisse/pdf.ts`) et le rapprochement (`src/lib/rapro/pdf.ts`) :
 * autoPrint + iframe caché recyclé.
 *
 * Le document reprend le contenu de l'écran, mais avec le STYLE DOCUMENT propre
 * aux PDF de l'app (pas le look web : ni cartes arrondies, ni bandeau coloré) :
 * en-tête centré + filet, bandeau de compteurs bordés, sections titrées à filets
 * fins, écarts colorés (vert/rouge) comme la caisse. Ordre :
 *   en-tête (titre + date)
 *   → compteurs de synthèse (revenu / RevPAR / TO projetés vs budget, + pickup)
 *   → progression du mois (acquis / jour / projeté vs budget + répartition)
 *   → détail par indicateur (Jour / Cumul / Projeté / Budget / Écart)
 *   → alertes éventuelles.
 */

import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { jsPDF } from 'jspdf'

import { fmt } from '#/lib/repjour/format.ts'
import type { Alert, Ecart, KPIBlock, MonthBudget } from '#/lib/repjour/types.ts'

export interface RepjourPdfData {
  /** Date en toutes lettres (ex. « lundi 7 juillet 2026 »). */
  titleDate: string
  /** Réalisé du jour — `null` en données partielles (prévision seule). */
  realiseJour: KPIBlock | null
  /** Cumul mois à date — `null` en données partielles. */
  realiseMTD: KPIBlock | null
  /** Projeté fin de mois — `null` si non disponible. */
  projeteMois: KPIBlock | null
  budget: MonthBudget
  /** Écart projeté vs budget — `null` si non calculable. */
  ecart: Ecart | null
  /** « Pris depuis la veille » (euros) — `null`/absent → compteur masqué. */
  pickup?: number | null
  /** Alertes du rapport (erreurs / avertissements). */
  alerts?: Alert[]
  /** Horodatage d'import du rapport (petite mention de pied). */
  importedAt?: string | null
}

/** Ouvre un PDF déjà rendu dans la fenêtre d'impression, via un iframe caché
 * recyclé (aucun téléchargement). Même harnais que caisse / rapro. */
function openPrintablePdf(pdf: jsPDF, frameId: string): void {
  pdf.autoPrint()
  const blobUrl = pdf.output('bloburl').toString()
  document.getElementById(frameId)?.remove()
  const iframe = document.createElement('iframe')
  iframe.id = frameId
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  iframe.src = blobUrl
  document.body.appendChild(iframe)
}

/** Construit le document PDF (jsPDF) du rapport, sans l'imprimer. Séparé de
 * l'impression pour être réutilisable (aperçu, test). */
export async function buildRepjourPdf(
  data: RepjourPdfData,
  title: string,
): Promise<jsPDF> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  pdf.setProperties({ title })
  renderReportDocument(pdf, data)
  return pdf
}

/** Génère le PDF du rapport du jour et ouvre l'impression. */
export async function printRepjourReport(
  data: RepjourPdfData,
  title: string,
): Promise<void> {
  const pdf = await buildRepjourPdf(data, title)
  openPrintablePdf(pdf, 'repjour-print-frame')
}

// --- Géométrie -------------------------------------------------------------
const LEFT = 15
const RIGHT = 195
const CENTER = 105
const CONTENT_W = RIGHT - LEFT // 180
const LABEL_R = 63 // fin de la colonne « libellé » du tableau
const PAD = 2

type RGB = [number, number, number]

// --- Palette DOCUMENT (sobre, calquée sur caisse / rapro) ------------------
const INK: RGB = [26, 26, 26]
const GRAY: RGB = [110, 110, 110] // mini-libellés, mentions
const GRAY2: RGB = [90, 90, 90] // en-têtes de colonnes
const BORDER: RGB = [210, 210, 214] // cadres de compteurs
const HAIR: RGB = [228, 228, 232] // filets fins entre lignes
const RULE: RGB = [51, 51, 51] // filet fort (sous l'en-tête)
// Écarts : mêmes teintes que la caisse (cohérence entre les PDF de l'app).
const POS: RGB = [18, 122, 46]
const NEG: RGB = [180, 35, 24]
// Répartition du mois (données) — vert / or / gris / rouge.
const ACQUIS: RGB = [18, 122, 46]
const JOUR: RGB = [204, 150, 20]
const PROJETE: RGB = [150, 150, 158]
const AMBER: RGB = [176, 120, 10] // avertissement

const setFill = (pdf: jsPDF, c: RGB) => pdf.setFillColor(c[0], c[1], c[2])
const setDraw = (pdf: jsPDF, c: RGB) => pdf.setDrawColor(c[0], c[1], c[2])
const setText = (pdf: jsPDF, c: RGB) => pdf.setTextColor(c[0], c[1], c[2])

/** Remplace les espaces fines / insécables (U+202F, U+00A0) des nombres
 * `fr-FR` par une espace ordinaire : les polices standard de jsPDF ne les
 * connaissent pas et les rendraient comme un glyphe parasite (« 282/100 »). */
const T = (s: string) => s.replace(/[\u202F\u00A0]/g, ' ')

/** Lignes du tableau, calquées sur `KPITable` (même ordre, mêmes formats). */
const ROWS: {
  label: string
  key: keyof KPIBlock
  budgetKey: keyof MonthBudget
  ecartKey: keyof Ecart
  fmtVal: (n: number) => string
  fmtEcart: (n: number) => string
}[] = [
  {
    label: 'Nuitées',
    key: 'nuitees',
    budgetKey: 'nuitees',
    ecartKey: 'nuitees',
    fmtVal: fmt.nuitees,
    fmtEcart: fmt.ecartNuitees,
  },
  {
    label: 'Taux occupation',
    key: 'to',
    budgetKey: 'taux_occupation',
    ecartKey: 'to',
    fmtVal: fmt.pct,
    fmtEcart: (n) => (n >= 0 ? '+' : '') + fmt.pct(n),
  },
  {
    label: 'Prix moyen',
    key: 'pm',
    budgetKey: 'prix_moyen',
    ecartKey: 'pm',
    fmtVal: fmt.eur,
    fmtEcart: fmt.ecartEur,
  },
  {
    label: 'RevPAR',
    key: 'revpar',
    budgetKey: 'revpar',
    ecartKey: 'revpar',
    fmtVal: fmt.eur,
    fmtEcart: fmt.ecartEur,
  },
  {
    label: "Chiffre d'affaires",
    key: 'roomRevenue',
    budgetKey: 'room_revenue',
    ecartKey: 'roomRevenue',
    fmtVal: fmt.eurInt,
    fmtEcart: fmt.ecartEurInt,
  },
]

const COL_HEADERS = ['Jour', 'Cumul', 'Projeté', 'Budget', 'Écart']
const COL_W = (RIGHT - LABEL_R) / COL_HEADERS.length

/** Bord droit (aligné à droite) de la colonne de valeur d'indice `i`. */
function colRight(i: number): number {
  return LABEL_R + COL_W * (i + 1) - PAD
}

/** Titre de section : petit libellé en capitales + filet fin pleine largeur. */
function sectionTitle(pdf: jsPDF, y: number, label: string): number {
  setText(pdf, GRAY2)
  pdf.setFont('helvetica', 'bold').setFontSize(8)
  pdf.text(label, LEFT, y, { charSpace: 0.4 })
  setDraw(pdf, HAIR)
  pdf.setLineWidth(0.2).line(LEFT, y + 1.8, RIGHT, y + 1.8)
  return y + 7
}

function renderReportDocument(pdf: jsPDF, data: RepjourPdfData): void {
  const {
    titleDate,
    realiseJour,
    realiseMTD,
    projeteMois,
    budget,
    ecart,
    pickup,
    alerts,
    importedAt,
  } = data

  // ===== En-tête : titre (petit) + date (grande, gras) + filet ============
  let y = 21
  setText(pdf, INK)
  pdf.setFont('helvetica', 'normal').setFontSize(12)
  pdf.text('RAPPORT JOURNALIER', CENTER, y, { align: 'center' })
  y += 11
  pdf.setFont('helvetica', 'bold').setFontSize(20)
  const title = titleDate.charAt(0).toUpperCase() + titleDate.slice(1)
  pdf.text(title, CENTER, y, { align: 'center' })
  y += 5
  setDraw(pdf, RULE)
  pdf.setLineWidth(0.4).line(LEFT, y, RIGHT, y)
  y += 10

  // ===== Compteurs de synthèse (cellules bordées, façon rapro) ============
  const cells: { label: string; value: string; sub?: string; color?: RGB }[] = [
    {
      label: 'Revenu hébergement',
      value: fmt.eurInt(projeteMois?.roomRevenue ?? 0),
      sub: fmt.eurInt(budget.room_revenue),
    },
    {
      label: 'Revenu moyen / chambre',
      value: fmt.eurInt(projeteMois?.revpar ?? 0),
      sub: fmt.eurInt(budget.revpar),
    },
    {
      label: "Taux d'occupation",
      value: fmt.pct(projeteMois?.to ?? 0),
      sub: fmt.pct(budget.taux_occupation),
    },
  ]
  if (typeof pickup === 'number') {
    cells.push({
      label: 'Pris depuis la veille',
      value: fmt.ecartEurInt(pickup),
      color: pickup >= 0 ? POS : NEG,
    })
  }

  const gap = 3
  const cw = (CONTENT_W - gap * (cells.length - 1)) / cells.length
  const ch = 18
  cells.forEach((c, i) => {
    const cx = LEFT + i * (cw + gap)
    setDraw(pdf, BORDER)
    pdf.setLineWidth(0.25)
    pdf.rect(cx, y, cw, ch)
    setText(pdf, GRAY)
    pdf.setFont('helvetica', 'normal').setFontSize(6.3)
    pdf.text(c.label.toUpperCase(), cx + 3, y + 4.7, { maxWidth: cw - 5 })
    setText(pdf, c.color ?? INK)
    pdf.setFont('helvetica', 'bold').setFontSize(13)
    pdf.text(T(c.value), cx + 3, y + 12)
    if (c.sub) {
      setText(pdf, GRAY)
      pdf.setFont('helvetica', 'normal').setFontSize(7)
      pdf.text(T(`/ ${c.sub}`), cx + 3, y + 16)
    }
  })
  y += ch + 10

  // ===== Progression du mois ==============================================
  const partial = !realiseJour
  const caJour = !partial && realiseJour ? realiseJour.roomRevenue : 0
  const acquis = realiseMTD?.roomRevenue ?? 0
  const precedent = Math.max(0, acquis - caJour)
  const projete = Math.max(0, (projeteMois?.roomRevenue ?? 0) - acquis)
  const totalv = acquis + projete
  const progress =
    budget.room_revenue > 0 ? (totalv / budget.room_revenue) * 100 : 0
  const over = progress > 100
  const maxScale = over ? progress * 1.15 : 100
  const frac = (v: number) =>
    budget.room_revenue > 0 ? (v / budget.room_revenue) * 100 / maxScale : 0

  setText(pdf, GRAY2)
  pdf.setFont('helvetica', 'bold').setFontSize(8)
  pdf.text('PROGRESSION DU MOIS', LEFT, y, { charSpace: 0.4 })
  setText(pdf, INK)
  pdf.setFont('helvetica', 'bold').setFontSize(9)
  pdf.text(`${Math.round(progress)} %`, RIGHT, y, { align: 'right' })
  y += 3

  // Barre plate (segments francs, coins droits — élément de graphe, pas widget).
  const barY = y
  const barH = 2.8
  setFill(pdf, HAIR)
  pdf.rect(LEFT, barY, CONTENT_W, barH, 'F')
  let sx = LEFT
  const seg = (v: number, c: RGB) => {
    const w = CONTENT_W * frac(v)
    if (w <= 0.1) return
    setFill(pdf, c)
    pdf.rect(sx, barY, w, barH, 'F')
    sx += w
  }
  seg(precedent, ACQUIS)
  seg(caJour, JOUR)
  seg(projete, PROJETE)
  if (over) {
    const gx = LEFT + CONTENT_W * (100 / maxScale)
    setFill(pdf, INK)
    pdf.rect(gx - 0.2, barY - 1, 0.4, barH + 2, 'F')
  }
  y += barH + 5

  // Répartition : petits carrés + libellé + montant (façon légende rapro).
  const parts: { label: string; amount: string; color: RGB }[] = []
  if (precedent > 0)
    parts.push({ label: 'Acquis', amount: fmt.eurInt(precedent), color: ACQUIS })
  if (!partial && caJour > 0)
    parts.push({ label: 'Jour', amount: fmt.eurInt(caJour), color: JOUR })
  if (projete > 0)
    parts.push({ label: 'Projeté', amount: fmt.eurInt(projete), color: PROJETE })
  if (totalv < budget.room_revenue)
    parts.push({
      label: 'Reste',
      amount: fmt.eurInt(budget.room_revenue - totalv),
      color: NEG,
    })
  let lx = LEFT
  pdf.setFont('helvetica', 'normal').setFontSize(7.5)
  parts.forEach((p) => {
    setFill(pdf, p.color)
    setDraw(pdf, p.color)
    pdf.setLineWidth(0.2).rect(lx, y - 2.3, 2.4, 2.4, 'FD')
    setText(pdf, GRAY2)
    const label = `${p.label} `
    pdf.text(label, lx + 3.4, y)
    const lw = pdf.getTextWidth(label)
    setText(pdf, INK)
    const amount = T(p.amount)
    pdf.text(amount, lx + 3.4 + lw, y)
    lx += 3.4 + lw + pdf.getTextWidth(amount) + 8
  })
  y += 10

  // ===== Détail par indicateur ============================================
  y = sectionTitle(pdf, y, 'DÉTAIL PAR INDICATEUR')

  // En-têtes de colonnes.
  setText(pdf, GRAY2)
  pdf.setFont('helvetica', 'bold').setFontSize(7.5)
  pdf.text('INDICATEUR', LEFT, y)
  COL_HEADERS.forEach((h, i) =>
    pdf.text(h.toUpperCase(), colRight(i), y, { align: 'right' }),
  )
  y += 2
  setDraw(pdf, RULE)
  pdf.setLineWidth(0.25).line(LEFT, y, RIGHT, y)
  y += 6

  const rowH = 8.4
  ROWS.forEach((row) => {
    setText(pdf, INK)
    pdf.setFont('helvetica', 'bold').setFontSize(9)
    pdf.text(row.label, LEFT, y)
    pdf.setFont('helvetica', 'normal')
    const jour = realiseJour ? T(row.fmtVal(realiseJour[row.key])) : '—'
    const cumul = realiseMTD ? T(row.fmtVal(realiseMTD[row.key])) : '—'
    const proj = projeteMois ? T(row.fmtVal(projeteMois[row.key])) : '—'
    pdf.text(jour, colRight(0), y, { align: 'right' })
    pdf.text(cumul, colRight(1), y, { align: 'right' })
    pdf.text(proj, colRight(2), y, { align: 'right' })
    pdf.text(T(row.fmtVal(budget[row.budgetKey])), colRight(3), y, {
      align: 'right',
    })
    if (ecart) {
      const v = ecart[row.ecartKey]
      pdf.setFont('helvetica', 'bold')
      setText(pdf, v >= 0 ? POS : NEG)
      pdf.text(T(row.fmtEcart(v)), colRight(4), y, { align: 'right' })
    } else {
      setText(pdf, GRAY)
      pdf.text('—', colRight(4), y, { align: 'right' })
    }
    // Filet fin de séparation, façon registre.
    setDraw(pdf, HAIR)
    pdf.setLineWidth(0.15).line(LEFT, y + 2.6, RIGHT, y + 2.6)
    y += rowH
  })

  y += 0.5
  setText(pdf, GRAY)
  pdf.setFont('helvetica', 'italic').setFontSize(7.5)
  pdf.text('Montants TTC', RIGHT, y, { align: 'right' })
  y += 8

  // ===== Alertes ==========================================================
  const list = alerts ?? []
  if (list.length > 0) {
    y = sectionTitle(pdf, y, 'ALERTES')
    list.forEach((a) => {
      const color = a.type === 'error' ? NEG : AMBER
      pdf.setFont('helvetica', 'normal').setFontSize(8.5)
      const lines = pdf.splitTextToSize(a.message, CONTENT_W - 6) as string[]
      setFill(pdf, color)
      pdf.rect(LEFT, y - 2.3, 2.2, 2.2, 'F')
      setText(pdf, INK)
      pdf.text(lines, LEFT + 5, y)
      y += lines.length * 4.4 + 2.5
    })
  }

  // ===== Pied : horodatage d'import =======================================
  if (importedAt) {
    const when = format(new Date(importedAt), "d MMMM yyyy 'à' HH'h'mm", {
      locale: fr,
    })
    setText(pdf, GRAY)
    pdf.setFont('helvetica', 'normal').setFontSize(8)
    pdf.text(`Rapport importé le ${when}`, LEFT, 287)
  }
}
