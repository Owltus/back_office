import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import { OCR_CHAR_THRESHOLD } from '#/lib/facturation/constants.ts'
import type { ExtractResult, PagePreview } from '#/lib/facturation/types.ts'

/*
 * Lecture d'un PDF, 100 % navigateur. Deux chemins, choisis automatiquement :
 *
 *  1. PDF « natif » (couche texte) → extraction directe via pdf.js. Rapide, fiable.
 *  2. PDF « scanné » (image, peu ou pas de texte) → chaque page est rendue sur un
 *     <canvas> puis passée à Tesseract (OCR, français). Plus lourd et plus lent.
 *
 * pdf.js sert dans LES DEUX cas (texte natif ET rasterisation pour l'OCR).
 * tesseract.js n'est chargé (import dynamique) QUE si l'OCR est réellement requis :
 * inutile de payer ~plusieurs Mo quand la couche texte suffit.
 *
 * Ce module lui-même est importé dynamiquement par le board → pdf.js reste hors
 * du bundle principal.
 */

// pdf.js exige un worker ; Vite le résout en URL servie depuis node_modules.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

// Échelle de rasterisation de l'aperçu (au-delà de 1 pour rester net à l'écran).
const PREVIEW_SCALE = 1.5

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

/** Aperçu image de CHAQUE page + ses dimensions en POINTS PDF (échelle 1). */
async function renderPreviews(
  pdf: pdfjs.PDFDocumentProxy,
): Promise<PagePreview[]> {
  const previews: PagePreview[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const base = page.getViewport({ scale: 1 })
    const canvas = await renderPageToCanvas(page, PREVIEW_SCALE)
    if (!canvas) continue
    previews.push({
      dataUrl: canvas.toDataURL('image/jpeg', 0.85),
      width: base.width,
      height: base.height,
    })
  }
  return previews
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

/** Rend chaque page en image et lit le texte par OCR (français). */
async function readOcrText(pdf: pdfjs.PDFDocumentProxy): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('fra')
  let out = ''
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const canvas = await renderPageToCanvas(page, 2)
      if (!canvas) continue
      const { data } = await worker.recognize(canvas)
      out += data.text + '\n'
    }
  } finally {
    await worker.terminate()
  }
  return out.trim()
}

/**
 * Extrait le texte d'un fichier PDF. Retourne le texte, la méthode retenue
 * (`native` / `ocr`) et le nombre de pages. Bascule sur l'OCR quand la couche
 * texte est trop maigre pour être exploitable (seuil par page).
 */
export async function extractPdf(file: File): Promise<ExtractResult> {
  const buf = await file.arrayBuffer()
  const task = pdfjs.getDocument({ data: new Uint8Array(buf) })
  const pdf = await task.promise
  const pageCount = pdf.numPages
  try {
    const previews = await renderPreviews(pdf)
    const native = await readNativeText(pdf)
    const density = native.replace(/\s+/g, '').length
    if (density >= OCR_CHAR_THRESHOLD * pageCount) {
      return { text: native, method: 'native', pageCount, previews }
    }
    const ocr = await readOcrText(pdf)
    return { text: ocr, method: 'ocr', pageCount, previews }
  } finally {
    await task.destroy()
  }
}
