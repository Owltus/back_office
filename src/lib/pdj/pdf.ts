/*
 * Génération du document PDF de la feuille de petit-déjeuner (CLIENT). Rendu
 * VECTORIEL via jsPDF, chargé en import() DYNAMIQUE (lib lourde, hors du premier
 * rendu — convention perf du projet). Même patron d'impression que la caisse /
 * le rapprochement / repjour : autoPrint + iframe caché recyclé.
 *
 * OBJECTIF : reproduire FIDÈLEMENT la trame d'impression HISTORIQUE de la page PDJ
 * (voir src/styles/pdj.css, bloc @media print) — même en-tête « Breakfast » + date,
 * mêmes 6 étages en grille 3×2 (liseré gris en haut, pas de titre d'étage), mêmes
 * cases à cocher, et le PIED de page : les 5 tuiles de totaux (la tuile « PDJ non
 * inclus » est masquée à l'impression) + la rangée des 3 cases « € » à remplir.
 * Ce PDF sert À LA FOIS au bouton Imprimer ET à la pièce jointe de l'e-mail, pour
 * qu'ils soient STRICTEMENT identiques.
 *
 * ⚠ La fonction de dessin `renderPdjDocument` (et TOUS ses helpers de module) est
 * une COPIE CONFORME de `supabase/functions/_shared/pdj/pdf.ts` (version Deno).
 * Seuls diffèrent l'import de jsPDF (dynamique ici, statique côté Deno) et les
 * entrées/sorties (printPdjSheet ici, buildPdjPdfBytes côté Deno). Toute
 * modification du dessin doit être répercutée à l'identique dans les DEUX fichiers.
 */

import type { jsPDF } from 'jspdf'

import { ALL_ROOMS, stayKind } from '#/lib/pdj/csv.ts'

// --- Contrat de données (consommé par le composant / le code appelant) -----
export interface PdjSheetRow {
  room: number
  guestName: string | null
  vip: boolean
  status: string // statut brut ; utiliser stayKind() pour la flèche
  stayCount: number
  guests: number
  breakfastsIncluded: number
  breakfastsServed: number
}
export interface PdjStats {
  rooms: number
  guests: number
  breakfasts: number
  potential: number
  staying: number
  departing: number
}
export interface PdjSheetData {
  titleDate: string // ex. « Mardi 7 juillet 2026 » (déjà formaté)
  serviceDate: string // 'YYYY-MM-DD'
  stats: PdjStats
  rows: PdjSheetRow[] // UNIQUEMENT les chambres occupées
}

/** Chambres groupées par étage, dans l'ordre de l'inventaire. */
function floorsOf(): { floor: number; rooms: number[] }[] {
  const map = new Map<number, number[]>()
  for (const room of ALL_ROOMS) {
    const floor = Math.floor(room / 100)
    const list = map.get(floor)
    if (list) list.push(room)
    else map.set(floor, [room])
  }
  return [...map.entries()].map(([floor, rooms]) => ({ floor, rooms }))
}

/** Construit le document PDF (jsPDF) de la feuille, sans l'imprimer. */
export async function buildPdjPdf(data: PdjSheetData): Promise<jsPDF> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  pdf.setProperties({ title: `Petit-déjeuner ${data.serviceDate}` })
  renderPdjDocument(pdf, data)
  return pdf
}

/** Ouvre un PDF déjà rendu dans la fenêtre d'impression, via un iframe caché
 * recyclé (aucun téléchargement). Même harnais que caisse / rapro / repjour. */
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

/** Génère la feuille PDF du jour et ouvre l'impression. */
export async function printPdjSheet(
  data: PdjSheetData,
  title: string,
): Promise<void> {
  const pdf = await buildPdjPdf(data)
  pdf.setProperties({ title })
  openPrintablePdf(pdf, 'pdj-print-frame')
}

/* ==========================================================================
 * COPIE CONFORME (client ↔ Deno) — dessin vectoriel. Ne pas diverger.
 * Fidèle à src/styles/pdj.css (@media print).
 * ======================================================================== */

