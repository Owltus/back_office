import { useCallback, useRef, useState } from 'react'

import {
  CONTENT_HEIGHT_MM,
  CONTENT_WIDTH_MM,
  mmToPx,
} from '#/lib/classeur/print/constants.ts'
import { paginate } from '#/lib/classeur/print/paginate.ts'
import type { PageData } from '#/lib/classeur/print/paginate.ts'

export type { PageData }

export interface PaginationResult {
  pages: PageData[]
  measuring: boolean
  measureRef: (node: HTMLDivElement | null) => void
}

/*
 * Hook de pagination — porté de Registre (`src/lib/print/usePagination.ts`).
 *
 * @param contentKey  Clé qui identifie le contenu (ex : le markdown brut).
 *                    Un changement de clé force une re-mesure + re-pagination.
 *
 * Phase 1 : mesure dans un conteneur caché → découpage en pages via paginate().
 * Phase 2 : rendu du HTML extrait de chaque page dans un <A4Page>.
 *
 * Écart avec la source : la garde « ne pas re-mesurer si la clé n'a pas
 * changé » lisait `pages.length` dans la fermeture du callback, avec un
 * `eslint-disable` pour l'exclure des dépendances. `hasPaginated` (ref)
 * porte la même information sans directive.
 */
export function usePagination(contentKey?: string): PaginationResult {
  const [pages, setPages] = useState<PageData[]>([])
  const [measuring, setMeasuring] = useState(true)
  const lastKey = useRef<string | undefined>(undefined)
  const hasPaginated = useRef(false)

  const measureRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return
      // Ne re-mesurer que si la clé a changé (ou première mesure)
      if (lastKey.current === contentKey && hasPaginated.current) return
      lastKey.current = contentKey

      // Ne montrer le spinner que lors de la première pagination,
      // pas lors des re-paginations (pour éviter de détruire le DOM et le scroll)
      if (!hasPaginated.current) {
        setMeasuring(true)
      }

      // Attendre que le DOM ait fini de peindre, que les Mermaid soient
      // rendus ET que les images soient chargées (une image non chargée
      // mesure 0 px : la page déborderait à l'affichage).
      requestAnimationFrame(() => {
        void Promise.all([waitForMermaid(node), waitForImages(node)]).then(
          () => {
            const maxHeight = mmToPx(CONTENT_HEIGHT_MM)
            const pageData = paginate(node, maxHeight)

            setPages(pageData)
            setMeasuring(false)
            hasPaginated.current = true
          },
        )
      })
    },
    [contentKey],
  )

  return { pages, measuring, measureRef }
}

/**
 * Attend que tous les diagrammes Mermaid soient rendus dans le conteneur.
 * Résout immédiatement si aucun diagramme n'est en attente.
 */
function waitForMermaid(container: HTMLElement): Promise<void> {
  const pending = container.querySelectorAll('[data-mermaid-status="pending"]')
  if (pending.length === 0) return Promise.resolve()

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const still = container.querySelectorAll(
        '[data-mermaid-status="pending"]',
      )
      if (still.length === 0) {
        observer.disconnect()
        resolve()
      }
    })
    // `attributes` suffit quand React met à jour le même <div> (cas nominal) ;
    // `childList` couvre un remplacement de nœud.
    observer.observe(container, {
      attributes: true,
      childList: true,
      subtree: true,
    })
  })
}

/** Délai au-delà duquel on pagine sans attendre une image qui ne vient pas. */
const IMAGES_ATTENTE_MAX_MS = 8000

/**
 * Attend le chargement (ou l'échec) de toutes les `<img>` du conteneur —
 * ajout du 2026-09-26 avec les images des documents. Une image en erreur
 * ne bloque pas : elle est paginée avec sa hauteur (nulle).
 */
export function waitForImages(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll('img')).filter(
    (img) => !img.complete,
  )
  if (images.length === 0) return Promise.resolve()
  return new Promise((resolve) => {
    let restantes = images.length
    const minuteur = setTimeout(resolve, IMAGES_ATTENTE_MAX_MS)
    const une = () => {
      restantes -= 1
      if (restantes === 0) {
        clearTimeout(minuteur)
        resolve()
      }
    }
    for (const img of images) {
      img.addEventListener('load', une, { once: true })
      img.addEventListener('error', une, { once: true })
    }
  })
}

/**
 * Largeur de la zone contenu A4 en px (pour dimensionner le conteneur de
 * mesure).
 */
export function getContentWidthPx(): number {
  return mmToPx(CONTENT_WIDTH_MM)
}
