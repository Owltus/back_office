import { budgetLabel } from '#/lib/facturation/constants.ts'
import type { StampData, StampPosition } from '#/lib/facturation/types.ts'

/*
 * Géométrie du cartouche de tampon — SOURCE UNIQUE partagée par l'aperçu HTML
 * déplaçable (StampPreview) et le rendu pdf-lib (stamp.ts). Tout est en POINTS
 * PDF : dimensions, position, tailles de texte. En passant par le même modèle,
 * ce qu'on voit à la souris est exactement ce qui est imprimé sur le PDF.
 */

export const STAMP_BOX_W = 236
export const STAMP_PAD = 12
export const STAMP_LINE_GAP = 6
export const STAMP_MARGIN = 24

/** Bornes du facteur d'échelle du tampon (redimensionnement par les coins). */
export const STAMP_MIN_SCALE = 0.6
export const STAMP_MAX_SCALE = 2.5

/** Couleurs en hex (l'aperçu HTML les prend telles quelles ; pdf-lib les convertit). */
export const STAMP_COLORS = {
  red: '#b81c1c',
  ink: '#1f1f1f',
  grey: '#6b6b6b',
} as const

export interface StampLine {
  text: string
  size: number
  bold: boolean
  color: keyof typeof STAMP_COLORS
}

/** jj/mm/aaaa à partir d'un aaaa-mm-jj (input date) ; renvoie l'entrée sinon. */
export function frDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

/** Lignes du cartouche, de haut en bas. Textes complets (la troncature au besoin
 *  est gérée à l'affichage : ellipsis en HTML, `fit()` en pdf-lib). */
export function stampLines(data: StampData): StampLine[] {
  const label = data.label || budgetLabel(data.code)
  const lines: StampLine[] = [
    { text: 'IMPUTATION COMPTABLE', size: 8, bold: true, color: 'red' },
    {
      text: `${data.code}  ${label}`.trim(),
      size: 10,
      bold: true,
      color: 'ink',
    },
  ]
  if (data.comment.trim()) {
    lines.push({
      text: data.comment.trim(),
      size: 8.5,
      bold: false,
      color: 'ink',
    })
  }
  const dateBits: string[] = []
  if (data.invoiceDate) dateBits.push(`Facture ${frDate(data.invoiceDate)}`)
  if (data.processedDate) dateBits.push(`Traitée ${frDate(data.processedDate)}`)
  if (dateBits.length) {
    lines.push({
      text: dateBits.join('  ·  '),
      size: 8,
      bold: false,
      color: 'grey',
    })
  }
  return lines
}

/**
 * Dimensions du cartouche à l'échelle `data.scale` : largeur = `STAMP_BOX_W × s`,
 * hauteur dérivée des lignes présentes (elle aussi × s). Même facteur partout →
 * proportions conservées.
 */
export function stampBoxSize(data: StampData): {
  width: number
  height: number
} {
  const s = data.scale || 1
  const height =
    stampLines(data).reduce((h, l) => h + (l.size + STAMP_LINE_GAP) * s, 0) +
    (STAMP_PAD * 2 - STAMP_LINE_GAP) * s
  return { width: STAMP_BOX_W * s, height }
}

/** Position par défaut : première page, coin haut-droit, à `STAMP_MARGIN` des bords. */
export function defaultStampPosition(
  pageWidth: number,
  data: StampData,
): StampPosition {
  const { width } = stampBoxSize(data)
  return {
    page: 0,
    x: Math.max(STAMP_MARGIN, pageWidth - width - STAMP_MARGIN),
    y: STAMP_MARGIN,
  }
}

/** Borne x/y pour que le cartouche reste entier dans la page (la page est conservée). */
export function clampStampPosition(
  pos: StampPosition,
  pageWidth: number,
  pageHeight: number,
  data: StampData,
): StampPosition {
  const { width, height } = stampBoxSize(data)
  return {
    page: pos.page,
    x: Math.max(0, Math.min(pos.x, pageWidth - width)),
    y: Math.max(0, Math.min(pos.y, pageHeight - height)),
  }
}
