import { useMemo, useState } from 'react'
import {
  BookText,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'

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
import { ReferentielImport } from '#/components/facturation/ReferentielImport.tsx'
import { ComptesManager } from '#/components/facturation/ComptesManager.tsx'
import { useFacturationModel } from '#/components/facturation/useFacturationModel.ts'
import { useBudgetLinesCuration } from '#/components/facturation/useBudgetLinesCuration.ts'
import { imputationKey } from '#/lib/facturation/budgetRegistry.ts'
import type { BudgetLine } from '#/lib/facturation/types.ts'

/*
 * Modal « Gérer les imputations » — CRUD du référentiel (table facturation_ref_imputations) via RPC.
 * Une imputation = un COUPLE (code analytique + compte) : c'est la granularité de la liste, de
 * l'édition et de la suppression. Habillage ÉPURÉ calqué sur le CodePicker : recherche à la loupe,
 * groupes par section, footer. Actions en ICÔNES seules + tooltips (crayon = modifier, poubelle =
 * supprimer, cadenas = protégée). Règles métier :
 *  - le code ET le compte forment la clé (PK) : immuables en édition (renommer = supprimer/recréer) ;
 *  - SUPPRESSION BLOQUÉE seulement pour le DERNIER compte d'un code encore utilisé (sa suppression
 *    effacerait un libellé actif) ; retirer un compte d'un code multi-comptes reste permis ;
 *    la RPC reste le garde-fou serveur. Le réimport en masse reste le canal d'édition global.
 * Admin-only (hérité de la route /facturation).
 */

interface Draft {
  code: string
  compte: string
  label: string
  category: string
  hint: string
}

const EMPTY: Draft = { code: '', compte: '', label: '', category: '', hint: '' }

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
  const [busy, setBusy] = useState<string | null>(null) // couple en cours de suppression
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const [importOpen, setImportOpen] = useState(false) // dialog de réimport en masse
  const [comptesOpen, setComptesOpen] = useState(false) // dialog du dictionnaire des comptes

  // Croise le cache déjà chargé pour savoir quels CODES sont UTILISÉS (le blocage de suppression
  // se joue au niveau du code, cf. la garde serveur : dernier compte d'un code utilisé).
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

  // Nombre de comptes par code → distingue le DERNIER compte (suppression protégée si code utilisé)
  // d'un compte parmi plusieurs (toujours supprimable).
  const countByCode = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of budgetLines) m.set(l.code, (m.get(l.code) ?? 0) + 1)
    return m
  }, [budgetLines])

  // Filtre puis groupage par section (ordre du plan préservé), façon CodePicker. Une ligne par
  // COUPLE ; la recherche couvre code, compte, libellé et section.
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const out: { category: string; lines: BudgetLine[] }[] = []
    for (const l of budgetLines) {
      if (
        needle &&
        !l.code.toLowerCase().includes(needle) &&
        !l.compte.toLowerCase().includes(needle) &&
        !l.label.toLowerCase().includes(needle) &&
        !l.category.toLowerCase().includes(needle)
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
  const coupleExists = (code: string, compte: string): boolean =>
    budgetLines.some((l) => l.code === code && l.compte === compte)

  function openNew() {
    setDraft(EMPTY)
    setIsNew(true)
    setFormError(null)
  }
  function openEdit(l: BudgetLine) {
    setDraft({
      code: l.code,
      compte: l.compte,
      label: l.label,
      category: l.category,
      hint: l.hint ?? '',
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
    const compte = draft.compte.trim()
    if (code.length < 3) {
      setFormError('Le code doit faire au moins 3 caractères.')
      return
    }
    if (compte.length < 1) {
      setFormError('Le compte est requis.')
      return
    }
    if (draft.label.trim().length < 1) {
      setFormError('Le libellé est requis.')
      return
    }
    if (isNew && coupleExists(code, compte)) {
      setFormError(`L'imputation ${code} / ${compte} existe déjà.`)
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await saveLine(
        {
          code,
          compte,
          label: draft.label.trim(),
          category: draft.category.trim(),
          hint: draft.hint.trim(),
          tags: [], // le référentiel au couple ne porte plus de domaines (tags)
        },
        { create: isNew },
      )
      closeForm()
    } catch (e) {
      const errCode = (e as { code?: string })?.code
      setFormError(
        errCode === '23505'
          ? 'Cette imputation existe déjà en base (rafraîchissez le référentiel).'
          : 'Enregistrement impossible (droits ou base indisponibles).',
      )
    } finally {
      setSaving(false)
    }
  }

  async function del(code: string, compte: string) {
    const ok = await confirm({
      title: 'Supprimer cette imputation ?',
      description: (
        <>
          Supprime <b>définitivement</b> l'imputation <b>{code}</b>
          {compte ? (
            <>
              {' '}
              / <b>{compte}</b>
            </>
          ) : null}{' '}
          du référentiel. Action <b>irréversible</b>, sans effet en revanche sur
          les factures déjà tamponnées.
        </>
      ),
      confirmLabel: 'Supprimer définitivement',
      destructive: true,
    })
    if (!ok) return
    const key = imputationKey(code, compte)
    setBusy(key)
    setRowError((e) => ({ ...e, [key]: '' }))
    try {
      await removeLine(code, compte)
    } catch {
      setRowError((e) => ({
        ...e,
        [key]: 'Suppression refusée (dernier compte actif du code, ou droits).',
      }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85vh] max-w-[38rem] flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-4 py-3">
            <DialogTitle className="text-base">
              Gérer les imputations
            </DialogTitle>
            <DialogDescription className="text-xs">
              {draft
                ? isNew
                  ? 'Nouvelle imputation (code + compte).'
                  : 'Modifier une imputation (code et compte non modifiables).'
                : 'Cliquez le crayon pour modifier. Le dernier compte d’un code utilisé ne peut pas être supprimé.'}
            </DialogDescription>
          </DialogHeader>

          {draft ? (
            /* --- Formulaire création / édition --- */
            <>
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="bl-code">
                      Code {isNew ? '(non modifiable ensuite)' : '(immuable)'}
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
                    <Label htmlFor="bl-compte">
                      Compte {isNew ? '(non modifiable ensuite)' : '(immuable)'}
                    </Label>
                    <Input
                      id="bl-compte"
                      value={draft.compte}
                      disabled={!isNew}
                      onChange={(e) =>
                        setDraft((d) => d && { ...d, compte: e.target.value })
                      }
                      placeholder="ex. 60610000"
                      className="font-mono"
                    />
                  </div>
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
                  placeholder="Rechercher (code, compte, libellé, section)…"
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
                          const key = imputationKey(l.code, l.compte)
                          const locked =
                            usage.has(l.code) &&
                            (countByCode.get(l.code) ?? 0) <= 1
                          return (
                            <div key={key}>
                              <div className="group flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/60">
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm text-foreground">
                                    {l.label}
                                  </p>
                                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                                    {l.code}
                                    {l.compte && (
                                      <span className="ml-2 text-muted-foreground/60">
                                        {l.compte}
                                      </span>
                                    )}
                                  </p>
                                </div>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => openEdit(l)}
                                      aria-label={`Modifier ${l.code} ${l.compte}`}
                                      className="shrink-0 rounded p-1 text-muted-foreground opacity-60 transition-colors group-hover:opacity-100 hover:text-foreground"
                                    >
                                      <Pencil className="size-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Modifier</TooltipContent>
                                </Tooltip>
                                {locked ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="shrink-0 p-1 text-muted-foreground/40">
                                        <Lock className="size-3.5" />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs whitespace-normal">
                                      Seul compte d’un code déjà utilisé (
                                      {usageLabel(l.code)}). Suppression
                                      impossible.
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        onClick={() => del(l.code, l.compte)}
                                        disabled={busy === key}
                                        aria-label={`Supprimer ${l.code} ${l.compte}`}
                                        className="shrink-0 rounded p-1 text-muted-foreground opacity-60 transition-colors group-hover:opacity-100 hover:text-destructive"
                                      >
                                        {busy === key ? (
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
                              {rowError[key] && (
                                <p className="px-2 text-[11px] text-destructive">
                                  {rowError[key]}
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
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setComptesOpen(true)}
                  >
                    <BookText className="size-4" />
                    Comptes
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setImportOpen(true)}
                  >
                    <Upload className="size-4" />
                    Réimporter
                  </Button>
                  <Button size="sm" onClick={openNew}>
                    <Plus className="size-4" />
                    Ajouter
                  </Button>
                </div>
              </div>
            </>
          )}
          {confirmDialog}
        </DialogContent>
      </Dialog>
      <ReferentielImport open={importOpen} onOpenChange={setImportOpen} />
      <ComptesManager open={comptesOpen} onOpenChange={setComptesOpen} />
    </>
  )
}
