/*
 * Génération d'un document PDF « Feuille de suivi parking » — une grille par
 * jour, calquée sur le formulaire papier existant (colonnes Place / NOM /
 * N°de # / Facturé? / Check in / Check out, 14 places, 13 & 14 = personnel,
 * grisées). Chaque grille est PRÉ-REMPLIE avec les ARRIVÉES du jour (une ligne
 * sur la place réservée), les cellules restantes vides à compléter à la main.
 *
 * Mode PAYSAGE, deux tableaux par page → quatre jours sur deux pages. Rendu
 * VECTORIEL via jsPDF, chargé en import() DYNAMIQUE (lib lourde, hors du premier
 * rendu — convention perf du projet). Même patron d'impression que caisse /
 * rapro / repjour : autoPrint + iframe caché recyclé.
 */

import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { jsPDF } from 'jspdf'

import { FIRST_STAFF_SPOT, SPOTS_LIST } from '#/lib/parking/model.ts'

/** Une ligne pré-remplie (une arrivée) d'une feuille de suivi. */
export interface ParkingSheetRow {
  spot: number
  nom: string
  numero?: string
  facture?: string
  checkIn?: string
  checkOut?: string
}

/** Une feuille (un jour) : sa date + les arrivées à placer. */
export interface ParkingSheetDay {
  date: Date
  rows: ParkingSheetRow[]
}

export interface ParkingSheetPdfData {
  days: ParkingSheetDay[]
}

/** Ouvre un PDF déjà rendu dans la fenêtre d'impression, via un iframe caché
 * recyclé (aucun téléchargement). Même harnais que les autres documents. */
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

/** Construit le document PDF (jsPDF), sans l'imprimer. Séparé pour l'aperçu/test. */
export async function buildParkingSheetPdf(
  data: ParkingSheetPdfData,
  title: string,
): Promise<jsPDF> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  pdf.setProperties({ title })
  renderSheets(pdf, data)
  return pdf
}

/** Génère les feuilles de suivi et ouvre l'impression. */
export async function printParkingSheets(
  data: ParkingSheetPdfData,
  title: string,
): Promise<void> {
  const pdf = await buildParkingSheetPdf(data, title)
  openPrintablePdf(pdf, 'parking-print-frame')
}

// --- Géométrie (A4 paysage : 297 × 210 mm) ---------------------------------
const MARGIN = 12
const GAP = 13 // espace entre les deux tableaux d'une page
const TABLE_W = (297 - 2 * MARGIN - GAP) / 2 // 130
const PER_PAGE = 2

type RGB = [number, number, number]
const INK: RGB = [26, 26, 26]
const GRID: RGB = [70, 70, 70]
const BAND: RGB = [216, 216, 216] // bandeau titre gris
const HEAD: RGB = [238, 238, 238] // fond des en-têtes de colonnes
const STAFF: RGB = [223, 223, 223] // lignes 13 & 14 (personnel)

const COLS: { key: keyof ParkingSheetRow | null; label: string; w: number; align: 'left' | 'center' }[] = [
  { key: null, label: 'Place', w: 14, align: 'center' },
  { key: 'nom', label: 'NOM', w: 44, align: 'left' },
  { key: 'numero', label: 'N°de #', w: 21, align: 'center' },
  { key: 'facture', label: 'Facturé?', w: 18, align: 'center' },
  { key: 'checkIn', label: 'Check in', w: 16, align: 'center' },
  { key: 'checkOut', label: 'Check out', w: 17, align: 'center' },
]

const setFill = (pdf: jsPDF, c: RGB) => pdf.setFillColor(c[0], c[1], c[2])
const setDraw = (pdf: jsPDF, c: RGB) => pdf.setDrawColor(c[0], c[1], c[2])
const setText = (pdf: jsPDF, c: RGB) => pdf.setTextColor(c[0], c[1], c[2])

function renderSheets(pdf: jsPDF, { days }: ParkingSheetPdfData): void {
  days.forEach((day, i) => {
    if (i > 0 && i % PER_PAGE === 0) pdf.addPage()
    const col = i % PER_PAGE // 0 = gauche, 1 = droite
    const x = MARGIN + col * (TABLE_W + GAP)
    drawSheet(pdf, x, day)
  })
}

