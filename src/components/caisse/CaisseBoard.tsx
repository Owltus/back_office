import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Lock,
  LockOpen,
  Minus,
  PenLine,
  Plus,
} from 'lucide-react'

import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { PrintButton } from '#/components/shared/PrintButton.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import { Label } from '#/components/ui/label.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { DatePickerButton } from '#/components/form/fields.tsx'
import { useAuth } from '#/components/auth/AuthContext.tsx'
import { cn } from '#/lib/utils.ts'
import { printCaisseSheet } from '#/lib/caisse/pdf.ts'
import {
  computeEcarts,
  emptyInput,
  expected,
  fundEcart,
  fundTotal,
  isBalanced,
} from '#/lib/caisse/calc.ts'
import {
  DENOMINATIONS,
  ECART_LABELS,
  EPSILON,
  FUND_TARGET,
  GRACE_HOURS,
  PAY_KEYS,
  SHIFT_LABELS,
  emptyCounts,
} from '#/lib/caisse/constants.ts'
import {
  canEditSheet,
  countersign,
  fetchPreviousSheet,
  fetchSheet,
  graceDeadline,
  reopenSheet,
  upsertSheet,
  validateSheet,
} from '#/lib/caisse/service.ts'
import { currentSlot, stepSlot } from '#/lib/caisse/shift.ts'
import {
  amountText,
  amountValue,
  countValue,
  sanitizeAmount,
} from '#/lib/caisse/input.ts'
import type {
  CaisseSheet,
  CaisseSheetInput,
  DenomKey,
  EcartKey,
  PayKey,
  Shift,
} from '#/lib/caisse/types.ts'

/* --------------------------------------------------------------------------
 * Caisse — feuille de caisse numérique (table caisse_sheets), persistée par
 * couple (date, shift). Confronte les montants attendus (StayNTouch + Lightspeed)
 * aux réels comptés, calcule les écarts en temps réel (cible 0 €), détaille le
 * fond de caisse (150 €), et gère la VALIDATION verrouillée : une feuille validée
 * n'est plus modifiable, sauf pendant la fenêtre de grâce (GRACE_HOURS) ou par un
 * admin. La RLS (supabase/caisse_sheets.sql) reste l'autorité ; l'UI la reflète.
 * ------------------------------------------------------------------------ */

const eur2 = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const eur0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const fmtEur = (n: number) => eur2.format(n) + ' €'
const fmtEurInt = (n: number) => eur0.format(n) + ' €'
const fmtEcart = (n: number) => (n >= 0 ? '+' : '') + eur2.format(n) + ' €'

const fmtTitle = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const fmtTime = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

function sheetToInput(s: CaisseSheet): CaisseSheetInput {
  return {
    reportDate: s.reportDate,
    shift: s.shift,
    operatorInitials: s.operatorInitials,
    snt: { ...s.snt },
    ls: { ...s.ls },
    caisse: { ...s.caisse },
    counts: { ...s.counts },
    fundOrigin: s.fundOrigin,
    comment: s.comment,
  }
}

/** Fusionne une saisie dans la feuille de base (pour un cache optimiste) :
 * conserve id / statut / validation / horodatage, remplace le contenu saisi. */
function inputToSheet(input: CaisseSheetInput, base: CaisseSheet | null): CaisseSheet {
  return {
    id: base?.id ?? '',
    reportDate: input.reportDate,
    shift: input.shift,
    operatorInitials: input.operatorInitials,
    snt: input.snt,
    ls: input.ls,
    caisse: input.caisse,
    counts: input.counts,
    fundOrigin: input.fundOrigin,
    comment: input.comment,
    status: base?.status ?? 'draft',
    validatedAt: base?.validatedAt ?? null,
    validatedBy: base?.validatedBy ?? null,
    countersignedBy: base?.countersignedBy ?? null,
    createdBy: base?.createdBy ?? '',
    createdAt: base?.createdAt ?? '',
    updatedAt: base?.updatedAt ?? '',
  }
}

