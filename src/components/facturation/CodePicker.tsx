import { useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Tag } from '#/components/facturation/Tag.tsx'
import { BUDGET_LINES, TAGS } from '#/lib/facturation/constants.ts'
import { normalize } from '#/lib/facturation/detect.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Modal de sélection des imputations. Une facture peut porter PLUSIEURS lignes
 * comptables : on coche/décoche autant de codes qu'on veut. La recherche filtre
 * sur le code, le libellé, la section ET les fournisseurs/descriptions du plan
 * (champ `hint`, invisible) — taper « booking » trouve la ligne OTA, « adyen »
 * la ligne commissions. Insensible à la casse et aux accents (normalize).
 */

// Texte de recherche normalisé, pré-calculé une fois (module-level).
const INDEX = BUDGET_LINES.map((l) => ({
  line: l,
  search: normalize(
    `${l.code} ${l.label} ${l.category} ${l.hint ?? ''} ${l.tags.join(' ')}`,
  ),
}))

export function CodePicker({
  open,
  onOpenChange,
  selected,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  selected: string[]
  onChange: (codes: string[]) => void
}) {
  const [q, setQ] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)

  // Filtre = tag actif (si présent) ET tous les mots de la requête présents,
  // puis regroupé par section dans l'ordre du plan.
  const groups = useMemo(() => {
    const tokens = normalize(q).split(/\s+/).filter(Boolean)
    const out: { category: string; lines: typeof BUDGET_LINES }[] = []
    for (const it of INDEX) {
      if (activeTag && !it.line.tags.includes(activeTag)) continue
      if (!tokens.every((t) => it.search.includes(t))) continue
      let g = out.find((x) => x.category === it.line.category)
      if (!g) {
        g = { category: it.line.category, lines: [] }
        out.push(g)
      }
      g.lines.push(it.line)
    }
    return out
  }, [q, activeTag])

  const toggle = (code: string) =>
    onChange(
      selected.includes(code)
        ? selected.filter((c) => c !== code)
        : [...selected, code],
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="text-base">
            Imputations comptables
          </DialogTitle>
          <DialogDescription className="text-xs">
            Cherchez par code, libellé, section ou fournisseur. Cochez une ou
            plusieurs lignes.
          </DialogDescription>
        </DialogHeader>

        <div className="relative border-b border-border px-4 py-2.5">
          <Search className="pointer-events-none absolute top-1/2 left-6 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher… (ex. « booking », « alcool », « FMELEC »)"
            className="h-9 pl-8"
          />
        </div>

        {/* Filtre par domaine : un tag actif à la fois, combiné en ET avec la
            recherche texte. Recliquer le tag actif l'enlève. */}
        <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2">
          {TAGS.map((t) => (
            <Tag
              key={t}
              label={t}
              active={activeTag === t}
              onClick={() => setActiveTag((cur) => (cur === t ? null : t))}
            />
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {groups.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              Aucune ligne ne correspond à « {q} ».
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.category} className="mb-2">
                <div className="px-2 py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {g.category}
                </div>
                {g.lines.map((l) => {
                  const on = selected.includes(l.code)
                  return (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => toggle(l.code)}
                      className={cn(
                        'flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors',
                        on ? 'bg-primary/10' : 'hover:bg-secondary/60',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border',
                          on
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border',
                        )}
                      >
                        {on && <Check className="size-3" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="font-mono text-xs text-foreground">
                            {l.code}
                          </span>
                          <span className="truncate text-sm">{l.label}</span>
                        </span>
                        {l.hint && (
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {l.hint}
                          </span>
                        )}
                        {l.tags.length > 0 && (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {l.tags.map((t) => (
                              <Tag key={t} label={t} />
                            ))}
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
          <span className="text-sm text-muted-foreground">
            {selected.length} imputation{selected.length > 1 ? 's' : ''}{' '}
            sélectionnée{selected.length > 1 ? 's' : ''}
          </span>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Terminé
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
