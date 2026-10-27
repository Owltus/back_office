/*
 * Petits champs de la fiche : liste déroulante (Select shadcn), section
 * titrée, interrupteur avec libellé.
 */

import { useId } from 'react'
import type { ReactNode } from 'react'

import { Label } from '#/components/ui/label.tsx'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { Switch } from '#/components/ui/switch.tsx'
import { cn } from '#/lib/utils.ts'

export interface OptionListe {
  valeur: string
  libelle: ReactNode
}

export interface GroupeListe {
  titre?: string
  options: OptionListe[]
}

/** Liste déroulante. `valeur` vide : le texte d'attente s'affiche. */
export function Liste({
  label,
  valeur,
  onChange,
  options,
  groupes,
  placeholder,
  disabled,
  className,
  libelleVisible = true,
}: {
  label: string
  valeur: string
  onChange: (v: string) => void
  options?: OptionListe[]
  groupes?: GroupeListe[]
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Faux : le libellé ne sert qu'aux lecteurs d'écran. */
  libelleVisible?: boolean
}) {
  const id = useId()
  const liste = (
    <Select value={valeur} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        size="sm"
        aria-label={libelleVisible ? undefined : label}
        className={cn('w-full', !libelleVisible && className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options?.map((o) => (
          <SelectItem key={o.valeur} value={o.valeur}>
            {o.libelle}
          </SelectItem>
        ))}
        {groupes?.map((g, i) =>
          g.options.length ? (
            <SelectGroup key={g.titre ?? i}>
              {g.titre && <SelectLabel>{g.titre}</SelectLabel>}
              {g.options.map((o) => (
                <SelectItem key={o.valeur} value={o.valeur}>
                  {o.libelle}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : null,
        )}
      </SelectContent>
    </Select>
  )
  if (!libelleVisible) return liste
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {liste}
    </div>
  )
}

export function Section({
  titre,
  aide,
  children,
}: {
  titre: ReactNode
  aide?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold">{titre}</h3>
      {aide != null && <p className="text-xs text-muted-foreground">{aide}</p>}
      {children}
    </section>
  )
}

export function Interrupteur({
  coche,
  onChange,
  disabled,
  children,
}: {
  coche: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  children: ReactNode
}) {
  const id = useId()
  return (
    <div className="flex items-center gap-2">
      <Switch
        id={id}
        checked={coche}
        onCheckedChange={onChange}
        disabled={disabled}
      />
      <Label htmlFor={id} className="text-sm font-normal">
        {children}
      </Label>
    </div>
  )
}
