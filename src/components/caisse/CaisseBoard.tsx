import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Minus, Plus } from 'lucide-react'

import { LockBadge } from '#/components/shared/LockBadge.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { PrintBlockedDialog } from '#/components/shared/PrintBlockedDialog.tsx'
import { PrintButton } from '#/components/shared/PrintButton.tsx'
import { StepNav } from '#/components/shared/StepNav.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { usePrintShortcut } from '#/components/shared/usePrintShortcut.ts'
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
import { errorMessage } from '#/lib/errors.ts'
import { printCaisseSheet } from '#/lib/caisse/pdf.ts'
import {
  computeEcarts,
  emptyInput,
  expected,
  fundEcart,
  fundTotal,
  hasCountedFund,
  isBalanced,
} from '#/lib/caisse/calc.ts'
import { fmtEcart, fmtEcartBare, fmtEur, fmtEurInt } from '#/lib/caisse/format.ts'
import {
  DENOMINATIONS,
  ECART_LABELS,
  EPSILON,
  FUND_TARGET,
  PAY_KEYS,
  SHIFT_LABELS,
  emptyCounts,
} from '#/lib/caisse/constants.ts'
import {
  canEditSheet,
  fetchOldestSlot,
  fetchPreviousSheet,
  fetchRecentValidatedSlots,
  fetchSheet,
  reopenSheet,
  upsertSheet,
  validateSheet,
} from '#/lib/caisse/service.ts'
import {
  currentSlot,
  resolveDisplaySlot,
  slotKey,
  stepSlot,
} from '#/lib/caisse/shift.ts'
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
 * fond de caisse (150 €), et gère la VALIDATION verrouillée : une feuille
 * clôturée est en LECTURE SEULE (champs figés) pour tous ; il faut la réouvrir
 * (admin) pour la modifier. La RLS (supabase/caisse_sheets.sql) reste
 * l'autorité ; l'UI la reflète.
 * ------------------------------------------------------------------------ */