export function CaisseBoard() {
  const { user, role } = useAuth()
  const queryClient = useQueryClient()

  // Slot initial (date + shift) déduit de l'heure : matin 08–15, soir 15–23,
  // nuit 23–07 (rattachée au jour où elle commence).
  const [selectedDate, setSelectedDate] = useState(() => currentSlot(new Date()).date)
  const [selectedShift, setSelectedShift] = useState<Shift>(
    () => currentSlot(new Date()).shift,
  )

  // Navigation shift par shift : matin → soir → nuit → matin du lendemain.
  const goStep = (delta: number) => {
    const s = stepSlot(selectedDate, selectedShift, delta)
    setSelectedDate(s.date)
    setSelectedShift(s.shift)
  }
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)
  const [hotelierName, setHotelierName] = useState('')

  const { data: sheet, isError: sheetError } = useQuery({
    queryKey: ['caisse', 'sheet', selectedDate, selectedShift],
    queryFn: () => fetchSheet(selectedDate, selectedShift),
  })

  // Fond de caisse à reporter : feuille précédente (uniquement si le couple
  // courant n'a pas encore de feuille — sinon on hydrate depuis la sienne).
  const { data: prevSheet, isLoading: prevLoading } = useQuery({
    queryKey: ['caisse', 'prev', selectedDate, selectedShift],
    queryFn: () => fetchPreviousSheet(selectedDate, selectedShift),
    enabled: sheet === null,
  })

  const [form, setForm] = useState<CaisseSheetInput>(() =>
    emptyInput(selectedDate, selectedShift, emptyCounts()),
  )
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  )

  const isValidated = sheet?.status === 'validated'
  // Prêt = feuille chargée ET, pour une nouvelle feuille, le report du fond de
  // caisse (feuille précédente) réglé — évite d'éditer avant hydratation. On
  // gate sur le CHARGEMENT (pas la donnée) : une requête « précédente » en échec
  // n'empêche pas la saisie (on repart alors d'un comptage vide).
  const ready = sheet !== undefined && !(sheet === null && prevLoading)
  const editable = ready && canEditSheet(sheet ?? null, role)
  const isAdmin = role === 'admin'
  const isWriter = role === 'super_utilisateur' || role === 'admin'
  const inGrace = isValidated && editable && !isAdmin
  const lockedForMe = isValidated && !editable
  const showWeb = form.shift === 'soir'

  const ecarts = useMemo(() => computeEcarts(form), [form])
  const total = fundTotal(form)
  const fEcart = fundEcart(form)
  const balanced = isBalanced(form)
  const deadline = graceDeadline(sheet ?? null)

  // --- Sauvegarde automatique (autosave) -----------------------------------
  // La feuille est persistée à chaque modification (débounce), sans bouton. Le
  // formulaire est la source de vérité en édition ; on ne le ré-hydrate qu'au
  // (premier) chargement d'un couple (date, shift). Règles de sûreté :
  //  - jamais d'écriture avant la première hydratation (hydratedRef) — sinon on
  //    écraserait un brouillon existant par du vide, ou on créerait une feuille
  //    fantôme ;
  //  - l'éditabilité est jugée sur le couple RÉELLEMENT sauvegardé (via le
  //    cache), pas sur le couple affiché — pour ne pas perdre la saisie d'un
  //    brouillon quand on vient de naviguer vers une feuille verrouillée ;
  //  - cache optimiste AVANT l'await — pour qu'un retour sur ce couple pendant
  //    une sauvegarde en vol lise la dernière saisie, pas une valeur périmée.
  const formRef = useRef(form)
  formRef.current = form
  const keyRef = useRef(`${selectedDate}|${selectedShift}`)
  const hydratedRef = useRef(false)
  const lastSavedRef = useRef(JSON.stringify(form))
  // Incrémenté par chaque action décisive (guard : valider / contre-signer /
  // rouvrir) : un autosave en vol ne doit pas réécrire le cache par-dessus.
  const mutationEpochRef = useRef(0)

  const flush = useCallback(
    async (input: CaisseSheetInput) => {
      if (!hydratedRef.current) return // jamais avant la première hydratation
      const snapshot = JSON.stringify(input)
      if (snapshot === lastSavedRef.current) return
      const qk = ['caisse', 'sheet', input.reportDate, input.shift] as const
      const prev = queryClient.getQueryData<CaisseSheet | null>(qk)
      if (!canEditSheet(prev ?? null, role)) return // éditabilité du couple sauvegardé
      // Les mutations d'indicateur / de baseline sont scopées au couple ENCORE
      // actif : la résolution asynchrone d'un flush d'un couple quitté ne doit
      // ni repeindre l'indicateur ni salir la baseline du couple courant.
      const inputKey = `${input.reportDate}|${input.shift}`
      const active = () => keyRef.current === inputKey
      lastSavedRef.current = snapshot // jalon avant l'await (anti double-envoi)
      if (active()) setSaveState('saving')
      // Cache optimiste AVANT l'await : un retour sur ce couple pendant que la
      // sauvegarde est en vol lit la dernière saisie, pas une valeur périmée.
      queryClient.setQueryData<CaisseSheet | null>(qk, (old) =>
        inputToSheet(input, old ?? null),
      )
      const epoch = mutationEpochRef.current
      try {
        const saved = await upsertSheet(input)
        // Ne pas écraser une validation/contre-signature survenue pendant l'await.
        if (mutationEpochRef.current === epoch) queryClient.setQueryData(qk, saved)
        if (active()) setSaveState('saved')
      } catch {
        // Rollback de l'optimiste — sauf si une mutation décisive (validation…)
        // a mis le cache à jour entre-temps : elle fait autorité.
        if (mutationEpochRef.current === epoch) queryClient.setQueryData(qk, prev ?? null)
        if (active()) {
          lastSavedRef.current = '' // autorise une nouvelle tentative
          setSaveState('error')
        }
      }
    },
    [queryClient, role],
  )

  // Hydratation : uniquement au (premier) chargement d'un couple (date, shift).
  // Le même couple n'est jamais ré-hydraté (sinon la saisie serait écrasée).
  useEffect(() => {
    const key = `${selectedDate}|${selectedShift}`
    if (keyRef.current !== key) {
      void flush(formRef.current) // flush la saisie du couple précédent
      keyRef.current = key
      hydratedRef.current = false
      setError('')
      setNotice('')
      setSaveState('idle')
    }
    if (sheet === undefined || hydratedRef.current) return
    // Nouvelle feuille : attendre la fin du chargement de la feuille précédente
    // (succès ou échec), puis reporter son fond de caisse s'il existe.
    if (sheet === null && prevLoading) return
    const next = sheet
      ? sheetToInput(sheet)
      : emptyInput(
          selectedDate,
          selectedShift,
          prevSheet ? { ...prevSheet.counts } : emptyCounts(),
        )
    setForm(next)
    lastSavedRef.current = JSON.stringify(next)
    hydratedRef.current = true
  }, [sheet, prevSheet, prevLoading, selectedDate, selectedShift, flush])

  // Débounce : sauvegarde ~700 ms après la dernière frappe (couple courant).
  useEffect(() => {
    if (!editable || !hydratedRef.current) return
    if (JSON.stringify(form) === lastSavedRef.current) return
    const snapshot = form
    const t = setTimeout(() => void flush(snapshot), 700)
    return () => clearTimeout(t)
  }, [form, editable, flush])

  // Flush au démontage (changement de route) et quand l'onglet passe en arrière-
  // plan (visibilitychange « hidden »). Best-effort : sur une fermeture d'onglet
  // très rapide (< délai de débounce) le dernier caractère peut ne pas partir.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush(formRef.current)
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      void flush(formRef.current)
    }
  }, [flush])

  // Re-rendu à l'expiration de la fenêtre de grâce : bascule editable → false
  // pour aligner l'UI sur la RLS (bannière périmée + écritures vouées au refus).
  const deadlineMs = deadline ? deadline.getTime() : null
  const [, forceTick] = useState(0)
  useEffect(() => {
    if (deadlineMs === null) return
    const ms = deadlineMs - Date.now()
    if (ms <= 0) return
    const t = setTimeout(() => forceTick((x) => x + 1), ms + 500)
    return () => clearTimeout(t)
  }, [deadlineMs])

  const displayDate = new Date(selectedDate + 'T00:00:00')
  const longDate = fmtTitle.format(displayDate)
  const titleDate = longDate.charAt(0).toUpperCase() + longDate.slice(1)

  // Colonnes du tableau des paiements (web seulement le soir).
  const cols: EcartKey[] = showWeb ? [...PAY_KEYS, 'web'] : [...PAY_KEYS]

  const setSnt = (k: keyof CaisseSheetInput['snt'], v: number) =>
    setForm((f) => ({ ...f, snt: { ...f.snt, [k]: v } }))
  const setLs = (k: keyof CaisseSheetInput['ls'], v: number) =>
    setForm((f) => ({ ...f, ls: { ...f.ls, [k]: v } }))
  const setCaisse = (k: keyof CaisseSheetInput['caisse'], v: number) =>
    setForm((f) => ({ ...f, caisse: { ...f.caisse, [k]: v } }))
  const setCount = (k: string, v: number) =>
    setForm((f) => ({ ...f, counts: { ...f.counts, [k]: v } }))
  const bumpCount = (k: DenomKey, delta: number) =>
    setForm((f) => ({
      ...f,
      counts: { ...f.counts, [k]: Math.max(0, (f.counts[k] ?? 0) + delta) },
    }))

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['caisse'] })

  async function guard(action: () => Promise<void>, ok: string) {
    mutationEpochRef.current += 1 // invalide tout autosave en vol (anti-clobber)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      await invalidate()
      setNotice(ok)
    } catch (err) {
      // Un refus RLS (ex. feuille verrouillée hors fenêtre) arrive ici : on
      // resynchronise l'état réel plutôt que de présumer le succès.
      setError(
        `Action refusée ou échouée : ${err instanceof Error ? err.message : String(err)}`,
      )
      await invalidate()
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirmClose() {
    if (!user) return
    const name = hotelierName.trim()
    if (!name) return
    setCloseOpen(false)
    await guard(async () => {
      const input = { ...form, operatorInitials: name }
      setForm(input)
      lastSavedRef.current = JSON.stringify(input) // avant l'await : coupe l'autosave concurrent
      const saved = await upsertSheet(input)
      await validateSheet(saved.id, user.id)
    }, 'Caisse clôturée.')
  }

  const handleCountersign = () => {
    if (!user || !sheet) return
    return guard(() => countersign(sheet.id, user.id), 'Caisse contre-signée.')
  }

  function handleReopen() {
    if (!sheet) return
    if (!window.confirm('Rouvrir cette caisse validée (déverrouillage admin) ?')) return
    return guard(() => reopenSheet(sheet.id), 'Caisse rouverte (brouillon).')
  }

  // Génère un VRAI document PDF (jsPDF) et ouvre la fenêtre d'impression du
  // navigateur — pas de téléchargement. Cf. src/lib/caisse/pdf.ts.
  const [pdfBusy, setPdfBusy] = useState(false)
  const handleGeneratePdf = async () => {
    setPdfBusy(true)
    setError('')
    try {
      const [yr, mo, da] = selectedDate.split('-')
      await printCaisseSheet(
        {
          titleDate,
          form,
          operatorInitials: sheet?.operatorInitials || form.operatorInitials,
        },
        `Caisse_${da}-${mo}-${yr}_${form.shift}`,
      )
    } catch (err) {
      setError(
        `Impression du PDF impossible : ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <div className="caisse-doc flex w-full min-w-0 flex-1 flex-col gap-4">
      <PageHeader
        title={`${titleDate} (${SHIFT_LABELS[form.shift].toLowerCase()})`}
        actions={
          <>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => goStep(-1)}
              aria-label="Shift précédent"
            >
              <ChevronLeft />
            </Button>
            <DatePickerButton
              value={selectedDate}
              onChange={(v) => v && setSelectedDate(v)}
              ariaLabel="Choisir un jour"
            />
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => goStep(1)}
              aria-label="Shift suivant"
            >
              <ChevronRight />
            </Button>
            <PrintButton
              onClick={handleGeneratePdf}
              responsiveLabel
              disabled={pdfBusy}
              className="ml-1"
            />
            {isWriter && editable && !isValidated && (
              <Button
                className="ml-1"
                onClick={() => {
                  setHotelierName(form.operatorInitials)
                  setCloseOpen(true)
                }}
              >
                <Check /> Clôturer la caisse
              </Button>
            )}
          </>
        }
      />

      {/* Bandeaux d'état du verrou. */}
      {inGrace && deadline && (
        <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-3 text-sm text-primary">
          <Lock className="size-4 shrink-0" />
          Caisse clôturée{sheet?.operatorInitials ? ` par ${sheet.operatorInitials}` : ''}. Modifiable encore jusqu'à {fmtTime.format(deadline)} (fenêtre de {GRACE_HOURS} h).
        </div>
      )}
      {lockedForMe && (
        <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
          <Lock className="size-4 shrink-0" />
          Caisse clôturée{sheet?.operatorInitials ? ` par ${sheet.operatorInitials}` : ''} et verrouillée. Contactez un administrateur pour toute correction.
        </div>
      )}

      {sheetError && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Impossible de charger cette feuille (connexion ?). Réessayez en changeant de shift puis en revenant.
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg bg-emerald-500/10 px-4 py-3 text-sm text-emerald-500">
          {notice}
        </div>
      )}

      {/* Tableau des montants + écarts (défile horizontalement si étroit). */}
      <div className="caisse-table overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Source</th>
              {cols.map((c) => (
                <th key={c} className="px-3 py-2 text-center font-medium">
                  {ECART_LABELS[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AmountRow
              label="STAY N' TOUCH"
              cols={cols}
              disabled={!editable}
              value={(c) => (c === 'web' ? form.snt.cbweb : form.snt[c as PayKey])}
              onChange={(c, v) => (c === 'web' ? setSnt('cbweb', v) : setSnt(c as PayKey, v))}
            />
            <AmountRow
              label="LIGHTSPEED"
              cols={cols}
              disabled={!editable}
              value={(c) => (c === 'web' ? null : form.ls[c as PayKey])}
              onChange={(c, v) => c !== 'web' && setLs(c as PayKey, v)}
            />
            <AmountRow
              label="CAISSE"
              cols={cols}
              disabled={!editable}
              value={(c) => (c === 'web' ? form.caisse.adyen : form.caisse[c as PayKey])}
              onChange={(c, v) =>
                c === 'web' ? setCaisse('adyen', v) : setCaisse(c as PayKey, v)
              }
            />
            <tr className="border-t border-border bg-muted/30 font-medium">
              <td className="px-3 py-2">ÉCARTS</td>
              {cols.map((c) => {
                const v = ecarts[c]
                const zero = Math.abs(v) < EPSILON
                return (
                  <td
                    key={c}
                    className={cn(
                      'px-3 py-2 text-right tabular-nums',
                      zero ? 'text-emerald-500' : 'text-destructive',
                    )}
                    title={`Attendu ${fmtEur(expected(form, c))}`}
                  >
                    {fmtEcart(v)}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Comptage du fond de caisse. Grille responsive : 2 colonnes (mobile),
          3 (intermédiaire), 5 colonnes-décades en remplissage vertical (≥ lg :
          grid-flow-col + grid-rows-3 → 500/200/100, 50/20/10, …). */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Fond de caisse</h2>
        <div className="caisse-denoms grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-flow-col lg:grid-cols-5 lg:grid-rows-3">
          {DENOMINATIONS.map((d) => {
            const n = form.counts[d.key] ?? 0
            const filled = n > 0
            return (
              <div
                key={d.key}
                className={cn(
                  'flex items-stretch overflow-hidden rounded-lg border transition-colors',
                  filled ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/20',
                  // 500 € en pleine largeur sur mobile (2 cols) : équilibre les
                  // 14 cartes restantes en 7 rangées de 2. Sans effet dès sm.
                  d.key === 'cnt_500' && 'col-span-2 sm:col-span-1',
                )}
              >
                {/* Zone gauche : bouton « − » pleine hauteur */}
                <button
                  type="button"
                  aria-label={`Retirer un ${d.label}`}
                  disabled={!editable}
                  onClick={() => bumpCount(d.key, -1)}
                  className="flex flex-1 items-center justify-center border-r border-border/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                >
                  <Minus className="size-4" />
                </button>
                {/* Zone centrale : valeur, quantité, sous-total */}
                <div className="flex flex-[1.4] flex-col items-center justify-center gap-0.5 px-1 py-2">
                  <span className="whitespace-nowrap text-xs font-semibold leading-none tabular-nums">
                    {d.label}
                  </span>
                  <CountInput
                    value={n}
                    disabled={!editable}
                    onChange={(v) => setCount(d.key, v)}
                  />
                  <span
                    className={cn(
                      'whitespace-nowrap text-[11px] leading-none tabular-nums',
                      filled ? 'font-medium text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {d.value < 1 ? fmtEur(d.value * n) : fmtEurInt(d.value * n)}
                  </span>
                </div>
                {/* Zone droite : bouton « + » pleine hauteur */}
                <button
                  type="button"
                  aria-label={`Ajouter un ${d.label}`}
                  disabled={!editable}
                  onClick={() => bumpCount(d.key, 1)}
                  className="flex flex-1 items-center justify-center border-l border-border/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            )
          })}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
          <span className="text-muted-foreground">
            Total compté / attendu {fmtEur(FUND_TARGET)}
          </span>
          <span
            className={cn(
              'tabular-nums font-medium',
              Math.abs(fEcart) < EPSILON ? 'text-emerald-500' : 'text-destructive',
            )}
          >
            {fmtEur(total)} ({fmtEcart(fEcart)})
          </span>
        </div>
      </div>

      {/* Commentaires (juste en dessous du fond de caisse). */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Commentaires</h2>
        <Textarea
          value={form.comment}
          disabled={!editable}
          onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
          placeholder="Justification d'un éventuel écart…"
          className="min-h-32"
        />
      </div>

      {/* Actions. */}
      {isWriter && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Autosave silencieux : on ne signale QUE les échecs (sinon la
              sauvegarde travaille en arrière-plan, sans mention explicite). */}
          {editable && saveState === 'error' && (
            <span className="text-sm text-destructive">
              Échec de l'enregistrement — vérifiez votre connexion.
            </span>
          )}
          {isValidated && editable && !sheet?.countersignedBy && (
            <Button variant="outline" onClick={handleCountersign} disabled={busy}>
              <PenLine /> Contre-signer
            </Button>
          )}
          {isAdmin && isValidated && (
            <Button variant="outline" onClick={handleReopen} disabled={busy}>
              <LockOpen /> Rouvrir (admin)
            </Button>
          )}
          {balanced && (
            <span className="text-sm text-emerald-500">Caisse équilibrée.</span>
          )}
        </div>
      )}

      {/* Modal de clôture : récapitulatif + nom de l'hôtelier + clôture réelle. */}
      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clôturer la caisse</DialogTitle>
            <DialogDescription>
              {titleDate} — {SHIFT_LABELS[form.shift]}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            {balanced ? (
              <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-emerald-500">
                <Check className="size-4 shrink-0" />
                Caisse équilibrée — tous les écarts sont à 0 €.
              </div>
            ) : (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive">
                <div className="mb-1 font-medium">Écarts non nuls :</div>
                <ul className="space-y-0.5">
                  {cols
                    .filter((c) => Math.abs(ecarts[c]) >= EPSILON)
                    .map((c) => (
                      <li key={c} className="flex justify-between gap-4">
                        <span>{ECART_LABELS[c]}</span>
                        <span className="tabular-nums">{fmtEcart(ecarts[c])}</span>
                      </li>
                    ))}
                  {Math.abs(fEcart) >= EPSILON && (
                    <li className="flex justify-between gap-4">
                      <span>Fond de caisse</span>
                      <span className="tabular-nums">{fmtEcart(fEcart)}</span>
                    </li>
                  )}
                </ul>
                <div className="mt-1 text-xs">À justifier dans les commentaires.</div>
              </div>
            )}

            <div className="flex justify-between border-t border-border pt-2 text-muted-foreground">
              <span>Fond de caisse compté</span>
              <span className="tabular-nums text-foreground">
                {fmtEur(total)} / {fmtEur(FUND_TARGET)}
              </span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="caisse-hotelier">Nom de l'hôtelier</Label>
              <Input
                id="caisse-hotelier"
                value={hotelierName}
                onChange={(e) => setHotelierName(e.target.value)}
                placeholder="Nom / initiales"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleConfirmClose} disabled={busy || !hotelierName.trim()}>
              <Check /> Clôturer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * Champ monétaire : <Input> shadcn en type="text" (pas de flèches natives),
 * suffixe « € ». Garde un état texte interne pour préserver la frappe décimale
 * ("12," ne doit pas être réécrit en "12"), resynchronisé si la valeur externe
 * change (chargement / reset de feuille).
 */
function MoneyInput({
  value,
  onChange,
  disabled,
}: {
  value: number
  onChange: (v: number) => void
  disabled: boolean
}) {
  const [text, setText] = useState(() => amountText(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    // Ne réécrit le texte QUE si la valeur externe ne correspond plus à la
    // frappe en cours — sinon on préserve les états intermédiaires ("12,").
    if (amountValue(text) !== value) setText(amountText(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <div className="relative">
      <Input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={text}
        onChange={(e) => {
          const t = sanitizeAmount(e.target.value)
          setText(t)
          onChange(amountValue(t))
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={focused ? '' : '0'}
        className="h-8 pr-6 text-right tabular-nums"
      />
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">
        €
      </span>
    </div>
  )
}

/**
 * Champ de comptage (entier ≥ 0). Le placeholder « 0 » de fond disparaît dès le
 * focus (édition) et réapparaît au blur si le champ est laissé vide.
 */
function CountInput({
  value,
  onChange,
  disabled,
}: {
  value: number
  onChange: (v: number) => void
  disabled: boolean
}) {
  const [focused, setFocused] = useState(false)
  return (
    <Input
      type="text"
      inputMode="numeric"
      disabled={disabled}
      value={value === 0 ? '' : String(value)}
      onChange={(e) => onChange(countValue(e.target.value))}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={focused ? '' : '0'}
      className="h-7 w-4/5 px-1 text-center text-sm tabular-nums"
    />
  )
}

function AmountRow({
  label,
  cols,
  value,
  onChange,
  disabled,
}: {
  label: string
  cols: EcartKey[]
  value: (c: EcartKey) => number | null
  onChange: (c: EcartKey, v: number) => void
  disabled: boolean
}) {
  return (
    <tr className="border-b border-border/60">
      <td className="px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
        {label}
      </td>
      {cols.map((c) => {
        const v = value(c)
        return (
          <td key={c} className="px-2 py-1">
            {v === null ? (
              <span className="block text-right text-muted-foreground">—</span>
            ) : (
              <MoneyInput value={v} disabled={disabled} onChange={(nv) => onChange(c, nv)} />
            )}
          </td>
        )
      })}
    </tr>
  )
}
