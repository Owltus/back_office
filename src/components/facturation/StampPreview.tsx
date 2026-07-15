import { useEffect, useRef, useState } from 'react'

import {
  STAMP_COLORS,
  STAMP_LINE_GAP,
  STAMP_MAX_SCALE,
  STAMP_MIN_SCALE,
  STAMP_PAD,
  STAMP_BOX_W,
  clampStampPosition,
  defaultStampPosition,
  stampBoxSize,
  stampLines,
} from '#/lib/facturation/stampLayout.ts'
import type {
  PagePreview,
  StampData,
  StampPosition,
} from '#/lib/facturation/types.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Aperçu des pages de la facture avec le tampon DÉPLAÇABLE à la souris.
 *
 * Agencement responsive : une page seule occupe tout le cadre (largeur ET
 * hauteur) ; plusieurs pages se rangent en GRILLE — de gauche à droite puis de
 * haut en bas — dont le nombre de colonnes s'adapte à la largeur disponible.
 *
 * Le tampon vit dans l'espace de coordonnées PDF (points) : sa position
 * `{page,x,y}` se rejoue à l'identique sur le PDF (stamp.ts). Chaque page a une
 * boîte 2D (left/top en px) qui sert au placement du tampon et à la détection de
 * la page survolée au glisser / cliquée.
 */

const GAP = 12 // écart (px) entre pages
const PAD = 24 // marge (px) autour de la grille
const TARGET_COL = 560 // largeur cible (px) d'une colonne : plus c'est haut, moins il y a de colonnes (donc des pages plus grosses)
const MAX_SCALE = 1.5 // borne d'agrandissement = échelle de rendu des aperçus (au-delà, ça flouterait)

interface PageBox {
  left: number
  top: number
  w: number
  h: number
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(v, hi))
}

