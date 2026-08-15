import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Ban,
  Eraser,
  ListPlus,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  Stamp,
  X,
} from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
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
import {
  budgetLabel,
  compteLabel,
  comptesForCode,
  missingComptes,
} from '#/lib/facturation/budgetRegistry.ts'
import { formatSection } from '#/lib/facturation/imputationFormat.ts'
import { plausibleFamilies } from '#/lib/facturation/issuerFamilies.ts'
import { canLearn } from '#/lib/facturation/detect.ts'
import { issuerKey } from '#/lib/facturation/text.ts'
import {
  deleteLearnedDoc,
  learnInvoiceDocument,
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
import {
  issuerCandidates,
  type IssuerMemory,
} from '#/lib/facturation/issuerMemory.ts'
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
  comptes,
  onCompteChange,
  detection,
  immature,
  onRemove,
  onBan,
  banningCode,
}: {
  codes: string[]
  /** Compte choisi par code (code → compte) ; affiché et modifiable si le code a plusieurs comptes. */
  comptes: Record<string, string>
  onCompteChange: (code: string, compte: string) => void
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
        const comptesList = comptesForCode(code)
        return (
          <div
            key={code}
            className="flex flex-col gap-2 rounded-md border border-border bg-secondary/40 px-2.5 py-2"
          >
            {/* Haut : description + code (et compte) à gauche, le % à droite, retrait au bout. */}
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
                {/* Compte du couple : Select si plusieurs comptes, sinon le compte affiché.
                    Affiché par son NOM humain (dictionnaire) ; le numéro reste pour le tampon. */}
                {comptesList.length > 1 ? (
                  <Select
                    value={comptes[code] ?? ''}
                    onValueChange={(v) => onCompteChange(code, v)}
                  >
                    <SelectTrigger
                      size="sm"
                      className="mt-0.5 h-7 w-full text-xs"
                    >
                      <SelectValue placeholder="Choisir un compte" />
                    </SelectTrigger>
                    <SelectContent>
                      {comptesList.map((c) => (
                        <SelectItem key={c} value={c}>
                          {compteLabel(c)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : comptesList.length === 1 ? (
                  <span className="text-[11px] text-muted-foreground/70">
                    {compteLabel(comptes[code] || comptesList[0])}
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground/50 italic">
                    pas de compte
                  </span>
                )}
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

      {/* CARD 2 — Commentaire, tampon. */}
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
  issuerMemory = { perIssuer: {} },
  anomalyCount = 0,
}: {
  record: InvoiceRecord
  onPatch: (next: Partial<InvoiceRecord>) => void
  immature?: boolean
  issuers?: Issuer[]
  /** Mémoire émetteur -> (code, compte) : alimente les candidats proposés en tête. */
  issuerMemory?: IssuerMemory
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

  // Tamponnable seulement si au moins un code EST retenu ET aucun code multi-comptes n'a
  // été laissé sans compte (garde-fou : le tampon ne part jamais avec un compte manquant).
  const canStamp =
    record.codes.length > 0 &&
    missingComptes(record.codes, record.comptes).length === 0

  // Candidats appris pour l'émetteur courant : couples (code, compte) déjà utilisés, du plus
  // fréquent au moins fréquent. Proposition cliquable en tête, jamais une auto-validation.
  const currentIssuerKey = issuerKey(record.supplierName, record.siren)
  const candidates = issuerCandidates(issuerMemory, currentIssuerKey)

  // Guidage directionnel : familles vers lesquelles pencher pour cet émetteur (informatif,
  // vide au démarrage à froid). Le côté « improbable » se voit dans le picker + la notice.
  const steerFamilies =
    record.detection?.familyReady && record.detection.familyPrior
      ? plausibleFamilies(record.detection.familyPrior, true)
      : []

  // Ajoute un couple candidat à l'imputation, sans doublonner un code déjà présent.
  function addCandidate(code: string, compte: string) {
    if (record.codes.includes(code)) return
    onPatch({
      codes: [...record.codes, code],
      comptes: { ...record.comptes, [code]: compte },
      userEdited: true,
    })
  }

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
        record.hash &&
        !journalHasHash(record.hash)
      ) {
        // INSTANTANÉ figé ICI : le désapprentissage retirera EXACTEMENT ces codes/émetteur,
        // même si l'utilisateur ré-édite ensuite l'imputation (compteurs partagés → symétrie).
        // Le nom d'émetteur n'entre PAS dans les nuages : son signal vit dans le modèle
        // séparé émetteur→codes, ce qui garde les nuages propres.
        const learnedCodes = [...record.codes]
        const deltas = countTokens(record.text)
        const learnSupplier = canLearn(record.supplierName, record.siren)
        const name = learnSupplier ? issuerKey(record.supplierName, record.siren) : ''
        const display = learnSupplier ? record.supplierName.trim() : ''
        try {
          // UNE seule RPC transactionnelle et IDEMPOTENTE (A1) : journal + incréments
          // nuages/émetteur gagnés ENSEMBLE, gardés par le hash. Un rejeu ou deux
          // onglets ne comptent qu'une fois (fin de l'inflation permanente des poids).
          // Renvoie false si le hash était déjà présent (doublon) → aucun incrément.
          const learned = await learnInvoiceDocument({
            hash: record.hash,
            issuer: name,
            display,
            codes: learnedCodes,
            deltas,
            comptes: { ...record.comptes }, // compte choisi par code, figé au tampon
            method: record.method ?? 'native',
          })
          if (learned) {
            const learnedIssuer = name || null
            // Patchs optimistes des caches (mêmes deltas), sans refetch — appliqués
            // UNIQUEMENT si l'apprentissage a réellement eu lieu (sinon on gonflerait
            // l'affichage pour un doublon).
            // NOTE (D5) : le MÊME delta est appliqué à TOUS les codes retenus (miroir
            // fidèle de la RPC). Un article multi-imputé gonfle identiquement plusieurs
            // codes ; un affinage (poids par code) toucherait aussi la RPC → différé.
            queryClient.setQueryData<WordPool>(['facturation', 'clouds'], (old) =>
              mergePools(old ?? { perCode: {} }, {
                perCode: Object.fromEntries(learnedCodes.map((c) => [c, deltas])),
              }),
            )
            if (learnSupplier) {
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
              queryClient.setQueryData<IssuerCodes>(
                ['facturation', 'issuerCodes'],
                (old) =>
                  mergeIssuerCodes(old ?? { perIssuer: {} }, {
                    perIssuer: {
                      [name]: Object.fromEntries(learnedCodes.map((c) => [c, 1])),
                    },
                  }),
              )
            }
            onPatch({ learned: true, learnedCodes, learnedIssuer })
            const entry: JournalEntry = {
              hash: record.hash,
              issuerKey: learnedIssuer,
              codes: learnedCodes,
              comptes: { ...record.comptes },
              deltas,
              method: record.method ?? 'native',
              learnedAt: record.processedDate,
            }
            queryClient.setQueryData<{ entries: JournalEntry[] }>(
              ['facturation', 'journal'],
              (old) => ({ entries: [...(old?.entries ?? []), entry] }),
            )
          }
        } catch {
          // Échec RPC (rôle, table, réseau) → rien appris, learned reste false (pas
          // d'undo asymétrique). On SIGNALE au lieu du silence.
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
          : canLearn(record.supplierName, record.siren)
            ? issuerKey(record.supplierName, record.siren)
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
    const issuerName = canLearn(record.supplierName, record.siren)
      ? issuerKey(record.supplierName, record.siren)
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
  const canBan = canLearn(record.supplierName, record.siren)
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
      await banIssuerCode(issuerKey(record.supplierName, record.siren), code)
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
                siren={record.siren}
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
          {/* Résumé directionnel : « Plutôt : … » pour un émetteur assez connu. Orientation
              douce, informative ; rien au démarrage à froid (émetteur inconnu/peu vu). */}
          {steerFamilies.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Plutôt&nbsp;:{' '}
              <span className="text-foreground">
                {steerFamilies.slice(0, 3).map(formatSection).join(', ')}
              </span>
            </p>
          )}
        </div>

        {/* Candidats appris pour l'émetteur : couples déjà utilisés, cliquables. Simple
            proposition (jamais validée d'office) ; masquée sans émetteur ou sans historique. */}
        {currentIssuerKey && candidates.length > 0 && (
          <div className="flex shrink-0 flex-col gap-1.5">
            <Label>Déjà utilisé pour cet émetteur</Label>
            <div className="flex flex-wrap gap-1.5">
              {candidates.map(({ code, compte }) => {
                const already = record.codes.includes(code)
                return (
                  <button
                    key={`${code}|${compte}`}
                    type="button"
                    disabled={already}
                    onClick={() => addCandidate(code, compte)}
                    title={
                      already
                        ? 'Déjà dans les imputations'
                        : `Ajouter ${budgetLabel(code)} — ${compteLabel(compte)}`
                    }
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-left text-xs transition-colors',
                      already
                        ? 'cursor-default border-border bg-secondary/40 text-muted-foreground/60'
                        : 'border-border bg-secondary/60 text-foreground hover:border-primary/60 hover:bg-secondary',
                    )}
                  >
                    {!already && (
                      <Plus className="size-3 shrink-0 text-muted-foreground" />
                    )}
                    <span className="max-w-[10rem] truncate">
                      {budgetLabel(code)}
                    </span>
                    <span className="max-w-[10rem] truncate text-[10px] text-muted-foreground">
                      {compteLabel(compte)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Imputations : zone LIBRE qui prend le max de place et défile si besoin. */}
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <Label>Imputations probables</Label>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ImputationList
              codes={record.codes}
              comptes={record.comptes}
              onCompteChange={(code, compte) =>
                onPatch({
                  comptes: { ...record.comptes, [code]: compte },
                  userEdited: true,
                })
              }
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

      {/* CARD 2 — Commentaire, avertissements & tampon. */}
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
        comptes={record.comptes}
        onChange={(codes, comptes) =>
          onPatch({ codes, comptes, userEdited: true })
        }
        detection={record.detection}
        immature={immature}
        issuer={issuerKey(record.supplierName, record.siren)}
      />

      <BudgetLinesManager open={managerOpen} onOpenChange={setManagerOpen} />

      <RevueDialog
        open={revueOpen}
        onOpenChange={setRevueOpen}
        issuerKey={issuerKey(record.supplierName, record.siren)}
        issuerLabel={record.supplierName.trim()}
      />
      {confirmDialog}
    </div>
  )
}
