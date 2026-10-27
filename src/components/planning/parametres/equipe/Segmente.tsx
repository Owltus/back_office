/*
 * Choix segmenté (prototype `Segmente`) : un groupe radio de boutons, l'aide
 * de chaque option en infobulle. Niveau de compétence, mode d'un jour.
 */

import { Tip } from '#/components/shared/Tip.tsx'
import { cn } from '#/lib/utils.ts'

export interface OptionSegmente<T extends string> {
  valeur: T
  libelle: string
  aide?: string
}

export function Segmente<T extends string>({
  valeur,
  options,
  onChange,
  disabled,
  label,
}: {
  valeur: T
  options: ReadonlyArray<OptionSegmente<T>>
  onChange: (v: T) => void
  disabled?: boolean
  /** Nom du groupe pour les lecteurs d'écran. */
  label: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex shrink-0 rounded-md border border-border bg-muted/40 p-0.5"
    >
      {options.map((o) => {
        const choisi = o.valeur === valeur
        const bouton = (
          <button
            key={o.valeur}
            type="button"
            role="radio"
            aria-checked={choisi}
            aria-label={o.libelle}
            disabled={disabled}
            onClick={() => !choisi && onChange(o.valeur)}
            className={cn(
              'rounded-[5px] px-2 py-1 text-xs font-medium text-muted-foreground transition-colors',
              'hover:text-foreground disabled:pointer-events-none disabled:opacity-60',
              choisi && 'bg-background text-foreground shadow-xs',
            )}
          >
            {o.libelle}
          </button>
        )
        return o.aide ? (
          <Tip key={o.valeur} label={o.aide}>
            {bouton}
          </Tip>
        ) : (
          bouton
        )
      })}
    </div>
  )
}
