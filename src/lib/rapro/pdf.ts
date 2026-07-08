/*
 * Génération d'un document PDF simple du rapprochement du jour, ouvert
 * directement dans la fenêtre d'impression du navigateur (aucun téléchargement).
 *
 * Rendu VECTORIEL via jsPDF, chargé en import() DYNAMIQUE (lib lourde, hors du
 * premier rendu — convention perf du projet). Même patron que la caisse
 * (`src/lib/caisse/pdf.ts`) : autoPrint + iframe caché recyclé.
 *
 * Structure : en-tête → bandeau de compteurs → tableau complet des chambres par
 * étage (couleurs de statut) → commentaire → deux cadres de signature.
 */

import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { jsPDF } from 'jspdf'

import { FLOORS } from '#/lib/rapro/rooms.ts'
import type { RoomStatus } from '#/lib/rapro/types.ts'

export interface RaproPdfData {
  titleDate: string
  statuses: ReadonlyMap<number, RoomStatus>
  occupied: ReadonlySet<number>
  counts: {
    sold: number
    clean: number
    todo: number
    refus: number
    noshow: number
  }
  comment: string
  validatedAt: string | null
}

/** Génère le PDF et ouvre la fenêtre d'impression du navigateur (iframe caché). */
export async function printRaproSheet(
  data: RaproPdfData,
  title: string,
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  pdf.setProperties({ title })
  renderRaproDocument(pdf, data)
  pdf.autoPrint()
  const blobUrl = pdf.output('bloburl').toString()
  document.getElementById('rapro-print-frame')?.remove()
  const iframe = document.createElement('iframe')
  iframe.id = 'rapro-print-frame'
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  iframe.src = blobUrl
  document.body.appendChild(iframe)
}

const LEFT = 15
const RIGHT = 195
const CENTER = 105
const CONTENT_W = RIGHT - LEFT

type RGB = [number, number, number]

/** Couleur de fond (ou aucune) et de texte d'une case chambre, en couleurs
 * douces adaptées au papier blanc. */
function cellStyle(
  status: RoomStatus,
  isEmpty: boolean,
): { fill: RGB | null; text: RGB } {
  if (status === 'nettoyee') return { fill: [110, 231, 183], text: [6, 78, 59] }
  if (status === 'refus') return { fill: [252, 211, 77], text: [120, 53, 15] }
  if (status === 'noshow') return { fill: [221, 214, 254], text: [76, 29, 149] }
  // non_nettoyee : grisé si non vendue, sinon rouge (occupée à faire).
  if (isEmpty) return { fill: [241, 245, 249], text: [148, 163, 184] }
  return { fill: [254, 202, 202], text: [127, 29, 29] }
}

