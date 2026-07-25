import { useCallback, useRef, useState, type DragEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import Papa from 'papaparse'
import { AlertTriangle, Check, FileUp, Loader2, X } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Button } from '#/components/ui/button.tsx'
import { useConfirm } from '#/components/shared/ConfirmDialog.tsx'
import { reimportRefImputations } from '#/lib/facturation/cloudService.ts'

/*
 * Réimport du référentiel des imputations — dépôt d'un fichier JSON ou CSV, aperçu, confirmation,
 * puis appel de la RPC ADDITIVE facturation_ref_reimport (upsert : jamais de suppression). Le
 * fichier ne quitte le navigateur qu'au moment de l'envoi des lignes normalisées. Admin-only
 * (hérité de la route /facturation). Aucun SQL à exécuter côté utilisateur.
 *
 * Formats acceptés :
 *  - JSON : tableau d'objets { code_analytique, compte, section?, libelle?, description?, sort_order? }.
 *  - CSV : en-tête code_analytique,compte,section,libelle,description (sort_order optionnel).
 * Les lignes sans code_analytique ou sans compte sont ignorées.
 */

interface RefRow {
  code_analytique: string
  compte: string
  section?: string
  libelle?: string
  description?: string
  sort_order?: number
}

/** Normalise une ligne brute (objet JSON ou ligne CSV à en-tête) vers RefRow ; champ vide -> undefined. */
function normalizeRow(r: Record<string, unknown>): RefRow {
  const s = (v: unknown): string => (v == null ? '' : String(v).trim())
  const sortRaw = s(r.sort_order)
  const sort = /^\d+$/.test(sortRaw) ? Number(sortRaw) : undefined
  return {
    code_analytique: s(r.code_analytique),
    compte: s(r.compte),
    section: s(r.section) || undefined,
    libelle: s(r.libelle) || undefined,
    description: s(r.description) || undefined,
    sort_order: sort,
  }
}

/** Parse le contenu selon son type (JSON tableau d'objets, ou CSV à en-tête) en lignes brutes
 *  normalisées (avant filtrage des invalides). Lève si le JSON n'est pas un tableau. */
function parseRows(text: string, isJson: boolean): RefRow[] {
  if (isJson) {
    const data: unknown = JSON.parse(text)
    if (!Array.isArray(data))
      throw new Error('Le JSON doit être un tableau d’objets.')
    return data.map((r) => normalizeRow((r ?? {}) as Record<string, unknown>))
  }
  const res = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
  })
  return (res.data ?? []).map(normalizeRow)
}

export function ReferentielImport({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const qc = useQueryClient()
  const { confirm, confirmDialog } = useConfirm()
  const inputRef = useRef<HTMLInputElement>(null)

  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<RefRow[] | null>(null)
  const [ignored, setIgnored] = useState(0)
  const [parseError, setParseError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)

  const reset = useCallback(() => {
    setFileName('')
    setRows(null)
    setIgnored(0)
    setParseError(null)
    setBusy(false)
    setImportError(null)
    setDone(null)
  }, [])

  const handleFile = useCallback(async (file: File) => {
    setParseError(null)
    setImportError(null)
    setDone(null)
    setRows(null)
    setIgnored(0)
    setFileName(file.name)
    try {
      const text = await file.text()
      const isJson = /\.json$/i.test(file.name) || text.trim().startsWith('[')
      const parsed = parseRows(text, isJson)
      const valid = parsed.filter((r) => r.code_analytique && r.compte)
      setIgnored(parsed.length - valid.length)
      if (valid.length === 0) {
        setParseError('Aucune ligne valide (code_analytique et compte requis).')
        return
      }
      setRows(valid)
    } catch {
      setParseError('Fichier illisible ou format invalide.')
    }
  }, [])

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  async function doImport() {
    if (!rows) return
    const ok = await confirm({
      title: 'Réimporter le référentiel ?',
      description: (
        <>
          Ajoute ou met à jour {rows.length} imputation
          {rows.length > 1 ? 's' : ''}. Aucune suppression : les imputations
          absentes du fichier restent en place.
        </>
      ),
      confirmLabel: 'Réimporter',
    })
    if (!ok) return
    setBusy(true)
    setImportError(null)
    try {
      const n = await reimportRefImputations(rows)
      await qc.invalidateQueries({ queryKey: ['facturation', 'budgetLines'] })
      setDone(n)
      setRows(null)
      setFileName('')
    } catch {
      setImportError(
        'Réimport impossible (droits insuffisants ou base indisponible).',
      )
    } finally {
      setBusy(false)
    }
  }

  const preview = rows?.slice(0, 5) ?? []

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="flex max-h-[85vh] max-w-[34rem] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="text-base">
            Réimporter le référentiel
          </DialogTitle>
          <DialogDescription className="text-xs">
            Fichier JSON (tableau d’objets) ou CSV (en-tête code_analytique,
            compte, section, libelle, description). Ajout et mise à jour
            uniquement, aucune suppression.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {/* Zone de dépôt (JSON ou CSV). */}
          <div
            onDrop={onDrop}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={(e) => {
              e.preventDefault()
              setDragOver(false)
            }}
            className={`rounded-lg border-2 p-4 transition-colors ${
              dragOver
                ? 'border-primary bg-primary/5'
                : 'border-dashed border-border'
            }`}
          >
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 py-4 text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              <FileUp className="size-5 shrink-0" />
              {fileName || 'Déposer un fichier .json ou .csv, ou cliquer'}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".json,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
                e.target.value = ''
              }}
            />
          </div>

          {parseError && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="size-4 shrink-0" />
              {parseError}
            </div>
          )}

          {importError && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <X className="size-4 shrink-0" />
              {importError}
            </div>
          )}

          {done !== null && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-500">
              <Check className="size-4 shrink-0" />
              Référentiel réimporté : {done} ligne{done > 1 ? 's' : ''} traitée
              {done > 1 ? 's' : ''}.
            </div>
          )}

          {/* Aperçu des lignes valides. */}
          {rows && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-foreground">
                {rows.length} ligne{rows.length > 1 ? 's' : ''} valide
                {rows.length > 1 ? 's' : ''}
                {ignored > 0
                  ? `, ${ignored} ignorée${ignored > 1 ? 's' : ''} (code ou compte manquant)`
                  : ''}
                .
              </p>
              <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-2">
                {preview.map((r, i) => (
                  <div
                    key={`${r.code_analytique}|${r.compte}|${i}`}
                    className="flex items-baseline gap-2 text-xs"
                  >
                    <span className="font-mono text-muted-foreground">
                      {r.code_analytique}
                    </span>
                    <span className="font-mono text-muted-foreground/70">
                      {r.compte}
                    </span>
                    <span className="truncate text-foreground">
                      {r.libelle || ''}
                    </span>
                  </div>
                ))}
                {rows.length > preview.length && (
                  <p className="text-[11px] text-muted-foreground">
                    et {rows.length - preview.length} autre
                    {rows.length - preview.length > 1 ? 's' : ''}.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              reset()
              onOpenChange(false)
            }}
            disabled={busy}
          >
            Fermer
          </Button>
          <Button size="sm" onClick={doImport} disabled={!rows || busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Réimporter
          </Button>
        </div>
        {confirmDialog}
      </DialogContent>
    </Dialog>
  )
}
