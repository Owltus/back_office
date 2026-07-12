import { StepNav } from '#/components/shared/StepNav.tsx'
import { useStepNavKeys } from '#/components/shared/useStepNavKeys.ts'

/*
 * Navigation d'année des vues annuelles analytique : chevrons précédent/suivant
 * bornés aux années disponibles, avec raccourcis clavier (←/→) et Alt (année
 * courante). Mutualise le triptyque `StepNav` + `useStepNavKeys` autrefois recopié
 * dans chaque board.
 */

type SetYear = (value: number | ((prev: number) => number)) => void

interface YearNavProps {
  year: number
  setYear: SetYear
  /** Années disponibles, triées croissant (bornes de navigation). */
  years: number[]
  currentYear: number
}

export function useYearNav({ year, setYear, years, currentYear }: YearNavProps) {
  const minYear = years[0] ?? currentYear
  const maxYear = years[years.length - 1] ?? currentYear
  const prevDisabled = year <= minYear
  const nextDisabled = year >= maxYear
  const goPrev = () => {
    if (year > minYear) setYear((y) => y - 1)
  }
  const goNext = () => {
    if (year < maxYear) setYear((y) => y + 1)
  }
  useStepNavKeys({
    onPrev: goPrev,
    onNext: goNext,
    onToday: () => setYear(currentYear),
    prevDisabled,
    nextDisabled,
  })
  return { goPrev, goNext, prevDisabled, nextDisabled }
}

export function YearNav(props: YearNavProps) {
  const { goPrev, goNext, prevDisabled, nextDisabled } = useYearNav(props)
  return (
    <StepNav
      onPrev={goPrev}
      onNext={goNext}
      prevLabel="Année précédente"
      nextLabel="Année suivante"
      prevDisabled={prevDisabled}
      nextDisabled={nextDisabled}
    >
      {/* Segment d'affichage de l'année : même habillage que les boutons outline
          du groupe (bordure, fond, hauteur, ombre) pour s'intégrer au triptyque
          segmenté — mais SANS être un bouton (pas de hover, curseur par défaut).
          Le ButtonGroup carre déjà ses coins internes (segment du milieu). */}
      <span className="inline-flex h-8 items-center justify-center border bg-background px-3 text-sm font-medium tabular-nums shadow-xs dark:border-input dark:bg-input/30">
        {props.year}
      </span>
    </StepNav>
  )
}
