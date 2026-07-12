import type { ReactNode } from 'react'

import { cn } from '#/lib/utils.ts'

/**
 * Groupe de boutons « segmenté » (Tailwind Button Group) : les boutons se
 * touchent, coins internes carrés, bordures mitoyennes fusionnées — un seul
 * bloc visuel homogène. On garde les boutons `outline` tels quels ; le groupe
 * ne fait que retoucher rayons, marges et z-index via des sélecteurs d'enfants.
 * À l'échelle d'une barre d'action, il matérialise « ces boutons vont ensemble »
 * (les actions de page d'un côté, la navigation temporelle de l'autre).
 *
 * Robustesse au wrapper de `Tip` : un bouton de barre est soit l'enfant direct
 * du groupe (cas normal — `Tip`/`PopoverTrigger` sont des fournisseurs sans DOM,
 * `asChild` rend le bouton lui-même), soit imbriqué dans un `<span>` porteur
 * quand il est désactivé (indispensable pour que l'infobulle s'ouvre malgré le
 * `disabled`). Piège : `TooltipTrigger asChild` remplace le `data-slot="button"`
 * du bouton activé par son propre `data-slot="tooltip-trigger"` ; on ne peut donc
 * PAS cibler le rayon via `[data-slot=button]`. On arrondit donc le slot lui-même
 * (l'enfant direct, quel qu'il soit), plus une passe sur le bouton imbriqué du
 * span des désactivés (là, le span porte `tooltip-trigger` et le bouton conserve
 * bien son `data-slot="button"`).
 */
export function ButtonGroup({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center',
        // Le slot survolé / focalisé passe au-dessus de son voisin : sa bordure
        // et son anneau de focus s'affichent entiers, non rognés par la bordure
        // mitoyenne posée juste à côté. `focus-within` couvre aussi le bouton
        // focalisé à l'intérieur d'un span porteur (cas désactivé).
        '[&>*]:relative [&>*:hover]:z-10 [&>*:focus-within]:z-10',
        // Fusion des bordures mitoyennes : chaque slot sauf le premier chevauche
        // son voisin de gauche d'un pixel (une seule ligne au lieu de deux).
        '[&>*:not(:first-child)]:-ml-px',
        // Coins internes carrés — slot en enfant direct (le bouton activé lui-même).
        '[&>*:not(:last-child)]:rounded-r-none',
        '[&>*:not(:first-child)]:rounded-l-none',
        // Coins internes carrés — bouton imbriqué (span porteur d'un désactivé).
        '[&>*:not(:last-child)_[data-slot=button]]:rounded-r-none',
        '[&>*:not(:first-child)_[data-slot=button]]:rounded-l-none',
        className,
      )}
    >
      {children}
    </div>
  )
}
