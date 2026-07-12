import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { ButtonGroup } from '#/components/shared/ButtonGroup.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'

/**
 * Navigation par pas : [◀] centre [▶], en groupe de boutons segmenté — les trois
 * éléments se touchent, bordures mitoyennes fusionnées (cf. `ButtonGroup`). C'est
 * le groupe « navigation temporelle » de la barre d'action, distinct du groupe
 * des autres actions (analytique, import, impression), lui aussi segmenté.
 *
 * Le triptyque était réécrit à l'identique dans six boards, avec des tailles de
 * flèches divergentes. Le centraliser garantit qu'ils restent alignés, et que
 * les flèches gardent la même taille que le bouton calendrier (`icon-sm`).
 *
 * Le centre est libre : un `DatePickerButton` (jour, shift), un libellé d'année,
 * ou le sélecteur de plage du parking. Il peut être vide.
 */
export function StepNav({
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  prevDisabled = false,
  nextDisabled = false,
  children,
  className,
}: {
  onPrev: () => void
  onNext: () => void
  /** Sert d'`aria-label` et d'infobulle : décrire le pas (« Jour précédent »). */
  prevLabel: string
  nextLabel: string
  prevDisabled?: boolean
  nextDisabled?: boolean
  children?: ReactNode
  className?: string
}) {
  const arrow = (
    icon: ReactNode,
    onClick: () => void,
    label: string,
    disabled: boolean,
  ) => {
    const button = (
      <Button
        variant="outline"
        size="icon-sm"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
      >
        {icon}
      </Button>
    )
    return (
      <Tip label={label}>
        {disabled ? (
          // Un bouton nativement désactivé n'émet aucun événement de survol :
          // sans ce span porteur, l'infobulle qui dit POURQUOI la flèche est en
          // bout de course ne s'ouvrirait jamais. Même pattern que PrintButton.
          <span tabIndex={0} className="inline-flex">
            {button}
          </span>
        ) : (
          button
        )}
      </Tip>
    )
  }

  return (
    <ButtonGroup className={className}>
      {arrow(<ChevronLeft />, onPrev, prevLabel, prevDisabled)}
      {children}
      {arrow(<ChevronRight />, onNext, nextLabel, nextDisabled)}
    </ButtonGroup>
  )
}
