import { useMemo, useState } from 'react'
import { Loader2, Lock, Pencil, Plus, Search, Trash2 } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#/components/ui/tooltip.tsx'
import { useConfirm } from '#/components/shared/ConfirmDialog.tsx'
import { useFacturationModel } from '#/components/facturation/useFacturationModel.ts'
import { useBudgetLinesCuration } from '#/components/facturation/useBudgetLinesCuration.ts'
import type { BudgetLine } from '#/lib/facturation/types.ts'

/*
 * Modal « Gérer les imputations » — CRUD du référentiel (table facturation_budget_lines) via RPC.
 * Habillage ÉPURÉ calqué sur le CodePicker : recherche à la loupe, groupes par section, footer.
 * Actions en ICÔNES seules + tooltips de l'app (crayon = modifier, poubelle = supprimer, cadenas
 * = déjà utilisée). Les DOMAINES (tags) ne sont pas affichés (jugés confusants) mais restent
 * CHERCHABLES et préservés à l'édition (pass-through). Règles métier :
 *  - le `code` est IMMUABLE en édition (PK + FK dans wordpool/issuer_codes/denylist/learned_docs) ;
 *  - SUPPRESSION BLOQUÉE si l'imputation est déjà utilisée ; sinon confirmation (irréversible) ;
 *    la RPC reste le garde-fou serveur.
 * Admin-only (hérité de la route /facturation).
 */

interface Draft {
  code: string
  label: string
  category: string
  hint: string
  tags: string[] // préservés à l'édition (non éditables ici), vides à la création
}

const EMPTY: Draft = { code: '', label: '', category: '', hint: '', tags: [] }

