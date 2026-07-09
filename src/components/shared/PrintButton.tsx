import { Printer } from 'lucide-react'

import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'

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
 * - `disabled` : grise le bouton (ex. aucune donnée à imprimer).
 */
export function PrintButton({
  onClick,
  className,
  responsiveLabel = false,
  iconOnly = false,
  disabled = false,
}: {
  onClick: () => void
  className?: string
  responsiveLabel?: boolean
  /** N'affiche que l'icône (aucun libellé), en bouton carré `icon-sm`. */
  iconOnly?: boolean
  disabled?: boolean
}) {
  return (
    <Tip label="Imprimer / PDF">
      <Button
        variant="outline"
        onClick={onClick}
        disabled={disabled}
        size={iconOnly ? 'icon-sm' : 'sm'}
        className={className}
        aria-label="Imprimer / PDF"
      >
        <Printer />
        {!iconOnly &&
          (responsiveLabel ? (
            <span className="hidden lg:inline">Imprimer / PDF</span>
          ) : (
            'Imprimer / PDF'
          ))}
      </Button>
    </Tip>
  )
}
