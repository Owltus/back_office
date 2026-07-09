/**
 * fields.tsx — Contrôles de formulaire génériques
 *
 * Sous-composants extraits d'AffichageBoard.tsx (étape 5) : groupe
 * label + contrôle, sélecteurs de date / d'heure custom (popovers shadcn)
 * et slider de taille. Aucune dépendance au métier de l'affiche.
 */

import { cloneElement, useId, useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CalendarDays, Clock } from 'lucide-react'

import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Calendar } from '#/components/ui/calendar.tsx'
import { Label } from '#/components/ui/label.tsx'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover.tsx'
import { Slider } from '#/components/ui/slider.tsx'
import { formatDateStr, parseDateStr } from '#/lib/poster/dateFormatter.ts'
import { cn } from '#/lib/utils.ts'

// Style commun des champs déclencheurs de popover (aligné sur les Input shadcn).
const PICKER_TRIGGER_CLASS =
  'flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30'

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 12 }, (_, i) =>
  String(i * 5).padStart(2, '0'),
)

/** Groupe label + contrôle : le label est relié au contrôle via un id généré
 * (clic sur le label = focus du champ ; champ nommé pour les lecteurs d'écran). */
export function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactElement<{ id?: string }>
}) {
  const id = useId()
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {cloneElement(children, { id })}
    </div>
  )
}

/** Sélecteur de date custom (remplace <input type="date"> natif) :
 * bouton stylé comme un Input + calendrier shadcn en popover, locale française.
 * Valeur stockée au même format que l'input natif ('YYYY-MM-DD' ou ''). */
export function DateField({
  id,
  value,
  onChange,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const date = parseDateStr(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button id={id} type="button" className={PICKER_TRIGGER_CLASS}>
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          <span className={cn('truncate', !date && 'text-muted-foreground')}>
            {date ? format(date, 'd MMM yyyy', { locale: fr }) : 'Choisir'}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          defaultMonth={date}
          locale={fr}
          onSelect={(d) => {
            onChange(d ? formatDateStr(d) : '')
            setOpen(false)
          }}
        />
        {value !== '' && (
          <div className="border-t border-border p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
            >
              Effacer
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** Bouton icône ouvrant le calendrier shadcn en popover (thème + locale FR).
 * Variante compacte de DateField pour une navigation par jour ([◀][📅][▶]) :
 * remplace le <input type="date"> natif (dont le picker n'est pas thémé).
 * Valeur au format 'YYYY-MM-DD'. */
export function DatePickerButton({
  value,
  onChange,
  ariaLabel = 'Choisir une date',
  min,
  max,
}: {
  value: string
  onChange: (value: string) => void
  ariaLabel?: string
  /** Bornes sélectionnables ('YYYY-MM-DD') : les jours hors [min, max] sont grisés. */
  min?: string
  max?: string
}) {
  const [open, setOpen] = useState(false)
  const date = parseDateStr(value)
  const minDate = min ? parseDateStr(min) : undefined
  const maxDate = max ? parseDateStr(max) : undefined
  const disabledDays = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tip label={ariaLabel}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label={ariaLabel}>
            <CalendarDays />
          </Button>
        </PopoverTrigger>
      </Tip>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          defaultMonth={date}
          locale={fr}
          disabled={disabledDays.length ? disabledDays : undefined}
          onSelect={(d) => {
            if (d) onChange(formatDateStr(d))
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

/** Sélecteur d'heure custom (remplace <input type="time"> natif) :
 * deux colonnes défilantes heures / minutes (pas de 5 min).
 * Valeur stockée au même format que l'input natif ('HH:MM' ou ''). */
export function TimeField({
  id,
  value,
  onChange,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [h, m] = value !== '' ? value.split(':') : ['', '']

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button id={id} type="button" className={PICKER_TRIGGER_CLASS}>
          <Clock className="size-4 shrink-0 text-muted-foreground" />
          <span
            className={cn('truncate', value === '' && 'text-muted-foreground')}
          >
            {value !== '' ? `${parseInt(h, 10)}h${m}` : 'Choisir'}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-1.5"
        align="start"
      >
        <div className="grid grid-cols-2 gap-1">
          <TimeColumn
            items={HOURS}
            selected={h}
            suffix="h"
            onPick={(nh) => onChange(`${nh}:${m || '00'}`)}
          />
          <TimeColumn
            items={MINUTES}
            selected={m}
            onPick={(nm) => {
              onChange(`${h || '00'}:${nm}`)
              setOpen(false)
            }}
          />
        </div>
        {value !== '' && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full"
            onClick={() => {
              onChange('')
              setOpen(false)
            }}
          >
            Effacer
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** Colonne défilante du sélecteur d'heure (heures ou minutes). */
export function TimeColumn({
  items,
  selected,
  suffix,
  onPick,
}: {
  items: Array<string>
  selected: string
  suffix?: string
  onPick: (value: string) => void
}) {
  return (
    <div className="flex max-h-48 min-w-0 flex-col gap-0.5 overflow-y-auto">
      {items.map((item) => {
        const isSelected = item === selected
        return (
          <button
            type="button"
            key={item}
            // Amène la valeur sélectionnée dans la zone visible à l'ouverture.
            ref={(el) => {
              if (el && isSelected) el.scrollIntoView({ block: 'nearest' })
            }}
            onClick={() => onPick(item)}
            className={cn(
              'rounded-md px-1 py-1 text-center text-sm tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50',
              isSelected
                ? 'bg-primary/10 text-primary'
                : 'text-foreground hover:bg-accent',
            )}
          >
            {item}
            {suffix}
          </button>
        )
      })}
    </div>
  )
}

/** Slider de taille de police avec valeur numérique affichée. */
export function SizeSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm">
        <Label>{label}</Label>
        <span className="tabular-nums text-muted-foreground">{value} px</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={1}
        onValueChange={(v) => onChange(v[0])}
        aria-label={label}
      />
    </div>
  )
}
