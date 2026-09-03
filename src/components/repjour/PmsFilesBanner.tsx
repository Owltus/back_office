import { Check, CircleAlert } from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'

/*
 * Bandeau « fichiers PMS manquants » — le PMS n'a pas transmis (ou plus, en
 * cas de panne côté DSI) un ou des exports StayNTouch attendus pour le cycle
 * courant, donc le rapport ne partira pas automatiquement.
 *
 * Une seule phrase (voir pmsStatus.buildMessage), sur le même gabarit que
 * SendStatusBanner : jamais de liste ni de retour à la ligne, quelle que soit
 * la combinaison de fichiers manquants. Même bouton « Ignorer » (masquage
 * partagé, en base) : rendu seulement si `onIgnore` est fourni — l'appelant ne
 * le passe qu'aux rôles habilités ET quand un rapport existe à marquer.
 */
interface PmsFilesBannerProps {
  message: string
  /** Masque le rappel (décision partagée). Absent = pas de bouton. */
  onIgnore?: () => void
  /** Masquage en cours : désactive le bouton. */
  ignoring?: boolean
}

export function PmsFilesBanner({
  message,
  onIgnore,
  ignoring,
}: PmsFilesBannerProps) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
    >
      <CircleAlert className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
      {onIgnore && (
        <Button
          variant="outline"
          size="sm"
          onClick={onIgnore}
          disabled={ignoring}
          className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Check />
          Ignorer
        </Button>
      )}
    </div>
  )
}
