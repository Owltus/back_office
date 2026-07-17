import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ChevronDown,
  ListPlus,
  Loader2,
  Stamp,
  X,
} from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import { CodePicker } from '#/components/facturation/CodePicker.tsx'
import { DetectionCard } from '#/components/facturation/DetectionCard.tsx'
import { budgetLabel } from '#/lib/facturation/constants.ts'
import { canLearn } from '#/lib/facturation/detect.ts'
import { normalize } from '#/lib/facturation/text.ts'
import { learnClouds, learnIssuer } from '#/lib/facturation/cloudService.ts'
import {
  addStrong,
  countTokens,
  mergePools,
  tokenize,
  type WordPool,
} from '#/lib/facturation/wordpool.ts'
import { type Issuer } from '#/lib/facturation/issuers.ts'
import { stampDataOf } from '#/lib/facturation/stampLayout.ts'
import type { InvoiceRecord } from '#/lib/facturation/types.ts'
import { cn } from '#/lib/utils.ts'

// Poids du nom d'émetteur comme token (signal fort mais non déterministe).
const SUPPLIER_WEIGHT = 5

/*
 * Panneau d'imputation (rail droit de l'atelier) pour la facture sélectionnée :
 * ce que la détection a trouvé, puis le formulaire. Une facture peut porter
 * PLUSIEURS imputations comptables (record.codes) : elles s'affichent en pastilles
 * retirables ; le choix passe par un modal de recherche (CodePicker). Le reste :
 * commentaire, dates, et l'apposition du tampon. Monté avec `key={record.id}`
 * par le board : changer de facture réinitialise les états locaux.
 */

/** Liste des imputations choisies, en pastilles retirables (rail droit). */
function ImputationList({
  codes,
  onRemove,
}: {
  codes: string[]
  onRemove: (code: string) => void
}) {
  if (codes.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Aucune imputation — ajoutez-en une ou plusieurs.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      {codes.map((code) => (
        <div
          key={code}
          className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-2 py-1.5"
        >
          <span className="font-mono text-xs text-foreground">{code}</span>
          <span className="min-w-0 flex-1 truncate text-sm">
            {budgetLabel(code)}
          </span>
          <button
            type="button"
            onClick={() => onRemove(code)}
            aria-label={`Retirer ${code}`}
            className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

/*
 * État à vide du rail droit : la MÊME charpente (imputations, commentaire, dates,
 * action) mais inerte — pour que la carte ait déjà sa forme avant tout dépôt.
 */
export function EmptyImputation() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Déposez une facture pour l'imputer.
      </p>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Imputations comptables</Label>
          <p className="text-xs text-muted-foreground">
            Aucune imputation — ajoutez-en une ou plusieurs.
          </p>
          <Button variant="outline" size="sm" disabled className="w-full">
            <ListPlus className="size-4" />
            Choisir les imputations
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Émetteur</Label>
          <Input disabled placeholder="Nom de l'émetteur (ex. Martin)" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Commentaire</Label>
          <Textarea
            disabled
            placeholder="Note libre apposée sur le tampon"
            rows={2}
            className="resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Date de facture</Label>
            <Input type="date" disabled />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Date de traitement</Label>
            <Input type="date" disabled />
          </div>
        </div>
      </div>

      <Button disabled className="w-full">
        <Stamp className="size-4" />
        Apposer le tampon & télécharger
      </Button>
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
  const [pickerOpen, setPickerOpen] = useState(false)
  const [stamping, setStamping] = useState(false)
  const [stampError, setStampError] = useState<string | null>(null)
  const queryClient = useQueryClient()

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

  const canStamp = record.codes.length > 0

  async function handleStamp() {
    setStamping(true)
    setStampError(null)
    try {
      const { stampAndDownload } = await import('#/lib/facturation/stamp.ts')
      await stampAndDownload(
        record.file,
        stampDataOf(record),
        record.fileName,
        record.position,
      )
      // Apprentissage au tamponnage (vérité terrain = record.codes après édition
      // humaine), une seule fois. Best-effort : un échec RPC ne bloque pas le PDF
      // déjà tamponné/téléchargé.
      if (!record.learned && record.codes.length > 0) {
        const deltas = countTokens(record.text)
        const learnSupplier = canLearn(record.supplierName)
        if (learnSupplier)
          addStrong(deltas, tokenize(record.supplierName), SUPPLIER_WEIGHT)
        try {
          await learnClouds(record.codes, deltas)
          onPatch({ learned: true })
          // Patch optimiste du cache (mêmes deltas), sans refetch du modèle.
          queryClient.setQueryData<WordPool>(['facturation', 'clouds'], (old) =>
            mergePools(old ?? { perCode: {} }, {
              perCode: Object.fromEntries(record.codes.map((c) => [c, deltas])),
            }),
          )
          // Apprentissage de l'émetteur (dictionnaire) : reconnu au prochain dépôt.
          if (learnSupplier) {
            const name = normalize(record.supplierName).trim()
            const display = record.supplierName.trim()
            await learnIssuer(name, display)
            queryClient.setQueryData<Issuer[]>(
              ['facturation', 'issuers'],
              (old) => {
                const list = old ? [...old] : []
                const i = list.findIndex((x) => x.name === name)
                if (i >= 0)
                  list[i] = { ...list[i], display, count: list[i].count + 1 }
                else list.push({ name, display, count: 1 })
                return list
              },
            )
          }
        } catch {
          /* apprentissage best-effort : ignoré si le réseau/la table échoue */
        }
      }
    } catch (e) {
      setStampError(e instanceof Error ? e.message : 'Tampon impossible')
    } finally {
      setStamping(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <DetectionCard detection={record.detection} />

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Imputations comptables</Label>
          <ImputationList
            codes={record.codes}
            onRemove={(code) =>
              onPatch({ codes: record.codes.filter((c) => c !== code) })
            }
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPickerOpen(true)}
            className="w-full"
          >
            <ListPlus className="size-4" />
            Choisir les imputations
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Émetteur</Label>
          <Input
            value={record.supplierName}
            onChange={(e) => onPatch({ supplierName: e.target.value })}
            placeholder="Nom de l'émetteur (ex. Martin)"
          />
          <p className="text-xs text-muted-foreground">
            Appris au tamponnage : la prochaine facture de cet émetteur en
            tiendra compte.
          </p>
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

      <CodePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selected={record.codes}
        onChange={(codes) => onPatch({ codes })}
      />
    </div>
  )
}
