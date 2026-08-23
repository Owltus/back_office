/*
 * Génération d'un document PDF « Feuille de suivi parking » — une grille par
 * jour, calquée sur le formulaire papier existant (colonnes Place / NOM /
 * N°de # / Facturé? / Check in / Check out, 14 places, 13 & 14 = personnel,
 * grisées). Chaque grille est PRÉ-REMPLIE avec les clients PRÉSENTS ce jour-là
 * (une ligne sur la place occupée — pas seulement les arrivées : un séjour de
 * plusieurs nuits reste présent chaque jour), les cellules restantes vides à
 * compléter à la main.
 *
 * Mode PAYSAGE, deux tableaux par page → quatre jours sur deux pages. Rendu
 * VECTORIEL via jsPDF, chargé en import() DYNAMIQUE (lib lourde, hors du premier
 * rendu — convention perf du projet). Même patron d'impression que caisse /
 * rapro / repjour : autoPrint + iframe caché recyclé.
 */

import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { jsPDF } from 'jspdf'

import {
  FIRST_STAFF_SPOT,
  PMR_GLYPH,
  PMR_SPOT,
  SPOTS_LIST,
} from '#/lib/parking/model.ts'
import { capitalize } from '#/lib/utils.ts'

/** Une ligne pré-remplie (un client présent) d'une feuille de suivi. */
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
 * recyclé (aucun téléchargement). Réservé à la SOURIS depuis la décision D1
 * (plan/audit-impression-tactile) : le tactile imprime désormais nativement
 * un document HTML dédié (`window.print()`, cf. `ParkingBoard.tsx`/
 * `parking.css`). `URL.revokeObjectURL` différé au `load` de l'iframe
 * (jamais immédiat : le navigateur a encore besoin du blob le temps de
 * charger le PDF dedans). */
function openPrintablePdf(pdf: jsPDF, frameId: string): void {
  pdf.autoPrint()
  const blobUrl = pdf.output('bloburl').toString()
  document.getElementById(frameId)?.remove()
  const iframe = document.createElement('iframe')
  iframe.id = frameId
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  iframe.addEventListener(
    'load',
    () => URL.revokeObjectURL(blobUrl),
    { once: true },
  )
  iframe.src = blobUrl
  document.body.appendChild(iframe)
}

/** Rasterise le pictogramme PMR en PNG (data URI) : jsPDF ne dessine pas les
 * `<path>` SVG, on passe donc par une image. Encre INK, fond transparent, haute
 * résolution (netteté à l'impression), ratio du viewBox respecté. Renvoie null si
 * indisponible (pas de DOM, échec) → le PDF retombe alors sur le numéro « 8 ». */
async function pmrPngDataUrl(): Promise<string | null> {
  if (typeof document === 'undefined') return null
  const W = 220
  const H = Math.round(W * (1280 / 1122)) // ratio du viewBox portrait 1122×1280
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${PMR_GLYPH.viewBox}">` +
    `<g transform="${PMR_GLYPH.transform}" fill="rgb(${INK[0]},${INK[1]},${INK[2]})">` +
    PMR_GLYPH.paths.map((d) => `<path d="${d}"/>`).join('') +
    `</g></svg>`
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('PMR svg load failed'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, W, H)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

/** Construit le document PDF (jsPDF), sans l'imprimer. Séparé pour l'aperçu/test. */
export async function buildParkingSheetPdf(
  data: ParkingSheetPdfData,
  title: string,
): Promise<jsPDF> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  pdf.setProperties({ title })
  rotateSecondPage(pdf) // abonnement AVANT le rendu ; l'injection a lieu à l'output
  const pmrPng = await pmrPngDataUrl() // pictogramme place PMR (null → repli « 8 »)
  renderSheets(pdf, data, pmrPng)
  return pdf
}

/** Génère les feuilles de suivi et ouvre l'impression (souris). */
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

const COLS: {
  key: keyof ParkingSheetRow | null
  label: string
  w: number
  align: 'left' | 'center'
}[] = [
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

function renderSheets(
  pdf: jsPDF,
  { days }: ParkingSheetPdfData,
  pmrPng: string | null,
): void {
  days.forEach((day, i) => {
    if (i > 0 && i % PER_PAGE === 0) pdf.addPage()
    const col = i % PER_PAGE // 0 = gauche, 1 = droite
    const x = MARGIN + col * (TABLE_W + GAP)
    drawSheet(pdf, x, day, pmrPng)
  })
}

/**
 * Tourne la 2e page (et suivantes) de 180° via l'attribut `/Rotate` de la PAGE
 * PDF, et NON par une transformation du contenu : la feuille est dessinée
 * normalement (mise en page identique à la 1re page), c'est l'affichage /
 * l'impression de la page entière qui est retourné — demandé pour le recto/verso.
 *
 * jsPDF n'a pas d'API de rotation de page, mais publie un événement `putPage` au
 * milieu de l'écriture du dictionnaire de page ; on y injecte `/Rotate 180` pour
 * les pages après la première. `write` n'est pas dans les types, d'où le cast.
 */
function rotateSecondPage(pdf: jsPDF): void {
  const internal = pdf.internal as typeof pdf.internal & {
    write: (line: string) => void
  }
  internal.events.subscribe('putPage', (data: { pageNumber: number }) => {
    if (data.pageNumber >= 2) internal.write('/Rotate 180')
  })
}

/** Un tableau (un jour) à l'abscisse `x`, pleine hauteur de page. */
function drawSheet(
  pdf: jsPDF,
  x: number,
  day: ParkingSheetDay,
  pmrPng: string | null,
): void {
  const W = TABLE_W
  const bySpot = new Map<number, ParkingSheetRow>()
  day.rows.forEach((r) => bySpot.set(r.spot, r))

  // --- « Date : <jour> » ---------------------------------------------------
  const dateLabel = capitalize(
    format(day.date, 'EEEE d MMMM yyyy', { locale: fr }),
  )
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

  // Lignes : n° de place + clients présents pré-remplis.
  SPOTS_LIST.forEach((spot, r) => {
    const ty = headY + headH + r * rowH + rowH / 2 + 1.4
    // Colonne « Place » : pictogramme fauteuil pour la place PMR, numéro sinon.
    if (spot === PMR_SPOT && pmrPng) {
      const imgH = 8 // mm (tient dans la ligne de 11,6 mm)
      const imgW = imgH * (1122 / 1280) // ratio du viewBox portrait
      const cellTop = headY + headH + r * rowH
      pdf.addImage(
        pmrPng,
        'PNG',
        xs[0] + COLS[0].w / 2 - imgW / 2,
        cellTop + rowH / 2 - imgH / 2,
        imgW,
        imgH,
      )
    } else {
      setText(pdf, INK)
      pdf.setFont('helvetica', 'bold').setFontSize(10)
      pdf.text(String(spot), xs[0] + COLS[0].w / 2, ty, { align: 'center' })
    }

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
