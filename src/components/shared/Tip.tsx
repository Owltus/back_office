import { useRef, useState, type ReactNode } from 'react'

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
 * Un enfant NATIVEMENT désactivé ne reçoit pas d'événement de survol : Radix
 * n'affichera rien. Pour qu'une infobulle explique POURQUOI un bouton est grisé,
 * enrober le bouton d'un `<span tabIndex={0}>` porteur (cf. PrintButton).
 *
 * Infobulle CONTRÔLÉE : Radix ferme la bulle au moindre clic du déclencheur. Or
 * cliquer un bouton (désactivé notamment) ne doit pas faire filer l'info sous les
 * yeux de l'utilisateur — on garde donc la bulle tant que la souris reste sur la
 * zone, et on ne ferme qu'à sa sortie (ou au blur clavier). Le `delayDuration`
 * du provider est préservé : c'est toujours Radix qui décide de l'ouverture.
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
  const [open, setOpen] = useState(false)
  // La souris est-elle sur le déclencheur ? Sert à ignorer la fermeture que Radix
  // demande au clic (pointer encore dessus) sans bloquer la sortie ni le blur.
  const overRef = useRef(false)
  return (
    <Tooltip
      open={open}
      onOpenChange={(next) => {
        if (next) return setOpen(true)
        if (overRef.current) return // clic pendant le survol : on garde l'info
        setOpen(false)
      }}
    >
      <TooltipTrigger
        asChild
        onPointerEnter={() => {
          overRef.current = true
        }}
        onPointerLeave={() => {
          overRef.current = false
          setOpen(false)
        }}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent
        side={side}
        sideOffset={6}
        className="pointer-events-none select-none"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