// --- Géométrie (A4, marge 10mm comme @page) --------------------------------
const PAGE_W = 210
const MARGIN = 10
const LEFT = MARGIN
const RIGHT = PAGE_W - MARGIN // 200
const CONTENT_W = RIGHT - LEFT // 190
const CENTER = PAGE_W / 2 // 105

type RGB = [number, number, number]

// --- Palette (reprise EXACTE des couleurs de pdj.css @media print) ---------
const INK: RGB = [26, 26, 26] // #1a1a1a (chambre, titres)
const TEXT: RGB = [51, 51, 51] // #333 (corps de ligne)
const GRAY: RGB = [102, 102, 102] // #666 (libellés, date, visites)
const GRAYLIGHT: RGB = [170, 170, 170] // chambres vides (opacity 0.4)
const BORDER: RGB = [224, 224, 224] // #e0e0e0 (cadres)
const TOPBAR: RGB = [179, 179, 179] // #b3b3b3 (liseré haut d'étage)
const HAIR: RGB = [245, 245, 245] // fin filet entre lignes
const PANEL: RGB = [250, 250, 250] // #fafafa (tuiles / cases €)
const WHITE: RGB = [255, 255, 255]
const INCLUDED: RGB = [188, 230, 190] // #bce6be (ligne PDJ inclus)
const VIP: RGB = [212, 165, 116] // #d4a574
const CHECKBOX_BORDER: RGB = [167, 168, 168] // #a7a8a8
const ARROW_UP: RGB = [239, 83, 80] // départ (rouge #EF5350)
const ARROW_DOWN: RGB = [33, 150, 243] // recouche (bleu #2196F3)

const setFill = (pdf: jsPDF, c: RGB) => pdf.setFillColor(c[0], c[1], c[2])
const setDraw = (pdf: jsPDF, c: RGB) => pdf.setDrawColor(c[0], c[1], c[2])
const setText = (pdf: jsPDF, c: RGB) => pdf.setTextColor(c[0], c[1], c[2])

/** Tronque un texte (avec « … ») pour tenir dans `maxW` mm à la police courante. */
function fitText(pdf: jsPDF, text: string, maxW: number): string {
  if (pdf.getTextWidth(text) <= maxW) return text
  let t = text
  while (t.length > 1 && pdf.getTextWidth(t + '…') > maxW) t = t.slice(0, -1)
  return t + '…'
}

/** Petite flèche verticale (départ = vers le haut, recouche = vers le bas). */
function drawArrow(
  pdf: jsPDF,
  cx: number,
  cy: number,
  dir: 'up' | 'down',
  color: RGB,
): void {
  setDraw(pdf, color)
  setFill(pdf, color)
  pdf.setLineWidth(0.4)
  const h = 2.2
  if (dir === 'up') {
    pdf.line(cx, cy + h / 2, cx, cy - h / 2 + 0.5)
    pdf.triangle(
      cx,
      cy - h / 2 - 0.4,
      cx - 0.9,
      cy - h / 2 + 0.9,
      cx + 0.9,
      cy - h / 2 + 0.9,
      'F',
    )
  } else {
    pdf.line(cx, cy - h / 2, cx, cy + h / 2 - 0.5)
    pdf.triangle(
      cx,
      cy + h / 2 + 0.4,
      cx - 0.9,
      cy + h / 2 - 0.9,
      cx + 0.9,
      cy + h / 2 - 0.9,
      'F',
    )
  }
}

/** Cases « clients » d'une ligne : `numBoxes` cases (mini 2), centrées dans `w`.
 * Case « attendue » (i < guests) = bord épais ; case « servie » (i < served) = pleine. */
function drawCheckboxes(
  pdf: jsPDF,
  x0: number,
  cy: number,
  w: number,
  numBoxes: number,
  guests: number,
  served: number,
): void {
  const box = 2.6
  const g = 1.3
  const totalW = numBoxes * box + (numBoxes - 1) * g
  let bx = x0 + Math.max(0.3, (w - totalW) / 2)
  const by = cy - box / 2
  for (let i = 0; i < numBoxes; i++) {
    const expected = i < guests
    const checked = i < served
    if (checked) {
      setFill(pdf, TEXT)
      setDraw(pdf, TEXT)
      pdf.setLineWidth(0.3).rect(bx, by, box, box, 'FD')
    } else {
      setFill(pdf, WHITE)
      setDraw(pdf, expected ? TEXT : CHECKBOX_BORDER)
      pdf.setLineWidth(expected ? 0.45 : 0.2).rect(bx, by, box, box, 'FD')
    }
    bx += box + g
  }
}

