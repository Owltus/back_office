import { useState } from 'react'
import type { CSSProperties } from 'react'
import { ChevronDown } from 'lucide-react'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover.tsx'
import { COLORS } from '#/lib/poster/config.ts'
import type { ColorKey } from '#/lib/poster/config.ts'
import {
  getAvailableIcons,
  getIconName,
  getIconSvg,
} from '#/lib/poster/icons.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Sélecteurs d'icône et de thème de couleur, extraits d'AffichageBoard pour être
 * partagés entre le panneau de réglages et le formulaire de modèle (TemplateDialog).
 * Chaque sélecteur gère son propre état d'ouverture (Popover) ; il expose une API
 * contrôlée `value` / `onChange`.
 */

const ICON_KEYS = getAvailableIcons()

// Le thème « OKKO » (défaut) est affiché en premier dans la liste.
const COLOR_KEYS = (Object.keys(COLORS) as ColorKey[]).sort((a, b) =>
  a === 'okko' ? -1 : b === 'okko' ? 1 : 0,
)

// Pastille de thème : cercle divisé en deux à 135° — fond du thème en haut à
// gauche, couleur d'accent en bas à droite. La transition de 1px lisse la
// frontière ; le background est clippé au padding-box pour ne pas baver.
function colorSwatch(colorKey: ColorKey): CSSProperties {
  const c = COLORS[colorKey]
  return {
    background: `linear-gradient(135deg, ${c.bg} calc(50% - 0.5px), ${c.border} calc(50% + 0.5px))`,
    backgroundClip: 'padding-box',
  }
}

export function IconPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Choisir une icône"
          className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <span
            className="flex size-5 shrink-0 items-center justify-center text-foreground [&>svg]:size-5"
            dangerouslySetInnerHTML={{ __html: getIconSvg(value) }}
          />
          <span className="truncate">{getIconName(value)}</span>
          <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-2"
        align="start"
      >
        <div className="app-scroll grid max-h-80 grid-cols-3 gap-1.5 overflow-y-auto pr-1">
          {ICON_KEYS.map((key) => {
            const selected = key === value
            return (
              <button
                type="button"
                key={key}
                title={getIconName(key)}
                ref={(el) => {
                  if (el && selected) el.scrollIntoView({ block: 'nearest' })
                }}
                onClick={() => {
                  onChange(key)
                  setOpen(false)
                }}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg border p-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50',
                  selected
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-transparent text-foreground hover:bg-accent',
                )}
              >
                <span
                  className="flex size-7 items-center justify-center [&>svg]:size-7"
                  dangerouslySetInnerHTML={{ __html: getIconSvg(key) }}
                />
                <span
                  className={cn(
                    'w-full truncate text-center text-[11px] leading-tight',
                    selected ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {getIconName(key)}
                </span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function ColorPicker({
  value,
  onChange,
}: {
  value: ColorKey
  onChange: (key: ColorKey) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Choisir un thème de couleur"
          className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <span
            className="size-5 shrink-0 rounded-full border border-border"
            style={colorSwatch(value)}
          />
          <span className="truncate">{COLORS[value].name}</span>
          <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-2"
        align="start"
      >
        <div className="flex flex-col gap-1">
          {COLOR_KEYS.map((key) => {
            const selected = key === value
            return (
              <button
                type="button"
                key={key}
                onClick={() => {
                  onChange(key)
                  setOpen(false)
                }}
                className={cn(
                  'flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50',
                  selected
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-transparent hover:bg-accent',
                )}
              >
                <span
                  className="size-5 shrink-0 rounded-full border border-border"
                  style={colorSwatch(key)}
                />
                <span>{COLORS[key].name}</span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