export function BudgetLinesManager({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { budgetLines, serverPool, issuerCodes, issuerDenylist, journal } =
    useFacturationModel()
  const { saveLine, removeLine } = useBudgetLinesCuration()
  const { confirm, confirmDialog } = useConfirm()

  const [q, setQ] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null) // null = liste ; sinon formulaire
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null) // code en cours de suppression
  const [rowError, setRowError] = useState<Record<string, string>>({})

  // Croise le cache déjà chargé pour savoir quels codes sont UTILISÉS (→ suppression bloquée).
  const usage = useMemo(() => {
    const detail = new Map<string, Map<string, number>>()
    const mark = (code: string, where: string) => {
      const m = detail.get(code) ?? new Map<string, number>()
      m.set(where, (m.get(where) ?? 0) + 1)
      detail.set(code, m)
    }
    for (const [code, cell] of Object.entries(serverPool.perCode))
      if (Object.keys(cell).length) mark(code, 'vocabulaire')
    for (const cell of Object.values(issuerCodes.perIssuer))
      for (const [code, n] of Object.entries(cell))
        if (n > 0) mark(code, 'émetteur')
    for (const set of Object.values(issuerDenylist.perIssuer))
      for (const code of set) mark(code, 'interdiction')
    for (const e of journal.entries)
      for (const code of e.codes) mark(code, 'facture apprise')
    return detail
  }, [serverPool, issuerCodes, issuerDenylist, journal])

  const usageLabel = (code: string): string => {
    const m = usage.get(code)
    if (!m) return ''
    return [...m.entries()]
      .map(([w, n]) => `${n} ${w}${n > 1 ? 's' : ''}`)
      .join(', ')
  }

  // Filtre puis groupage par section (ordre du plan préservé), façon CodePicker. La recherche
  // couvre AUSSI les domaines (tags) même s'ils ne sont pas affichés → on les retrouve.
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const out: { category: string; lines: BudgetLine[] }[] = []
    for (const l of budgetLines) {
      if (
        needle &&
        !l.code.toLowerCase().includes(needle) &&
        !l.label.toLowerCase().includes(needle) &&
        !l.category.toLowerCase().includes(needle) &&
        !l.tags.some((t) => t.toLowerCase().includes(needle))
      )
        continue
      let g = out.find((x) => x.category === l.category)
      if (!g) {
        g = { category: l.category, lines: [] }
        out.push(g)
      }
      g.lines.push(l)
    }
    return out
  }, [budgetLines, q])

  const categories = useMemo(
    () => [...new Set(budgetLines.map((l) => l.category))].sort(),
    [budgetLines],
  )
  const codeExists = (code: string): boolean =>
    budgetLines.some((l) => l.code === code)

  function openNew() {
    setDraft(EMPTY)
    setIsNew(true)
    setFormError(null)
  }
  function openEdit(l: BudgetLine) {
    setDraft({
      code: l.code,
      label: l.label,
      category: l.category,
      hint: l.hint ?? '',
      tags: l.tags,
    })
    setIsNew(false)
    setFormError(null)
  }
  function closeForm() {
    setDraft(null)
    setFormError(null)
  }

  async function save() {
    if (!draft) return
    const code = draft.code.trim()
    if (code.length < 3) {
      setFormError('Le code doit faire au moins 3 caractères.')
      return
    }
    if (draft.label.trim().length < 1) {
      setFormError('Le libellé est requis.')
      return
    }
    if (isNew && codeExists(code)) {
      setFormError(`Le code « ${code} » existe déjà.`)
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await saveLine(
        {
          code,
          label: draft.label.trim(),
          category: draft.category.trim(),
          hint: draft.hint.trim(),
          tags: draft.tags, // inchangés (préservés à l'édition)
        },
        { create: isNew },
      )
      closeForm()
    } catch (e) {
      const errCode = (e as { code?: string })?.code
      setFormError(
        errCode === '23505'
          ? 'Ce code existe déjà en base (rafraîchissez le référentiel).'
          : 'Enregistrement impossible (droits ou base indisponibles).',
      )
    } finally {
      setSaving(false)
    }
  }

  async function del(code: string) {
    const ok = await confirm({
      title: 'Supprimer cette imputation ?',
      description: (
        <>
          Supprime <b>définitivement</b> l'imputation <b>{code}</b> du
          référentiel. Action <b>irréversible</b> — sans effet, en revanche, sur
          les factures déjà tamponnées.
        </>
      ),
      confirmLabel: 'Supprimer définitivement',
      destructive: true,
    })
    if (!ok) return
    setBusy(code)
    setRowError((e) => ({ ...e, [code]: '' }))
    try {
      await removeLine(code)
    } catch {
      setRowError((e) => ({
        ...e,
        [code]: 'Suppression refusée (imputation utilisée ou droits).',
      }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-[38rem] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="text-base">Gérer les imputations</DialogTitle>
          <DialogDescription className="text-xs">
            {draft
              ? isNew
                ? 'Nouvelle imputation.'
                : 'Modifier une imputation — le code n’est pas modifiable.'
              : 'Cliquez le crayon pour modifier. Une imputation déjà utilisée ne peut pas être supprimée.'}
          </DialogDescription>
        </DialogHeader>

        {draft ? (
          /* --- Formulaire création / édition --- */
          <>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="bl-code">
                  Code{' '}
                  {isNew ? '(unique, non modifiable ensuite)' : '(immuable)'}
                </Label>
                <Input
                  id="bl-code"
                  value={draft.code}
                  disabled={!isNew}
                  onChange={(e) =>
                    setDraft((d) => d && { ...d, code: e.target.value })
                  }
                  placeholder="ex. FMELECoooo"
                  className="font-mono"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="bl-label">Libellé</Label>
                <Input
                  id="bl-label"
                  value={draft.label}
                  onChange={(e) =>
                    setDraft((d) => d && { ...d, label: e.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="bl-cat">Section</Label>
                <Input
                  id="bl-cat"
                  list="bl-cats"
                  value={draft.category}
                  onChange={(e) =>
                    setDraft((d) => d && { ...d, category: e.target.value })
                  }
                  placeholder="ex. RESTAURATION"
                />
                <datalist id="bl-cats">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="bl-hint">
                  Description (exemples de dépenses)
                </Label>
                <Textarea
                  id="bl-hint"
                  value={draft.hint}
                  rows={3}
                  className="resize-none"
                  onChange={(e) =>
                    setDraft((d) => d && { ...d, hint: e.target.value })
                  }
                />
              </div>
              {formError && (
                <p className="text-xs text-destructive">{formError}</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={closeForm}
                disabled={saving}
              >
                Annuler
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                Enregistrer
              </Button>
            </div>
          </>
        ) : (
          /* --- Liste épurée (façon CodePicker) --- */
          <>
            <div className="relative border-b border-border px-4 py-2.5">
              <Search className="pointer-events-none absolute top-1/2 left-6 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher (code, libellé, section, domaine)…"
                className="h-9 pl-8"
              />
            </div>
            <TooltipProvider delayDuration={300}>
              <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                {groups.length === 0 ? (
                  <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                    Aucune imputation ne correspond.
                  </p>
                ) : (
                  groups.map((g) => (
                    <div
                      key={g.category}
                      className="mb-2 flex flex-col gap-0.5"
                    >
                      <div className="flex items-center gap-2 px-2 py-1">
                        <span className="h-px flex-1 bg-primary/20" />
                        <span className="text-[11px] font-semibold tracking-[0.12em] text-primary/80 uppercase">
                          {g.category}
                        </span>
                        <span className="h-px flex-1 bg-primary/20" />
                      </div>
                      {g.lines.map((l) => {
                        const used = usage.has(l.code)
                        return (
                          <div key={l.code}>
                            <div className="group flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/60">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm text-foreground">
                                  {l.label}
                                </p>
                                <p className="truncate font-mono text-[11px] text-muted-foreground">
                                  {l.code}
                                </p>
                              </div>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => openEdit(l)}
                                    aria-label={`Modifier ${l.code}`}
                                    className="shrink-0 rounded p-1 text-muted-foreground opacity-60 transition-colors group-hover:opacity-100 hover:text-foreground"
                                  >
                                    <Pencil className="size-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Modifier</TooltipContent>
                              </Tooltip>
                              {used ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="shrink-0 p-1 text-muted-foreground/40">
                                      <Lock className="size-3.5" />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs whitespace-normal">
                                    Déjà utilisée ({usageLabel(l.code)}) —
                                    suppression impossible.
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => del(l.code)}
                                      disabled={busy === l.code}
                                      aria-label={`Supprimer ${l.code}`}
                                      className="shrink-0 rounded p-1 text-muted-foreground opacity-60 transition-colors group-hover:opacity-100 hover:text-destructive"
                                    >
                                      {busy === l.code ? (
                                        <Loader2 className="size-3.5 animate-spin" />
                                      ) : (
                                        <Trash2 className="size-3.5" />
                                      )}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Supprimer</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                            {rowError[l.code] && (
                              <p className="px-2 text-[11px] text-destructive">
                                {rowError[l.code]}
                              </p>
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
              <span className="text-sm text-muted-foreground tabular-nums">
                {budgetLines.length} imputation
                {budgetLines.length > 1 ? 's' : ''}
              </span>
              <Button size="sm" onClick={openNew}>
                <Plus className="size-4" />
                Ajouter
              </Button>
            </div>
          </>
        )}
        {confirmDialog}
      </DialogContent>
    </Dialog>
  )
}
