import { useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'

import { Input } from '#/components/ui/input.tsx'
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '#/components/ui/popover.tsx'
import { normalizeIssuer } from '#/lib/facturation/text.ts'
import { similarity } from '#/lib/facturation/similarity.ts'
import type { Issuer } from '#/lib/facturation/issuers.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Combobox émetteur : un input à saisie LIBRE (on peut toujours taper un nouveau nom)
 * doublé d'une liste déroulante des émetteurs DÉJÀ connus, filtrée en direct. Remplace
 * l'ancien <datalist> natif (rendu navigateur, non stylable) et absorbe la correction de
 * faute de frappe : si le texte tapé ne correspond à aucun émetteur connu littéralement,
 * la liste bascule sur les noms PROCHES (Levenshtein) au lieu de rester vide — choisir
 * l'un d'eux évite de créer un doublon. Le classement met les plus fréquents en tête.
 */

const MAX_MATCHES = 8
const MAX_NEAR = 5
const NEAR_MIN_RATIO = 0.6

type Option = { issuer: Issuer; near: boolean }

export function IssuerCombobox({
  value,
  onChange,
  issuers,
  placeholder,
  inputClassName,
}: {
  value: string
  onChange: (value: string) => void
  issuers: Issuer[]
  placeholder?: string
  /** Classes fusionnées sur l'input (ex. `rounded-r-none` pour un input group). */
  inputClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const q = normalizeIssuer(value)

  // Correspondances : d'abord littérales (sous-chaîne), sinon PROCHES (faute de frappe).
  const options = useMemo<Option[]>(() => {
    const sorted = [...issuers].sort((a, b) => b.count - a.count)
    if (!q)
      return sorted
        .slice(0, MAX_MATCHES)
        .map((i) => ({ issuer: i, near: false }))
    const subs = sorted.filter((i) => normalizeIssuer(i.display).includes(q))
    if (subs.length > 0)
      return subs.slice(0, MAX_MATCHES).map((i) => ({ issuer: i, near: false }))
    return sorted
      .map((i) => ({ issuer: i, r: similarity(q, normalizeIssuer(i.display)) }))
      .filter((x) => x.r >= NEAR_MIN_RATIO)
      .sort((a, b) => b.r - a.r)
      .slice(0, MAX_NEAR)
      .map((x) => ({ issuer: x.issuer, near: true }))
  }, [issuers, q])

  const near = options.length > 0 && options[0].near
  // Nom tapé absent du dictionnaire (ni exact, ni sous-chaîne) → futur nouvel émetteur.
  const isNew =
    q.length > 0 && !issuers.some((i) => normalizeIssuer(i.display) === q)
  const activeIdx = Math.min(active, Math.max(0, options.length - 1))
  const hasContent = options.length > 0 || isNew

  function select(o: Option) {
    onChange(o.issuer.display)
    setOpen(false)
    inputRef.current?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(a + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && open && options[activeIdx]) {
      e.preventDefault()
      select(options[activeIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <Popover open={open && hasContent} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value)
              setActive(0)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            className={cn('pr-8', inputClassName)}
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label="Émetteurs connus"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setOpen((o) => !o)
              inputRef.current?.focus()
            }}
            className="absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronsUpDown className="size-4" />
          </button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        // Garder le focus dans l'input : le clavier continue de piloter la liste.
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-h-64 w-(--radix-popover-trigger-width) overflow-y-auto p-1"
      >
        {near && (
          <p className="px-2 py-1 text-[11px] tracking-wide text-muted-foreground uppercase">
            Peut-être
          </p>
        )}
        {options.map((o, i) => {
          const exact = normalizeIssuer(o.issuer.display) === q
          return (
            <button
              key={o.issuer.name}
              type="button"
              // mousedown avant blur : on sélectionne sans que l'input perde le focus.
              onMouseDown={(e) => {
                e.preventDefault()
                select(o)
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors',
                i === activeIdx ? 'bg-secondary' : 'hover:bg-secondary/60',
              )}
            >
              <Check
                className={cn(
                  'size-3.5 shrink-0',
                  exact ? 'text-primary' : 'text-transparent',
                )}
              />
              <span className="min-w-0 flex-1 truncate">
                {o.issuer.display}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {o.issuer.count}×
              </span>
            </button>
          )
        })}
        {isNew && (
          <p className="border-t border-border px-2 py-1.5 text-[11px] text-muted-foreground">
            {options.length > 0 ? 'Ou conserver' : 'Nouvel émetteur'} «{' '}
            <span className="text-foreground">{value.trim()}</span> » — créé au
            tamponnage.
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
