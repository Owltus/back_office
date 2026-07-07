import { Printer } from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'

/**
 * Bouton « Imprimer / PDF » commun aux boards (icône Printer + libellé).
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
    <Button
      onClick={onClick}
      disabled={disabled}
      size={iconOnly ? 'icon-sm' : undefined}
      className={className}
      aria-label="Imprimer / PDF"
      title="Imprimer / PDF"
    >
      <Printer />
      {!iconOnly &&
        (responsiveLabel ? (
          <span className="hidden lg:inline">Imprimer / PDF</span>
        ) : (
          'Imprimer / PDF'
        ))}
    </Button>
  )
}
