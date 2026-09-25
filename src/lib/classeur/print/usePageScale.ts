import { useCallback, useRef, useState } from 'react'

import {
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  mmToPx,
} from '#/lib/classeur/print/constants.ts'

/** Dimensions réelles d'une page A4 en px (96 DPI) */
const PAGE_W_PX = mmToPx(PAGE_WIDTH_MM)
const PAGE_H_PX = mmToPx(PAGE_HEIGHT_MM)

/*
 * Hook qui calcule le scale optimal pour afficher une page A4 dans un
 * conteneur donné — porté de Registre (`src/lib/hooks/usePageScale.ts`).
 * Retourne un ref callback à attacher au conteneur et la valeur de scale
 * actuelle. Utilisé par les pages de détail (aperçu à côté de l'éditeur) ;
 * `PrintPreview` n'en a pas besoin (pages à l'échelle 1 dans un défilement).
 *
 * @param mode "fit" scale en X et Y pour centrer la page, "width" scale
 *             uniquement en X
 */
export function usePageScale(mode: 'fit' | 'width' = 'fit') {
  const [scale, setScale] = useState(mode === 'fit' ? 1 : 0.5)
  const roRef = useRef<ResizeObserver | null>(null)

  const containerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (roRef.current) {
        roRef.current.disconnect()
        roRef.current = null
      }
      if (!node) return

      const compute = () => {
        const rect = node.getBoundingClientRect()
        const pad = mode === 'fit' ? 32 : 48
        if (mode === 'fit') {
          const sx = (rect.width - pad) / PAGE_W_PX
          const sy = (rect.height - pad) / PAGE_H_PX
          setScale(Math.min(sx, sy))
        } else {
          setScale(Math.min(1, (rect.width - pad) / PAGE_W_PX))
        }
      }
      compute()
      const ro = new ResizeObserver(compute)
      ro.observe(node)
      roRef.current = ro
    },
    [mode],
  )

  return { containerRef, scale }
}
