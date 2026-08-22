import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'

/*
 * Bouton retour des pages analytique : remonte dans l'ARBORESCENCE LOGIQUE de
 * la page (détail mensuel → vue annuelle ; vue annuelle → page du domaine),
 * via un lien explicite (`to`) — jamais `router.history.back()`. L'historique
 * de navigation dépend du chemin PAR LEQUEL on est arrivé (lien direct,
 * actualisation, onglet neuf, partage d'URL) : la cible d'un retour basé sur
 * l'historique n'est alors plus la page parente, mais n'importe quoi. Un lien
 * explicite pointe toujours au même endroit, quel que soit le chemin parcouru.
 */
export function AnalytiqueBackButton({
  to,
  label = "Retour à l'analytique",
}: {
  /** Route de la page parente dans l'arborescence (ex. `/rapro/analytique`). */
  to: string
  label?: string
}) {
  return (
    <Tip label={label}>
      <Button asChild variant="outline" size="icon-sm" className="max-sm:size-11">
        <Link to={to} aria-label={label}>
          <ArrowLeft />
        </Link>
      </Button>
    </Tip>
  )
}
