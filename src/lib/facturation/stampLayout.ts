import type {
  InvoiceRecord,
  StampData,
  StampPosition,
} from '#/lib/facturation/types.ts'

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
/** Interligne (hauteur de ligne / taille de police). > 1 pour ne pas rogner le haut/bas
 *  des glyphes. Partagé par la hauteur de boîte, l'aperçu HTML et le PDF → placement
 *  identique et contenu qui tient toujours dans le cartouche. */
export const STAMP_LINE_H = 1.15

/** Bornes du facteur d'échelle du tampon (redimensionnement par les coins). */
export const STAMP_MIN_SCALE = 0.6
export const STAMP_MAX_SCALE = 2.5

/** Encre du tampon (hex) — MONOCHROME comme un vrai coup de tampon : une seule
 *  encre rouge, déclinée en pleine intensité et en version atténuée pour le secondaire.
 *  L'aperçu HTML les prend telles quelles ; pdf-lib les convertit. */
export const STAMP_COLORS = {
  red: '#b81c1c', // encre principale (titre, codes)
  ink: '#b81c1c', // même encre pour les codes (plus de noir)
  grey: '#c98a8a', // encre atténuée pour le secondaire (date)
} as const

/** Cadre « coup de tampon » : double filet (extérieur épais + intérieur fin, décalé). */
export const STAMP_BORDER = 2
export const STAMP_INNER_GAP = 3
export const STAMP_INNER_BORDER = 0.8

export interface StampLine {
  text: string
  size: number
  bold: boolean
  color: keyof typeof STAMP_COLORS
  align?: 'left' | 'right' // défaut : gauche
}

/** Projection d'une facture vers les données du tampon (source unique, partagée
 *  par le board et le panneau d'imputation). Le libellé est dérivé du code. */
export function stampDataOf(record: InvoiceRecord): StampData {
  return {
    codes: record.codes,
    comment: record.comment,
    invoiceDate: record.invoiceDate,
    processedDate: record.processedDate,
    scale: record.stampScale,
  }
}

/** jj/mm/aaaa à partir d'un aaaa-mm-jj (input date) ; renvoie l'entrée sinon. */
export function frDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

/** Lignes du cartouche, de haut en bas. Textes complets (la troncature au besoin
 *  est gérée à l'affichage : ellipsis en HTML, `fit()` en pdf-lib). */
export function stampLines(data: StampData): StampLine[] {
  const codes = data.codes.filter((c) => c.trim())
  const lines: StampLine[] = []
  // Une ligne par imputation : le CODE comptable SEUL (pas de libellé).
  // Placeholder si aucun code encore.
  if (codes.length === 0) {
    lines.push({ text: '— à imputer —', size: 10, bold: true, color: 'grey' })
  }
  for (const code of codes) {
    lines.push({ text: code, size: 10, bold: true, color: 'ink' })
  }
  if (data.comment.trim()) {
    lines.push({
      text: data.comment.trim(),
      size: 8.5,
      bold: false,
      color: 'ink',
    })
  }
  if (data.processedDate) {
    lines.push({
      text: `Traitée ${frDate(data.processedDate)}`,
      size: 8,
      bold: false,
      color: 'grey',
      align: 'right',
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
  const lines = stampLines(data)
  // Hauteur du texte : chaque ligne occupe `size × interligne`, plus un gap entre lignes.
  const textH =
    lines.reduce((h, l) => h + l.size * STAMP_LINE_H, 0) +
    Math.max(0, lines.length - 1) * STAMP_LINE_GAP
  // + padding haut/bas + les DEUX filets (le cadre grignote l'intérieur en box-border).
  const height = (textH + STAMP_PAD * 2 + STAMP_BORDER * 2) * s
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
