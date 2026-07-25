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
import { useFacturationModel } from '#/components/facturation/useFacturationModel.ts'
import { fillComptes } from '#/lib/facturation/budgetRegistry.ts'
import { preferredCompte } from '#/lib/facturation/issuerMemory.ts'
import { normalize } from '#/lib/facturation/detect.ts'
import type { BudgetLine, Detection } from '#/lib/facturation/types.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Modal de sélection des imputations. Une imputation = un COUPLE (code + compte) : le
 * référentiel porte désormais une ligne par couple, on REGROUPE donc par code (un bouton
 * par code) et, quand un code sélectionné porte plusieurs comptes, un petit Select laisse
 * choisir lequel. La recherche filtre sur le code, le libellé, la section, les comptes ET
 * les fournisseurs/descriptions du plan (champ `hint`, invisible) — taper « booking »
 * trouve la ligne OTA, « adyen » la ligne commissions. Insensible à la casse et aux accents
 * (normalize). Le filtre latéral porte sur la SECTION (les anciens « domaines »/tags ne sont
 * plus alimentés par le référentiel couplé).
 */

/** Une entrée regroupée par code : la 1re ligne du code (libellé/section/hint) + ses comptes. */
interface CodeEntry {
  line: BudgetLine
  comptes: string[]
  search: string
}

export function CodePicker({
  open,
  onOpenChange,
  selected,
  comptes,
  onChange,
  detection,
  immature = false,
  issuer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  selected: string[]
  comptes: Record<string, string>
  onChange: (codes: string[], comptes: Record<string, string>) => void
  detection?: Detection | null
  immature?: boolean
  /** Clé de l'émetteur courant (issuerKey) → pré-sélection de son compte habituel à l'ajout d'un code. */
  issuer?: string
}) {
  const { budgetLines, issuerMemory } = useFacturationModel()
  const [q, setQ] = useState('')
  const [activeSection, setActiveSection] = useState<string | null>(null)

  // Index de recherche normalisé, une entrée par CODE (le référentiel a une ligne par COUPLE :
  // on regroupe les comptes d'un même code). Recalculé quand le référentiel change.
  const index = useMemo(() => {
    const byCode = new Map<string, CodeEntry>()
    for (const l of budgetLines) {
      const hit = byCode.get(l.code)
      if (hit) {
        if (l.compte && !hit.comptes.includes(l.compte)) hit.comptes.push(l.compte)
        hit.search += ' ' + normalize(`${l.compte} ${l.hint ?? ''}`)
        continue
      }
      byCode.set(l.code, {
        line: l,
        comptes: l.compte ? [l.compte] : [],
        search: normalize(
          `${l.code} ${l.label} ${l.category} ${l.compte} ${l.hint ?? ''}`,
        ),
      })
    }
    return [...byCode.values()]
  }, [budgetLines])

  // Sections comptables présentes (remplace le filtre « par domaine » : les tags ne sont plus
  // portés par le référentiel couplé).
  const sections = useMemo(
    () =>
      [...new Set(index.map((it) => it.line.category).filter(Boolean))].sort(),
    [index],
  )

  // Filtre = section active (si présente) ET tous les mots de la requête présents,
  // puis regroupé par section dans l'ordre du plan.
  const groups = useMemo(() => {
    const tokens = normalize(q).split(/\s+/).filter(Boolean)
    const out: { category: string; entries: CodeEntry[] }[] = []
    for (const it of index) {
      if (activeSection && it.line.category !== activeSection) continue
      if (!tokens.every((t) => it.search.includes(t))) continue
      let g = out.find((x) => x.category === it.line.category)
      if (!g) {
        g = { category: it.line.category, entries: [] }
        out.push(g)
      }
      g.entries.push(it)
    }
    return out
  }, [q, activeSection, index])

  // Cocher/décocher un code, en réalignant la table des comptes (compte pré-rempli si le code
  // n'en a qu'un ; choix conservé sinon, entrée retirée quand le code est décoché).
  const toggle = (code: string) => {
    const nextCodes = selected.includes(code)
      ? selected.filter((c) => c !== code)
      : [...selected, code]
    onChange(
      nextCodes,
      fillComptes(nextCodes, comptes, (c) =>
        preferredCompte(issuerMemory, issuer ?? '', c),
      ),
    )
  }

  const setCompte = (code: string, compte: string) =>
    onChange(selected, { ...comptes, [code]: compte })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-[38rem] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="text-base">
            Imputations comptables
          </DialogTitle>
          <DialogDescription className="text-xs">
            Cherchez par code, libellé, section, compte ou fournisseur. Cochez
            une ou plusieurs lignes.
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

        {/* Filtre par section : une seule section à la fois, combinée en ET avec la
            recherche texte. « Toutes les sections » réinitialise le filtre. */}
        <div className="border-b border-border px-4 py-2">
          <Select
            value={activeSection ?? 'all'}
            onValueChange={(v) => setActiveSection(v === 'all' ? null : v)}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue placeholder="Toutes les sections" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les sections</SelectItem>
              {sections.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
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
                  {g.entries.map((it) => {
                    const l = it.line
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
                      <div key={l.code} className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => toggle(l.code)}
                          className={cn(
                            'relative flex w-full flex-col gap-2 rounded-md px-2 py-2 text-left transition-colors',
                            on ? 'bg-primary/10' : 'hover:bg-secondary/60',
                          )}
                        >
                          {/* Nom, code + compte(s), explication (place réservée à droite pour le %). */}
                          <span className="flex min-w-0 flex-col gap-1 pr-12">
                            <span className="truncate text-sm text-foreground">
                              {l.label}
                            </span>
                            <span className="flex flex-wrap items-center gap-x-1.5 font-mono text-[11px] text-muted-foreground">
                              <span>{l.code}</span>
                              {it.comptes.length === 1 ? (
                                <span className="text-muted-foreground/70">
                                  · {it.comptes[0]}
                                </span>
                              ) : it.comptes.length > 1 ? (
                                <span className="text-muted-foreground/70">
                                  · {it.comptes.length} comptes
                                </span>
                              ) : null}
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

                        {/* Code coché avec plusieurs comptes → choix du compte (précision du couple).
                            Hors du bouton (un Select interactif ne s'imbrique pas dans un bouton). */}
                        {on && it.comptes.length > 1 && (
                          <div className="px-2 pb-1">
                            <Select
                              value={comptes[l.code] ?? ''}
                              onValueChange={(v) => setCompte(l.code, v)}
                            >
                              <SelectTrigger
                                size="sm"
                                className="w-full font-mono text-[11px]"
                              >
                                <SelectValue placeholder="Choisir un compte" />
                              </SelectTrigger>
                              <SelectContent>
                                {it.comptes.map((c) => (
                                  <SelectItem
                                    key={c}
                                    value={c}
                                    className="font-mono"
                                  >
                                    {c}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
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
