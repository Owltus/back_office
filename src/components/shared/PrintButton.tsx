import { Printer } from 'lucide-react'

import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { cn } from '#/lib/utils.ts'

/**
 * Bouton « Imprimer / PDF » commun aux boards (icône Printer + libellé).
 *
 * `outline` comme tous les boutons de barre : le plein est réservé à l'action
 * principale d'un formulaire ou d'une confirmation, où il se distingue d'un
 * « Annuler ». Dans une barre, il n'a rien à trancher.
 *
 * - `onClick` : chaque board garde son handlePrint (nom de document compris).
 * - `className` : variantes de placement (w-full, lg:hidden, print:hidden…).
 * - `responsiveLabel` : masque le libellé sous lg (icône seule en responsive),
 *   comme sur le board PDJ ; sinon le libellé est toujours visible.
 * - `label` : libellé visible ET aria-label. Défaut « Imprimer / PDF », commun
 *   aux boards ; la page affichage passe « Imprimer » (document A3, pas un PDF
 *   de rapport). Sert aussi de repli à l'infobulle quand `tipLabel` est absent.
 * - `disabled` : grise le bouton (ex. aucune donnée à imprimer).
 * - `tipLabel` : infobulle. À personnaliser quand le bouton est désactivé —
 *   c'est alors la seule chose qui dise POURQUOI on ne peut pas imprimer.
 * - `mobileLabel` : n'a d'effet qu'avec `iconOnly`. Sous 640px, le bouton
 *   s'agrandit (44px, plancher tactile) et révèle le libellé — au survol, une
 *   infobulle explique une icône seule ; au doigt, il n'y a pas de survol
 *   (adapt.md), donc l'icône seule n'explique plus rien. Au-delà de 640px,
 *   rendu inchangé (icône seule, taille normale).
 */
export function PrintButton({
  onClick,
  className,
  responsiveLabel = false,
  iconOnly = false,
  mobileLabel = false,
  disabled = false,
  label = 'Imprimer / PDF',
  tipLabel,
}: {
  onClick: () => void
  className?: string
  responsiveLabel?: boolean
  /** N'affiche que l'icône (aucun libellé), en bouton carré `icon-sm`. */
  iconOnly?: boolean
  mobileLabel?: boolean
  disabled?: boolean
  label?: string
  tipLabel?: string
}) {
  const button = (
    <Button
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      size={iconOnly ? 'icon-sm' : 'sm'}
      className={cn(
        iconOnly &&
          mobileLabel &&
          'max-sm:h-11 max-sm:w-auto max-sm:gap-1.5 max-sm:px-3',
        className,
      )}
      aria-label={label}
    >
      <Printer />
      {!iconOnly &&
        (responsiveLabel ? (
          <span className="hidden lg:inline">{label}</span>
        ) : (
          label
        ))}
      {iconOnly && mobileLabel && (
        <span className="hidden max-sm:inline">{label}</span>
      )}
    </Button>
  )

  return (
    <Tip label={tipLabel ?? label}>
      {disabled ? (
        // Un bouton désactivé n'émet aucun événement de survol : sans ce span
        // porteur, Radix n'ouvrirait jamais l'infobulle — précisément dans le
        // cas où elle est la plus utile. Le span se dimensionne au contenu ;
        // un `className="w-full"` sur un bouton désactivé n'aurait donc pas
        // d'effet (aucun appelant n'est dans ce cas aujourd'hui).
        <span tabIndex={0} className="inline-flex">
          {button}
        </span>
      ) : (
        button
      )}
    </Tip>
  )
}