/** Un tableau (un jour) à l'abscisse `x`, pleine hauteur de page. */
function drawSheet(pdf: jsPDF, x: number, day: ParkingSheetDay): void {
  const W = TABLE_W
  const bySpot = new Map<number, ParkingSheetRow>()
  day.rows.forEach((r) => bySpot.set(r.spot, r))

  // --- « Date : <jour> » ---------------------------------------------------
  const label = format(day.date, 'EEEE d MMMM yyyy', { locale: fr })
  const dateLabel = label.charAt(0).toUpperCase() + label.slice(1)
  setText(pdf, INK)
  pdf.setFont('helvetica', 'normal').setFontSize(11)
  pdf.text('Date : ', x, 13)
  pdf.setFont('helvetica', 'bold')
  pdf.text(dateLabel, x + pdf.getTextWidth('Date : '), 13)

  // --- Bandeau titre gris --------------------------------------------------
  const bandY = 16
  const bandH = 9
  setFill(pdf, BAND)
  setDraw(pdf, GRID)
  pdf.setLineWidth(0.3)
  pdf.rect(x, bandY, W, bandH, 'FD')
  setText(pdf, INK)
  pdf.setFont('helvetica', 'bold').setFontSize(11)
  pdf.text('FEUILLE DE SUIVI PARKING', x + W / 2, bandY + bandH / 2 + 1.6, {
    align: 'center',
  })

  // --- Grille : en-tête + 14 lignes ---------------------------------------
  const headY = bandY + bandH
  const headH = 8
  const nRows = SPOTS_LIST.length
  const rowH = 11.6
  const gridTop = headY
  const gridBottom = headY + headH + nRows * rowH

  // Fond de l'en-tête de colonnes.
  setFill(pdf, HEAD)
  pdf.rect(x, headY, W, headH, 'F')

  // Fond grisé des lignes « personnel » (13 & 14).
  SPOTS_LIST.forEach((spot, r) => {
    if (spot >= FIRST_STAFF_SPOT) {
      setFill(pdf, STAFF)
      pdf.rect(x, headY + headH + r * rowH, W, rowH, 'F')
    }
  })

  // Bords de colonnes (abscisses cumulées).
  let cx = x
  const xs = [x]
  COLS.forEach((c) => {
    cx += c.w
    xs.push(cx)
  })

  // Filets : verticales + horizontales.
  setDraw(pdf, GRID)
  pdf.setLineWidth(0.3)
  xs.forEach((vx) => pdf.line(vx, gridTop, vx, gridBottom))
  pdf.line(x, gridTop, x + W, gridTop)
  pdf.line(x, headY + headH, x + W, headY + headH)
  SPOTS_LIST.forEach((_, r) => {
    const ly = headY + headH + (r + 1) * rowH
    pdf.line(x, ly, x + W, ly)
  })

  // En-têtes de colonnes.
  setText(pdf, INK)
  pdf.setFont('helvetica', 'bold').setFontSize(8)
  COLS.forEach((c, i) => {
    const ty = headY + headH / 2 + 1.4
    if (c.align === 'left') pdf.text(c.label, xs[i] + 2.5, ty)
    else pdf.text(c.label, xs[i] + c.w / 2, ty, { align: 'center' })
  })

  // Lignes : n° de place + arrivées pré-remplies.
  SPOTS_LIST.forEach((spot, r) => {
    const ty = headY + headH + r * rowH + rowH / 2 + 1.4
    setText(pdf, INK)
    pdf.setFont('helvetica', 'bold').setFontSize(10)
    pdf.text(String(spot), xs[0] + COLS[0].w / 2, ty, { align: 'center' })

    const row = bySpot.get(spot)
    if (!row) return
    pdf.setFont('helvetica', 'normal').setFontSize(8.5)
    COLS.forEach((c, i) => {
      if (!c.key) return
      const raw = row[c.key]
      if (raw == null || raw === '') return
      const value = String(raw)
      if (c.align === 'left') {
        // Nom : tronqué à la largeur de colonne (pas de retour à la ligne).
        const fitted = (pdf.splitTextToSize(value, c.w - 4) as string[])[0]
        pdf.text(fitted, xs[i] + 2.5, ty)
      } else {
        pdf.text(value, xs[i] + c.w / 2, ty, { align: 'center' })
      }
    })
  })
}
