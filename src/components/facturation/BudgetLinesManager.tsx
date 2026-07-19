import { useMemo, useState } from 'react'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'

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
import { useConfirm } from '#/components/shared/ConfirmDialog.tsx'
import { Tag } from '#/components/facturation/Tag.tsx'
import { useFacturationModel } from '#/components/facturation/useFacturationModel.ts'
import { useBudgetLinesCuration } from '#/components/facturation/useBudgetLinesCuration.ts'
import { TAGS } from '#/lib/facturation/constants.ts'
import type { BudgetLine } from '#/lib/facturation/types.ts'

/*
 * Modal « Gérer les imputations » — CRUD du référentiel (table facturation_budget_lines) via RPC.
 * Distinct du CodePicker (qui SÉLECTIONNE). Règles :
 *  - le `code` est IMMUABLE en édition (PK + FK dans wordpool/issuer_codes/denylist/learned_docs) ;
 *  - SUPPRESSION BLOQUÉE si l'imputation est déjà utilisée (bouton désactivé + motif) ; la RPC
 *    reste le garde-fou serveur de dernier recours.
 * Admin-only (hérité de la route /facturation).
 */

interface Draft {
  code: string
  label: string
  category: string
  hint: string
  tags: string[]
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

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return budgetLines
    return budgetLines.filter(
      (l) =>
        l.code.toLowerCase().includes(needle) ||
        l.label.toLowerCase().includes(needle) ||
        l.category.toLowerCase().includes(needle),
    )
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
          tags: draft.tags,
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
          Supprime définitivement <b>{code}</b> du référentiel. Sans effet sur
          les factures déjà tamponnées.
        </>
      ),
      confirmLabel: 'Supprimer',
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

  const toggleTag = (t: string) =>
    setDraft(
      (d) =>
        d && {
          ...d,
          tags: d.tags.includes(t)
            ? d.tags.filter((x) => x !== t)
            : [...d.tags, t],
        },
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-[44rem] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row items-start justify-between gap-3 space-y-0 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <DialogTitle className="text-base">
              Gérer les imputations
            </DialogTitle>
            <DialogDescription className="text-xs">
              Créez, modifiez ou supprimez une imputation. Le code n'est pas
              modifiable ; une imputation déjà utilisée ne peut pas être
              supprimée.
            </DialogDescription>
          </div>
          {!draft && (
            <Button size="sm" onClick={openNew} className="shrink-0">
              <Plus className="size-4" />
              Ajouter
            </Button>
          )}
        </DialogHeader>

        {draft ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="bl-code">
                Code {isNew ? '(unique, non modifiable ensuite)' : '(immuable)'}
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
                onChange={(e) =>
                  setDraft((d) => d && { ...d, hint: e.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Domaines</Label>
              <div className="flex flex-wrap gap-1.5">
                {TAGS.map((t) => (
                  <Tag
                    key={t}
                    label={t}
                    active={draft.tags.includes(t)}
                    onClick={() => toggleTag(t)}
                  />
                ))}
              </div>
            </div>
            {formError && (
              <p className="text-xs text-destructive">{formError}</p>
            )}
            <div className="mt-1 flex justify-end gap-2">
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
          </div>
        ) : (
          <>
            <div className="border-b border-border px-4 py-2.5">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher (code, libellé, section)…"
                className="h-9"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                  Aucune imputation.
                </p>
              ) : (
                filtered.map((l) => {
                  const used = usage.has(l.code)
                  return (
                    <div
                      key={l.code}
                      className="flex flex-col gap-1 rounded-md px-2 py-2 hover:bg-secondary/50"
                    >
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-foreground">
                            {l.label}
                          </p>
                          <p className="truncate font-mono text-[11px] text-muted-foreground">
                            {l.code} · {l.category}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(l)}
                          className="shrink-0"
                        >
                          <Pencil className="size-4" />
                          Éditer
                        </Button>
                        {used ? (
                          <span title={`Utilisée : ${usageLabel(l.code)}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled
                              className="shrink-0 text-muted-foreground"
                            >
                              <Trash2 className="size-4" />
                              Utilisée
                            </Button>
                          </span>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => del(l.code)}
                            disabled={busy === l.code}
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                          >
                            {busy === l.code ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Trash2 className="size-4" />
                            )}
                            Supprimer
                          </Button>
                        )}
                      </div>
                      {l.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {l.tags.map((t) => (
                            <Tag key={t} label={t} />
                          ))}
                        </div>
                      )}
                      {rowError[l.code] && (
                        <p className="text-[11px] text-destructive">
                          {rowError[l.code]}
                        </p>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}
        {confirmDialog}
      </DialogContent>
    </Dialog>
  )
}
