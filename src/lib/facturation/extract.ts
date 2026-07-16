import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import {
  OCR_CHAR_THRESHOLD,
  PREVIEW_RASTER_SCALE,
} from '#/lib/facturation/constants.ts'
import type { ExtractResult, PagePreview } from '#/lib/facturation/types.ts'

/*
 * Lecture d'un PDF, 100 % navigateur. Deux chemins, choisis automatiquement :
 *
 *  1. PDF « natif » (couche texte) → extraction directe via pdf.js. Rapide, fiable.
 *  2. PDF « scanné » (peu ou pas de texte) → chaque page est rendue sur un
 *     <canvas> puis passée à Tesseract (OCR, français). Plus lourd et plus lent.
 *
 * La méthode est décidée D'ABORD (densité de la couche texte), puis chaque page
 * n'est rasterisée QU'UNE fois : le même canvas sert à l'aperçu ET, si besoin, à
 * l'OCR. tesseract.js n'est chargé (import dynamique) que si l'OCR est requis.
 *
 * Ce module lui-même est importé dynamiquement par le board → pdf.js reste hors
 * du bundle principal.
 */

// pdf.js exige un worker ; Vite le résout en URL servie depuis node_modules.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/** Rend une page pdf.js sur un <canvas> à l'échelle donnée (null si pas de 2D). */
async function renderPageToCanvas(
  page: Awaited<ReturnType<pdfjs.PDFDocumentProxy['getPage']>>,
  scale: number,
): Promise<HTMLCanvasElement | null> {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  await page.render({ canvas, canvasContext: ctx, viewport }).promise
  return canvas
}

/** Concatène la couche texte de toutes les pages (chaîne vide si scan pur). */
async function readNativeText(pdf: pdfjs.PDFDocumentProxy): Promise<string> {
  let text = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const line = content.items
      .map((it) => ('str' in it ? it.str : ''))
      .join(' ')
    text += line + '\n'
  }
  return text.trim()
}

/**
 * Rasterise chaque page UNE seule fois → aperçus (dataURL + dimensions en points),
 * et, si `withOcr`, lit aussi le texte OCR depuis le même canvas.
 */
async function renderPages(
  pdf: pdfjs.PDFDocumentProxy,
  withOcr: boolean,
): Promise<{ previews: PagePreview[]; ocrText: string }> {
  const previews: PagePreview[] = []
  let ocrText = ''
  const worker = withOcr
    ? await import('tesseract.js').then((m) => m.createWorker('fra'))
    : null
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const base = page.getViewport({ scale: 1 })
      const canvas = await renderPageToCanvas(page, PREVIEW_RASTER_SCALE)
      if (!canvas) continue
      previews.push({
        dataUrl: canvas.toDataURL('image/jpeg', 0.85),
        width: base.width,
        height: base.height,
      })
      if (worker) {
        const { data } = await worker.recognize(canvas)
        ocrText += data.text + '\n'
      }
    }
  } finally {
    if (worker) await worker.terminate()
  }
  return { previews, ocrText: ocrText.trim() }
}

/**
 * Extrait le texte d'un fichier PDF. Retourne le texte, la méthode retenue
 * (`native` / `ocr`), le nombre de pages et les aperçus. Bascule sur l'OCR quand
 * la couche texte est trop maigre pour être exploitable (seuil par page).
 */
export async function extractPdf(file: File): Promise<ExtractResult> {
  const buf = await file.arrayBuffer()
  const task = pdfjs.getDocument({ data: new Uint8Array(buf) })
  const pdf = await task.promise
  const pageCount = pdf.numPages
  try {
    const native = await readNativeText(pdf)
    const density = native.replace(/\s+/g, '').length
    const useOcr = density < OCR_CHAR_THRESHOLD * pageCount

    const { previews, ocrText } = await renderPages(pdf, useOcr)
    return {
      text: useOcr ? ocrText : native,
      method: useOcr ? 'ocr' : 'native',
      pageCount,
      previews,
    }
  } finally {
    await task.destroy()
  }
}
