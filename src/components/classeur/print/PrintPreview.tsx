import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Printer, X } from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import {
  MiseEnPageEnCours,
  SELECTEUR_PAGINATION_EN_COURS,
} from '#/lib/classeur/print/buildPrintHtml.ts'
import { printViaIframe } from '#/lib/classeur/print/printIframe.ts'
import { echelleEffective } from '#/lib/classeur/zoom.ts'

/**
 * Aide sous le titre, TOUJOURS lisible (retour à la ligne, jamais tronquée).
 * Ni guillemets français ni tiret cadratin (règle des messages).
 */
export const AIDE_PDF =
  'Pour un fichier PDF, choisissez Enregistrer au format PDF comme imprimante.'

/** Place UTILE de la zone des pages (rembourrages déduits), en px CSS. */
function placeUtile(n: HTMLElement): { largeur: number; hauteur: number } {
  const st = n.ownerDocument.defaultView?.getComputedStyle(n)
  const px = (v: string | undefined) => parseFloat(v ?? '') || 0
  return {
    largeur: n.clientWidth - px(st?.paddingLeft) - px(st?.paddingRight),
    hauteur: n.clientHeight - px(st?.paddingTop) - px(st?.paddingBottom),
  }
}

interface PrintPreviewProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Titre du dialogue. Par défaut « Aperçu avant impression ». */
  title?: string
  /**
   * Nom du fichier proposé par « Enregistrer au format PDF » (le `<title>`
   * du document imprimé), construit par `nomFichierImpression`. À défaut,
   * « Classeur ».
   */
  nomFichier?: string
  /**
   * Ref du conteneur défilant qui contient les pages A4, pour appeler
   * `printViaIframe` (ou `imprimerApercu`) depuis l'extérieur. Facultatif :
   * le bouton du dialogue s'en charge déjà.
   */
  containerRef?: RefObject<HTMLDivElement | null>
  /** Les pages A4 (`DocumentPages`, `TrackingSheetPage`, …). */
  children: ReactNode
}

/*
 * Modale d'aperçu avant impression — portée de Registre, sur `ui/dialog`.
 *
 * Affiche les pages A4 (blanches) dans un dialogue plein écran défilant.
 *
 * Une seule sortie : « Imprimer » (iframe caché, `printViaIframe`), texte
 * vectoriel ; pour un fichier, « Enregistrer au format PDF » du navigateur.
 * (Le PDF en images, pages capturées dans le navigateur, a été RETIRÉ le
 * 2026-10-08 à la demande de l'utilisateur.)
 *
 * Écran étroit (B1, A4) : l'en-tête passe à la ligne, le bouton Fermer reste
 * à côté du titre ; les pages sont AJUSTÉES à la largeur par défaut
 * (`echelleEffective('ajuster', …)`, même logique que l'éditeur), sans
 * aucun contrôle de zoom. Le zoom est un `zoom` CSS sur l'enveloppe des
 * pages : la page elle-même n'est pas touchée, donc l'impression (copie des
 * `.a4-page`) ne change pas.
 */
export function PrintPreview({
  open,
  onOpenChange,
  title = 'Aperçu avant impression',
  nomFichier,
  containerRef,
  children,
}: PrintPreviewProps) {
  const innerRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = containerRef ?? innerRef
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Audit du 2026-10-04 : imprimer pendant qu'un document mesure encore
  // (images, schéma Mermaid) l'omettait du document imprimé, sans un mot.
  // Le bouton attend que plus aucun marqueur `data-pagination="en-cours"`
  // ne reste dans l'aperçu (`printViaIframe` attend aussi, borné).
  const [noeud, setNoeud] = useState<HTMLDivElement | null>(null)
  const [preparation, setPreparation] = useState(false)
  const [place, setPlace] = useState({ largeur: 0, hauteur: 0 })
  const poserRef = useCallback(
    (n: HTMLDivElement | null) => {
      scrollRef.current = n
      setNoeud(n)
    },
    [scrollRef],
  )

  useEffect(() => {
    if (!noeud) return
    const relire = () =>
      setPreparation(
        noeud.querySelector(SELECTEUR_PAGINATION_EN_COURS) !== null,
      )
    relire()
    const observer = new MutationObserver(relire)
    observer.observe(noeud, {
      attributes: true,
      attributeFilter: ['data-pagination'],
      childList: true,
      subtree: true,
    })
    return () => observer.disconnect()
  }, [noeud])

  // Largeur UTILE de la zone des pages, pour l'ajustement à l'écran.
  useEffect(() => {
    if (!noeud) return
    const mesurer = () => setPlace(placeUtile(noeud))
    mesurer()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(mesurer)
    ro.observe(noeud)
    return () => ro.disconnect()
  }, [noeud])

  // Ajusté à la largeur, sans contrôle à l'écran (boutons de zoom retirés
  // le 2026-10-08 à la demande de l'utilisateur) ; plafonné à 100 %, donc
  // seul un écran étroit réduit les pages. Place inconnue (premier rendu,
  // jsdom) : 100 %.
  const echelle = place.largeur > 0 ? echelleEffective('ajuster', place) : 1

  const handlePrint = async () => {
    const container = scrollRef.current
    if (!container || busy || preparation) return
    setBusy(true)
    setError(null)
    try {
      await printViaIframe(container, { nomFichier })
    } catch (err) {
      setError(
        err instanceof MiseEnPageEnCours
          ? err.message
          : "Impression impossible. Réessayez ou fermez l'aperçu.",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="classeur-print-preview flex h-[92dvh] w-[95vw] max-w-[880px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[880px]"
      >
        {/* En-tête. Ligne 1 : titre + aide (qui passent à la ligne) et
            Fermer, toujours visible. Ligne 2 : Imprimer, qui passe
            à la ligne sur un écran étroit (B1). */}
        <div className="flex shrink-0 flex-col gap-2 border-b border-border px-3 py-2 sm:px-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-sm font-semibold break-words">
                {title}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Aperçu des pages A4 telles qu'elles seront imprimées.
              </DialogDescription>
              <p className="text-xs text-muted-foreground" data-aide-pdf="">
                {AIDE_PDF}
              </p>
            </div>
            <DialogClose asChild>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 pointer-coarse:h-11"
                aria-label="Fermer l'aperçu"
              >
                <X className="size-4 sm:hidden" aria-hidden />
                <span className="max-sm:sr-only">Fermer</span>
              </Button>
            </DialogClose>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              size="sm"
              className="pointer-coarse:h-11"
              onClick={handlePrint}
              disabled={busy || preparation}
              aria-label="Imprimer"
            >
              <Printer className="size-4" aria-hidden />
              {preparation ? 'Préparation…' : 'Imprimer'}
            </Button>
          </div>
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        {/* Zone défilante avec les pages A4 */}
        <div
          ref={poserRef}
          className="classeur-print-preview-scroll flex-1 overflow-auto bg-muted/50 p-3 sm:p-6"
        >
          {/* `items-center-safe` : une page plus large que l'écran (zoom
              agrandi) déborde à droite, jamais à gauche où elle serait
              inatteignable. `zoom` sur l'ENVELOPPE seulement : les pages
              imprimées restent à l'échelle 1. */}
          <div
            className="flex flex-col items-center-safe gap-6"
            data-zoom-pages=""
            style={echelle === 1 ? undefined : { zoom: echelle }}
          >
            {children}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
