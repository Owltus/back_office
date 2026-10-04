import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Download, Printer } from 'lucide-react'

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

const AIDE_PDF =
  'Télécharger le PDF : fichier prêt à envoyer. Pour un texte sélectionnable, Imprimer puis « Enregistrer au format PDF ».'

function libelleBoutonPdf(
  preparation: boolean,
  pdf: { fait: number; total: number } | null,
): string {
  if (pdf) {
    return pdf.total > 0
      ? `Création du PDF… (${Math.min(pdf.fait + 1, pdf.total)} / ${pdf.total})`
      : 'Création du PDF…'
  }
  return preparation ? 'Préparation…' : 'Télécharger le PDF'
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
   * le bouton Imprimer / PDF du dialogue s'en charge déjà.
   */
  containerRef?: RefObject<HTMLDivElement | null>
  /** Les pages A4 (`DocumentPages`, `TrackingSheetPage`, …). */
  children: ReactNode
}

/*
 * Modale d'aperçu avant impression — portée de Registre, sur `ui/dialog`.
 *
 * Affiche les pages A4 (blanches, à l'échelle 1) dans un dialogue plein
 * écran défilant. L'impression passe par un iframe caché
 * (`lib/classeur/print/printIframe.ts`) : c'est aussi le chemin « PDF »
 * (« Enregistrer en PDF » dans le dialogue du navigateur, avec le nom de
 * fichier `nomFichier` et une ligne d'aide sous le titre).
 *
 * « Télécharger le PDF » (D19 renversée par l'utilisateur le 2026-10-04) :
 * fichier produit dans le navigateur, pages capturées en image
 * (`lib/classeur/print/pdfDirect.ts`, chargé au clic avec html2canvas-pro
 * et jspdf). Même nom de fichier que l'impression.
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

  // Progression du PDF téléchargé : null = aucun en cours.
  const [pdf, setPdf] = useState<{ fait: number; total: number } | null>(null)

  const handlePdf = async () => {
    const container = scrollRef.current
    if (!container || busy || preparation || pdf) return
    setPdf({ fait: 0, total: 0 })
    setError(null)
    try {
      const { telechargerPdf } =
        await import('#/lib/classeur/print/pdfDirect.ts')
      await telechargerPdf(container, {
        nomFichier,
        onProgression: (fait, total) => setPdf({ fait, total }),
      })
    } catch (err) {
      setError(
        err instanceof MiseEnPageEnCours
          ? err.message
          : 'Création du PDF impossible. Réessayez, ou utilisez Imprimer.',
      )
    } finally {
      setPdf(null)
    }
  }

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="classeur-print-preview flex h-[92vh] w-[95vw] max-w-[880px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[880px]"
      >
        {/* En-tête : titre + actions */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
          <div className="min-w-0">
            <DialogTitle className="truncate text-sm font-semibold">
              {title}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Aperçu des pages A4 telles qu'elles seront imprimées.
            </DialogDescription>
            {/* Étape 9 : le PDF téléchargé est fait d'images ; le texte
                net et cherchable reste celui du dialogue du navigateur. */}
            <p
              className="truncate text-xs text-muted-foreground"
              title={AIDE_PDF}
            >
              {AIDE_PDF}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {error && (
              <span role="alert" className="text-xs text-destructive">
                {error}
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handlePdf}
              disabled={busy || preparation || pdf !== null}
              aria-label="Télécharger le PDF"
            >
              <Download className="size-4" aria-hidden />
              {libelleBoutonPdf(preparation, pdf)}
            </Button>
            <Button
              size="sm"
              onClick={handlePrint}
              disabled={busy || preparation || pdf !== null}
              aria-label="Imprimer ou enregistrer en PDF"
            >
              <Printer className="size-4" aria-hidden />
              {preparation ? 'Préparation…' : 'Imprimer / PDF'}
            </Button>
            <DialogClose asChild>
              <Button size="sm" variant="outline">
                Fermer
              </Button>
            </DialogClose>
          </div>
        </div>

        {/* Zone scrollable avec les pages A4 */}
        <div
          ref={poserRef}
          className="classeur-print-preview-scroll flex-1 overflow-y-auto bg-muted/50 p-6"
        >
          {/* `items-center-safe` : une page plus large que l'écran (téléphone)
              déborde à droite, jamais à gauche où elle serait inatteignable. */}
          <div className="flex flex-col items-center-safe gap-6">
            {children}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
