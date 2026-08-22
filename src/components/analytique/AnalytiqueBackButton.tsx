import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { cn } from '#/lib/utils.ts'

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
  enlargeOnNarrow = true,
}: {
  /** Route de la page parente dans l'arborescence (ex. `/rapro/analytique`). */
  to: string
  label?: string
  /** Défaut `true` (plancher tactile 44px sous 640px, comme `StepNav`). À
   *  désactiver UNIQUEMENT quand l'appelant garantit déjà que ce bouton ne
   *  s'affiche jamais sur écran tactile (cf. `StepNav`, même raison). */
  enlargeOnNarrow?: boolean
}) {
  return (
    <Tip label={label}>
      <Button
        asChild
        variant="outline"
        size="icon-sm"
        className={cn(enlargeOnNarrow && 'max-sm:size-11')}
      >
        <Link to={to} aria-label={label}>
          <ArrowLeft />
        </Link>
      </Button>
    </Tip>
  )
}
