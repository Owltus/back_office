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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#/components/ui/tooltip.tsx'
import { useConfirm } from '#/components/shared/ConfirmDialog.tsx'
import { useFacturationModel } from '#/components/facturation/useFacturationModel.ts'
import { useComptesCuration } from '#/components/facturation/useComptesCuration.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Dialog « Dictionnaire des comptes » — donne à chaque numéro de compte un NOM humain
 * (table facturation_ref_comptes) via RPC (garde de rôle serveur `gestion`). La liste réunit
 * les comptes déjà nommés ET les comptes référencés par une imputation mais pas encore nommés
 * (badge « à nommer »). Un compte encore référencé ne peut pas être supprimé (cadenas + garde
 * serveur 23503). Style épuré calqué sur BudgetLinesManager. Ouvert depuis « Gérer les
 * imputations ». Admin-only (hérité de la route /facturation).
 */

interface Draft {
  compte: string
  libelle: string
}

export function ComptesManager({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { budgetLines, comptes } = useFacturationModel()
  const { saveCompte, removeCompte } = useComptesCuration()
  const { confirm, confirmDialog } = useConfirm()

  const [q, setQ] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [rowError, setRowError] = useState<Record<string, string>>({})

  // Comptes référencés par une imputation (couple) : suppression protégée.
  const referenced = useMemo(
    () => new Set(budgetLines.map((l) => l.compte).filter(Boolean)),
    [budgetLines],
  )

  // Liste = union { comptes du dictionnaire } ∪ { comptes référencés non encore nommés }.
  const rows = useMemo(() => {
    const byCompte = new Map<string, string>()
    for (const c of comptes) byCompte.set(c.compte, c.libelle)
    for (const cpt of referenced) if (!byCompte.has(cpt)) byCompte.set(cpt, '')
    return [...byCompte.entries()]
      .map(([compte, libelle]) => ({ compte, libelle }))
      .sort((a, b) => a.compte.localeCompare(b.compte))
  }, [comptes, referenced])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(
      (r) =>
        r.compte.toLowerCase().includes(needle) ||
        r.libelle.toLowerCase().includes(needle),
    )
  }, [rows, q])

  const known = useMemo(() => new Set(comptes.map((c) => c.compte)), [comptes])
  const toName = rows.filter((r) => !r.libelle.trim()).length

  function openNew() {
    setDraft({ compte: '', libelle: '' })
    setIsNew(true)
    setFormError(null)
  }
  function openEdit(r: Draft) {
    setDraft({ compte: r.compte, libelle: r.libelle })
    setIsNew(false)
    setFormError(null)
  }
  function closeForm() {
    setDraft(null)
    setFormError(null)
  }

  async function save() {
    if (!draft) return
    const compte = draft.compte.trim()
    const libelle = draft.libelle.trim()
    if (compte.length < 1) {
      setFormError('Le numéro de compte est requis.')
      return
    }
    if (libelle.length < 1) {
      setFormError('Le nom du compte est requis.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await saveCompte(compte, libelle)
      closeForm()
    } catch {
      setFormError('Enregistrement impossible (droits ou base indisponibles).')
    } finally {
      setSaving(false)
    }
  }

  async function del(compte: string) {
    const ok = await confirm({
      title: 'Supprimer ce compte du dictionnaire ?',
      description: (
        <>
          Retire le nom humain de <b>{compte}</b>. Le compte reste utilisable dans
          les imputations, mais réapparaîtra « à nommer ». Action sans effet sur les
          factures déjà tamponnées.
        </>
      ),
      confirmLabel: 'Supprimer',
      destructive: true,
    })
    if (!ok) return
    setBusy(compte)
    setRowError((e) => ({ ...e, [compte]: '' }))
    try {
      await removeCompte(compte)
    } catch {
      setRowError((e) => ({
        ...e,
        [compte]: 'Suppression refusée (compte encore utilisé, ou droits).',
      }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-[38rem] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="text-base">Dictionnaire des comptes</DialogTitle>
          <DialogDescription className="text-xs">
            {draft
              ? isNew
                ? 'Nouveau compte (numéro + nom humain).'
                : 'Renommer un compte (numéro non modifiable).'
              : 'Donnez à chaque numéro un nom clair. Un compte utilisé ne peut pas être supprimé.'}
          </DialogDescription>
        </DialogHeader>

        {draft ? (
          /* --- Formulaire création / édition --- */
          <>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="cpt-num">
                  Numéro de compte{' '}
                  {isNew ? '(non modifiable ensuite)' : '(immuable)'}
                </Label>
                <Input
                  id="cpt-num"
                  value={draft.compte}
                  disabled={!isNew}
                  onChange={(e) =>
                    setDraft((d) => d && { ...d, compte: e.target.value })
                  }
                  placeholder="ex. 60710000"
                  className="font-mono"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="cpt-lib">Nom humain</Label>
                <Input
                  id="cpt-lib"
                  value={draft.libelle}
                  onChange={(e) =>
                    setDraft((d) => d && { ...d, libelle: e.target.value })
                  }
                  placeholder="ex. Achats de denrées"
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
          /* --- Liste --- */
          <>
            <div className="relative border-b border-border px-4 py-2.5">
              <Search className="pointer-events-none absolute top-1/2 left-6 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher (numéro ou nom)…"
                className="h-9 pl-8"
              />
            </div>
            <TooltipProvider delayDuration={300}>
              <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                {filtered.length === 0 ? (
                  <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                    Aucun compte ne correspond.
                  </p>
                ) : (
                  filtered.map((r) => {
                    const used = referenced.has(r.compte)
                    const unnamed = !r.libelle.trim()
                    return (
                      <div key={r.compte}>
                        <div className="group flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/60">
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                'truncate text-sm',
                                unnamed
                                  ? 'text-muted-foreground/60 italic'
                                  : 'text-foreground',
                              )}
                            >
                              {r.libelle.trim() || 'à nommer'}
                            </p>
                            <p className="truncate font-mono text-[11px] text-muted-foreground">
                              {r.compte}
                              {!known.has(r.compte) && (
                                <span className="ml-2 rounded bg-amber-500/10 px-1 font-sans text-[10px] text-amber-600">
                                  à nommer
                                </span>
                              )}
                            </p>
                          </div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => openEdit(r)}
                                aria-label={`Renommer ${r.compte}`}
                                className="shrink-0 rounded p-1 text-muted-foreground opacity-60 transition-colors group-hover:opacity-100 hover:text-foreground"
                              >
                                <Pencil className="size-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Renommer</TooltipContent>
                          </Tooltip>
                          {used || !known.has(r.compte) ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="shrink-0 p-1 text-muted-foreground/40">
                                  <Lock className="size-3.5" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs whitespace-normal">
                                {used
                                  ? 'Compte utilisé par une imputation. Suppression impossible.'
                                  : 'Compte non enregistré au dictionnaire.'}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => del(r.compte)}
                                  disabled={busy === r.compte}
                                  aria-label={`Supprimer ${r.compte}`}
                                  className="shrink-0 rounded p-1 text-muted-foreground opacity-60 transition-colors group-hover:opacity-100 hover:text-destructive"
                                >
                                  {busy === r.compte ? (
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
                        {rowError[r.compte] && (
                          <p className="px-2 text-[11px] text-destructive">
                            {rowError[r.compte]}
                          </p>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </TooltipProvider>
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
              <span className="text-sm text-muted-foreground tabular-nums">
                {rows.length} compte{rows.length > 1 ? 's' : ''}
                {toName > 0 && (
                  <span className="ml-2 text-amber-600">· {toName} à nommer</span>
                )}
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
