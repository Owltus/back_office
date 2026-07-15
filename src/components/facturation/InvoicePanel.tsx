import { useState } from 'react'
import {
  AlertTriangle,
  BookmarkPlus,
  Check,
  ChevronDown,
  Loader2,
  Stamp,
} from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import type { InvoiceRecord } from '#/components/facturation/FacturationBoard.tsx'
import { BUDGET_LINES, budgetLabel } from '#/lib/facturation/constants.ts'
import { rememberRule } from '#/lib/facturation/detect.ts'
import type { BudgetLine, StampData } from '#/lib/facturation/types.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Panneau d'imputation (rail droit de l'atelier) pour la facture sélectionnée :
 * ce que la détection a trouvé, le formulaire (code, fournisseur, commentaire,
 * dates) et les deux actions — mémoriser la correspondance fournisseur → code,
 * et apposer le tampon. Monté avec `key={record.id}` par le board : changer de
 * facture réinitialise les états locaux (mémorisé, texte déplié…).
 */

// Options du <select> groupées par catégorie (calculé une fois).
const GROUPED: { category: string; lines: BudgetLine[] }[] = []
for (const line of BUDGET_LINES) {
  let group = GROUPED.find((g) => g.category === line.category)
  if (!group) {
    group = { category: line.category, lines: [] }
    GROUPED.push(group)
  }
  group.lines.push(line)
}

function DetectionLine({ record }: { record: InvoiceRecord }) {
  const d = record.detection
  if (!d || !d.supplier) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucun fournisseur reconnu — à imputer manuellement.
      </p>
    )
  }
  return (
    <p className="text-sm">
      <span className="text-muted-foreground">Détecté : </span>
      <span className="font-medium text-foreground">{d.supplier}</span>
      {d.matchedKeyword && (
        <span className="text-muted-foreground">
          {' '}
          (« {d.matchedKeyword} », {Math.round(d.confidence * 100)} %
          {d.learned ? ', appris' : ''})
        </span>
      )}
    </p>
  )
}

function Hints({ record }: { record: InvoiceRecord }) {
  const h = record.detection?.hints
  if (!h) return null
  const chips: string[] = []
  if (h.invoiceNumber) chips.push(`N° ${h.invoiceNumber}`)
  if (h.amount) chips.push(`${h.amount} €`)
  if (!chips.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span
          key={c}
          className="rounded bg-secondary/60 px-1.5 py-0.5 text-xs text-muted-foreground"
        >
          {c}
        </span>
      ))}
    </div>
  )
}

export function InvoicePanel({
  record,
  onPatch,
}: {
  record: InvoiceRecord
  onPatch: (next: Partial<InvoiceRecord>) => void
}) {
  const [showText, setShowText] = useState(false)
  const [remembered, setRemembered] = useState(false)
  const [stamping, setStamping] = useState(false)
  const [stampError, setStampError] = useState<string | null>(null)

  if (record.status === 'processing') {
    return (
      <p className="text-sm text-muted-foreground">
        Lecture en cours — un scan passé à l'OCR peut prendre quelques secondes
        par page.
      </p>
    )
  }

  if (record.status === 'error') {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <AlertTriangle className="size-4 shrink-0" />
        {record.error}
      </div>
    )
  }

  const canStamp = !!record.code
  const canRemember = !!record.code && !!record.supplierName.trim()

  const stampData: StampData = {
    code: record.code,
    label: budgetLabel(record.code),
    comment: record.comment,
    invoiceDate: record.invoiceDate,
    processedDate: record.processedDate,
    scale: record.stampScale,
  }

  async function handleStamp() {
    setStamping(true)
    setStampError(null)
    try {
      const { stampAndDownload } = await import('#/lib/facturation/stamp.ts')
      await stampAndDownload(
        record.file,
        stampData,
        record.fileName,
        record.position,
      )
    } catch (e) {
      setStampError(e instanceof Error ? e.message : 'Tampon impossible')
    } finally {
      setStamping(false)
    }
  }

  function handleRemember() {
    rememberRule(record.supplierName, record.code)
    setRemembered(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <DetectionLine record={record} />
        <Hints record={record} />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Code comptable</Label>
          <Select
            value={record.code}
            onValueChange={(v) => onPatch({ code: v })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choisir une ligne budgétaire" />
            </SelectTrigger>
            <SelectContent>
              {GROUPED.map((g) => (
                <SelectGroup key={g.category}>
                  <SelectLabel>{g.category}</SelectLabel>
                  {g.lines.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.code} — {l.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Fournisseur (pour mémorisation)</Label>
          <Input
            value={record.supplierName}
            onChange={(e) => {
              onPatch({ supplierName: e.target.value })
              setRemembered(false)
            }}
            placeholder="Nom du fournisseur"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Commentaire</Label>
          <Textarea
            value={record.comment}
            onChange={(e) => onPatch({ comment: e.target.value })}
            placeholder="Note libre apposée sur le tampon"
            rows={2}
            className="resize-y"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Date de facture</Label>
            <Input
              type="date"
              value={record.invoiceDate}
              onChange={(e) => onPatch({ invoiceDate: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Date de traitement</Label>
            <Input
              type="date"
              value={record.processedDate}
              onChange={(e) => onPatch({ processedDate: e.target.value })}
            />
          </div>
        </div>
      </div>

      {stampError && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {stampError}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Button
          onClick={handleStamp}
          disabled={!canStamp || stamping}
          className="w-full"
        >
          {stamping ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Stamp className="size-4" />
          )}
          Apposer le tampon & télécharger
        </Button>
        <Button
          variant="outline"
          onClick={handleRemember}
          disabled={!canRemember || remembered}
          className="w-full"
        >
          {remembered ? (
            <Check className="size-4" />
          ) : (
            <BookmarkPlus className="size-4" />
          )}
          {remembered ? 'Fournisseur mémorisé' : 'Mémoriser ce fournisseur'}
        </Button>
      </div>

      <div className="border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setShowText((s) => !s)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown
            className={cn(
              'size-3.5 transition-transform',
              showText && 'rotate-180',
            )}
          />
          {showText ? 'Masquer' : 'Voir'} le texte lu
        </button>
        {showText && (
          <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-muted/40 p-3 text-xs whitespace-pre-wrap text-muted-foreground">
            {record.text || '(aucun texte extrait)'}
          </pre>
        )}
      </div>
    </div>
  )
}