/** Un tableau d'étage : boîte bordée + liseré gris en haut + lignes chambres.
 * Pas de titre d'étage (comme la trame : les numéros de chambre suffisent). */
function drawFloor(
  pdf: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  floor: { floor: number; rooms: number[] },
  byRoom: Map<number, PdjSheetRow>,
): void {
  // Cadre + liseré gris en haut (::before 2px #b3b3b3).
  setFill(pdf, TOPBAR)
  pdf.rect(x, y, w, 0.6, 'F')
  setDraw(pdf, BORDER)
  pdf.setLineWidth(0.2).rect(x, y, w, h)

  const nRooms = floor.rooms.length
  const innerTop = y + 1.4
  const rowH = (h - 1.8) / nRooms

  // Colonnes (proportions de la trame : chambre / nom / statut / visites / cases).
  const roomW = 8
  const statusW = 4
  const visitsW = 5
  const boxesW = 14
  const nameW = w - roomW - statusW - visitsW - boxesW
  const statusCx = x + roomW + nameW + statusW / 2
  const visitsCx = x + roomW + nameW + statusW + visitsW / 2
  const boxesX = x + roomW + nameW + statusW + visitsW

  floor.rooms.forEach((room, i) => {
    const ry = innerTop + i * rowH
    const cy = ry + rowH / 2
    const gst = byRoom.get(room)
    // Fond vert « PDJ inclus » sur toute la ligne.
    if (gst && gst.breakfastsIncluded > 0) {
      setFill(pdf, INCLUDED)
      pdf.rect(x + 0.2, ry, w - 0.4, rowH, 'F')
    }
    // Numéro de chambre.
    setText(pdf, gst ? INK : GRAYLIGHT)
    pdf.setFont('helvetica', 'bold').setFontSize(7)
    pdf.text(String(room), x + 1.6, cy + 1)
    // Nom (VIP = ambre). Vide si chambre non occupée.
    const name = gst ? (gst.guestName ?? '—') : ''
    setText(pdf, gst?.vip ? VIP : gst ? TEXT : GRAYLIGHT)
    pdf.setFont('helvetica', gst?.vip ? 'bold' : 'normal').setFontSize(6.5)
    if (name) pdf.text(fitText(pdf, name, nameW - 1.5), x + roomW, cy + 0.9)
    if (gst) {
      // Flèche de statut.
      const kind = stayKind(gst.status)
      if (kind === 'departing') drawArrow(pdf, statusCx, cy, 'up', ARROW_UP)
      else if (kind === 'staying') drawArrow(pdf, statusCx, cy, 'down', ARROW_DOWN)
      // Visites (si > 1).
      if (gst.stayCount > 1) {
        setText(pdf, GRAY)
        pdf.setFont('helvetica', 'bold').setFontSize(7)
        pdf.text(String(gst.stayCount), visitsCx, cy + 1, { align: 'center' })
      }
      // Cases clients.
      const numBoxes = Math.max(2, gst.guests)
      drawCheckboxes(pdf, boxesX, cy, boxesW, numBoxes, gst.guests, gst.breakfastsServed)
    }
    // Fin filet de séparation.
    if (i < nRooms - 1) {
      setDraw(pdf, HAIR)
      pdf.setLineWidth(0.1).line(x + 0.4, ry + rowH, x + w - 0.4, ry + rowH)
    }
  })
}

/** Pied de page : 5 tuiles de totaux (la « PDJ non inclus » est masquée à
 * l'impression) — valeur AU-DESSUS du libellé, fond clair, sans liseré. */
