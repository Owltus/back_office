import { clamp } from '#/lib/utils.ts'
import type { PagePreview } from '#/lib/facturation/types.ts'

/*
 * Agencement responsive des pages de l'aperçu — logique PURE (testable), sortie
 * du composant. Les pages se rangent de gauche à droite puis de haut en bas ; le
 * nombre de colonnes s'adapte à la largeur disponible. Chaque page reçoit une
 * boîte 2D (left/top/w/h en px) qui sert au placement du tampon et à la détection
 * de la page survolée. Tout est en pixels écran ; la conversion vers les points
 * PDF se fait via `scale`.
 */

export const GRID_GAP = 12 // écart (px) entre pages
export const GRID_PAD = 24 // marge (px) autour de la grille
export const GRID_TARGET_COL = 560 // largeur de colonne cible (px) : plus c'est haut, moins de colonnes

export interface PageBox {
  left: number
  top: number
  w: number
  h: number
}

export interface GridLayout {
  cols: number
  rows: number
  /** Échelle points PDF → px écran. `0` tant que la taille dispo est inconnue. */
  scale: number
  cellW: number
  cellH: number
  contentW: number
  contentH: number
  boxes: PageBox[]
}

/**
 * Calcule l'agencement dans l'espace disponible. Une page seule occupe tout le
 * cadre (largeur ET hauteur) ; plusieurs pages passent en grille. `maxScale`
 * plafonne l'agrandissement (= échelle de rasterisation des aperçus).
 */
export function computeGrid(
  previews: PagePreview[],
  availW: number,
  availH: number,
  maxScale: number,
): GridLayout {
  const maxW = Math.max(...previews.map((p) => p.width))
  const maxH = Math.max(...previews.map((p) => p.height))
  const w = availW - GRID_PAD
  const h = availH - GRID_PAD

  let cols = 1
  let scale = 0
  if (w > 0 && h > 0) {
    if (previews.length <= 1) {
      scale = Math.min(w / maxW, h / maxH, 1)
    } else {
      cols = clamp(
        Math.floor((w + GRID_GAP) / (GRID_TARGET_COL + GRID_GAP)),
        1,
        previews.length,
      )
      const colW = (w - (cols - 1) * GRID_GAP) / cols
      scale = Math.min(colW / maxW, maxScale)
    }
  }

  const cellW = maxW * scale
  const cellH = maxH * scale
  const rows = Math.ceil(previews.length / cols)
  const boxes: PageBox[] = previews.map((pg, i) => ({
    left: (i % cols) * (cellW + GRID_GAP),
    top: Math.floor(i / cols) * (cellH + GRID_GAP),
    w: pg.width * scale,
    h: pg.height * scale,
  }))

  return {
    cols,
    rows,
    scale,
    cellW,
    cellH,
    contentW: cols * cellW + (cols - 1) * GRID_GAP,
    contentH: rows * cellH + (rows - 1) * GRID_GAP,
    boxes,
  }
}

/** Index de la page (cellule) sous un point du contenu (px). */
export function pageAt(grid: GridLayout, px: number, py: number): number {
  const c = clamp(Math.floor(px / (grid.cellW + GRID_GAP)), 0, grid.cols - 1)
  const r = clamp(Math.floor(py / (grid.cellH + GRID_GAP)), 0, grid.rows - 1)
  return clamp(r * grid.cols + c, 0, grid.boxes.length - 1)
}
