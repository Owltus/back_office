import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Ban,
  Eraser,
  ListPlus,
  Loader2,
  RotateCcw,
  Settings2,
  Stamp,
  X,
} from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import { useConfirm } from '#/components/shared/ConfirmDialog.tsx'
import { CodePicker } from '#/components/facturation/CodePicker.tsx'
import { IssuerCombobox } from '#/components/facturation/IssuerCombobox.tsx'
import { RevueDialog } from '#/components/facturation/FacturationRevue.tsx'
import { useFacturationCuration } from '#/components/facturation/useFacturationCuration.ts'
import {
  confidenceTone,
  needsReview,
  probaFor,
  sourceFor,
} from '#/components/facturation/confidence.ts'
import { budgetLabel } from '#/lib/facturation/constants.ts'
import { canLearn } from '#/lib/facturation/detect.ts'
import { issuerKey } from '#/lib/facturation/text.ts'
import {
  learnClouds,
  learnIssuer,
  learnIssuerCodes,
  unlearnClouds,
  unlearnIssuer,
  unlearnIssuerCodes,
} from '#/lib/facturation/cloudService.ts'
import {
  mergeIssuerCodes,
  type IssuerCodes,
} from '#/lib/facturation/issuerCodes.ts'
import {
  countTokens,
  mergePools,
  type WordPool,
} from '#/lib/facturation/wordpool.ts'
import { type Issuer } from '#/lib/facturation/issuers.ts'
import { stampDataOf } from '#/lib/facturation/stampLayout.ts'
import type { InvoiceRecord } from '#/lib/facturation/types.ts'
import { cn } from '#/lib/utils.ts'

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
  onBan,
  banningCode,
}: {
  codes: string[]
  detection: InvoiceRecord['detection']
  immature: boolean
  onRemove: (code: string) => void
  /** Bannir ce code pour l'émetteur (denylist) — absent si aucun émetteur nommé. */
  onBan?: (code: string) => void
  banningCode?: string | null
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
        const viaIssuer = sourceFor(code, detection) === 'issuer'
        const review = needsReview(detection)
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
                <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                  {code}
                  {viaIssuer && (
                    <span className="rounded bg-primary/10 px-1 font-sans text-[10px] text-primary">
                      via émetteur
                    </span>
                  )}
                  {review && (
                    <span className="rounded bg-amber-500/10 px-1 font-sans text-[10px] text-amber-600">
                      à vérifier
                    </span>
                  )}
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

              <div className="flex shrink-0 flex-col items-center gap-0.5 self-start">
                <button
                  type="button"
                  onClick={() => onRemove(code)}
                  aria-label={`Retirer ${code}`}
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
                {onBan && (
                  <button
                    type="button"
                    onClick={() => onBan(code)}
                    disabled={banningCode === code}
                    aria-label={`Ne plus jamais imputer cet émetteur sur ${code}`}
                    title="Ne plus jamais imputer cet émetteur sur ce code (interdiction)"
                    className="rounded p-0.5 text-destructive/50 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    {banningCode === code ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Ban className="size-3.5" />
                    )}
                  </button>
                )}
              </div>
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
      {/* Émetteur : tout en haut (même charpente que le panneau actif : input group). */}
      <div className="flex shrink-0 flex-col gap-1.5">
        <Label>Émetteur</Label>
        <div className="flex items-stretch">
          <Input
            disabled
            placeholder="Nom de l'émetteur (ex. Martin)"
            className="rounded-r-none"
          />
          <Button
            variant="outline"
            size="icon"
            disabled
            aria-label="Contrôle des imputations"
            className="-ml-px shrink-0 rounded-l-none"
          >
            <Settings2 className="size-4" />
          </Button>
        </div>
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

        <div className="flex flex-col gap-1.5">
          <Label>Date de traitement</Label>
          <Input type="date" disabled />
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
  anomalyCount = 0,
}: {
  record: InvoiceRecord
  onPatch: (next: Partial<InvoiceRecord>) => void
  immature?: boolean
  issuers?: Issuer[]
  anomalyCount?: number
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [revueOpen, setRevueOpen] = useState(false)
  const [stamping, setStamping] = useState(false)
  const [stampError, setStampError] = useState<string | null>(null)
  const [learnWarning, setLearnWarning] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const [banningCode, setBanningCode] = useState<string | null>(null)
  const [banWarning, setBanWarning] = useState(false)
  const [replayUndoing, setReplayUndoing] = useState(false)
  const [replayDone, setReplayDone] = useState(false)
  const [showReplay, setShowReplay] = useState(false)
  const queryClient = useQueryClient()
  const { banIssuerCode } = useFacturationCuration()
  const { confirm, confirmDialog } = useConfirm()

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
      // PDF tamponné + téléchargé → marqueur « validé » (même si « mémoriser » décoché).
      onPatch({ stamped: true })
      // Apprentissage au tamponnage (vérité terrain = record.codes après édition
      // humaine), une seule fois. Réversible via « Annuler l'apprentissage ».
      // Best-effort : un échec RPC ne bloque pas le PDF déjà tamponné/téléchargé.
      if (!record.learned && record.codes.length > 0) {
        // Le pull de mots appris = UNIQUEMENT le contenu de la facture. Le nom d'émetteur
        // n'est PLUS injecté dans les nuages : son signal vit dans le modèle séparé
        // émetteur→codes (learnIssuerCodes ci-dessous), ce qui garde les nuages propres.
        // INSTANTANÉ figé ICI : le désapprentissage retirera EXACTEMENT ces codes/émetteur,
        // même si l'utilisateur ré-édite ensuite l'imputation (compteurs partagés → symétrie).
        const learnedCodes = [...record.codes]
        const deltas = countTokens(record.text)
        const learnSupplier = canLearn(record.supplierName)
        let learnedIssuer: string | null = null
        try {
          await learnClouds(learnedCodes, deltas)
          // Patch optimiste du cache (mêmes deltas), sans refetch du modèle.
          // NOTE (D5) : le MÊME delta est appliqué à TOUS les codes retenus (miroir
          // fidèle de la RPC). Pour un article multi-imputé, cela gonfle identiquement
          // plusieurs codes et dilue leur discrimination future. Un affinage (répartir
          // le poids par code) toucherait aussi la RPC → différé, hors de ce lot.
          queryClient.setQueryData<WordPool>(['facturation', 'clouds'], (old) =>
            mergePools(old ?? { perCode: {} }, {
              perCode: Object.fromEntries(learnedCodes.map((c) => [c, deltas])),
            }),
          )
          // Apprentissage de l'émetteur, ISOLÉ : un échec ici ne doit pas invalider les
          // nuages déjà appris (sinon l'instantané ne refléterait pas la réalité).
          if (learnSupplier) {
            try {
              const name = issuerKey(record.supplierName)
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
              // Co-occurrence émetteur → codes (le « filtre fort » : +1 par code validé).
              await learnIssuerCodes(name, learnedCodes)
              queryClient.setQueryData<IssuerCodes>(
                ['facturation', 'issuerCodes'],
                (old) =>
                  mergeIssuerCodes(old ?? { perIssuer: {} }, {
                    perIssuer: {
                      [name]: Object.fromEntries(
                        learnedCodes.map((c) => [c, 1]),
                      ),
                    },
                  }),
              )
              learnedIssuer = name // n'est figé QUE si l'émetteur a bien été mémorisé
            } catch {
              setLearnWarning(true) // émetteur non mémorisé, mais les nuages, si
            }
          }
          // learned + INSTANTANÉ posés en DERNIER, une fois l'apprentissage réel connu :
          // un échec émetteur laisse learnedIssuer=null → l'undo ne touchera pas l'émetteur.
          onPatch({ learned: true, learnedCodes, learnedIssuer })
        } catch {
          // Même les nuages ont échoué → rien appris, learned reste false (pas d'undo
          // asymétrique). On SIGNALE (rôle, table, réseau) au lieu du silence.
          setLearnWarning(true)
        }
      }
    } catch (e) {
      setStampError(e instanceof Error ? e.message : 'Tampon impossible')
    } finally {
      setStamping(false)
    }
  }

  // Cœur du désapprentissage : retire EXACTEMENT `codes` (+ `issuerName` s'il est fourni)
  // du modèle, en rejouant en soustraction le même delta que le texte a produit à l'apprentissage
  // (borné à 0 côté RPC). Le texte est stable → deltas identiques ; les CODES et l'ÉMETTEUR sont
  // passés explicitement (instantané d'apprentissage), jamais l'état courant éventuellement
  // réédité. Requiert les RPC de facturation_corrections.sql ; sinon l'appel échoue (propagé).
  async function unlearnInvoiceCore(
    codes: string[],
    issuerName: string | null,
  ) {
    const deltas = countTokens(record.text)
    await unlearnClouds(codes, deltas)
    if (issuerName) {
      await unlearnIssuer(issuerName)
      await unlearnIssuerCodes(issuerName, codes)
    }
    // Le serveur fait foi après correction : on resynchronise le cache.
    queryClient.invalidateQueries({ queryKey: ['facturation', 'clouds'] })
    queryClient.invalidateQueries({ queryKey: ['facturation', 'issuers'] })
    queryClient.invalidateQueries({ queryKey: ['facturation', 'issuerCodes'] })
  }

  // Annuler l'apprentissage d'une facture apprise DANS LA SÉANCE (juste tamponnée) : on rejoue
  // l'INSTANTANÉ figé au tamponnage (learnedCodes/learnedIssuer), pas l'état courant — sinon une
  // édition depuis le tampon ferait décrémenter des codes/émetteurs jamais appris (compteurs
  // partagés). Repli sur l'état courant pour d'anciennes factures sans instantané.
  async function handleUndoLearn() {
    setUndoing(true)
    setLearnWarning(false)
    try {
      const codes = record.learnedCodes ?? record.codes
      const issuerName =
        record.learnedIssuer !== undefined
          ? record.learnedIssuer
          : canLearn(record.supplierName)
            ? issuerKey(record.supplierName)
            : null
      await unlearnInvoiceCore(codes, issuerName)
      onPatch({ learned: false, learnedCodes: undefined, learnedIssuer: null })
    } catch {
      setLearnWarning(true)
    } finally {
      setUndoing(false)
    }
  }

  // Désapprendre une facture REJOUÉE : re-déposée exprès pour effacer une erreur passée. Ici il
  // n'existe PAS d'instantané (facture fraîche, non apprise) → on retire ce que l'état COURANT
  // aurait appris. ⚠ Cela décrémente des compteurs PARTAGÉS : l'utilisateur doit régler l'émetteur
  // et les codes EXACTEMENT comme lors du tamponnage fautif (sinon il érode un autre apprentissage).
  async function handleReplayUnlearn() {
    const issuerName = canLearn(record.supplierName)
      ? issuerKey(record.supplierName)
      : null
    // Récap + confirmation : on décrémente des compteurs PARTAGÉS d'après l'état COURANT.
    // L'utilisateur doit vérifier que codes + émetteur reproduisent le tampon fautif.
    const ok = await confirm({
      title: 'Désapprendre cette facture ?',
      description: (
        <>
          Retire du modèle ce que cette facture apprendrait pour{' '}
          <b>{record.codes.map((c) => budgetLabel(c)).join(', ')}</b>
          {issuerName ? (
            <>
              {' '}
              (émetteur <b>{record.supplierName.trim()}</b>)
            </>
          ) : null}
          . Vérifiez que l'émetteur et les codes reproduisent EXACTEMENT le
          tampon fautif — sinon vous effacez un autre apprentissage.
        </>
      ),
      confirmLabel: 'Désapprendre',
      destructive: true,
    })
    if (!ok) return
    setReplayUndoing(true)
    setLearnWarning(false)
    setReplayDone(false)
    try {
      await unlearnInvoiceCore(record.codes, issuerName)
      setReplayDone(true)
    } catch {
      setLearnWarning(true)
    } finally {
      setReplayUndoing(false)
    }
  }

  // Bannir un couple émetteur↔code depuis l'atelier : « ne plus JAMAIS imputer cet émetteur
  // sur ce code » (denylist). Nécessite un émetteur nommé (assez long pour servir de clé).
  // Retire aussi le code de la facture courante. Best-effort (droits, table absente).
  const canBan = canLearn(record.supplierName)
  async function handleBan(code: string) {
    if (!canBan) return
    // Confirmation : geste IRRÉVERSIBLE facile à confondre avec un simple retrait.
    const ok = await confirm({
      title: 'Bannir cet émetteur sur ce code ?',
      description: (
        <>
          Ne plus JAMAIS imputer{' '}
          <b>{record.supplierName.trim() || 'cet émetteur'}</b> sur{' '}
          <b>{budgetLabel(code)}</b>. Interdiction permanente ; « Lever
          l'interdiction » (dans Contrôle des imputations) ne restaure pas
          l'historique appris.
        </>
      ),
      confirmLabel: 'Bannir',
      destructive: true,
    })
    if (!ok) return
    setBanningCode(code)
    setBanWarning(false)
    try {
      await banIssuerCode(issuerKey(record.supplierName), code)
      onPatch({
        codes: record.codes.filter((c) => c !== code),
        userEdited: true,
      })
    } catch {
      setBanWarning(true)
    } finally {
      setBanningCode(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Émetteur : combobox des émetteurs connus + bouton engrenage (revue / curation)
          en input group. La pastille ambre signale des anomalies à examiner. */}
      <div className="flex shrink-0 flex-col gap-1.5">
        <Label>Émetteur</Label>
        <div className="flex items-stretch">
          <div className="min-w-0 flex-1">
            <IssuerCombobox
              value={record.supplierName}
              onChange={(v) => onPatch({ supplierName: v, userEdited: true })}
              issuers={issuers}
              placeholder="Nom de l'émetteur (ex. Martin)"
              inputClassName="rounded-r-none"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setRevueOpen(true)}
            aria-label="Contrôle des imputations"
            title={
              anomalyCount > 0
                ? `${anomalyCount} anomalie${anomalyCount > 1 ? 's' : ''} à examiner`
                : 'Contrôle des imputations'
            }
            className={cn(
              '-ml-px shrink-0 rounded-l-none',
              // Anomalie(s) en attente → bouton orange pour attirer l'œil.
              anomalyCount > 0 &&
                'border-amber-500 text-amber-600 hover:bg-amber-500/10 hover:text-amber-600',
            )}
          >
            <Settings2 className="size-4" />
          </Button>
        </div>
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
            onBan={canBan ? handleBan : undefined}
            banningCode={banningCode}
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

        <div className="flex flex-col gap-1.5">
          <Label>Date de traitement</Label>
          <Input
            type="date"
            value={record.processedDate}
            onChange={(e) => onPatch({ processedDate: e.target.value })}
          />
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

        {banWarning && (
          <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <AlertTriangle className="size-3.5 shrink-0" />
            Interdiction non enregistrée (droits ou base indisponibles).
          </div>
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

        {/* Avertissements AVANT le tampon : rendre visible que « tamponner = apprendre » et
            signaler quand l'apprentissage sera partiel ou bruité (facteur humain). */}
        {!record.learned && canStamp && (
          <div className="flex flex-col gap-1.5">
            {canBan ? (
              <p className="px-1 text-[11px] text-muted-foreground">
                En tamponnant, l'imputation sera mémorisée pour «{' '}
                {record.supplierName.trim()} ».
              </p>
            ) : (
              <p className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                Facture tamponnée, mais l'émetteur ne sera pas mémorisé (nom
                vide ou trop court) : le filtre émetteur ne progressera pas pour
                lui.
              </p>
            )}
            {record.codes.length > 1 && (
              <p className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                Les {record.codes.length} imputations apprendront le même
                vocabulaire (facture mixte) — retirez un code accessoire si son
                imputation n'est pas à mémoriser.
              </p>
            )}
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

        {/* Correction d'une erreur PASSÉE (facture DÉJÀ tamponnée puis RE-DÉPOSÉE) : action
            OPT-IN, masquée par défaut pour ne pas s'afficher sur une facture neuve à tamponner.
            On règle l'émetteur + les codes fautifs, puis on désapprend, sans re-tamponner. */}
        {!record.learned &&
          canStamp &&
          (replayDone ? (
            <p className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <RotateCcw className="size-3.5 shrink-0" />
              Imputation désapprise pour cet émetteur.
            </p>
          ) : !showReplay ? (
            <button
              type="button"
              onClick={() => setShowReplay(true)}
              className="self-center text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Cette facture corrige une erreur déjà tamponnée ?
            </button>
          ) : (
            <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground">
                Réglez l'émetteur et les codes{' '}
                <b>exactement comme le tampon fautif</b>, puis désapprenez.
                N'utilisez ceci que pour une facture <b>déjà tamponnée</b> par
                le passé.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowReplay(false)}
                  className="flex-1"
                >
                  Annuler
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReplayUnlearn}
                  disabled={replayUndoing}
                  className="flex-1 text-destructive hover:text-destructive"
                >
                  {replayUndoing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Eraser className="size-4" />
                  )}
                  Désapprendre
                </Button>
              </div>
            </div>
          ))}
      </div>

      <CodePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selected={record.codes}
        onChange={(codes) => onPatch({ codes, userEdited: true })}
        detection={record.detection}
        immature={immature}
      />

      <RevueDialog
        open={revueOpen}
        onOpenChange={setRevueOpen}
        issuerKey={issuerKey(record.supplierName)}
        issuerLabel={record.supplierName.trim()}
      />
      {confirmDialog}
    </div>
  )
}
