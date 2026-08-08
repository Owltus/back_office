import { MailWarning, Send } from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'

/*
 * Bandeau « pas encore envoyé » — filet de secours partagé RepJour / PDJ.
 *
 * S'affiche UNIQUEMENT quand un rapport du cycle hôtelier COURANT existe mais
 * n'a pas encore été envoyé (auto ou manuel). Jamais de bandeau « tout va bien » :
 * la décision d'affichage appartient à l'appelant (il ne le monte qu'en cas de
 * souci), ce composant ne fait que rendre le message + l'action.
 *
 * Ton ambre discret (cohérent avec les avertissements du board, thème dark navy).
 * Le bouton « Envoyer » n'est rendu que si `onSend` est fourni : l'appelant le
 * passe au seul GRADE admin (seul habilité à déclencher l'envoi manuel). Les
 * autres rôles voient le message informatif, sans action.
 */

interface SendStatusBannerProps {
  /** Message court (français), ex. « Le rapport du … n'a pas encore été envoyé. » */
  message: string
  /** Déclenche le flux d'envoi existant. Absent (non-admin) = pas de bouton. */
  onSend?: () => void
  /** Envoi en cours : désactive le bouton. */
  sending?: boolean
}

export function SendStatusBanner({
  message,
  onSend,
  sending,
}: SendStatusBannerProps) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-500"
    >
      <MailWarning className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 text-amber-500/90">{message}</span>
      {onSend && (
        <Button
          variant="outline"
          size="sm"
          onClick={onSend}
          disabled={sending}
          className="shrink-0 border-amber-500/40 text-amber-500 hover:bg-amber-500/10 hover:text-amber-500"
        >
          <Send />
          Envoyer
        </Button>
      )}
    </div>
  )
}
