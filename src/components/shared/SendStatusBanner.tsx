import { Check, MailWarning } from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'

/*
 * Bandeau « pas encore envoyé » — filet de secours (RepJour).
 *
 * S'affiche UNIQUEMENT quand un rapport du cycle hôtelier COURANT existe mais
 * n'a pas encore été envoyé (auto ou manuel). Jamais de bandeau « tout va bien » :
 * la décision d'affichage appartient à l'appelant (il ne le monte qu'en cas de
 * souci), ce composant ne fait que rendre le message + l'action « Ignorer ».
 *
 * Ton ambre discret (cohérent avec les avertissements du board, thème dark navy).
 * L'envoi manuel se fait par le bouton de la barre du haut (pas de doublon ici).
 * Le bouton « Ignorer » retire le rappel quand on n'en a pas besoin ; il n'est
 * rendu que si `onIgnore` est fourni (l'appelant le passe aux rôles habilités).
 */

interface SendStatusBannerProps {
  /** Message court (français), ex. « Le rapport du … n'a pas encore été envoyé. » */
  message: string
  /** Masque le rappel (décision partagée). Absent = pas de bouton (rôle non habilité). */
  onIgnore?: () => void
  /** Masquage en cours : désactive le bouton. */
  ignoring?: boolean
}

export function SendStatusBanner({
  message,
  onIgnore,
  ignoring,
}: SendStatusBannerProps) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-500"
    >
      <MailWarning className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 text-amber-500/90">{message}</span>
      {onIgnore && (
        <Button
          variant="outline"
          size="sm"
          onClick={onIgnore}
          disabled={ignoring}
          className="shrink-0 border-amber-500/40 text-amber-500 hover:bg-amber-500/10 hover:text-amber-500"
        >
          <Check />
          Ignorer
        </Button>
      )}
    </div>
  )
}
