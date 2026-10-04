import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import {
  bornerEchelle,
  defilementPointFixe,
  echelleApresMolette,
  echelleEffective,
  ecrireModeZoom,
  lireModeZoom,
  palierPrecedent,
  palierSuivant,
} from '#/lib/classeur/zoom.ts'
import type { ModeZoom, PlaceApercu } from '#/lib/classeur/zoom.ts'

/*
 * Zoom de l'aperçu A4 d'un document, en lecture comme en édition (étape 8 ;
 * D27 « éditeur seulement » révisée par l'audit A4 du 2026-10-04 : la page
 * en lecture est l'aperçu le plus regardé), D28 : Ctrl + molette / Ctrl + 0 / Ctrl + « + » / « − »
 * interceptés AU-DESSUS de l'aperçu seulement, ailleurs le zoom du
 * navigateur reste). Sur le modèle de `useChapterZoom`.
 *
 * - Le MODE est mémorisé par poste (`localStorage`, clé versionnée, sous
 *   `try/catch`) : c'est un réglage d'écran, sans donnée, pas par document.
 * - L'ÉCHELLE EFFECTIVE (`echelle`) est calculée par `lib/classeur/zoom.ts`
 *   depuis la place mesurée de la colonne : c'est LA seule source pour le
 *   rendu (`zoom` CSS) ; la synchro texte ⇄ aperçu et la barre d'une image
 *   lisent des rapports de défilement et des `getBoundingClientRect`, déjà
 *   exprimés dans cette échelle.
 * - Tout changement garde un point fixe : sous la souris pour Ctrl +
 *   molette, au centre de la zone visible pour les boutons et le clavier.
 */

const CLE_STOCKAGE = 'bo.classeur.zoomApercu.v1'
/**
 * Marges retirées de la colonne : 48 px en largeur (valeur de l'ancien
 * `usePageScale('width')`, comportement « ajusté » inchangé), 32 px en
 * hauteur (le `py-4` autour des pages).
 */
const MARGE_X = 48
const MARGE_Y = 32

function lireStockage(): ModeZoom {
  try {
    return lireModeZoom(window.localStorage.getItem(CLE_STOCKAGE))
  } catch {
    return 'ajuster'
  }
}

function ecrireStockage(mode: ModeZoom): void {
  try {
    window.localStorage.setItem(CLE_STOCKAGE, ecrireModeZoom(mode))
  } catch {
    // Stockage refusé : le réglage ne survit pas à la séance, sans plus.
  }
}

/** Point à garder fixe pendant un changement d'échelle. */
type Ancre = {
  /** Position du point dans la zone visible, depuis son bord haut-gauche. */
  x: number
  y: number
  defilementX: number
  defilementY: number
  ancienne: number
}

export type ZoomApercu = ReturnType<typeof useZoomApercu>

