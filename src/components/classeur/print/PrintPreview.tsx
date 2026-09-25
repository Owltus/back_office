import { useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Printer } from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { printViaIframe } from '#/lib/classeur/print/printIframe.ts'

interface PrintPreviewProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Titre du dialogue. Par défaut « Aperçu avant impression ». */
  title?: string
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
 * (« Enregistrer en PDF » dans le dialogue du navigateur). Le bouton
 * « Télécharger » de Registre (Edge headless via Rust) n'a pas été porté.
 */
export function PrintPreview({
  open,
  onOpenChange,
  title = 'Aperçu avant impression',
  containerRef,
  children,
}: PrintPreviewProps) {
  const innerRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = containerRef ?? innerRef
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePrint = async () => {
    const container = scrollRef.current
    if (!container || busy) return
    setBusy(true)
    setError(null)
    try {
      await printViaIframe(container)
    } catch {
      setError("Impression impossible. Réessayez ou fermez l'aperçu.")
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
          </div>
          <div className="flex items-center gap-2">
            {error && (
              <span role="alert" className="text-xs text-destructive">
                {error}
              </span>
            )}
            <Button
              size="sm"
              onClick={handlePrint}
              disabled={busy}
              aria-label="Imprimer ou enregistrer en PDF"
            >
              <Printer className="size-4" aria-hidden />
              Imprimer / PDF
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
          ref={scrollRef}
          className="classeur-print-preview-scroll flex-1 overflow-y-auto bg-muted/50 p-6"
        >
          <div className="flex flex-col items-center gap-6">{children}</div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
