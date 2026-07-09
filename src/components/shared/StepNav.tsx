import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { cn } from '#/lib/utils.ts'

/**
 * Navigation par pas : [◀] centre [▶].
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
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Tip label={prevLabel}>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={onPrev}
          disabled={prevDisabled}
          aria-label={prevLabel}
        >
          <ChevronLeft />
        </Button>
      </Tip>
      {children}
      <Tip label={nextLabel}>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={onNext}
          disabled={nextDisabled}
          aria-label={nextLabel}
        >
          <ChevronRight />
        </Button>
      </Tip>
    </div>
  )
}
