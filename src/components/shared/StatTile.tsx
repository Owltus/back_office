import type { CSSProperties, ReactNode } from 'react'

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip.tsx'
import { cn } from '#/lib/utils.ts'

/*
 * Carte de synthèse UNIFIÉE — style « Tuile, valeur seule » (retenu via la page
 * /artefact). Un liseré de couleur à gauche porte le code couleur (accent), puis
 * un corps centré verticalement : libellé (petit, haut) + valeur (grande).
 * AUCUNE icône, volontairement — le plus simple et lisible.
 *
 * Hauteur uniforme garantie par la grille (`items-stretch`) : toutes les cartes
 * d'une rangée s'étirent à la même hauteur, le corps centrant son contenu. Un
 * `hint` optionnel ajoute une infobulle explicative au survol (d'où vient la
 * donnée), comme les anciennes cartes rapro/PDJ.
 *
 * Vocation : remplacer les cartes dupliquées de rapro/PDJ puis, au fil du
 * portage, le StatCard des pages analytique et les SummaryCards du dashboard.
 */
export function StatTile({
  label,
  value,
  accent,
  hint,
  className,
}: {
  label: ReactNode
  value: ReactNode
  /** Couleur du liseré d'accent. Ex. '#34d399' ou 'var(--chart-5)'. */
  accent: string
  /** Explication au survol (tooltip). */
  hint?: string
  className?: string
}) {
  const card = (
    <div
      className={cn(
        'flex items-stretch overflow-hidden rounded-xl border border-border bg-card',
        hint && 'cursor-help',
        className,
      )}
      style={{ '--tile': accent } as CSSProperties}
    >
      <span
        aria-hidden="true"
        className="w-1.5 shrink-0"
        style={{ background: 'var(--tile)' }}
      />
      <div className="flex min-w-0 flex-col justify-center gap-1 px-3 py-2.5">
        <span className="text-[0.6rem] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="text-xl font-bold leading-none tabular-nums text-foreground">
          {value}
        </span>
      </div>
    </div>
  )
  if (!hint) return card
  return (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent className="max-w-56 select-none text-center leading-snug">
        {hint}
      </TooltipContent>
    </Tooltip>
  )
}
