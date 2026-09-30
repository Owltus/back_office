import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

/*
 * Zoom de la grille des cartes d'un chapitre — porté de Registre
 * (`lib/hooks/useChapterZoom.ts`). Le nombre de colonnes se règle par
 * Ctrl + molette SUR LA ZONE des documents, ou Ctrl + « + » / « - » / « 0 » ; `0` (auto)
 * laisse le navigateur remplir la largeur avec des cartes d'environ 280 px.
 *
 * Écarts avec la source :
 *   - la préférence était en SQLite (table `preferences`) ; ici,
 *     `localStorage` (clé `bo.classeur.colonnes.v1`), lecture et écriture
 *     sous `try/catch` — un poste partagé peut refuser le stockage ;
 *   - la molette n'est écoutée que sur la ZONE qui contient les documents
 *     (`zoneRef`, et non sur `window`) : Ctrl + molette ailleurs dans
 *     l'application reste le zoom du navigateur. Jusqu'au 2026-09-30 elle
 *     l'était sur la seule grille — il fallait viser une carte, et le
 *     moindre espace vide (sous les cartes, entre deux) zoomait toute la
 *     page du navigateur (retour utilisateur).
 */

const CLE_STOCKAGE = 'bo.classeur.colonnes.v1'
const MIN_COLONNES = 1
const AUTO = 0
/** Largeur cible d'une carte en mode auto. */
const LARGEUR_CIBLE = 280
/** Largeur minimale d'une carte : borne haute du nombre de colonnes. */
const LARGEUR_MIN = 150
/** `gap-4` de la grille. */
const GAP_PX = 16

function lireStockage(): number {
  try {
    const brut = window.localStorage.getItem(CLE_STOCKAGE)
    const n = Number(brut)
    return brut !== null && Number.isInteger(n) && n >= 0 ? n : AUTO
  } catch {
    return AUTO
  }
}

function ecrireStockage(valeur: number): void {
  try {
    window.localStorage.setItem(CLE_STOCKAGE, String(valeur))
  } catch {
    // Stockage refusé : la préférence ne survit pas à la séance, sans plus.
  }
}

/** Colonnes effectives en mode auto : proportion de la borne haute. */
function resoudre(colonnes: number, maxColonnes: number): number {
  if (colonnes !== AUTO) return Math.min(colonnes, maxColonnes)
  return Math.max(
    MIN_COLONNES,
    Math.round((maxColonnes * LARGEUR_CIBLE) / (LARGEUR_CIBLE + LARGEUR_MIN)),
  )
}

export function useChapterZoom() {
  const [colonnes, setColonnes] = useState<number>(lireStockage)
  const [maxColonnes, setMaxColonnes] = useState(6)
  const observerRef = useRef<ResizeObserver | null>(null)

  const zoom = useCallback(
    (direction: 1 | -1) => {
      setColonnes((prev) => {
        const courant = resoudre(prev, maxColonnes)
        const suivant =
          direction === 1
            ? Math.max(courant - 1, MIN_COLONNES)
            : Math.min(courant + 1, maxColonnes)
        ecrireStockage(suivant)
        return suivant
      })
    },
    [maxColonnes],
  )

  const reset = useCallback(() => {
    setColonnes(AUTO)
    ecrireStockage(AUTO)
  }, [])

  // Refs stables pour les écouteurs (pas de réabonnement à chaque rendu).
  const zoomRef = useRef(zoom)
  const resetRef = useRef(reset)
  useEffect(() => {
    zoomRef.current = zoom
    resetRef.current = reset
  }, [zoom, reset])

  /**
   * Ref de rappel à poser sur la GRILLE : ResizeObserver (borne haute du
   * nombre de colonnes).
   */
  const containerRef = useCallback((node: HTMLElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }
    if (!node) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const largeur = entry.contentRect.width
        const max = Math.max(
          MIN_COLONNES,
          Math.floor((largeur + GAP_PX) / (LARGEUR_MIN + GAP_PX)),
        )
        setMaxColonnes((prev) => (prev === max ? prev : max))
      }
    })
    observer.observe(node)
    observerRef.current = observer
  }, [])

  /**
   * Ref de rappel à poser sur la ZONE qui contient les documents (toute la
   * hauteur restante de la page, vide compris) : Ctrl + molette. `onWheel`
   * React est passif, donc incapable de `preventDefault` : écouteur DOM
   * explicite.
   */
  const detacherRef = useRef<(() => void) | null>(null)
  const zoneRef = useCallback((node: HTMLElement | null) => {
    detacherRef.current?.()
    detacherRef.current = null
    if (!node) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      zoomRef.current(e.deltaY > 0 ? -1 : 1)
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    detacherRef.current = () => node.removeEventListener('wheel', onWheel)
  }, [])

  // Raccourcis clavier Ctrl + « + » / « - » / « 0 », tant que la page est montée.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.ctrlKey && !e.metaKey) return
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        zoomRef.current(1)
      } else if (e.key === '-') {
        e.preventDefault()
        zoomRef.current(-1)
      } else if (e.key === '0') {
        e.preventDefault()
        resetRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const effectives =
    colonnes === AUTO ? undefined : Math.min(colonnes, maxColonnes)

  const gridStyle = useMemo<CSSProperties>(
    () =>
      effectives
        ? { gridTemplateColumns: `repeat(${effectives}, minmax(0, 1fr))` }
        : {
            gridTemplateColumns: `repeat(auto-fill, minmax(${LARGEUR_CIBLE}px, 1fr))`,
          },
    [effectives],
  )

  return { gridStyle, containerRef, zoneRef }
}
