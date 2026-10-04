import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Download, Printer, X } from 'lucide-react'

import { ZoomApercu } from '#/components/classeur/detail/ZoomApercu.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { TooltipProvider } from '#/components/ui/tooltip.tsx'
import {
  MiseEnPageEnCours,
  SELECTEUR_PAGINATION_EN_COURS,
} from '#/lib/classeur/print/buildPrintHtml.ts'
import { avertissementLongPdf } from '#/lib/classeur/print/estimationPdf.ts'
import { printViaIframe } from '#/lib/classeur/print/printIframe.ts'
import {
  echelleEffective,
  palierPrecedent,
  palierSuivant,
} from '#/lib/classeur/zoom.ts'
import type { ModeZoom } from '#/lib/classeur/zoom.ts'

/**
 * Aide sous le titre, TOUJOURS lisible (retour à la ligne, jamais tronquée).
 * Ni guillemets français ni tiret cadratin (règle des messages).
 */
export const AIDE_PDF =
  'Télécharger le PDF : un fichier prêt à envoyer. Imprimer : texte plus net, choisissez Enregistrer au format PDF pour un PDF sélectionnable.'

/** Libellé du bouton de téléchargement pendant la création. */
export function libelleCreationPdf(pdf: {
  fait: number
  total: number
}): string {
  return pdf.total > 0
    ? `Création du PDF… ${Math.min(pdf.fait + 1, pdf.total)} / ${pdf.total}`
    : 'Création du PDF…'
}

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
   * du document imprimé) et du PDF téléchargé, construit par
   * `nomFichierImpression`. À défaut, « Classeur ».
   */
  nomFichier?: string
  /**
   * Ref du conteneur défilant qui contient les pages A4, pour appeler
   * `printViaIframe` (ou `imprimerApercu`) depuis l'extérieur. Facultatif :
   * les boutons du dialogue s'en chargent déjà.
   */
  containerRef?: RefObject<HTMLDivElement | null>
  /**
   * Accès direct « Télécharger le PDF » en un clic : vrai, le
   * téléchargement démarre SEUL dès que la pagination de l'aperçu est
   * prête, une fois par ouverture (ni relancé après une annulation ou une
   * erreur, ni au rendu suivant). L'aperçu reste ouvert, avec la
   * progression et Annuler ; le fermer annule.
   */
  autoTelecharger?: boolean
  /** Appelé quand un PDF a été enregistré (pour fermer l'aperçu, par ex.). */
  onPdfTermine?: (resultat: { pages: number; nom: string }) => void
  /** Les pages A4 (`DocumentPages`, `TrackingSheetPage`, …). */
  children: ReactNode
}

/*
 * Modale d'aperçu avant impression — portée de Registre, sur `ui/dialog`.
 *
 * Affiche les pages A4 (blanches) dans un dialogue plein écran défilant.
 *
 * Deux sorties (audit du 2026-10-04, A2 : l'utilisateur avait demandé
 * « télécharger directement un PDF », et le bouton mis en avant restait
 * Imprimer) :
 * - « Télécharger le PDF », bouton PRINCIPAL : fichier produit dans le
 *   navigateur, pages capturées en image (`lib/classeur/print/pdfDirect.ts`,
 *   chargé au clic avec html2canvas-pro et jspdf). Progression « n / N »,
 *   Annuler, et fermer l'aperçu ANNULE (dit dans la ligne d'état) ;
 * - « Imprimer », secondaire : iframe caché (`printViaIframe`), texte
 *   vectoriel, et « Enregistrer au format PDF » du navigateur.
 *
 * Écran étroit (B1, A4) : l'en-tête passe à la ligne, le bouton Fermer reste
 * à côté du titre ; les pages sont AJUSTÉES à la largeur par défaut
 * (`echelleEffective('ajuster', …)`, même logique que l'éditeur) avec le
 * contrôle `ZoomApercu`. Le zoom est un `zoom` CSS sur l'enveloppe des
 * pages : la page elle-même n'est pas touchée, donc ni l'impression (copie
 * des `.a4-page`) ni la capture du PDF (page isolée, échelle 1) ne changent.
 */
