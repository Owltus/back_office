import type { ReactNode } from 'react'

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip.tsx'

/**
 * Infobulle d'un bouton de barre.
 *
 * Elle remplace l'attribut `title` natif, que le navigateur peint lui-même :
 * fond système, police système, thème ignoré. Le `TooltipContent` de shadcn est
 * peint par nos jetons (`bg-foreground` / `text-background`), donc il s'inverse
 * tout seul entre le clair et le sombre.
 *
 * Ne JAMAIS laisser un `title` sur l'enfant : les deux infobulles se
 * superposeraient. L'`aria-label` en revanche reste indispensable — un lecteur
 * d'écran n'ouvre pas de survol.
 *
 * `TooltipProvider` est monté une fois pour toutes dans routes/__root.tsx.
 *
 * Un enfant désactivé ne reçoit pas d'événement de survol : Radix n'affichera
 * rien. C'est le comportement voulu (une flèche en bout de course est muette).
 */
export function Tip({
  label,
  side = 'bottom',
  children,
}: {
  label: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** Le déclencheur : un unique élément qui accepte `ref` (un `Button`). */
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