export function useZoomApercu({
  hauteurBornee = true,
}: {
  /**
   * La colonne a-t-elle une hauteur propre (grand écran, hauteur mesurée
   * jusqu'au bas de la fenêtre) ? Sinon elle prend la hauteur de son
   * contenu, qui dépend de l'échelle : « page entière » bouclerait sur
   * elle-même (chaque mesure plus petite que la précédente). On prend
   * alors la hauteur de la fenêtre.
   */
  hauteurBornee?: boolean
} = {}) {
  const [mode, setModeEtat] = useState<ModeZoom>(lireStockage)
  const [place, setPlace] = useState<PlaceApercu | null>(null)
  // Avant la première mesure : 50 %, comme l'ancien `usePageScale('width')`.
  const echelle = place ? echelleEffective(mode, place) : 0.5

  const defilementNode = useRef<HTMLElement | null>(null)
  const echelleRef = useRef(echelle)
  const placeRef = useRef(place)
  const ancreRef = useRef<Ancre | null>(null)
  useLayoutEffect(() => {
    echelleRef.current = echelle
    placeRef.current = place
  }, [echelle, place])

  /** Change de mode en gardant fixe le point (x, y) de la zone visible. */
  const appliquer = useCallback(
    (suivant: ModeZoom, point?: { x: number; y: number }) => {
      const node = defilementNode.current
      const cible = placeRef.current
        ? echelleEffective(suivant, placeRef.current)
        : null
      // Une ancre seulement si l'échelle change vraiment : sinon aucun
      // rendu ne viendrait la consommer, et elle servirait plus tard, périmée.
      if (node && cible !== null && cible !== echelleRef.current) {
        if (!ancreRef.current) {
          ancreRef.current = {
            x: point?.x ?? node.clientWidth / 2,
            y: point?.y ?? node.clientHeight / 2,
            defilementX: node.scrollLeft,
            defilementY: node.scrollTop,
            ancienne: echelleRef.current,
          }
        } else if (point) {
          ancreRef.current.x = point.x
          ancreRef.current.y = point.y
        }
      }
      // L'échelle visée devient la référence des évènements suivants, avant
      // même le rendu (plusieurs crans de molette dans la même image).
      if (cible !== null) echelleRef.current = cible
      setModeEtat(suivant)
      ecrireStockage(suivant)
    },
    [],
  )

  // Après le rendu à la nouvelle échelle : défilement recalé sur l'ancre.
  useLayoutEffect(() => {
    const a = ancreRef.current
    const node = defilementNode.current
    ancreRef.current = null
    if (!a || !node || a.ancienne === echelle) return
    node.scrollLeft = defilementPointFixe(
      a.defilementX,
      a.x,
      a.ancienne,
      echelle,
    )
    node.scrollTop = defilementPointFixe(
      a.defilementY,
      a.y,
      a.ancienne,
      echelle,
    )
  }, [echelle])

  const definirMode = useCallback(
    (suivant: ModeZoom) =>
      appliquer(typeof suivant === 'number' ? bornerEchelle(suivant) : suivant),
    [appliquer],
  )

  /** « + » (1) ou « − » (-1) : palier suivant depuis l'échelle EFFECTIVE. */
  const zoomer = useCallback(
    (direction: 1 | -1) => {
      const e = echelleRef.current
      appliquer(direction === 1 ? palierSuivant(e) : palierPrecedent(e))
    },
    [appliquer],
  )

  const reinitialiser = useCallback(() => appliquer('ajuster'), [appliquer])

  // Mesure de la colonne qui défile.
  const roRef = useRef<ResizeObserver | null>(null)
  const borneeRef = useRef(hauteurBornee)
  const mesurerRef = useRef<(() => void) | null>(null)
  useLayoutEffect(() => {
    borneeRef.current = hauteurBornee
    mesurerRef.current?.()
  }, [hauteurBornee])
  const defilementRef = useCallback((node: HTMLElement | null) => {
    roRef.current?.disconnect()
    roRef.current = null
    mesurerRef.current = null
    defilementNode.current = node
    if (!node) return
    const mesurer = () => {
      const r = node.getBoundingClientRect()
      const hauteur = borneeRef.current ? r.height : window.innerHeight
      const suivante = {
        largeur: Math.max(0, r.width - MARGE_X),
        hauteur: Math.max(0, hauteur - MARGE_Y),
      }
      setPlace((p) =>
        p && p.largeur === suivante.largeur && p.hauteur === suivante.hauteur
          ? p
          : suivante,
      )
    }
    mesurerRef.current = mesurer
    mesurer()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(mesurer)
    ro.observe(node)
    roRef.current = ro
  }, [])

  /*
   * Zone d'écoute (colonne d'aperçu ET contrôle de zoom) : Ctrl + molette,
   * et présence du pointeur pour les raccourcis clavier. `onWheel` React
   * est passif, incapable de `preventDefault` : écouteur DOM explicite.
   */
  const dedansRef = useRef(false)
  const zoneNode = useRef<HTMLElement | null>(null)
  const detacherRef = useRef<(() => void) | null>(null)
  const zoneRef = useCallback(
    (node: HTMLElement | null) => {
      detacherRef.current?.()
      detacherRef.current = null
      zoneNode.current = node
      dedansRef.current = false
      if (!node) return
      const molette = (e: WheelEvent) => {
        // Molette seule : le défilement normal, sans y toucher.
        if (!e.ctrlKey && !e.metaKey) return
        e.preventDefault()
        const cible = defilementNode.current
        const r = cible?.getBoundingClientRect()
        appliquer(
          echelleApresMolette(echelleRef.current, e.deltaY, e.deltaMode),
          r ? { x: e.clientX - r.left, y: e.clientY - r.top } : undefined,
        )
      }
      const entre = () => {
        dedansRef.current = true
      }
      const sort = () => {
        dedansRef.current = false
      }
      node.addEventListener('wheel', molette, { passive: false })
      node.addEventListener('pointerenter', entre)
      node.addEventListener('pointerleave', sort)
      detacherRef.current = () => {
        node.removeEventListener('wheel', molette)
        node.removeEventListener('pointerenter', entre)
        node.removeEventListener('pointerleave', sort)
      }
    },
    [appliquer],
  )

  // Ctrl + 0 / « + » / « − » : seulement si le pointeur ou le focus est
  // dans l'aperçu ; sinon, le zoom du navigateur (D28).
  useEffect(() => {
    function surTouche(e: KeyboardEvent) {
      if (!e.ctrlKey && !e.metaKey) return
      // AltGr arrive sous Windows comme Ctrl + Alt : AltGr + à tape « @ »
      // en AZERTY (« } » en QWERTZ) avec `code` Digit0. Ce n'est jamais un
      // zoom : on laisse passer la frappe.
      if (e.altKey) return
      const zone = zoneNode.current
      if (!zone) return
      const focus = document.activeElement
      if (!dedansRef.current && !(focus && zone.contains(focus))) return
      if (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') {
        e.preventDefault()
        reinitialiser()
      } else if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
        e.preventDefault()
        zoomer(1)
      } else if (e.key === '-' || e.code === 'NumpadSubtract') {
        e.preventDefault()
        zoomer(-1)
      }
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [reinitialiser, zoomer])

  return {
    mode,
    echelle,
    definirMode,
    zoomer,
    reinitialiser,
    defilementRef,
    zoneRef,
  }
}