function drawStatTiles(pdf: jsPDF, stats: PdjStats, y: number, h: number): void {
  const tiles: { label: string; value: number; arrow?: 'up' | 'down' }[] = [
    { label: 'Chambres occupées', value: stats.rooms },
    { label: 'Clients', value: stats.guests },
    { label: 'PDJ inclus', value: stats.breakfasts },
    { label: 'Recouche', value: stats.staying, arrow: 'down' },
    { label: 'Départ', value: stats.departing, arrow: 'up' },
  ]
  const gap = 3
  const tw = (CONTENT_W - gap * (tiles.length - 1)) / tiles.length
  tiles.forEach((t, i) => {
    const tx = LEFT + i * (tw + gap)
    const mid = tx + tw / 2
    setFill(pdf, PANEL)
    setDraw(pdf, BORDER)
    pdf.setLineWidth(0.25).rect(tx, y, tw, h, 'FD')
    // Valeur (au-dessus).
    setText(pdf, INK)
    pdf.setFont('helvetica', 'normal').setFontSize(11)
    pdf.text(String(t.value), mid, y + h / 2 - 0.2, { align: 'center' })
    // Libellé (en dessous), + petite flèche pour Recouche/Départ.
    setText(pdf, GRAY)
    pdf.setFont('helvetica', 'normal').setFontSize(4.6)
    const label = fitText(pdf, t.label.toUpperCase(), tw - 3)
    pdf.text(label, mid, y + h - 1.8, { align: 'center' })
    if (t.arrow) {
      const lw = pdf.getTextWidth(label)
      drawArrow(
        pdf,
        mid + lw / 2 + 1.4,
        y + h - 2.6,
        t.arrow,
        t.arrow === 'up' ? ARROW_UP : ARROW_DOWN,
      )
    }
  })
}

/** Rangée des 3 cases « € » à remplir à la main. */
function drawRevenueBoxes(pdf: jsPDF, y: number, h: number): void {
  const labels = ['PDJ Inclus €', 'PDJ Extra €', 'Total €']
  const gap = 6
  const bw = (CONTENT_W - gap * 2) / 3
  labels.forEach((label, i) => {
    const bx = LEFT + i * (bw + gap)
    setFill(pdf, PANEL)
    setDraw(pdf, BORDER)
    pdf.setLineWidth(0.25).rect(bx, y, bw, h, 'FD')
    setText(pdf, GRAY)
    pdf.setFont('helvetica', 'normal').setFontSize(6)
    pdf.text(label.toUpperCase(), bx + bw / 2, y + h - 2, { align: 'center' })
  })
}

/** Dessine la feuille complète (UNE page A4). COPIE CONFORME entre client et Deno. */
export function renderPdjDocument(pdf: jsPDF, data: PdjSheetData): void {
  const byRoom = new Map<number, PdjSheetRow>()
  for (const r of data.rows) byRoom.set(r.room, r)

  // ===== En-tête : « Breakfast » centré + date (jj/mm/aaaa) à droite ========
  const [yy, mm, dd] = data.serviceDate.split('-')
  setText(pdf, INK)
  pdf.setFont('helvetica', 'normal').setFontSize(13)
  pdf.text('Breakfast', CENTER, 12, { align: 'center' })
  setText(pdf, GRAY)
  pdf.setFont('helvetica', 'normal').setFontSize(8)
  pdf.text(`${dd}/${mm}/${yy}`, RIGHT, 12, { align: 'right' })

  // ===== Pied de page (ancré en bas) : tuiles + cases « € » ================
  const REV_H = 13
  const TILE_H = 10
  const revY = 287 - REV_H // bas de page (marge 10)
  const tileY = revY - 3 - TILE_H
  drawStatTiles(pdf, data.stats, tileY, TILE_H)
  drawRevenueBoxes(pdf, revY, REV_H)

  // ===== Étages : grille 3 colonnes × 2 rangées, entre en-tête et pied =====
  const floors = floorsOf()
  const floorsTop = 17
  const floorsBottom = tileY - 4
  const H_GAP = 2
  const V_GAP = 7
  const colW = (CONTENT_W - 2 * H_GAP) / 3
  const floorH = (floorsBottom - floorsTop - V_GAP) / 2
  floors.forEach((floor, i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    const x = LEFT + col * (colW + H_GAP)
    const y = floorsTop + row * (floorH + V_GAP)
    drawFloor(pdf, x, y, colW, floorH, floor, byRoom)
  })
}