export function StampPreview({
  previews,
  data,
  position,
  onPositionChange,
  onScaleChange,
}: {
  previews: PagePreview[]
  data: StampData
  position: StampPosition | null
  onPositionChange: (pos: StampPosition) => void
  onScaleChange: (scale: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const recompute = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    recompute()
    const observer = new ResizeObserver(recompute)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const box = stampBoxSize(data) // dimensions déjà à l'échelle du tampon (data.scale)
  const ss = data.scale || 1 // échelle intrinsèque du tampon (redimensionnement)
  const maxW = Math.max(...previews.map((p) => p.width))
  const maxH = Math.max(...previews.map((p) => p.height))

  // --- Agencement (colonnes + échelle) selon la place disponible -------------
  const availW = size.w - PAD
  const availH = size.h - PAD
  let cols = 1
  let scale = 0
  if (availW > 0 && availH > 0) {
    if (previews.length <= 1) {
      // Page seule : plein cadre (largeur ET hauteur).
      scale = Math.min(availW / maxW, availH / maxH, 1)
    } else {
      // Grille : autant de colonnes que la largeur en autorise (largeur de
      // colonne cible), puis chaque page est mise à l'échelle de sa colonne.
      cols = clamp(
        Math.floor((availW + GAP) / (TARGET_COL + GAP)),
        1,
        previews.length,
      )
      const colW = (availW - (cols - 1) * GAP) / cols
      scale = Math.min(colW / maxW, MAX_SCALE)
    }
  }

  const cellW = maxW * scale
  const cellH = maxH * scale
  const rows = Math.ceil(previews.length / cols)
  const contentW = cols * cellW + (cols - 1) * GAP
  const contentH = rows * cellH + (rows - 1) * GAP

  // Boîte 2D de chaque page (gauche→droite, haut→bas).
  const boxes: PageBox[] = previews.map((pg, i) => {
    const c = i % cols
    const r = Math.floor(i / cols)
    return {
      left: c * (cellW + GAP),
      top: r * (cellH + GAP),
      w: pg.width * scale,
      h: pg.height * scale,
    }
  })

  // Page + coordonnées effectives du tampon (bornées à la page).
  const raw = position ?? defaultStampPosition(previews[0].width, data)
  const pageIdx = clamp(raw.page, 0, previews.length - 1)
  const pageDims = previews[pageIdx]
  const pos = clampStampPosition(
    { page: pageIdx, x: raw.x, y: raw.y },
    pageDims.width,
    pageDims.height,
    data,
  )

  // Détecte la page (cellule de la grille) sous un point du contenu (px).
  function pageAt(px: number, py: number): number {
    const c = clamp(Math.floor(px / (cellW + GAP)), 0, cols - 1)
    const r = clamp(Math.floor(py / (cellH + GAP)), 0, rows - 1)
    return clamp(r * cols + c, 0, previews.length - 1)
  }

  // --- Glisser : le point saisi reste sous le curseur ------------------------
  const grab = useRef<{ gx: number; gy: number } | null>(null)
  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    grab.current = { gx: e.clientX - rect.left, gy: e.clientY - rect.top }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!grab.current || scale === 0 || !contentRef.current) return
    const rect = contentRef.current.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const p = pageAt(px, py)
    const dims = previews[p]
    onPositionChange(
      clampStampPosition(
        {
          page: p,
          x: (px - grab.current.gx - boxes[p].left) / scale,
          y: (py - grab.current.gy - boxes[p].top) / scale,
        },
        dims.width,
        dims.height,
        data,
      ),
    )
  }
  function onPointerUp(e: React.PointerEvent) {
    grab.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  // Cliquer sur une page y pose le tampon (centré sur le clic) — permet de
  // l'envoyer sur une page non visible sans avoir à l'y faire glisser.
  function onPageClick(i: number, e: React.MouseEvent) {
    if (!contentRef.current || scale === 0) return
    const rect = contentRef.current.getBoundingClientRect()
    const dims = previews[i]
    onPositionChange(
      clampStampPosition(
        {
          page: i,
          x: (e.clientX - rect.left - boxes[i].left) / scale - box.width / 2,
          y: (e.clientY - rect.top - boxes[i].top) / scale - box.height / 2,
        },
        dims.width,
        dims.height,
        data,
      ),
    )
  }

  // --- Redimensionnement par les coins ---------------------------------------
  // Le coin OPPOSÉ à celui saisi sert d'ancre (reste fixe). L'échelle est
  // déduite de la largeur entre l'ancre et le curseur (proportions conservées).
  const resize = useRef<{
    page: number
    anchorX: number
    anchorY: number
    isLeft: boolean
    isTop: boolean
  } | null>(null)
  function onResizeDown(
    e: React.PointerEvent,
    isLeft: boolean,
    isTop: boolean,
  ) {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    resize.current = {
      page: pos.page,
      anchorX: isLeft ? pos.x + box.width : pos.x,
      anchorY: isTop ? pos.y + box.height : pos.y,
      isLeft,
      isTop,
    }
  }
  function onResizeMove(e: React.PointerEvent) {
    const r = resize.current
    if (!r || scale === 0 || !contentRef.current) return
    e.stopPropagation()
    const rect = contentRef.current.getBoundingClientRect()
    const px = (e.clientX - rect.left - boxes[r.page].left) / scale
    const width = r.isLeft ? r.anchorX - px : px - r.anchorX
    const nextScale = clamp(
      width / STAMP_BOX_W,
      STAMP_MIN_SCALE,
      STAMP_MAX_SCALE,
    )
    const scaled: StampData = { ...data, scale: nextScale }
    const nb = stampBoxSize(scaled)
    const dims = previews[r.page]
    onScaleChange(nextScale)
    onPositionChange(
      clampStampPosition(
        {
          page: r.page,
          x: r.isLeft ? r.anchorX - nb.width : r.anchorX,
          y: r.isTop ? r.anchorY - nb.height : r.anchorY,
        },
        dims.width,
        dims.height,
        scaled,
      ),
    )
  }
  function onResizeUp(e: React.PointerEvent) {
    resize.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const HANDLES = [
    { isLeft: true, isTop: true, cls: '-top-1 -left-1 cursor-nwse-resize' },
    { isLeft: false, isTop: true, cls: '-top-1 -right-1 cursor-nesw-resize' },
    { isLeft: true, isTop: false, cls: '-bottom-1 -left-1 cursor-nesw-resize' },
    {
      isLeft: false,
      isTop: false,
      cls: '-bottom-1 -right-1 cursor-nwse-resize',
    },
  ]

  const lines = stampLines(data)

  return (
    <div
      ref={containerRef}
      className="flex min-h-0 min-w-0 flex-1 flex-col items-center overflow-y-auto"
    >
      {scale > 0 && (
        <div
          ref={contentRef}
          className="relative"
          style={{ width: contentW, height: contentH }}
        >
          {previews.map((pg, i) => (
            <img
              key={i}
              src={pg.dataUrl}
              alt={`Page ${i + 1}`}
              draggable={false}
              onClick={(e) => onPageClick(i, e)}
              className={cn(
                'absolute cursor-crosshair rounded-md shadow-lg ring-1 select-none',
                i === pos.page ? 'ring-2 ring-primary/50' : 'ring-border',
              )}
              style={{
                left: boxes[i].left,
                top: boxes[i].top,
                width: boxes[i].w,
                height: boxes[i].h,
              }}
            />
          ))}

          {/* Cartouche déplaçable ET redimensionnable — réplique HTML de pdf-lib. */}
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="absolute flex cursor-move flex-col ring-1 ring-black/10"
            style={{
              left: boxes[pos.page].left + pos.x * scale,
              top: boxes[pos.page].top + pos.y * scale,
              width: box.width * scale,
              height: box.height * scale,
              padding: STAMP_PAD * ss * scale,
              backgroundColor: 'rgba(255,255,255,0.92)',
              border: `1.4px solid ${STAMP_COLORS.red}`,
              touchAction: 'none',
              boxSizing: 'border-box',
            }}
          >
            {lines.map((line, i) => (
              <span
                key={i}
                style={{
                  fontSize: line.size * ss * scale,
                  lineHeight: 1,
                  marginTop: i ? STAMP_LINE_GAP * ss * scale : 0,
                  fontWeight: line.bold ? 700 : 400,
                  color: STAMP_COLORS[line.color],
                  fontFamily: 'Helvetica, Arial, sans-serif',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {line.text}
              </span>
            ))}

            {/* Poignées de redimensionnement (coins) */}
            {HANDLES.map((h, i) => (
              <div
                key={i}
                onPointerDown={(e) => onResizeDown(e, h.isLeft, h.isTop)}
                onPointerMove={onResizeMove}
                onPointerUp={onResizeUp}
                className={cn(
                  'absolute size-2.5 rounded-sm border border-white bg-primary shadow',
                  h.cls,
                )}
                style={{ touchAction: 'none' }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
