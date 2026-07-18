import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ListPlus,
  Loader2,
  RotateCcw,
  Stamp,
  X,
} from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import { CodePicker } from '#/components/facturation/CodePicker.tsx'
import { IssuerCombobox } from '#/components/facturation/IssuerCombobox.tsx'
import {
  confidenceTone,
  probaFor,
} from '#/components/facturation/confidence.ts'
import { budgetLabel } from '#/lib/facturation/constants.ts'
import { canLearn } from '#/lib/facturation/detect.ts'
import { normalize } from '#/lib/facturation/text.ts'
import {
  learnClouds,
  learnIssuer,
  unlearnClouds,
  unlearnIssuer,
} from '#/lib/facturation/cloudService.ts'
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

// Poids du nom d'émetteur comme token appris. VOLONTAIREMENT MODÉRÉ (anti-« collapse ») :
// un poids trop élevé donne au token d'émetteur un idf/tf dominant, qui rappelle ensuite
// systématiquement l'imputation historique de ce fournisseur et écrase les autres
// (problème quand un même émetteur livre des articles à imputations différentes). Il
// doit INFORMER, pas verrouiller — les mots de l'article gardent la main.
const SUPPLIER_WEIGHT = 2

/*
 * Panneau d'imputation (rail droit de l'atelier) pour la facture sélectionnée :
 * ce que la détection a trouvé, puis le formulaire. Une facture peut porter
 * PLUSIEURS imputations comptables (record.codes) : elles s'affichent en pastilles
 * retirables ; le choix passe par un modal de recherche (CodePicker). Le reste :
 * commentaire, dates, et l'apposition du tampon. Monté avec `key={record.id}`
 * par le board : changer de facture réinitialise les états locaux.
 */

/**
 * Liste FUSIONNÉE des imputations : chaque code retenu est retirable ET affiche sa
 * PROBABILITÉ d'être la bonne (barre + %). Remplace l'ancienne carte séparée. Les
 * codes sont déjà ordonnés meilleur d'abord. `immature` plafonne la teinte (jamais de
 * vert « fiable » trompeur) sans masquer le pourcentage réel.
 */