export function PrintPreview({
  open,
  onOpenChange,
  title = 'Aperçu avant impression',
  nomFichier,
  containerRef,
  autoTelecharger = false,
  onPdfTermine,
  children,
}: PrintPreviewProps) {
  const innerRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = containerRef ?? innerRef
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Audit du 2026-10-04 : imprimer pendant qu'un document mesure encore
  // (images, schéma Mermaid) l'omettait du document imprimé, sans un mot.
  // Les boutons attendent que plus aucun marqueur `data-pagination="en-cours"`
  // ne reste dans l'aperçu (`printViaIframe` attend aussi, borné).
  const [noeud, setNoeud] = useState<HTMLDivElement | null>(null)
  const [preparation, setPreparation] = useState(false)
  const [nbPages, setNbPages] = useState(0)
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
    const relire = () => {
      setPreparation(
        noeud.querySelector(SELECTEUR_PAGINATION_EN_COURS) !== null,
      )
      setNbPages(noeud.querySelectorAll('.a4-page').length)
    }
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

  const [modeZoom, setModeZoom] = useState<ModeZoom>('ajuster')
  // Place inconnue (premier rendu, jsdom) : 100 %, comme avant.
  const echelle = place.largeur > 0 ? echelleEffective(modeZoom, place) : 1
  const zoomer = (direction: 1 | -1) =>
    setModeZoom(
      direction > 0 ? palierSuivant(echelle) : palierPrecedent(echelle),
    )

  // Progression du PDF téléchargé : null = aucun en cours.
  const [pdf, setPdf] = useState<{ fait: number; total: number } | null>(null)
  const controleur = useRef<AbortController | null>(null)

  const annulerPdf = useCallback(() => {
    controleur.current?.abort()
    controleur.current = null
  }, [])

  // Démonté (aperçu fermé par le parent) : la création est annulée.
  useEffect(() => annulerPdf, [annulerPdf])
  useEffect(() => {
    if (!open) annulerPdf()
  }, [open, annulerPdf])

  const handlePdf = async () => {
    const container = scrollRef.current
    if (!container || busy || preparation || controleur.current) return
    const ctrl = new AbortController()
    controleur.current = ctrl
    setPdf({ fait: 0, total: 0 })
    setError(null)
    try {
      const { telechargerPdf } =
        await import('#/lib/classeur/print/pdfDirect.ts')
      const resultat = await telechargerPdf(container, {
        nomFichier,
        signal: ctrl.signal,
        onProgression: (fait, total) => {
          if (!ctrl.signal.aborted) setPdf({ fait, total })
        },
      })
      if (!ctrl.signal.aborted) onPdfTermine?.(resultat)
    } catch (err) {
      // Annulé (bouton Annuler ou aperçu fermé) : voulu, aucun message.
      if (!ctrl.signal.aborted) {
        setError(
          err instanceof MiseEnPageEnCours
            ? err.message
            : 'Création du PDF impossible. Réessayez, ou utilisez Imprimer.',
        )
      }
    } finally {
      if (controleur.current === ctrl) controleur.current = null
      setPdf(null)
    }
  }

  // Accès direct en un clic : une seule fois par ouverture, pagination prête.
  const autoLance = useRef(false)
  useEffect(() => {
    if (!open) {
      autoLance.current = false
      return
    }
    if (!autoTelecharger || autoLance.current) return
    if (!noeud || preparation || nbPages === 0) return
    autoLance.current = true
    void handlePdf()
    // `handlePdf` lit l'état courant ; seule la disponibilité déclenche.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoTelecharger, noeud, preparation, nbPages])

  const handlePrint = async () => {
    const container = scrollRef.current
    if (!container || busy || preparation || pdf) return
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

  const changerOuverture = (ouvert: boolean) => {
    // Fermer pendant la création = annulation EXPLICITE (dite à l'écran).
    if (!ouvert) annulerPdf()
    onOpenChange(ouvert)
  }

  const enCreation = pdf !== null
  // B7 : chaque bouton n'affiche QUE son propre état. Pendant la mesure,
  // les deux attendent ; pendant la création du PDF, Imprimer garde son
  // libellé (désactivé) ; pendant l'impression, le PDF aussi.
  const libellePdf = enCreation
    ? libelleCreationPdf(pdf)
    : preparation
      ? 'Préparation…'
      : 'Télécharger le PDF'
  const libelleImprimer =
    !enCreation && preparation ? 'Préparation…' : 'Imprimer'
  const avertissement =
    !enCreation && !preparation ? avertissementLongPdf(nbPages) : null

  return (
    <Dialog open={open} onOpenChange={changerOuverture}>
      <DialogContent
        showCloseButton={false}
        className="classeur-print-preview flex h-[92dvh] w-[95vw] max-w-[880px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[880px]"
      >
        {/* En-tête. Ligne 1 : titre + aide (qui passent à la ligne) et
            Fermer, toujours visible. Ligne 2 : zoom et sorties, qui passent
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
                aria-label={
                  enCreation
                    ? "Fermer l'aperçu et annuler le PDF"
                    : "Fermer l'aperçu"
                }
              >
                <X className="size-4 sm:hidden" aria-hidden />
                <span className="max-sm:sr-only">Fermer</span>
              </Button>
            </DialogClose>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* Fournisseur local : l'aperçu est aussi rendu hors de
                l'application (tests, pages isolées). */}
            <TooltipProvider>
              <ZoomApercu
                className="mr-auto"
                mode={modeZoom}
                echelle={echelle}
                onMode={setModeZoom}
                onZoomer={zoomer}
              />
            </TooltipProvider>
            <Button
              size="sm"
              variant="outline"
              className="pointer-coarse:h-11"
              onClick={handlePrint}
              disabled={busy || preparation || enCreation}
              aria-label="Imprimer"
            >
              <Printer className="size-4" aria-hidden />
              {libelleImprimer}
            </Button>
            {enCreation && (
              <Button
                size="sm"
                variant="outline"
                className="pointer-coarse:h-11"
                onClick={annulerPdf}
              >
                Annuler
              </Button>
            )}
            <Button
              size="sm"
              className="pointer-coarse:h-11"
              onClick={handlePdf}
              disabled={busy || preparation || enCreation}
              aria-label="Télécharger le PDF"
            >
              <Download className="size-4" aria-hidden />
              <span className="tabular-nums">{libellePdf}</span>
            </Button>
          </div>
          {(error || enCreation || avertissement) && (
            <p
              className={
                error
                  ? 'text-xs text-destructive'
                  : 'text-xs text-muted-foreground'
              }
              role={error ? 'alert' : 'status'}
            >
              {error ??
                (enCreation
                  ? "Fermer l'aperçu annule la création du PDF."
                  : avertissement)}
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
              imprimées et capturées restent à l'échelle 1. */}
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