const fmtTitle = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

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

  // Instant de référence figé au montage : le shift courant et les bornes se
  // recalculent au même « maintenant », sans dériver d'un rendu à l'autre.
  const [now] = useState(() => new Date())

  // Slot initial (date + shift) déduit de l'heure : nuit 02–12, matin 12–21,
  // soir 21–02. Corrigé juste après par l'auto-sélection (shift déjà clôturé →
  // le suivant), une fois connue la liste des shifts validés.
  const [selectedDate, setSelectedDate] = useState(() => currentSlot(now).date)
  const [selectedShift, setSelectedShift] = useState<Shift>(
    () => currentSlot(now).shift,
  )

  // Shifts déjà clôturés (récents) : permet de sauter, au chargement, ceux qui
  // sont faits — l'hôtelier tombe sur celui qu'il doit remplir.
  const { data: validatedSlots } = useQuery({
    queryKey: ['caisse', 'validated-recent'],
    queryFn: fetchRecentValidatedSlots,
  })
  const validatedKeys = useMemo(
    () => new Set((validatedSlots ?? []).map((s) => slotKey(s.date, s.shift))),
    [validatedSlots],
  )
  // Slot à afficher : le courant, ou le suivant s'il est clôturé (jamais en
  // arrière — une nuit oubliée n'est pas reprise au chargement).
  const displaySlot = useMemo(
    () => resolveDisplaySlot(now, (d, s) => validatedKeys.has(slotKey(d, s))),
    [now, validatedKeys],
  )

  // Bornes de navigation. Haute : le slot à afficher (= le courant, ou le
  // suivant si le courant est clôturé) — on peut donc atteindre le shift à
  // remplir même s'il n'a pas encore commencé, mais pas au-delà. Basse : le plus
  // ancien enregistrement, ou — s'il n'existe pas ou n'est pas plus ancien — le
  // shift JUSTE AVANT (base vide : on remonte d'un cran pour amorcer le fond).
  const nowSlot = displaySlot
  const nowKey = slotKey(nowSlot.date, nowSlot.shift)
  const { data: oldestSlot } = useQuery({
    queryKey: ['caisse', 'oldest'],
    queryFn: fetchOldestSlot,
  })
  const prevSlot = stepSlot(nowSlot.date, nowSlot.shift, -1)
  const prevKey = slotKey(prevSlot.date, prevSlot.shift)
  const lowerSlot =
    oldestSlot && slotKey(oldestSlot.date, oldestSlot.shift) < prevKey ? oldestSlot : prevSlot
  const lowerKey = slotKey(lowerSlot.date, lowerSlot.shift)
  const curKey = slotKey(selectedDate, selectedShift)
  const atLatestSlot = curKey >= nowKey
  const atLowerBound = curKey <= lowerKey

  const setSlot = (s: { date: string; shift: Shift }) => {
    setSelectedDate(s.date)
    setSelectedShift(s.shift)
  }

  // L'hôtelier a-t-il déjà choisi un shift ? Alors l'auto-sélection ne le lui
  // arrache plus. Posé par toute navigation manuelle (flèches, calendrier).
  const userNavigatedRef = useRef(false)
  const autoPickedRef = useRef(false)
  // Auto-sélection UNE fois, au premier chargement de la liste des shifts
  // validés : on avance sur le slot à remplir. Après ça (ou après une action de
  // l'hôtelier), on ne touche plus à sa sélection.
  useEffect(() => {
    if (autoPickedRef.current || userNavigatedRef.current) return
    if (validatedSlots === undefined) return // attendre la donnée
    autoPickedRef.current = true
    if (slotKey(displaySlot.date, displaySlot.shift) !== curKey) setSlot(displaySlot)
  }, [validatedSlots, displaySlot, curKey])

  // Navigation shift par shift : matin → soir → nuit → matin du lendemain.
  const goStep = (delta: number) => {
    if (delta > 0 && atLatestSlot) return // pas au-delà du shift à remplir
    if (delta < 0 && atLowerBound) return // pas avant la borne basse
    userNavigatedRef.current = true
    setSlot(stepSlot(selectedDate, selectedShift, delta))
  }

  // Sélection d'un jour bornée aux mêmes limites (clamp si le shift courant
  // sortirait de l'intervalle sur la date choisie).
  const goDate = (v: string) => {
    if (!v) return
    userNavigatedRef.current = true
    const k = slotKey(v, selectedShift)
    if (k > nowKey) setSlot(nowSlot)
    else if (k < lowerKey) setSlot(lowerSlot)
    else setSelectedDate(v)
  }
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)
  const [hotelierName, setHotelierName] = useState('')

  const { data: sheet, isError: sheetError } = useQuery({
    queryKey: ['caisse', 'sheet', selectedDate, selectedShift],
    queryFn: () => fetchSheet(selectedDate, selectedShift),
  })

  // Brouillon jamais compté (fond vide) : à traiter comme une feuille neuve pour
  // le report du fond — il doit hériter du dernier shift réel, pas rester vide.
  const emptyDraft =
    sheet != null && sheet.status === 'draft' && !hasCountedFund(sheet)
  // Le couple courant attend un report du fond : aucune feuille, ou brouillon
  // vide. Pilote UNIFORMÉMENT le chargement de la précédente, l'attente
  // d'hydratation et l'état « prêt » (sinon la condition se réécrit à 3 endroits).
  const needsCarry = sheet === null || emptyDraft

  // Fond de caisse à reporter : feuille précédente RÉELLE, chargée seulement
  // quand le couple courant attend un report ; sinon on hydrate depuis la sienne.
  const { data: prevSheet, isLoading: prevLoading } = useQuery({
    queryKey: ['caisse', 'prev', selectedDate, selectedShift],
    queryFn: () => fetchPreviousSheet(selectedDate, selectedShift),
    enabled: needsCarry,
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
  const ready = sheet !== undefined && !(needsCarry && prevLoading)
  const editable = ready && canEditSheet(sheet ?? null, role)
  const isWriter = role === 'super_utilisateur' || role === 'admin'
  // Champs éditables UNIQUEMENT sur un brouillon : une caisse clôturée est
  // verrouillée (valeurs figées) pour tous, admin compris — il faut la réouvrir
  // pour la modifier.
  const canEditFields = editable && !isValidated
  const showWeb = form.shift === 'soir'

  const ecarts = useMemo(() => computeEcarts(form), [form])
  const total = fundTotal(form)
  const fEcart = fundEcart(form)
  const balanced = isBalanced(form)

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
  // Incrémenté par chaque action décisive (guard : clôturer / réouvrir) : un
  // autosave en vol ne doit pas réécrire le cache par-dessus.
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
        // Ne pas écraser une validation/réouverture survenue pendant l'await.
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
      setSaveState('idle')
    }
    if (sheet === undefined || hydratedRef.current) return
    // Nouvelle feuille OU brouillon au fond vide : attendre la fin du chargement
    // de la feuille précédente (succès ou échec), puis reporter son fond compté.
    if (needsCarry && prevLoading) return
    // `carry` retombe sur un comptage vide sans précédente : pour un brouillon
    // vide, réappliquer un comptage vide est neutre, d'où le simple `emptyDraft`.
    const carry = prevSheet ? { ...prevSheet.counts } : emptyCounts()
    const next =
      sheet === null
        ? emptyInput(selectedDate, selectedShift, carry)
        : emptyDraft
          ? { ...sheetToInput(sheet), counts: carry }
          : sheetToInput(sheet)
    setForm(next)
    lastSavedRef.current = JSON.stringify(next)
    hydratedRef.current = true
  }, [sheet, needsCarry, emptyDraft, prevSheet, prevLoading, selectedDate, selectedShift, flush])

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

  async function guard(action: () => Promise<void>) {
    mutationEpochRef.current += 1 // invalide tout autosave en vol (anti-clobber)
    setBusy(true)
    setError('')
    try {
      await action()
      await invalidate()
    } catch (err) {
      // Un refus RLS (ex. feuille verrouillée hors fenêtre) arrive ici : on
      // resynchronise l'état réel plutôt que de présumer le succès. `errorMessage`
      // et non `String(err)` : un refus RLS est un objet, pas une Error.
      setError(`Action refusée ou échouée : ${errorMessage(err)}`)
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
    })
  }

  function handleReopen() {
    if (!sheet) return
    if (!window.confirm('Réouvrir cette caisse clôturée ?')) return
    return guard(() => reopenSheet(sheet.id))
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
      setError(`Impression du PDF impossible : ${errorMessage(err)}`)
    } finally {
      setPdfBusy(false)
    }
  }

  // Ctrl+P emprunte la même porte que le bouton : le PDF jsPDF, jamais le rendu
  // brut du DOM. Feuille non clôturée, le raccourci explique son refus — là où
  // le bouton se contente d'être désactivé, infobulle à l'appui.
  const [printBlocked, setPrintBlocked] = useState(false)
  usePrintShortcut(() => {
    if (pdfBusy) return
    if (!isValidated) {
      setPrintBlocked(true)
      return
    }
    void handleGeneratePdf()
  })

  /* Bouton d'état de la feuille, rendu en bas de page (sous les commentaires),
     là où se termine la saisie : Réouvrir si la feuille est clôturée et
     `editable` (admin à tout moment, OU super_utilisateur dans la fenêtre de
     grâce), Verrouillé sinon (super hors grâce), Clôturer sur un brouillon.

     Le poids visuel suit l'intention : clôturer est la SUITE du travail (bouton
     plein), réouvrir en est le RETOUR EN ARRIÈRE (contour vert, comme la
     pastille d'en-tête), verrouillé en est le refus (contour rouge). Texte seul :
     le libellé dit déjà l'action, une icône n'y ajoutait rien. */
  const stateAction = !isWriter ? null : !isValidated ? (
    editable && (
      <Tip label="Fige les montants de ce shift">
        <Button
          className="w-full"
          onClick={() => {
            setHotelierName(form.operatorInitials)
            setCloseOpen(true)
          }}
        >
          Clôturer la caisse
        </Button>
      </Tip>
    )
  ) : editable ? (
    <Tip label="Rend les montants modifiables">
      <Button
        variant="outline"
        className="w-full border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-500 dark:hover:bg-emerald-500/10"
        onClick={handleReopen}
        disabled={busy}
      >
        Réouvrir la caisse
      </Button>
    </Tip>
  ) : (
    // Bouton désactivé : Radix ne verrait aucun survol dessus, d'où le span
    // porteur. C'est ici que l'infobulle compte le plus — elle est la seule à
    // dire POURQUOI la réouverture est refusée.
    <Tip label="Réouverture réservée à un administrateur">
      <span tabIndex={0} className="block w-full">
        <Button
          variant="outline"
          disabled
          className="w-full border-destructive/50 text-destructive disabled:opacity-100"
        >
          Verrouillé
        </Button>
      </span>
    </Tip>
  )

  return (
    <div className="caisse-doc mx-auto flex w-full min-w-0 max-w-5xl flex-1 flex-col gap-4 print:max-w-none">
      <PageHeader
        title={`${titleDate} (${SHIFT_LABELS[form.shift].toLowerCase()})`}
        // Attendre `ready` : sans feuille chargée, `isValidated` vaut faux par
        // défaut et la pastille afficherait « Ouverte » avant de se contredire.
        badge={
          ready && (
            <LockBadge
              locked={isValidated}
              label={isValidated ? 'Clôturée' : 'Ouverte'}
              hint={
                isValidated
                  ? 'Montants figés. Réouvrez la feuille pour les modifier.'
                  : 'Saisie en cours, enregistrée automatiquement.'
              }
            />
          )
        }
        actions={
          <>
            {/* 1) Impression : toujours présente, mais désactivée tant que la
                caisse n'est pas clôturée — le document ne s'imprime qu'une fois
                les montants figés. L'infobulle porte alors la raison. */}
            <PrintButton
              onClick={handleGeneratePdf}
              iconOnly
              disabled={!isValidated || pdfBusy}
              tipLabel={
                isValidated
                  ? 'Imprimer / PDF'
                  : 'Clôturez la caisse pour imprimer la feuille'
              }
            />
            {/* 2) Navigation, en dernier : elle est collée au bord droit sur
                toutes les pages (cf. PageHeader). */}
            <StepNav
              className="ml-1"
              onPrev={() => goStep(-1)}
              onNext={() => goStep(1)}
              prevLabel="Shift précédent"
              nextLabel="Shift suivant"
              prevDisabled={atLowerBound}
              nextDisabled={atLatestSlot}
            >
              <DatePickerButton
                value={selectedDate}
                onChange={goDate}
                min={lowerSlot.date}
                max={nowSlot.date}
                ariaLabel="Choisir un jour"
              />
            </StepNav>
          </>
        }
      />

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

      {/* Tableau des montants + écarts (défile horizontalement si étroit). */}
      <div className="caisse-table overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-muted-foreground">
              <th className="w-32 px-3 py-1.5 text-left font-medium">Source</th>
              {cols.map((c) => (
                <th key={c} className="px-3 py-1.5 text-center font-medium">
                  {c === 'web' ? (
                    <>
                      <span className="max-sm:hidden">{ECART_LABELS.web}</span>
                      <span className="sm:hidden">Adyen</span>
                    </>
                  ) : (
                    ECART_LABELS[c]
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AmountRow
              label="STAY N' TOUCH"
              cols={cols}
              disabled={!canEditFields}
              value={(c) => (c === 'web' ? form.snt.cbweb : form.snt[c as PayKey])}
              onChange={(c, v) => (c === 'web' ? setSnt('cbweb', v) : setSnt(c as PayKey, v))}
            />
            <AmountRow
              label="LIGHTSPEED"
              cols={cols}
              disabled={!canEditFields}
              value={(c) => (c === 'web' ? null : form.ls[c as PayKey])}
              onChange={(c, v) => c !== 'web' && setLs(c as PayKey, v)}
            />
            <AmountRow
              label="CAISSE/TPE"
              cols={cols}
              disabled={!canEditFields}
              value={(c) => (c === 'web' ? form.caisse.adyen : form.caisse[c as PayKey])}
              onChange={(c, v) =>
                c === 'web' ? setCaisse('adyen', v) : setCaisse(c as PayKey, v)
              }
            />
            <tr className="border-t border-border bg-muted/30 font-medium">
              <td className="px-3 py-1.5">ÉCARTS</td>
              {cols.map((c) => {
                const v = ecarts[c]
                const zero = Math.abs(v) < EPSILON
                return (
                  <td
                    key={c}
                    className={cn(
                      'px-3 py-1.5 text-right tabular-nums',
                      zero ? 'text-emerald-500' : 'text-destructive',
                    )}
                    title={`Attendu ${fmtEur(expected(form, c))}`}
                  >
                    {fmtEcartBare(v)}
                    <span className="max-sm:hidden"> €</span>
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
      <div className="rounded-xl border border-border bg-card p-3">
        <h2 className="mb-2 text-sm font-semibold">Fond de caisse</h2>
        <div className="caisse-denoms grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-flow-col lg:grid-cols-5 lg:grid-rows-3">
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
                  disabled={!canEditFields}
                  onClick={() => bumpCount(d.key, -1)}
                  className="flex flex-1 items-center justify-center border-r border-border/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                >
                  <Minus className="size-4" />
                </button>
                {/* Zone centrale : valeur, quantité, sous-total */}
                <div className="flex flex-[1.4] flex-col items-center justify-center gap-1 px-1 py-1.5">
                  <span className="whitespace-nowrap text-xs font-semibold leading-none tabular-nums">
                    {d.label}
                  </span>
                  <CountInput
                    value={n}
                    disabled={!canEditFields}
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
                  disabled={!canEditFields}
                  onClick={() => bumpCount(d.key, 1)}
                  className="flex flex-1 items-center justify-center border-l border-border/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            )
          })}
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm">
          <span className="text-muted-foreground">
            Fond de caisse {fmtEurInt(FUND_TARGET)}
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
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Commentaires</h2>
          {isValidated && sheet?.operatorInitials && (
            <span className="text-sm font-medium text-muted-foreground">
              {sheet.operatorInitials}
            </span>
          )}
        </div>
        <Textarea
          value={form.comment}
          disabled={!canEditFields}
          onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
          placeholder="Justification d'un éventuel écart…"
          // Hauteur figée : `resize-none` retire la poignée, `h-24` neutralise
          // le `field-sizing-content` de la primitive (qui étirait le champ à
          // mesure qu'on écrivait). Au-delà, le texte défile dans le champ.
          className="h-24 resize-none"
        />
      </div>

      {/* Actions — le bouton d'état ferme la page, sous la saisie. */}
      {isWriter && (
        <div className="flex flex-col gap-2">
          {/* Autosave silencieux : on ne signale QUE les échecs (sinon la
              sauvegarde travaille en arrière-plan, sans mention explicite). */}
          {editable && saveState === 'error' && (
            <span className="text-sm text-destructive">
              Échec de l'enregistrement — vérifiez votre connexion.
            </span>
          )}
          {stateAction}
        </div>
      )}

      <PrintBlockedDialog
        open={printBlocked}
        onOpenChange={setPrintBlocked}
        reason="La caisse n'est pas clôturée. Clôturez-la pour imprimer la feuille."
      />

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
              Clôturer définitivement
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
      className="h-6 w-4/5 px-1 text-center text-sm tabular-nums"
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
      <td className="px-3 py-2 text-xs font-medium uppercase text-muted-foreground max-sm:whitespace-nowrap">
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
