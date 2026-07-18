import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#/components/ui/tooltip.tsx'
import {
  confidenceTone,
  probaFor,
} from '#/components/facturation/confidence.ts'
import { BUDGET_LINES, TAGS } from '#/lib/facturation/constants.ts'
import { normalize } from '#/lib/facturation/detect.ts'
import type { Detection } from '#/lib/facturation/types.ts'
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
  detection,
  immature = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  selected: string[]
  onChange: (codes: string[]) => void
  detection?: Detection | null
  immature?: boolean
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
      <DialogContent className="flex max-h-[85vh] max-w-[38rem] flex-col gap-0 overflow-hidden p-0">
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

        {/* Filtre par domaine : un seul domaine à la fois, combiné en ET avec la
            recherche texte. « Tous les domaines » réinitialise le filtre. */}
        <div className="border-b border-border px-4 py-2">
          <Select
            value={activeTag ?? 'all'}
            onValueChange={(v) => setActiveTag(v === 'all' ? null : v)}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue placeholder="Tous les domaines" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les domaines</SelectItem>
              {TAGS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <TooltipProvider delayDuration={300}>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {groups.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                Aucune ligne ne correspond à « {q} ».
              </p>
            ) : (
              groups.map((g) => (
                <div key={g.category} className="mb-2 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 px-2 py-1">
                    <span className="h-px flex-1 bg-primary/20" />
                    <span className="text-[11px] font-semibold tracking-[0.12em] text-primary/80 uppercase">
                      {g.category}
                    </span>
                    <span className="h-px flex-1 bg-primary/20" />
                  </div>
                  {g.lines.map((l) => {
                    const on = selected.includes(l.code)
                    const raw = probaFor(l.code, detection)
                    const pct = raw === undefined ? null : Math.round(raw * 100)
                    const tone = confidenceTone(
                      raw === undefined
                        ? 0
                        : immature
                          ? Math.min(raw, 0.45)
                          : raw,
                    )
                    return (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => toggle(l.code)}
                        className={cn(
                          'relative flex w-full flex-col gap-2 rounded-md px-2 py-2 text-left transition-colors',
                          on ? 'bg-primary/10' : 'hover:bg-secondary/60',
                        )}
                      >
                        {/* Nom, code, explication (place réservée à droite pour le %). */}
                        <span className="flex min-w-0 flex-col gap-1 pr-12">
                          <span className="truncate text-sm text-foreground">
                            {l.label}
                          </span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {l.code}
                          </span>
                          {l.hint && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="truncate text-left text-xs text-muted-foreground">
                                  {l.hint}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs whitespace-normal">
                                {l.hint}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </span>

                        {/* Barre de progression sur TOUTE la largeur (en bas). */}
                        <span className="block h-1 w-full overflow-hidden rounded-full bg-secondary">
                          {pct !== null && (
                            <span
                              className={cn(
                                'block h-full rounded-full transition-all',
                                tone.bar,
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          )}
                        </span>

                        {/* % centré verticalement sur toute la hauteur de la card. */}
                        <span
                          className={cn(
                            'absolute top-1/2 right-3 -translate-y-1/2 text-lg leading-none font-semibold tabular-nums',
                            pct === null ? 'text-muted-foreground' : tone.text,
                          )}
                        >
                          {pct ?? 0}
                          <span className="text-xs font-normal">%</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </TooltipProvider>

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