function renderRaproDocument(
  pdf: jsPDF,
  { titleDate, statuses, occupied, counts, comment, validatedAt }: RaproPdfData,
): void {
  let y = 20

  // --- En-tête : titre (petit) + date (grande, gras) -----------------------
  pdf.setTextColor(26)
  pdf.setFont('helvetica', 'normal').setFontSize(12)
  pdf.text('RAPPROCHEMENT DES CHAMBRES', CENTER, y, { align: 'center' })
  y += 10
  pdf.setFont('helvetica', 'bold').setFontSize(19)
  pdf.text(titleDate, CENTER, y, { align: 'center' })
  y += 5
  pdf.setDrawColor(51).setLineWidth(0.4).line(LEFT, y, RIGHT, y)
  y += 8

  // --- Bandeau de compteurs (5 cases) --------------------------------------
  const cells: Array<[string, number]> = [
    ['Vendues', counts.sold],
    ['Nettoyées', counts.clean],
    ['Non nettoyées', counts.todo],
    ['Refus', counts.refus],
    ['No-show', counts.noshow],
  ]
  const cw = CONTENT_W / cells.length
  cells.forEach(([lbl, val], i) => {
    const cx = LEFT + i * cw
    pdf.setDrawColor(210).setLineWidth(0.2).rect(cx, y, cw - 2, 15)
    pdf.setFont('helvetica', 'bold').setFontSize(14).setTextColor(26)
    pdf.text(String(val), cx + (cw - 2) / 2, y + 7.5, { align: 'center' })
    pdf.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(110)
    pdf.text(lbl.toUpperCase(), cx + (cw - 2) / 2, y + 12.5, {
      align: 'center',
      maxWidth: cw - 3,
    })
  })
  y += 20

  // --- Tableau complet des chambres par étage (couleurs de statut) ---------
  const hasOccupancy = occupied.size > 0
  const colW = CONTENT_W / FLOORS.length
  const cellH = 4.6
  const gridTop = y
  FLOORS.forEach(({ floor, rooms }, i) => {
    const cx = LEFT + i * colW
    pdf.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(90)
    pdf.text(`Étage ${floor}`, cx + colW / 2, gridTop, { align: 'center' })
    rooms.forEach((room, j) => {
      const status = statuses.get(room) ?? 'non_nettoyee'
      const isEmpty = hasOccupancy && !occupied.has(room)
      const { fill, text } = cellStyle(status, isEmpty)
      const w = colW - 2
      const h = cellH - 0.8
      const cellY = gridTop + 3 + j * cellH
      if (fill) {
        pdf.setFillColor(fill[0], fill[1], fill[2])
        pdf.rect(cx + 1, cellY, w, h, 'F')
      } else {
        pdf.setDrawColor(205).setLineWidth(0.2)
        pdf.rect(cx + 1, cellY, w, h)
      }
      pdf.setFont('helvetica', 'normal').setFontSize(7.5)
      pdf.setTextColor(text[0], text[1], text[2])
      pdf.text(String(room), cx + 1 + w / 2, cellY + h / 2 + 1.1, {
        align: 'center',
      })
    })
  })
  const maxRooms = FLOORS.reduce((m, f) => Math.max(m, f.rooms.length), 0)
  y = gridTop + 3 + maxRooms * cellH + 6

  // --- Légende des statuts (même code couleur que les cases) ----------------
  const legend: Array<[string, RGB]> = [
    ['Nettoyée', [110, 231, 183]],
    ['Non nettoyée', [254, 202, 202]],
    ['Refus', [252, 211, 77]],
    ['No-show', [221, 214, 254]],
    ['Non vendue', [241, 245, 249]],
  ]
  pdf.setFont('helvetica', 'normal').setFontSize(7.5)
  const legendGap = 7
  const itemW = legend.map(([lbl]) => 4 + pdf.getTextWidth(lbl))
  const legendW =
    itemW.reduce((a, b) => a + b, 0) + legendGap * (legend.length - 1)
  let lx = RIGHT - legendW // aligné à droite (bord droit = marge RIGHT)
  legend.forEach(([lbl, rgb], i) => {
    pdf.setFillColor(rgb[0], rgb[1], rgb[2])
    pdf.setDrawColor(170).setLineWidth(0.2)
    pdf.rect(lx, y - 2.6, 3, 3, 'FD')
    pdf.setTextColor(80)
    pdf.text(lbl, lx + 4, y)
    lx += itemW[i] + legendGap
  })
  y += 8

  // --- Commentaire : cadre pleine largeur jusqu'aux signatures --------------
  const sigY = 255
  pdf.setFont('helvetica', 'bold').setFontSize(10).setTextColor(26)
  pdf.text('COMMENTAIRE', LEFT, y)
  y += 4
  const commentH = Math.max(sigY - 10 - y, 16)
  pdf.setDrawColor(180).setLineWidth(0.2).rect(LEFT, y, CONTENT_W, commentH)
  const c = comment.trim()
  if (c) {
    pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(60)
    pdf.text(pdf.splitTextToSize(c, CONTENT_W - 6) as string[], LEFT + 3, y + 5)
  }

  // --- Mention de clôture (petite, au-dessus des signatures) ----------------
  if (validatedAt) {
    const when = format(new Date(validatedAt), "d MMMM yyyy 'à' HH'h'mm", {
      locale: fr,
    })
    pdf.setFont('helvetica', 'normal').setFontSize(8).setTextColor(120)
    pdf.text(`Clôturé le ${when}`, RIGHT, sigY - 3, { align: 'right' })
  }

  // --- Signatures : deux cadres, libellés fixes (non nominatifs) ------------
  const boxW = 85
  const boxH = 28
  pdf.setDrawColor(51).setLineWidth(0.3)
  pdf.rect(LEFT, sigY, boxW, boxH)
  pdf.rect(RIGHT - boxW, sigY, boxW, boxH)
  pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(90)
  pdf.text('SIGNATURE OKKO', LEFT + 3, sigY + 5)
  pdf.text('SIGNATURE ÉLIS', RIGHT - boxW + 3, sigY + 5)
}