function ImputationList({
  codes,
  detection,
  immature,
  onRemove,
}: {
  codes: string[]
  detection: InvoiceRecord['detection']
  immature: boolean
  onRemove: (code: string) => void
}) {
  if (codes.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {detection?.abstained
          ? 'Preuve insuffisante — ajoutez une imputation.'
          : 'Aucune imputation — ajoutez-en une ou plusieurs.'}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      {codes.map((code) => {
        const raw = probaFor(code, detection)
        const pct = raw === undefined ? null : Math.round(raw * 100)
        const tone = confidenceTone(
          raw === undefined ? 0 : immature ? Math.min(raw, 0.45) : raw,
        )
        return (
          <div
            key={code}
            className="flex flex-col gap-2 rounded-md border border-border bg-secondary/40 px-2.5 py-2"
          >
            {/* Haut : description + code à gauche, le % à droite, retrait au bout. */}
            <div className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm text-foreground">
                  {budgetLabel(code)}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {code}
                </span>
              </div>

              <div className="shrink-0 text-right">
                {pct === null ? (
                  <span className="text-[11px] text-muted-foreground">
                    ajoutée
                  </span>
                ) : (
                  <span
                    className={cn(
                      'text-lg leading-none font-semibold tabular-nums',
                      tone.text,
                    )}
                  >
                    {pct}
                    <span className="text-xs font-normal">%</span>
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => onRemove(code)}
                aria-label={`Retirer ${code}`}
                className="shrink-0 self-start rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {/* Bas : barre de progression sur TOUTE la largeur de la card. */}
            <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
              {pct !== null && (
                <div
                  className={cn('h-full rounded-full transition-all', tone.bar)}
                  style={{ width: `${pct}%` }}
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/*
 * État à vide du rail droit : la MÊME charpente (imputations, commentaire, dates,
 * action) mais inerte — pour que la carte ait déjà sa forme avant tout dépôt.
 */
export function EmptyImputation() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Émetteur : tout en haut (même charpente que le panneau actif). */}
      <div className="flex shrink-0 flex-col gap-1.5">
        <Label>Émetteur</Label>
        <Input disabled placeholder="Nom de l'émetteur (ex. Martin)" />
      </div>

      {/* Imputations : zone libre. */}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <Label>Imputations probables</Label>
        <p className="min-h-0 flex-1 text-xs text-muted-foreground">
          Déposez une facture pour l'imputer.
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled
          className="w-full shrink-0"
        >
          <ListPlus className="size-4" />
          Choisir les imputations
        </Button>
      </div>

      {/* Bas épinglé : commentaire, dates, tampon. */}
      <div className="flex shrink-0 flex-col gap-4">
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

        <Button disabled className="w-full">
          <Stamp className="size-4" />
          Apposer le tampon & télécharger
        </Button>
      </div>
    </div>
  )
}

export function InvoicePanel({
  record,
  onPatch,
  immature = false,
  issuers = [],
}: {
  record: InvoiceRecord
  onPatch: (next: Partial<InvoiceRecord>) => void
  immature?: boolean
  issuers?: Issuer[]
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [stamping, setStamping] = useState(false)
  const [stampError, setStampError] = useState<string | null>(null)
  const [learnWarning, setLearnWarning] = useState(false)
  const [remember, setRemember] = useState(true)
  const [undoing, setUndoing] = useState(false)
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
    setLearnWarning(false)
    try {
      const { stampAndDownload } = await import('#/lib/facturation/stamp.ts')
      await stampAndDownload(
        record.file,
        stampDataOf(record),
        record.fileName,
        record.position,
      )
      // Apprentissage au tamponnage (vérité terrain = record.codes après édition
      // humaine), une seule fois, ET seulement si l'utilisateur choisit de mémoriser
      // (garde-fou contre une mauvaise imputation qui polluerait durablement la base).
      // Best-effort : un échec RPC ne bloque pas le PDF déjà tamponné/téléchargé.
      if (remember && !record.learned && record.codes.length > 0) {
        const deltas = countTokens(record.text)
        const learnSupplier = canLearn(record.supplierName)
        if (learnSupplier)
          addStrong(deltas, tokenize(record.supplierName), SUPPLIER_WEIGHT)
        try {
          await learnClouds(record.codes, deltas)
          onPatch({ learned: true })
          // Patch optimiste du cache (mêmes deltas), sans refetch du modèle.
          // NOTE (D5) : le MÊME delta est appliqué à TOUS les codes retenus (miroir
          // fidèle de la RPC). Pour un article multi-imputé, cela gonfle identiquement
          // plusieurs codes et dilue leur discrimination future. Un affinage (répartir
          // le poids par code) toucherait aussi la RPC → différé, hors de ce lot.
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
          // Apprentissage best-effort : le PDF reste tamponné/téléchargé. On le
          // SIGNALE (rôle insuffisant, table absente, réseau) au lieu du silence,
          // pour que l'utilisateur sache que rien n'a été mémorisé.
          setLearnWarning(true)
        }
      }
    } catch (e) {
      setStampError(e instanceof Error ? e.message : 'Tampon impossible')
    } finally {
      setStamping(false)
    }
  }

  // Annuler l'apprentissage : reconstitue le MÊME delta qu'au tamponnage (D5) et le
  // rejoue en soustraction. Exact tant que la facture n'a pas été rééditée depuis.
  // Requiert les RPC de facturation_corrections.sql ; sinon l'appel échoue (signalé).
  async function handleUndoLearn() {
    setUndoing(true)
    setLearnWarning(false)
    try {
      const deltas = countTokens(record.text)
      const learnSupplier = canLearn(record.supplierName)
      if (learnSupplier)
        addStrong(deltas, tokenize(record.supplierName), SUPPLIER_WEIGHT)
      await unlearnClouds(record.codes, deltas)
      if (learnSupplier)
        await unlearnIssuer(normalize(record.supplierName).trim())
      onPatch({ learned: false })
      // Le serveur fait foi après correction : on resynchronise le cache.
      queryClient.invalidateQueries({ queryKey: ['facturation', 'clouds'] })
      queryClient.invalidateQueries({ queryKey: ['facturation', 'issuers'] })
    } catch {
      setLearnWarning(true)
    } finally {
      setUndoing(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Émetteur : tout en haut, combobox des émetteurs connus (saisie libre). */}
      <div className="flex shrink-0 flex-col gap-1.5">
        <Label>Émetteur</Label>
        <IssuerCombobox
          value={record.supplierName}
          onChange={(v) => onPatch({ supplierName: v, userEdited: true })}
          issuers={issuers}
          placeholder="Nom de l'émetteur (ex. Martin)"
        />
      </div>

      {/* Imputations : zone LIBRE qui prend le max de place et défile si besoin. */}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <Label>Imputations probables</Label>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ImputationList
            codes={record.codes}
            detection={record.detection}
            immature={immature}
            onRemove={(code) =>
              onPatch({
                codes: record.codes.filter((c) => c !== code),
                userEdited: true,
              })
            }
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPickerOpen(true)}
          className="w-full shrink-0"
        >
          <ListPlus className="size-4" />
          Choisir les imputations
        </Button>
      </div>

      {/* Bas ÉPINGLÉ : commentaire (taille figée), dates, tampon. */}
      <div className="flex shrink-0 flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Commentaire</Label>
          <Textarea
            value={record.comment}
            onChange={(e) => onPatch({ comment: e.target.value })}
            placeholder="Note libre apposée sur le tampon"
            rows={2}
            className="resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Date de facture</Label>
            <Input
              type="date"
              value={record.invoiceDate}
              onChange={(e) =>
                onPatch({ invoiceDate: e.target.value, userEdited: true })
              }
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

        {stampError && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            {stampError}
          </div>
        )}

        {learnWarning && (
          <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <AlertTriangle className="size-3.5 shrink-0" />
            Tampon appliqué, mais l'imputation n'a pas pu être mémorisée (droits
            ou base indisponibles).
          </div>
        )}

        {/* Confirmation d'apprentissage : on voit ce qui partira en base, et on peut
            refuser (une mauvaise imputation ne doit pas polluer la base). */}
        {!record.learned && (
          <label className="flex cursor-pointer items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="mt-0.5 size-3.5 shrink-0 accent-primary"
            />
            <span>
              Mémoriser cette imputation.
              {remember && record.codes.length > 0 && (
                <>
                  {' '}
                  Sera appris :{' '}
                  <span className="text-foreground">
                    {record.supplierName.trim() || 'émetteur non renseigné'}
                  </span>{' '}
                  →{' '}
                  <span className="text-foreground">
                    {record.codes.map((c) => budgetLabel(c)).join(', ')}
                  </span>
                  .
                </>
              )}
            </span>
          </label>
        )}

        {/* Déjà appris → annuler l'apprentissage (désapprentissage) en cas d'erreur. */}
        {record.learned && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleUndoLearn}
            disabled={undoing}
            className="w-full"
          >
            {undoing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RotateCcw className="size-4" />
            )}
            Annuler l'apprentissage
          </Button>
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
      </div>

      <CodePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selected={record.codes}
        onChange={(codes) => onPatch({ codes, userEdited: true })}
        detection={record.detection}
        immature={immature}
      />
    </div>
  )
}
