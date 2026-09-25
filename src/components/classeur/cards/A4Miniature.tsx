import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import {
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  mmToPx,
} from '#/lib/classeur/print/constants.ts'

const PAGE_W_PX = mmToPx(PAGE_WIDTH_MM)
const PAGE_H_PX = mmToPx(PAGE_HEIGHT_MM)

/**
 * Miniature d'une page A4 — portée de Registre (`A4Preview`). Le composant
 * d'impression RÉEL (`DocumentPages`, `TrackingSheetPage`…) est rendu à sa
 * taille (210 × 297 mm) puis réduit par `transform: scale()` pour tenir dans
 * la largeur de la carte ; le ratio A4 est toujours respecté. Un
 * `ResizeObserver` recalcule l'échelle au redimensionnement.
 *
 * Seule la PREMIÈRE page est visible (la miniature est rognée) ; la classe
 * `a4-miniature` retire l'ombre des pages (`styles/classeur.css`).
 */
export function A4Miniature({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)

  const onResize = useCallback((entries: ResizeObserverEntry[]) => {
    for (const entry of entries) {
      const w = entry.contentRect.width
      if (w > 0) setScale(w / PAGE_W_PX)
    }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(onResize)
    ro.observe(el)
    return () => ro.disconnect()
  }, [onResize])

  return (
    <div
      ref={containerRef}
      className="a4-miniature w-full overflow-hidden bg-white"
      style={{ aspectRatio: '210 / 297' }}
      aria-hidden="true"
    >
      {scale > 0 && (
        <div
          style={{
            transformOrigin: 'top left',
            transform: `scale(${scale})`,
            width: `${PAGE_W_PX}px`,
            height: `${PAGE_H_PX}px`,
            overflow: 'hidden',
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}
