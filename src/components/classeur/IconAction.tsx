import type { ComponentProps, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'

/**
 * Bouton icône d'une barre d'actions du Classeur : `outline` `icon-sm` dans
 * un `Tip`, `aria-label` = libellé de l'infobulle — la forme des boutons
 * d'en-tête de toutes les autres pages (Literie, Rapro, PDJ).
 *
 * - `busy` : l'icône laisse la place à un `Loader2` et le bouton se
 *   désactive le temps de l'action.
 * - désactivé : enrobé d'un `<span tabIndex>` porteur pour que l'infobulle
 *   s'ouvre quand même (un bouton natif désactivé ne reçoit pas le survol,
 *   cf. `Tip`) ; `ButtonGroup` sait arrondir le bouton imbriqué.
 * - `ghost` : variante discrète (bouton retour, tiroir des chapitres).
 */
export function IconAction({
  label,
  icon,
  busy = false,
  disabled = false,
  variant = 'outline',
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, 'children' | 'size' | 'variant'> & {
  label: string
  icon: ReactNode
  busy?: boolean
  variant?: 'outline' | 'ghost'
}) {
  const inactif = disabled || busy
  const bouton = (
    <Button
      variant={variant}
      size="icon-sm"
      aria-label={label}
      disabled={inactif}
      className={className}
      {...props}
    >
      {busy ? <Loader2 className="animate-spin" /> : icon}
    </Button>
  )
  if (!inactif) return <Tip label={label}>{bouton}</Tip>
  return (
    <Tip label={label}>
      <span tabIndex={0} className="inline-flex rounded-md">
        {bouton}
      </span>
    </Tip>
  )
}
