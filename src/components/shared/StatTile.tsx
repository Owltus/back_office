import type { CSSProperties, ReactNode } from 'react'

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip.tsx'
import { cn } from '#/lib/utils.ts'

/*
 * Carte de synthèse UNIFIÉE — reproduction FIDÈLE du style « Tuile, valeur
 * seule » retenu sur la page /artefact : liseré de couleur à gauche + corps
 * centré (libellé 0.6rem en haut, valeur 1.4rem en bas), AUCUNE icône. Métriques
 * calquées à l'identique sur la maquette.
 *
 * Composant UNIQUE, réutilisé partout (rapro, PDJ, analytique, dashboard). Les
 * éléments portent des classes stables (`stat-tile`, `stat-tile__rail/body/
 * label/value`) pour que des contextes particuliers — l'IMPRESSION du rapport
 * PDJ notamment — puissent les recibler en CSS sans reconstruire la carte.
 *
 * Hauteur uniforme garantie par la grille (`items-stretch`) : toutes les cartes
 * d'une rangée s'étirent à la même hauteur, le corps centrant son contenu.
 */
export function StatTile({
  label,
  value,
  accent,
  hint,
  sub,
  children,
  printHidden,
  className,
}: {
  label: ReactNode
  value: ReactNode
  /** Couleur du liseré d'accent. Ex. '#34d399' ou 'var(--chart-5)'. */
  accent: string
  /** Explication au survol (tooltip). */
  hint?: string
  /** Ligne secondaire sous la valeur (ex. « / budget », « validées »). */
  sub?: ReactNode
  /** Contenu libre sous la valeur (ex. barre de progression budget). */
  children?: ReactNode
  /** Masquer à l'impression (footer PDJ : cartes écran uniquement). */
  printHidden?: boolean
  className?: string
}) {
  const card = (
    <div
      className={cn(
        'stat-tile flex items-stretch overflow-hidden rounded-xl border border-border bg-card',
        hint && 'cursor-help',
        printHidden && 'stat-tile--print-hidden',
        className,
      )}
      style={{ '--tile': accent } as CSSProperties}
    >
      <span
        aria-hidden="true"
        className="stat-tile__rail w-2 shrink-0"
        style={{ background: 'var(--tile)' }}
      />
      <div className="stat-tile__body flex min-w-0 flex-1 flex-col justify-center gap-1 px-3 py-[0.55rem]">
        <span className="stat-tile__label text-[0.6rem] font-semibold uppercase leading-[1.15] tracking-[0.03em] text-muted-foreground">
          {label}
        </span>
        <span className="stat-tile__value text-[1.4rem] font-bold leading-none tabular-nums text-foreground">
          {value}
        </span>
        {sub}
        {children}
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
