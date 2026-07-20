import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Ban,
  Eraser,
  ListPlus,
  Loader2,
  Pencil,
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
import { BudgetLinesManager } from '#/components/facturation/BudgetLinesManager.tsx'
import { IssuerCombobox } from '#/components/facturation/IssuerCombobox.tsx'
import { RevueDialog } from '#/components/facturation/FacturationRevue.tsx'
import { useFacturationCuration } from '#/components/facturation/useFacturationCuration.ts'
import {
  confidenceTone,
  needsReview,
  probaFor,
} from '#/components/facturation/confidence.ts'
import { budgetLabel } from '#/lib/facturation/budgetRegistry.ts'
import { canLearn } from '#/lib/facturation/detect.ts'
import { issuerKey } from '#/lib/facturation/text.ts'
import {
  deleteLearnedDoc,
  learnClouds,
  learnIssuer,
  learnIssuerCodes,
  recordLearnedDoc,
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
import type { InvoiceRecord, JournalEntry } from '#/lib/facturation/types.ts'
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
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* CARD 1 — Émetteur + imputations probables. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-xl border border-border bg-card p-3">
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
          <div className="flex shrink-0 items-stretch">
            <Button
              variant="outline"
              disabled
              className="min-w-0 flex-1 justify-start rounded-r-none"
            >
              <ListPlus className="size-4" />
              Choisir une imputation
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled
              aria-label="Gérer les imputations"
              className="-ml-px shrink-0 rounded-l-none"
            >
              <Pencil className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* CARD 2 — Commentaire, date de traitement, tampon. */}
      <div className="flex shrink-0 flex-col gap-3 rounded-xl border border-border bg-card p-3">
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
  const [managerOpen, setManagerOpen] = useState(false)
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

  // Présence LIVE d'un hash au journal (cache Query), à l'instant T — plus fiable que le flag
  // `record.duplicate` figé au dépôt : couvre le cas de deux dépôts du même PDF dans la séance
  // (le 2e voit l'entrée écrite par le tampon du 1er).
  const journalHasHash = (h?: string): boolean =>
    !!h &&
    (
      queryClient.getQueryData<{ entries: JournalEntry[] }>([
        'facturation',
        'journal',
      ])?.entries ?? []
    ).some((e) => e.hash === h)

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
      // Garde anti-DOUBLON (D4) : un PDF déjà appris (présent au journal) ne réapprend PAS —
      // le tampon + téléchargement se font quand même, mais sans ré-incrémenter les nuages.
      // On teste la présence LIVE au journal (pas le flag figé au dépôt) pour couvrir deux
      // dépôts du même PDF dans la séance : le 2e voit l'entrée écrite par le 1er.
      if (
        !record.learned &&
        record.codes.length > 0 &&
        !journalHasHash(record.hash)
      ) {
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
          // JOURNAL : trace persistante de CE document (hash → instantané figé). Permet la
          // détection de doublon et le désapprentissage EXACT sans re-déposer le PDF.
          // Best-effort : un échec (table absente, droits) ne bloque pas le PDF déjà tamponné.
          if (record.hash) {
            const entry: JournalEntry = {
              hash: record.hash,
              issuerKey: learnedIssuer,
              codes: learnedCodes,
              deltas,
              method: record.method ?? 'native',
              learnedAt: record.processedDate,
            }
            try {
              await recordLearnedDoc(entry)
              queryClient.setQueryData<{ entries: JournalEntry[] }>(
                ['facturation', 'journal'],
                (old) => ({ entries: [...(old?.entries ?? []), entry] }),
              )
            } catch {
              // Journal non écrit (best-effort) ; l'apprentissage reste fait.
            }
          }
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
      // Si cette facture (journalisée) a DÉJÀ été désapprise ailleurs (modal « Factures
      // apprises » → forgetLearnedDoc) → son hash a disparu du journal : les compteurs sont
      // déjà décrémentés. On ne re-décrémente PAS (sinon on éroderait d'autres factures) : on
      // se contente de refermer l'état local.
      if (record.hash && !journalHasHash(record.hash)) {
        onPatch({
          learned: false,
          learnedCodes: undefined,
          learnedIssuer: null,
        })
        return
      }
      const codes = record.learnedCodes ?? record.codes
      const issuerName =
        record.learnedIssuer !== undefined
          ? record.learnedIssuer
          : canLearn(record.supplierName)
            ? issuerKey(record.supplierName)
            : null
      await unlearnInvoiceCore(codes, issuerName)
      // Retirer l'entrée du journal SANS rejeu (le décrément vient d'être fait ci-dessus) —
      // sinon un désapprentissage par hash ultérieur re-soustrairait. Best-effort.
      if (record.hash) {
        try {
          await deleteLearnedDoc(record.hash)
          queryClient.setQueryData<{ entries: JournalEntry[] }>(
            ['facturation', 'journal'],
            (old) => ({
              entries: (old?.entries ?? []).filter(
                (e) => e.hash !== record.hash,
              ),
            }),
          )
        } catch {
          // Entrée non retirée (best-effort) ; resync à la prochaine lecture.
        }
      }
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
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* CARD 1 — Émetteur + imputations probables. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-xl border border-border bg-card p-3">
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
          {/* Sélection + gestion, en input group (même charpente que l'émetteur) : « Choisir une
            imputation » (ouvre le sélecteur) + bouton engrenage/crayon accolé (gérer le référentiel). */}
          <div className="flex shrink-0 items-stretch">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPickerOpen(true)}
              className="min-w-0 flex-1 justify-start rounded-r-none"
            >
              <ListPlus className="size-4" />
              Choisir une imputation
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setManagerOpen(true)}
              aria-label="Gérer les imputations"
              title="Gérer les imputations"
              className="-ml-px shrink-0 rounded-l-none"
            >
              <Pencil className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* CARD 2 — Commentaire, date de traitement, avertissements & tampon. */}
      <div className="flex shrink-0 flex-col gap-3 rounded-xl border border-border bg-card p-3">
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

        {/* Doublon : ce PDF a déjà été appris (présent au journal). Non bloquant — on peut
            re-tamponner pour ré-obtenir le PDF, mais l'apprentissage sera SAUTÉ (anti double
            comptage, cf. handleStamp). */}
        {record.duplicate && !record.learned && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            Facture déjà apprise. La re-tamponner télécharge le PDF mais ne
            réapprend pas (évite le double comptage).
          </p>
        )}

        {/* Avertissements AVANT le tampon : rendre visible que « tamponner = apprendre » et
            signaler quand l'apprentissage sera partiel ou bruité (facteur humain). */}
        {!record.learned && canStamp && !record.duplicate && (
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
            OPT-IN, masquée par défaut. REPLI seulement pour une facture apprise AVANT le journal
            (sans entrée = non `duplicate`) : une facture journalisée se désapprend exactement
            depuis « Contrôle des imputations → Factures apprises ». On règle l'émetteur + les
            codes fautifs, puis on désapprend, sans re-tamponner. */}
        {!record.learned &&
          canStamp &&
          !record.duplicate &&
          (replayDone ? (
            <p className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <RotateCcw className="size-3.5 shrink-0" />
              Imputation désapprise pour cet émetteur.
            </p>
          ) : !showReplay ? (
            <button
              type="button"
              onClick={() => setShowReplay(true)}
              className="self-center text-center text-[10px] leading-tight text-wrap whitespace-normal text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Corriger une facture déjà tamponnée&nbsp;?
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

      <BudgetLinesManager open={managerOpen} onOpenChange={setManagerOpen} />

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
