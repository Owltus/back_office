import { CircleAlert } from 'lucide-react'

/*
 * Bandeau « fichiers PMS manquants » — le PMS n'a pas transmis (ou plus, en
 * cas de panne côté DSI) un ou des exports StayNTouch attendus pour le cycle
 * courant, donc le rapport ne partira pas automatiquement.
 *
 * Une seule phrase (voir pmsStatus.buildMessage), sur le même gabarit que
 * SendStatusBanner : jamais de liste ni de retour à la ligne, quelle que soit
 * la combinaison de fichiers manquants.
 */
interface PmsFilesBannerProps {
  message: string
}

export function PmsFilesBanner({ message }: PmsFilesBannerProps) {
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
    >
      <CircleAlert className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
    </div>
  )
}
