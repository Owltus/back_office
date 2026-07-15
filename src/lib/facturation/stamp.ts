import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { PDFFont } from 'pdf-lib'

import {
  STAMP_COLORS,
  STAMP_LINE_GAP,
  STAMP_PAD,
  clampStampPosition,
  defaultStampPosition,
  stampBoxSize,
  stampLines,
} from '#/lib/facturation/stampLayout.ts'
import type { StampData, StampPosition } from '#/lib/facturation/types.ts'

/*
 * Apposition du « tampon » sur le PDF, en vectoriel, côté navigateur (pdf-lib).
 * La géométrie (dimensions, lignes, position par défaut) vient de stampLayout,
 * partagée avec l'aperçu déplaçable : le cartouche est dessiné exactement là où
 * l'utilisateur l'a posé. Aucune altération du reste du document.
 */

/** Convertit un hex '#rrggbb' en couleur pdf-lib (composantes 0–1). */
function hex(color: string) {
  const n = parseInt(color.slice(1), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

const COLOR_RGB = {
  red: hex(STAMP_COLORS.red),
  ink: hex(STAMP_COLORS.ink),
  grey: hex(STAMP_COLORS.grey),
}

/** Tronque `text` avec « … » pour tenir dans `maxWidth` à la taille donnée. */
function fit(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let s = text
  while (s.length > 1 && font.widthOfTextAtSize(s + '…', size) > maxWidth) {
    s = s.slice(0, -1)
  }
  return s + '…'
}

/** Déclenche le téléchargement d'un PDF (octets) sous le nom donné. */
function download(bytes: Uint8Array, name: string): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Construit les octets du PDF tamponné (première page) — SANS téléchargement,
 * pour être exécutable/testable hors navigateur. `position` = coin haut-gauche du
 * cartouche en points PDF (origine EN HAUT) ; par défaut le coin haut-droit.
 */
export async function buildStampedPdf(
  src: ArrayBuffer | Uint8Array,
  data: StampData,
  position?: StampPosition | null,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(src)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const pages = pdf.getPages()
  const first = pages[0]
  // Position par défaut sur la 1re page ; on borne l'index à une page existante.
  const wanted = position ?? defaultStampPosition(first.getSize().width, data)
  const pageIndex = Math.max(0, Math.min(wanted.page, pages.length - 1))
  const page = pages[pageIndex]
  const { width: pageW, height: pageH } = page.getSize()
  const box = stampBoxSize(data)

  // Position (origine haut-gauche) → coordonnées pdf-lib (origine bas-gauche).
  const topLeft = clampStampPosition(wanted, pageW, pageH, data)
  const x = topLeft.x
  const y = pageH - topLeft.y - box.height

  page.drawRectangle({
    x,
    y,
    width: box.width,
    height: box.height,
    color: rgb(1, 1, 1),
    opacity: 0.9,
    borderColor: COLOR_RGB.red,
    borderWidth: 1.4,
  })

  const innerW = box.width - STAMP_PAD * 2
  let cursor = y + box.height - STAMP_PAD
  for (const line of stampLines(data)) {
    const f = line.bold ? bold : font
    cursor -= line.size
    page.drawText(fit(line.text, f, line.size, innerW), {
      x: x + STAMP_PAD,
      y: cursor,
      size: line.size,
      font: f,
      color: COLOR_RGB[line.color],
    })
    cursor -= STAMP_LINE_GAP
  }

  return pdf.save()
}

/**
 * Tamponne la première page du PDF et déclenche son téléchargement (navigateur).
 * `baseName` = nom du fichier source (l'extension .pdf est retirée/rajoutée).
 */
export async function stampAndDownload(
  file: File,
  data: StampData,
  baseName: string,
  position?: StampPosition | null,
): Promise<void> {
  const out = await buildStampedPdf(await file.arrayBuffer(), data, position)
  const stem = baseName.replace(/\.pdf$/i, '')
  download(out, `${stem}-tampon.pdf`)
}
