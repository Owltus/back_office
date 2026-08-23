import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  LineChart,
  MoreVertical,
  Minus,
  Pencil,
  Plus,
  Printer,
  Trash2,
  Undo2,
} from 'lucide-react'

import { LockBadge } from '#/components/shared/LockBadge.tsx'
import { MobileToolbar, ToolbarCell } from '#/components/shared/MobileToolbar.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { PrintButton } from '#/components/shared/PrintButton.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { ButtonGroup } from '#/components/shared/ButtonGroup.tsx'
import { StepNav } from '#/components/shared/StepNav.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { usePrintShortcut } from '#/components/shared/usePrintShortcut.ts'
import { useResponsiveShell } from '#/components/shared/useResponsiveShell.ts'
import { useStepNavKeys } from '#/components/shared/useStepNavKeys.ts'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '#/components/ui/context-menu.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { CloseSheetDialog } from '#/components/shared/CloseSheetDialog.tsx'
import type { CloseIssue } from '#/components/shared/CloseSheetDialog.tsx'
import { ConfirmDialog } from '#/components/shared/ConfirmDialog.tsx'
import { DatePickerButton } from '#/components/form/fields.tsx'
import { useAuth } from '#/components/auth/AuthContext.tsx'
import { DENOM_SVG } from '#/assets/euros/index.ts'
import { capitalize, cn } from '#/lib/utils.ts'
import { errorMessage } from '#/lib/errors.ts'
import { useNavbarBadge, useNavbarSubtitle } from '#/lib/navbarSubtitle.ts'
import { printCaisseSheet } from '#/lib/caisse/pdf.ts'
import {
  computeEcarts,
  emptyInput,
  expected,
  fundEcart,
  fundTotal,
  hasCountedFund,
  inputToSheet,
  round2,
  sheetToInput,
} from '#/lib/caisse/calc.ts'
import { effectiveFundTarget, isCautionActiveOn } from '#/lib/caisse/cautions.ts'
import {
  fmtEcart,
  fmtEcartBare,
  fmtEur,
  fmtEurInt,
} from '#/lib/caisse/format.ts'
import {
  DENOMINATIONS,
  ECART_LABELS,
  EPSILON,
  FUND_TARGET,
  SHIFTS,
  SHIFT_LABELS,
  emptyCounts,
  paymentColumns,
} from '#/lib/caisse/constants.ts'
import {
  createCaution,
  deleteCaution,
  fetchAllCautions,
  fetchOldestSlot,
  fetchPreviousSheet,
  fetchRecentValidatedSlots,
  fetchSheet,
  reactivateCaution,
  refundCaution,
  reopenSheet,
  updateCaution,
  upsertSheet,
  validateSheet,
} from '#/lib/caisse/service.ts'
import { canActOnCaisseDay } from '#/lib/caisse/editability.ts'
import {
  currentSlot,
  dateStr,
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
import { fetchOldestServiceDate } from '#/lib/pdj/service.ts'
import { ALL_ROOMS } from '#/lib/hotel/rooms.ts'
import type {
  CaisseSheet,
  CaisseSheetInput,
  Caution,
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

// Date courte (« 15 août ») pour la liste des cautions : « depuis le … ».
const fmtDayShort = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
})

export function CaisseBoard({ initialDate }: { initialDate?: string }) {
  const { isNavbarMobile, isTouchDevice } = useResponsiveShell()
  const navigate = useNavigate()
  const { user, can, pageLevel } = useAuth()
  const queryClient = useQueryClient()

  // Instant de référence figé au montage : le shift courant et les bornes se
  // recalculent au même « maintenant », sans dériver d'un rendu à l'autre.
  const [now] = useState(() => new Date())

  // Slot initial (date + shift) déduit de l'heure : nuit 02–12, matin 12–21,
  // soir 21–02. Corrigé juste après par l'auto-sélection (shift déjà clôturé →
  // le suivant), une fois connue la liste des shifts validés.
  //
  // Arrivée via lien (`initialDate` fourni) : on cale sur cette date et un shift
  // stable (le premier), et l'auto-sélection est neutralisée (voir autoPickedRef).
  const [selectedDate, setSelectedDate] = useState(
    () => initialDate ?? currentSlot(now).date,
  )
  const [selectedShift, setSelectedShift] = useState<Shift>(() =>
    initialDate ? SHIFTS[0] : currentSlot(now).shift,
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
  const nowKey = slotKey(displaySlot.date, displaySlot.shift)
  const { data: oldestSlot } = useQuery({
    queryKey: ['caisse', 'oldest'],
    queryFn: fetchOldestSlot,
  })
  // Plus ancien jour ayant un rapport In-House (PDJ) : la caisse doit pouvoir
  // remonter jusque-là pour saisir les caisses historiques, même sans caisse
  // encore créée sur ces jours (le contenu de la caisse suit la dispo In-House).
  const { data: oldestServiceDate } = useQuery({
    queryKey: ['pdj', 'oldest-service-date'],
    queryFn: fetchOldestServiceDate,
  })
  const prevSlot = stepSlot(displaySlot.date, displaySlot.shift, -1)
  // Borne basse = le PLUS ANCIEN parmi : le shift juste avant (amorçage du fond),
  // le slot de caisse le plus ancien, et le 1er shift du plus ancien jour In-House.
  const lowerCandidates: Array<{ date: string; shift: Shift }> = [prevSlot]
  if (oldestSlot) lowerCandidates.push(oldestSlot)
  if (oldestServiceDate)
    lowerCandidates.push({ date: oldestServiceDate, shift: SHIFTS[0] })
  const lowerSlot = lowerCandidates.reduce((min, s) =>
    slotKey(s.date, s.shift) < slotKey(min.date, min.shift) ? s : min,
  )
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
  // Arrivée via lien : l'auto-sélection est déjà « consommée » au montage, elle
  // ne déplacera pas le slot vers le shift à remplir (on reste sur la date liée).
  const autoPickedRef = useRef(Boolean(initialDate))
  // Auto-sélection UNE fois, au premier chargement de la liste des shifts
  // validés : on avance sur le slot à remplir. Après ça (ou après une action de
  // l'hôtelier), on ne touche plus à sa sélection.
  useEffect(() => {
    if (autoPickedRef.current || userNavigatedRef.current) return
    if (validatedSlots === undefined) return // attendre la donnée
    autoPickedRef.current = true
    if (slotKey(displaySlot.date, displaySlot.shift) !== curKey)
      setSlot(displaySlot)
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
    if (k > nowKey) setSlot(displaySlot)
    else if (k < lowerKey) setSlot(lowerSlot)
    else setSelectedDate(v)
  }

  // ← / → naviguent shift par shift (bornés), Alt revient au shift courant.
  useStepNavKeys({
    onPrev: () => goStep(-1),
    onNext: () => goStep(1),
    onToday: () => {
      userNavigatedRef.current = true
      setSlot(displaySlot)
    },
    prevDisabled: atLowerBound,
    nextDisabled: atLatestSlot,
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)
  const [hotelierName, setHotelierName] = useState('')
  // Dialogue de caution, un seul état pour les deux usages (création / édition
  // d'une caution existante) — évite deux composants/prefills qui pourraient
  // diverger.
  const [cautionDialog, setCautionDialog] = useState<
    { mode: 'create' } | { mode: 'edit'; caution: Caution } | null
  >(null)
  const [confirmDeleteCautionId, setConfirmDeleteCautionId] = useState<
    string | null
  >(null)
  // Remboursement : action à conséquence réelle (cesse de majorer le fond
  // immédiatement, D3) et non ré-annulable depuis l'UI — un clic direct depuis
  // le menu contextuel est trop exposé au mis-clic. Passe donc, comme
  // « Supprimer », par une confirmation explicite.
  const [confirmRefundCautionId, setConfirmRefundCautionId] = useState<
    string | null
  >(null)
  // Remise en cours : annule un remboursement saisi par erreur — même exigence
  // de confirmation que « Rembourser », pour la même raison.
  const [confirmReactivateCautionId, setConfirmReactivateCautionId] = useState<
    string | null
  >(null)

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
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')

  const isValidated = sheet?.status === 'validated'
  // Prêt = feuille chargée ET, pour une nouvelle feuille, le report du fond de
  // caisse (feuille précédente) réglé — évite d'éditer avant hydratation. On
  // gate sur le CHARGEMENT (pas la donnée) : une requête « précédente » en échec
  // n'empêche pas la saisie (on repart alors d'un comptage vide).
  const ready = sheet !== undefined && !(needsCarry && prevLoading)
  const caisseLevel = pageLevel('caisse')
  // Jour métier courant (borne haute de la fenêtre). Verrou PAR JOUR, comme le
  // rapprochement mais plus court : écriture n'agit que dans la fenêtre J-1
  // (aujourd'hui et J-1) ; la gestion agit sur n'importe quel jour (cf.
  // lib/caisse/editability.ts).
  const todayDate = currentSlot(now).date
  const dayEditable = canActOnCaisseDay(selectedDate, todayDate, caisseLevel)
  const editable = ready && dayEditable
  const isWriter = can('caisse', 'ecriture')
  const isGestion = can('caisse', 'gestion')
  // Champs éditables UNIQUEMENT sur un brouillon : une caisse clôturée est
  // verrouillée (valeurs figées) pour tous, admin compris — il faut la réouvrir
  // pour la modifier.
  const canEditFields = editable && !isValidated

  // Cautions clients : TOUTES (actives ET remboursées, table de petite taille) —
  // nécessaire pour recalculer le fond effectif d'une date passée (D4). Le fond
  // attendu n'est JAMAIS une valeur stockée : il se recalcule en direct pour le
  // jour affiché, ce qui permet à une caution ajoutée en retard de corriger
  // automatiquement l'affichage d'une feuille déjà clôturée (voir
  // plan/caisse-cautions/00-INDEX.md, D4).
  const { data: cautions = [] } = useQuery({
    queryKey: ['caisse', 'cautions'],
    queryFn: fetchAllCautions,
  })
  const effectiveTarget = useMemo(
    () => effectiveFundTarget(cautions, selectedDate, FUND_TARGET),
    [cautions, selectedDate],
  )
  // Cautions VRAIMENT actives ce jour-là (composent le fond effectif affiché,
  // cf. closeIssues plus bas).
  const activeCautions = useMemo(
    () => cautions.filter((c) => isCautionActiveOn(c, selectedDate)),
    [cautions, selectedDate],
  )
  // Cautions à AFFICHER pour le jour affiché : les actives, PLUS celles
  // remboursées CE jour-là précisément (borne exclusive de isCautionActiveOn :
  // une caution remboursée aujourd'hui ne compte plus dans le fond dès
  // aujourd'hui, mais doit rester visible pour repérer une erreur de saisie du
  // jour et pouvoir la remettre en cours — sans ce deuxième critère, un
  // remboursement disparaîtrait aussitôt de l'écran).
  const visibleCautions = useMemo(
    () =>
      cautions.filter(
        (c) =>
          isCautionActiveOn(c, selectedDate) || c.refundedDate === selectedDate,
      ),
    [cautions, selectedDate],
  )
  // Caution ciblée par la confirmation en cours (rembourser ou supprimer) — sert
  // à afficher chambre + montant dans le texte de la modale, pour qu'un
  // mis-clic soit repéré avant validation, pas après.
  const cautionToRefund = cautions.find((c) => c.id === confirmRefundCautionId)
  const cautionToDelete = cautions.find((c) => c.id === confirmDeleteCautionId)
  const cautionToReactivate = cautions.find(
    (c) => c.id === confirmReactivateCautionId,
  )

  const ecarts = useMemo(() => computeEcarts(form), [form])
  // Dérivés du fond, mémoïsés ensemble : chaque frappe re-render le board, et sans
  // mémo ces calculs (dont `fundTotal`, une réduction sur 15 coupures) se rejouaient
  // à chaque touche. L'équilibre se lit désormais via `closeIssues` (verdict modal).
  // `total` (compté) INCLUT les cautions actives : ce sont des enveloppes
  // scellées au montant connu, jamais recomptées billet par billet dans la
  // grille des coupures — sans cet ajout, l'écart afficherait en permanence
  // -(cautions actives), même une caisse parfaitement équilibrée.
  const { total, fEcart } = useMemo(() => {
    const cautionsCash = activeCautions.reduce((s, c) => s + c.amount, 0)
    const counted = round2(fundTotal(form) + cautionsCash)
    return { total: counted, fEcart: fundEcart(counted, effectiveTarget) }
  }, [form, effectiveTarget, activeCautions])

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
      // Éditabilité du couple sauvegardé : jour dans la fenêtre (niveau + J-2).
      if (!canActOnCaisseDay(input.reportDate, todayDate, caisseLevel)) return
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
        if (mutationEpochRef.current === epoch)
          queryClient.setQueryData(qk, saved)
        if (active()) setSaveState('saved')
      } catch {
        // Rollback de l'optimiste — sauf si une mutation décisive (validation…)
        // a mis le cache à jour entre-temps : elle fait autorité.
        if (mutationEpochRef.current === epoch)
          queryClient.setQueryData(qk, prev ?? null)
        if (active()) {
          lastSavedRef.current = '' // autorise une nouvelle tentative
          setSaveState('error')
        }
      }
    },
    [queryClient, caisseLevel, todayDate],
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
  }, [
    sheet,
    needsCarry,
    emptyDraft,
    prevSheet,
    prevLoading,
    selectedDate,
    selectedShift,
    flush,
  ])

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

  // Titre daté : formatage Intl (relativement coûteux) mémoïsé sur la seule date,
  // pas rejoué à chaque frappe dans un champ.
  const titleDate = useMemo(
    () => capitalize(fmtTitle.format(new Date(selectedDate + 'T00:00:00'))),
    [selectedDate],
  )

  // Colonnes du tableau des paiements (web au matin et au soir, pas la nuit).
  const cols = useMemo(() => paymentColumns(form.shift), [form.shift])

  // Verdict du modal de clôture : une anomalie par écart non nul (paiements puis
  // fond), chacune expliquée pour un débutant. Non bloquant — cf. CloseSheetDialog.
  const closeIssues: CloseIssue[] = []
  for (const c of cols) {
    const gap = ecarts[c]
    if (Math.abs(gap) < EPSILON) continue
    closeIssues.push({
      title: `${ECART_LABELS[c]} : ${fmtEcart(gap)}`,
      detail:
        gap > 0
          ? `Il manque ${fmtEur(Math.abs(gap))} par rapport au montant attendu.`
          : `Il y a ${fmtEur(Math.abs(gap))} de trop par rapport au montant attendu.`,
    })
  }
  if (Math.abs(fEcart) >= EPSILON) {
    // Précision « (150 € + N caution(s) active(s)) » quand une caution majore la
    // cible — sinon le montant seul (450 € par ex.) ne s'explique pas de lui-même.
    const targetLabel =
      effectiveTarget > FUND_TARGET
        ? `${fmtEurInt(effectiveTarget)} (${fmtEurInt(FUND_TARGET)} + ${activeCautions.length} caution${activeCautions.length > 1 ? 's' : ''} active${activeCautions.length > 1 ? 's' : ''})`
        : fmtEurInt(effectiveTarget)
    closeIssues.push({
      title: `Fond de caisse : ${fmtEcart(fEcart)}`,
      detail: !hasCountedFund(form)
        ? `Le fond n'a pas été compté. Il devrait être à ${targetLabel}.`
        : fEcart > 0
          ? `Le fond compté dépasse de ${fmtEur(Math.abs(fEcart))} le niveau normal (${targetLabel}).`
          : `Il manque ${fmtEur(Math.abs(fEcart))} dans le fond (${targetLabel} attendus).`,
    })
  }
  // Un écart sans commentaire est la seule anomalie invisible ailleurs : on invite
  // à l'expliquer (sans bloquer la clôture).
  const closeHint =
    closeIssues.length > 0 && form.comment.trim() === ''
      ? 'Pense à justifier ces écarts dans le commentaire.'
      : undefined

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

  // Tabulation en COLONNE (haut→bas, puis colonne suivante) au lieu de l'ordre
  // DOM d'un tableau (ligne par ligne). Chaque champ de montant porte un
  // `data-taborder` = colonne × 3 + ligne ; sur Tab / Shift+Tab on trie ces
  // index et on cycle au voisin. Le focus BOUCLE dans la carte (après le
  // dernier champ on revient au premier, et inversement) : la tabulation reste
  // piégée dans la grille des montants, sans partir ailleurs dans la page.
  // Robuste aux cellules absentes (Lightspeed n'a pas de « web ») et aux champs
  // désactivés (feuille clôturée) : simplement filtrés.
  const handleGridTab = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Tab') return
    const host = e.currentTarget.closest('[data-money-grid]')
    if (!host) return
    const inputs = Array.from(
      host.querySelectorAll<HTMLInputElement>('input[data-taborder]'),
    )
      .filter((el) => !el.disabled)
      .sort((a, b) => Number(a.dataset.taborder) - Number(b.dataset.taborder))
    cycleFocus(e, inputs)
  }

  // Même principe pour la grille des coupures (billets & pièces) : le focus
  // boucle dans la carte et ne visite que les champs de comptage — les boutons
  // +/− sont hors tabulation (tabIndex -1). L'ordre suit le DOM, qui reproduit
  // déjà l'ordre visuel colonne par colonne du gabarit bureau (grid-flow-col).
  const handleDenomTab = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Tab') return
    const host = e.currentTarget.closest('[data-denom-grid]')
    if (!host) return
    const inputs = Array.from(
      host.querySelectorAll<HTMLInputElement>('input[data-denom-cell]'),
    ).filter((el) => !el.disabled)
    cycleFocus(e, inputs)
  }

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
      await validateSheet(saved.id)
    })
  }

  function handleReopen() {
    if (!sheet) return
    if (!window.confirm('Réouvrir cette caisse clôturée ?')) return
    return guard(() => reopenSheet(sheet.id))
  }

  // Cautions clients : prise, édition, remboursement (immédiat, D3), suppression
  // (erreur de saisie, réservée gestion). TOUTES verrouillées par `canEditFields` —
  // même règle que le reste de la page (une caisse clôturée est figée pour tous,
  // gestion comprise, jusqu'à réouverture) : autrement il serait étrange de
  // pouvoir encore toucher aux cautions d'un shift déjà clôturé à l'écran.
  // Invalident toutes le même cache — la cible affichée (effectiveTarget) suit
  // sans jamais toucher aux feuilles de caisse.
  const invalidateCautions = () =>
    queryClient.invalidateQueries({ queryKey: ['caisse', 'cautions'] })

  async function handleSubmitCaution(input: {
    room: number
    amount: number
    comment: string
  }) {
    if (!isWriter || !canEditFields || !cautionDialog) return
    if (cautionDialog.mode === 'edit') {
      const id = cautionDialog.caution.id
      setCautionDialog(null)
      try {
        await updateCaution(id, input)
        await invalidateCautions()
      } catch (err) {
        setError(`Modification de la caution refusée ou échouée : ${errorMessage(err)}`)
      }
      return
    }
    // Garde-fou : une caution ne peut pas être prise dans le FUTUR (le
    // remboursement, lui, est toujours horodaté à aujourd'hui réel — une
    // caution future violerait la contrainte refunded_date >= taken_date au
    // premier remboursement). Comparaison à la vraie date calendaire du jour
    // (`dateStr(now)`), PAS à `todayDate` : ce dernier suit le rattachement de
    // shift (la nuit 02h-12h reste datée la veille) et retarde d'un jour tant
    // qu'on est le matin — même quand le shift affiché a déjà avancé sur
    // aujourd'hui (nuit de la veille déjà clôturée). Comparer à `todayDate`
    // rejetait alors à tort une caution prise sur le matin du jour même.
    if (selectedDate > dateStr(now)) {
      setError('Impossible de prendre une caution à une date future.')
      return
    }
    setCautionDialog(null)
    try {
      await createCaution({ ...input, takenDate: selectedDate })
      await invalidateCautions()
    } catch (err) {
      setError(`Ajout de la caution refusé ou échoué : ${errorMessage(err)}`)
    }
  }

  function handleRefundCaution() {
    if (!isWriter || !canEditFields || !confirmRefundCautionId) return
    const id = confirmRefundCautionId
    setConfirmRefundCautionId(null)
    // Vraie date calendaire (comme la garde-fou de création, cf. handleSubmitCaution) :
    // `todayDate` retarde d'un jour tant qu'on est le matin et que la nuit de la
    // veille n'est pas close.
    refundCaution(id, dateStr(now))
      .then(invalidateCautions)
      .catch((err) =>
        setError(`Remboursement refusé ou échoué : ${errorMessage(err)}`),
      )
  }

  function handleReactivateCaution() {
    if (!isWriter || !canEditFields || !confirmReactivateCautionId) return
    const id = confirmReactivateCautionId
    setConfirmReactivateCautionId(null)
    reactivateCaution(id)
      .then(invalidateCautions)
      .catch((err) =>
        setError(`Remise en cours refusée ou échouée : ${errorMessage(err)}`),
      )
  }

  function handleDeleteCaution() {
    if (!canEditFields || !confirmDeleteCautionId) return
    // Miroir exact de la RLS (caisse_cautions_delete_ecriture_same_day.sql) :
    // gestion à tout moment, écriture SEULEMENT le jour même de la prise.
    const target = cautions.find((c) => c.id === confirmDeleteCautionId)
    if (!target || !(isGestion || target.takenDate === dateStr(now))) return
    const id = confirmDeleteCautionId
    setConfirmDeleteCautionId(null)
    deleteCaution(id)
      .then(invalidateCautions)
      .catch((err) =>
        setError(`Suppression refusée ou échouée : ${errorMessage(err)}`),
      )
  }

  // Génère le MÊME PDF, souris ou tactile. Sur tactile, la plupart des
  // navigateurs mobiles ne rendent aucune visionneuse PDF dans l'iframe
  // caché (souris) : `autoPrint()` n'y déclenche rien, le bouton semblait ne
  // rien faire. On ouvre donc ce même PDF dans un nouvel onglet VISIBLE —
  // `window.open` synchrone avec le clic (avant tout `await`), sinon le
  // bloqueur de popups l'annule (cf. lib/print/openPdf.ts).
  const [pdfBusy, setPdfBusy] = useState(false)
  const handlePrint = async () => {
    const target = isTouchDevice ? window.open('', '_blank') : undefined
    setPdfBusy(true)
    setError('')
    try {
      const [yr, mo, da] = selectedDate.split('-')
      await printCaisseSheet(
        {
          titleDate,
          form,
          operatorInitials: sheet?.operatorInitials || form.operatorInitials,
          effectiveFundTarget: effectiveTarget,
          activeCautions,
        },
        `Caisse_${da}-${mo}-${yr}_${form.shift}`,
        target,
      )
    } catch (err) {
      setError(`Impression du PDF impossible : ${errorMessage(err)}`)
    } finally {
      setPdfBusy(false)
    }
  }

  // Ctrl+P emprunte la même porte que le bouton. Feuille non clôturée → ne
  // fait rien, comme un bouton désactivé.
  usePrintShortcut(() => {
    if (pdfBusy || !isValidated) return
    void handlePrint()
  })

  /* Bouton d'état de la feuille, rendu en bas de page (sous les commentaires),
     là où se termine la saisie : Réouvrir si la feuille est clôturée et
     `editable` (gestion à tout moment, OU écriture dans la fenêtre J-2),
     Verrouillé sinon (écriture hors fenêtre), Clôturer sur un brouillon éditable.

     Le poids visuel suit l'intention : clôturer est la SUITE du travail (bouton
     plein), réouvrir en est le RETOUR EN ARRIÈRE (contour vert, comme la
     pastille d'en-tête), verrouillé en est le refus (contour rouge). Texte seul :
     le libellé dit déjà l'action, une icône n'y ajoutait rien. */
  // Échelle des quatre issues (au lieu d'un ternaire imbriqué) : non-rédacteur →
  // rien ; brouillon éditable → Clôturer ; clôturée + éditable → Réouvrir ;
  // clôturée hors droits → Verrouillé.
  const stateAction = (() => {
    if (!isWriter) return null
    if (!isValidated) {
      if (!editable) return null
      return (
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
    }
    if (editable) {
      return (
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
      )
    }
    // Bouton désactivé : Radix ne verrait aucun survol dessus, d'où le span
    // porteur. C'est ici que l'infobulle compte le plus — elle est la seule à
    // dire POURQUOI la réouverture est refusée.
    return (
      <Tip label="Réouverture réservée à la gestion (caisse trop ancienne)">
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
  })()

  const title = `${titleDate} (${SHIFT_LABELS[form.shift].toLowerCase()})`
  // Sous 1024px, le jour+shift vit dans la Navbar globale (sous-titre, à côté
  // du hamburger) — le titre de page s'efface d'autant pour ne pas le répéter,
  // même mécanisme que Rapprochement (seuil VOLONTAIREMENT identique à celui
  // de la Navbar, cf. `isNavbarMobile` = `useResponsiveShell`).
  useNavbarSubtitle(isNavbarMobile ? title : null)
  // Même mécanisme pour la pastille de statut : posée à la fois dans la Navbar
  // (< 1024px) et dans l'en-tête de page (≥ 1024px), un seul des deux visible à
  // la fois (cf. PageHeader). Attendre `ready` : sans feuille chargée,
  // `isValidated` vaut faux par défaut et la pastille afficherait « Ouverte »
  // avant de se contredire.
  const statusBadge = ready && (
    <LockBadge
      locked={isValidated}
      label={isValidated ? 'Clôturée' : 'Ouverte'}
      compact
      hint={
        isValidated
          ? 'Montants figés. Réouvrez la feuille pour les modifier.'
          : 'Saisie en cours, enregistrée automatiquement.'
      }
    />
  )
  useNavbarBadge(isNavbarMobile ? statusBadge : null)

  return (
    <div
      className={cn(
        'caisse-doc mx-auto flex w-full min-w-0 max-w-5xl flex-1 flex-col gap-4 print:max-w-none',
        // `print:pb-0` : la réserve pour la barre d'outils basse fixe n'a de
        // sens qu'à l'écran (elle-même `print:hidden`, cf. MobileToolbar) —
        // sans lui, un espace vide inutile s'ajoutait au document imprimé.
        isTouchDevice && 'pb-20 print:pb-0',
      )}
    >
      {/* En-tête compact, impression tactile uniquement (cf. caisse.css) —
          la barre de titre écran (PageHeader) est déjà print:hidden. */}
      <div className="caisse-header">
        <h1>Feuille de caisse</h1>
        <span className="caisse-header-date">{titleDate}</span>
        <span className="caisse-header-shift">
          {SHIFT_LABELS[form.shift]}
        </span>
      </div>

      <PageHeader
        // Sous 1024px, `undefined` (pas un masquage CSS) : la ligne titre ne
        // réserve plus sa hauteur — cf. commentaire useNavbarSubtitle ci-dessus.
        title={isNavbarMobile ? undefined : title}
        badgeAlign="end"
        badge={isNavbarMobile ? undefined : statusBadge}
        // Sur écran tactile, ce groupe entier laisse la place à la barre
        // d'outils basse fixe (cf. fin du composant), comme Rapprochement.
        // `undefined` (pas un `hidden` CSS) : PageHeader ne rend alors
        // littéralement rien pour ce prop.
        actions={
          isTouchDevice ? undefined : (
            <>
              {/* Bouton « Caution » — exceptionnellement du texte + icône « + » :
                  ouvre le dialogue de saisie (chambre, montant, commentaire). Une
                  caution active majore le fond de caisse attendu (cf. carte
                  « Fond de caisse » plus bas) tant qu'elle n'est pas remboursée.
                  Désactivé sur une caisse clôturée — comme tout le reste de la
                  page, il faut la réouvrir pour y toucher.
                  Réservé au bureau à la souris : créer une caution est une
                  action PONCTUELLE, pas une navigation répétée comme
                  Préc./Suiv./Imprimer — volontairement absente de la barre
                  d'outils basse tactile (cf. plan/responsive-tactile-multi-
                  pages/6-caisse-board-jour.md). */}
              {isWriter &&
                (canEditFields ? (
                  <Tip label="Ajouter une caution client">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCautionDialog({ mode: 'create' })}
                    >
                      <Plus />
                      Caution
                    </Button>
                  </Tip>
                ) : (
                  <Tip label="Caisse clôturée : réouvrez-la pour gérer les cautions">
                    <span tabIndex={0}>
                      <Button variant="outline" size="sm" disabled>
                        <Plus />
                        Caution
                      </Button>
                    </span>
                  </Tip>
                ))}
              {/* Groupe « actions de page » : vue analytique + impression. */}
              <ButtonGroup>
                {/* 0) Vue analytique : synthèse mensuelle en lecture (tous rôles). */}
                <Tip label="Vue analytique">
                  <Button asChild variant="outline" size="icon-sm">
                    <Link to="/caisse/analytique" aria-label="Vue analytique">
                      <LineChart />
                    </Link>
                  </Button>
                </Tip>
                {/* 1) Impression : toujours présente, mais désactivée tant que la
                    caisse n'est pas clôturée — le document ne s'imprime qu'une fois
                    les montants figés. L'infobulle porte alors la raison. */}
                <PrintButton
                  onClick={handlePrint}
                  iconOnly
                  disabled={!isValidated || pdfBusy}
                  tipLabel={
                    isValidated
                      ? 'Imprimer / PDF'
                      : 'Clôturez la caisse pour imprimer la feuille'
                  }
                />
              </ButtonGroup>
              {/* Groupe « navigation temporelle », collé au bord droit.
                  `enlargeOnNarrow={false}` sur les deux : ce groupe n'est
                  JAMAIS montré sur écran tactile (barre basse dédiée dès
                  qu'un doigt est détecté, cf. plus haut) — l'agrandir à un
                  simple rétrécissement de fenêtre désaccorderait sa taille de
                  celle des boutons voisins, restés fixes. */}
              <StepNav
                onPrev={() => goStep(-1)}
                onNext={() => goStep(1)}
                prevLabel="Shift précédent"
                nextLabel="Shift suivant"
                prevDisabled={atLowerBound}
                nextDisabled={atLatestSlot}
                enlargeOnNarrow={false}
              >
                <DatePickerButton
                  value={selectedDate}
                  onChange={goDate}
                  min={lowerSlot.date}
                  max={displaySlot.date}
                  todayValue={displaySlot.date}
                  ariaLabel="Choisir un jour"
                  enlargeOnNarrow={false}
                />
              </StepNav>
            </>
          )
        }
        // Toujours collées ensemble au bord droit, jamais écartées aux deux
        // bords même en fenêtre étroite : ce groupe n'existe que côté souris
        // (cf. `isTouchDevice` ci-dessus) — le repli « aux deux bords », pensé
        // pour la portée du pouce sur téléphone, n'a ici aucune raison d'être.
        actionsAlign="end"
      />

      {sheetError && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive print:hidden">
          Impossible de charger cette feuille (connexion ?). Réessayez en
          changeant de shift puis en revenant.
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive print:hidden">
          {error}
        </div>
      )}

      {!ready ? (
        // Squelette-reflet pendant le chargement : reprend la VRAIE ossature du
        // tableau des montants (en-têtes invariants + `cols`, qui inclut la
        // colonne « web » du soir), la vraie grille des dénominations et la carte
        // commentaires — mêmes paddings, mêmes hauteurs d'input, même 500 € pleine
        // largeur sur mobile — pour ne rien décaler. Rendre le corps seulement une
        // fois `ready` supprime le flash « valeurs vides → hydratées ». En-tête et
        // LockBadge restent gérés au-dessus.
        <>
          <div
            className="caisse-table overflow-x-auto rounded-xl border border-border bg-card"
            aria-hidden="true"
          >
            <table className="w-full table-fixed border-collapse text-sm">
              <thead>
                <AmountsThead cols={cols} />
              </thead>
              <tbody>
                {Array.from({ length: 3 }).map((_, r) => (
                  <tr key={r} className="border-b border-border/60">
                    <td className="px-3 py-2">
                      <Skeleton className="h-4 w-24" />
                    </td>
                    {cols.map((c) => (
                      <td key={c} className="px-2 py-1">
                        <Skeleton className="h-9 w-full rounded-md" />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-border bg-muted/30">
                  <td className="px-3 py-1.5">
                    <Skeleton className="h-4 w-16" />
                  </td>
                  {cols.map((c) => (
                    <td key={c} className="px-3 py-1.5">
                      <Skeleton className="ml-auto h-4 w-12" />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <div
            className="rounded-xl border border-border bg-card p-3"
            aria-hidden="true"
          >
            <div className="caisse-denoms grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-flow-col lg:grid-cols-5 lg:grid-rows-3">
              {DENOMINATIONS.map((d) => (
                <Skeleton
                  key={d.key}
                  className={cn(
                    'h-[5.5rem] rounded-lg',
                    d.key === 'cnt_500' && 'col-span-2 sm:col-span-1',
                  )}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>

          {/* Zone commentaire FLEXIBLE : même bornage que le contenu réel
              (flex-1 + plancher) pour ne rien décaler au passage au contenu. */}
          <div
            className="flex flex-1 flex-col rounded-xl border border-border bg-card p-3"
            aria-hidden="true"
          >
            <Skeleton className="mb-2 h-4 w-28" />
            <Skeleton className="min-h-16 w-full flex-1 rounded-md" />
          </div>
        </>
      ) : (
        <>
          {/* Tableau des montants + écarts (défile horizontalement si étroit).
          `data-money-grid` : périmètre de la tabulation en colonne (handleGridTab). */}
          <div
            data-money-grid
            className="caisse-table overflow-x-auto rounded-xl border border-border bg-card"
          >
            <table className="w-full table-fixed border-collapse text-sm">
              <thead>
                <AmountsThead cols={cols} />
              </thead>
              <tbody>
                <AmountRow
                  label="STAY N' TOUCH"
                  rowIndex={0}
                  onCellKeyDown={handleGridTab}
                  cols={cols}
                  disabled={!canEditFields}
                  // Seule ligne à accepter un montant négatif (remboursement,
                  // correction) : Lightspeed et Dépôt restent positifs.
                  allowNegative
                  value={(c) =>
                    c === 'web' ? form.snt.cbweb : form.snt[c as PayKey]
                  }
                  onChange={(c, v) =>
                    c === 'web' ? setSnt('cbweb', v) : setSnt(c as PayKey, v)
                  }
                />
                <AmountRow
                  label="LIGHTSPEED"
                  rowIndex={1}
                  onCellKeyDown={handleGridTab}
                  cols={cols}
                  disabled={!canEditFields}
                  value={(c) => (c === 'web' ? null : form.ls[c as PayKey])}
                  onChange={(c, v) => c !== 'web' && setLs(c as PayKey, v)}
                />
                <AmountRow
                  label="DÉPÔT"
                  rowIndex={2}
                  onCellKeyDown={handleGridTab}
                  cols={cols}
                  disabled={!canEditFields}
                  value={(c) =>
                    c === 'web' ? form.caisse.adyen : form.caisse[c as PayKey]
                  }
                  onChange={(c, v) =>
                    c === 'web'
                      ? setCaisse('adyen', v)
                      : setCaisse(c as PayKey, v)
                  }
                  // Double-clic : reporte la somme attendue des deux lignes du
                  // dessus (StayNTouch + Lightspeed) pour la colonne. `expected`
                  // arrondit au centime (pas d'addition flottante brute → plus de
                  // « 0,30000000000000004 ») et gère le cas « web » (cbweb seul).
                  onFill={(c) => expected(form, c)}
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
          <div className="caisse-card rounded-xl border border-border bg-card p-3">
            <div
              data-denom-grid
              className="caisse-denoms grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-flow-col lg:grid-cols-5 lg:grid-rows-3"
            >
              {DENOMINATIONS.map((d) => {
                const n = form.counts[d.key] ?? 0
                const filled = n > 0
                return (
                  <div
                    key={d.key}
                    className={cn(
                      'flex items-stretch overflow-hidden rounded-lg border transition-colors',
                      filled
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border bg-muted/20',
                      // 500 € en pleine largeur sur mobile (2 cols) : équilibre les
                      // 14 cartes restantes en 7 rangées de 2. Sans effet dès sm.
                      d.key === 'cnt_500' && 'col-span-2 sm:col-span-1',
                    )}
                  >
                    {/* Bouton « − » pleine hauteur, à gauche */}
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={`Retirer un ${d.label}`}
                      disabled={!canEditFields}
                      onClick={() => bumpCount(d.key, -1)}
                      className="flex flex-1 items-center justify-center border-r border-border/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30 print:hidden"
                    >
                      <Minus className="size-4" />
                    </button>
                    {/* Colonne centrale : quantité, puis visuel du billet / de la
                    pièce (estompé tant que rien n'est compté), puis sous-total. */}
                    <div className="flex flex-[1.6] flex-col items-center justify-center gap-1.5 px-1 py-1">
                      <CountInput
                        value={n}
                        disabled={!canEditFields}
                        onChange={(v) => setCount(d.key, v)}
                        onKeyDown={handleDenomTab}
                      />
                      <div className="flex h-8 items-center justify-center">
                        <img
                          src={DENOM_SVG[d.key]}
                          alt={d.label}
                          draggable={false}
                          className={cn(
                            'max-h-full w-auto select-none drop-shadow-sm transition-opacity',
                            // Pièce (< 5 €) un peu plus haute que le billet pour l'équilibre.
                            d.value < 5 ? 'h-8' : 'h-7',
                            !filled && 'opacity-40',
                          )}
                        />
                      </div>
                      <span
                        className={cn(
                          'whitespace-nowrap text-[11px] leading-none tabular-nums',
                          filled
                            ? 'font-medium text-foreground'
                            : 'text-muted-foreground',
                        )}
                      >
                        {d.value < 1
                          ? fmtEur(d.value * n)
                          : fmtEurInt(d.value * n)}
                      </span>
                    </div>
                    {/* Bouton « + » pleine hauteur, à droite */}
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={`Ajouter un ${d.label}`}
                      disabled={!canEditFields}
                      onClick={() => bumpCount(d.key, 1)}
                      className="flex flex-1 items-center justify-center border-l border-border/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30 print:hidden"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Fond de caisse {fmtEurInt(effectiveTarget)}
              </span>
              <span
                className={cn(
                  'tabular-nums font-medium',
                  Math.abs(fEcart) < EPSILON
                    ? 'text-emerald-500'
                    : 'text-destructive',
                )}
              >
                {fmtEur(total)} ({fmtEcart(fEcart)})
              </span>
            </div>
          </div>

          {/* Cautions du jour affiché : les actives (chambre, montant,
              commentaire libre), plus celles remboursées CE jour précisément
              (pour repérer une erreur et pouvoir les remettre en cours). Clic
              droit (menu contextuel) pour agir. Carte absente s'il n'y a rien
              à montrer. */}
          {visibleCautions.length > 0 && (
            <div
              className={cn(
                'caisse-card rounded-xl border border-border bg-card p-3',
                // À l'impression, seules les cautions ACTIVES comptent (même
                // périmètre que `activeCautions` du PDF jsPDF) : si la liste
                // écran ne contient que des remboursées du jour, la carte
                // entière n'a rien à montrer sur le document.
                activeCautions.length === 0 && 'print:hidden',
              )}
            >
              <div className="mb-2.5 flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold">Cautions</h2>
                <span className="text-xs text-muted-foreground print:hidden">
                  Clic droit, ou le bouton ⋮, pour agir
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                {visibleCautions.map((c) => {
                  // Rien à proposer (caisse clôturée, ou rôle lecture seule) :
                  // pas de menu DU TOUT plutôt qu'un menu vide (gestion implique
                  // toujours écriture dans ce modèle de rôles, donc `isWriter`
                  // seul suffit à couvrir les 3 actions).
                  const hasActions = isWriter && canEditFields
                  // Remise en cours proposée UNIQUEMENT le jour même du
                  // remboursement (c'est la raison d'être de cette liste élargie :
                  // repérer et corriger une erreur de la journée) — jamais depuis
                  // une date PASSÉE où la caution apparaît encore active (D4).
                  const refundedToday =
                    hasActions &&
                    c.status === 'refunded' &&
                    c.refundedDate === selectedDate
                  // Suppression : gestion à tout moment, écriture SEULEMENT le
                  // jour même de la prise (miroir exact de la policy RLS,
                  // supabase/caisse_cautions_delete_ecriture_same_day.sql) — une
                  // caution plus ancienne « court » déjà sur plusieurs feuilles,
                  // potentiellement closes ; au-delà, seule la gestion supprime.
                  const canDelete =
                    hasActions && (isGestion || c.takenDate === dateStr(now))
                  // Descripteurs d'action UNIQUES, rendus ensuite par DEUX menus
                  // distincts (clic droit ET bouton ⋮ visible) : le clic droit
                  // reste le réflexe souris/desktop, le bouton est l'équivalent
                  // tactile/clavier — sans lui, ces actions n'étaient joignables
                  // par aucun des deux (contrainte produit confirmée). Les deux
                  // primitives Radix (ContextMenu/DropdownMenu) exigent chacune
                  // leur propre composant Item : un seul tableau de données évite
                  // de dupliquer le TEXTE et la LOGIQUE, pas le rendu lui-même.
                  const menuActions = hasActions
                    ? [
                        {
                          key: 'edit',
                          icon: <Pencil />,
                          label: 'Modifier',
                          onSelect: () =>
                            setCautionDialog({ mode: 'edit', caution: c }),
                        },
                        // Une caution déjà remboursée peut rester listée ici pour
                        // une date PASSÉE antérieure à son remboursement (D4) —
                        // « Rembourser » ne doit alors PAS réapparaître : la
                        // recliquer écraserait silencieusement `refunded_date`
                        // par une date plus tardive, décalant la cascade.
                        ...(c.status === 'active'
                          ? [
                              {
                                key: 'refund',
                                icon: <Undo2 />,
                                label: 'Rembourser',
                                onSelect: () =>
                                  setConfirmRefundCautionId(c.id),
                              },
                            ]
                          : []),
                        ...(refundedToday
                          ? [
                              {
                                key: 'reactivate',
                                icon: <Undo2 />,
                                label: 'Remettre en cours',
                                onSelect: () =>
                                  setConfirmReactivateCautionId(c.id),
                              },
                            ]
                          : []),
                        ...(canDelete
                          ? [
                              {
                                key: 'delete',
                                icon: <Trash2 />,
                                label: 'Supprimer',
                                onSelect: () =>
                                  setConfirmDeleteCautionId(c.id),
                                destructive: true,
                                separatorBefore: true,
                              },
                            ]
                          : []),
                      ]
                    : []
                  const row = (
                    // Une seule ligne, colonnes bien distinctes (chambre /
                    // montant / commentaire / date [/ actions]), séparées par un
                    // liseré vertical — le commentaire seul est flexible et
                    // tronqué (`min-w-0` + `truncate`), tout le reste garde sa
                    // largeur naturelle sans jamais passer à la ligne. `key`
                    // porté ICI (pas sur un wrapper) : sans actions, cet <li> est
                    // renvoyé TEL QUEL comme enfant direct de <ul> — jamais de
                    // <div> autour (invalide en HTML dans une liste).
                    <li
                      key={c.id}
                      className={cn(
                        'grid items-center gap-4 rounded-lg bg-muted/30 px-3.5 py-2.5 transition-colors',
                        hasActions
                          ? 'grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] cursor-context-menu hover:bg-muted/60'
                          : 'grid-cols-[auto_auto_minmax(0,1fr)_auto]',
                        // Remboursée : hors périmètre du document imprimé
                        // (cf. gate `activeCautions` ci-dessus).
                        c.status === 'refunded' && 'print:hidden',
                      )}
                    >
                      <span className="flex items-center gap-2 whitespace-nowrap text-base font-semibold">
                        Chambre {c.room}
                        {c.status === 'refunded' && (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                            Remboursée
                          </span>
                        )}
                      </span>
                      <span className="whitespace-nowrap border-l border-border/60 pl-4">
                        <span className="inline-flex items-center rounded-md bg-indigo-500/10 px-2 py-0.5 tabular-nums font-semibold text-indigo-600 dark:text-indigo-400">
                          {fmtEur(c.amount)}
                        </span>
                      </span>
                      <span className="min-w-0 truncate border-l border-border/60 pl-4 text-sm text-muted-foreground">
                        {c.comment || '—'}
                      </span>
                      <span className="whitespace-nowrap border-l border-border/60 pl-4 text-xs text-muted-foreground">
                        depuis le {fmtDayShort.format(new Date(c.takenDate + 'T00:00:00'))}
                      </span>
                      {/* Équivalent tactile/clavier du clic droit — seul moyen
                          d'atteindre ce menu sans souris. `stopPropagation` :
                          un clic ici ne doit pas déclencher le menu contextuel
                          du parent. */}
                      {hasActions && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label="Actions sur cette caution"
                              onClick={(e) => e.stopPropagation()}
                              className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                            >
                              <MoreVertical className="size-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            {menuActions.map((a) => (
                              <Fragment key={a.key}>
                                {a.separatorBefore && <DropdownMenuSeparator />}
                                <DropdownMenuItem
                                  variant={a.destructive ? 'destructive' : undefined}
                                  onSelect={a.onSelect}
                                >
                                  {a.icon}
                                  {a.label}
                                </DropdownMenuItem>
                              </Fragment>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </li>
                  )
                  if (!hasActions) return row
                  return (
                    <ContextMenu key={c.id}>
                      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
                      <ContextMenuContent className="w-48">
                        {menuActions.map((a) => (
                          <Fragment key={a.key}>
                            {a.separatorBefore && <ContextMenuSeparator />}
                            <ContextMenuItem
                              variant={a.destructive ? 'destructive' : undefined}
                              onSelect={a.onSelect}
                            >
                              {a.icon}
                              {a.label}
                            </ContextMenuItem>
                          </Fragment>
                        ))}
                      </ContextMenuContent>
                    </ContextMenu>
                  )
                })}
              </ul>
            </div>
          )}

          {/* Commentaires (juste en dessous du fond de caisse).
          Carte FLEXIBLE : elle absorbe la place restante de la page et sert de
          variable d'ajustement, comme le Rapprochement. `flex flex-1 flex-col`
          la fait grandir et empile titre + champ ; le bouton de clôture reste
          collé en bas quand tout tient. Sur une fenêtre courte, le champ se
          réduit jusqu'à son plancher `min-h-16` (jamais 0, jamais invisible),
          puis c'est la page qui défile (conteneur racine sans `min-h-0`). */}
          <div className="caisse-card flex flex-1 flex-col rounded-xl border border-border bg-card p-3">
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
              onChange={(e) =>
                setForm((f) => ({ ...f, comment: e.target.value }))
              }
              placeholder="Justification d'un éventuel écart…"
              // Hauteur FLEXIBLE : `flex-1` fait absorber la place restante de la
              // carte, `min-h-16` est le plancher, `resize-none` retire la poignée
              // (et neutralise le `field-sizing-content` de la primitive, qui
              // étirait le champ à mesure qu'on écrivait).
              className="min-h-16 flex-1 resize-none print:hidden"
            />
            {/* Impression tactile : le rendu papier d'un <textarea> désactivé
                est trop peu fiable selon le navigateur — texte brut à la place. */}
            <div className="caisse-print-comment hidden print:block">
              {form.comment.trim() || '—'}
            </div>
          </div>

          {/* Actions — le bouton d'état ferme la page, sous la saisie. */}
          {isWriter && (
            <div className="flex flex-col gap-2 print:hidden">
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
        </>
      )}

      {/* Modal de clôture : verdict didactique + nom de l'hôtelier + clôture. */}
      <CloseSheetDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        title="Clôturer la caisse"
        subtitle={`${titleDate} — ${SHIFT_LABELS[form.shift]}`}
        issues={closeIssues}
        okTitle="Caisse équilibrée"
        okReason={`Les montants comptés correspondent aux encaissements attendus, et le fond est à ${fmtEurInt(effectiveTarget)}.`}
        hint={closeHint}
        hotelierName={hotelierName}
        onHotelierNameChange={setHotelierName}
        onConfirm={handleConfirmClose}
        busy={busy}
      />

      <CautionDialog
        state={cautionDialog}
        onOpenChange={(open) => {
          if (!open) setCautionDialog(null)
        }}
        onSubmit={handleSubmitCaution}
      />

      <ConfirmDialog
        open={confirmRefundCautionId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRefundCautionId(null)
        }}
        title="Rembourser cette caution ?"
        description={
          cautionToRefund
            ? `Chambre ${cautionToRefund.room} — ${fmtEur(cautionToRefund.amount)}. Le fond de caisse attendu cesse aussitôt d'en tenir compte.`
            : undefined
        }
        confirmLabel="Rembourser"
        onConfirm={handleRefundCaution}
      />

      <ConfirmDialog
        open={confirmDeleteCautionId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteCautionId(null)
        }}
        title="Supprimer cette caution ?"
        description={
          (cautionToDelete
            ? `Chambre ${cautionToDelete.room} — ${fmtEur(cautionToDelete.amount)}. `
            : '') +
          'Réservé à la correction d’une erreur de saisie — pour une caution normalement rendue, utilisez plutôt « Rembourser ».'
        }
        confirmLabel="Supprimer"
        destructive
        onConfirm={handleDeleteCaution}
      />

      <ConfirmDialog
        open={confirmReactivateCautionId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmReactivateCautionId(null)
        }}
        title="Remettre cette caution en cours ?"
        description={
          cautionToReactivate
            ? `Chambre ${cautionToReactivate.room} — ${fmtEur(cautionToReactivate.amount)}. Annule le remboursement du jour ; le fond de caisse attendu la comptera de nouveau.`
            : undefined
        }
        confirmLabel="Remettre en cours"
        onConfirm={handleReactivateCaution}
      />

      {/* Barre d'outils basse (écran tactile uniquement, peu importe la
          largeur — téléphone OU tablette) : même patron que Rapprochement.
          Préc./Suiv. avancent d'un SHIFT (matin → soir → nuit → lendemain, via
          `goStep`/`stepSlot`), PAS d'un jour civil — décision produit tranchée
          (plan/responsive-tactile-multi-pages/00-INDEX.md, D2), pas de
          sélecteur de shift dédié à construire. Le bouton « Caution » n'y
          figure pas : action ponctuelle (création), pas une navigation
          répétée — elle reste réservée à l'en-tête desktop (cf. plus haut). */}
      <MobileToolbar visible={isTouchDevice}>
        <ToolbarCell
          icon={<ChevronLeft className="size-5" />}
          label="Préc."
          ariaLabel="Shift précédent"
          onClick={() => goStep(-1)}
          disabled={atLowerBound}
          bordered={false}
        />
        <ToolbarCell
          icon={<LineChart className="size-5" />}
          label="Analytique"
          ariaLabel="Vue analytique"
          onClick={() => navigate({ to: '/caisse/analytique' })}
        />
        <ToolbarCell
          icon={<Printer className="size-5" />}
          label="Imprimer"
          ariaLabel={
            isValidated
              ? 'Imprimer / PDF'
              : 'Clôturez la caisse pour imprimer la feuille'
          }
          onClick={handlePrint}
          disabled={!isValidated || pdfBusy}
        />
        <ToolbarCell
          icon={<ChevronRight className="size-5" />}
          label="Suiv."
          ariaLabel="Shift suivant"
          onClick={() => goStep(1)}
          disabled={atLatestSlot}
        />
      </MobileToolbar>
    </div>
  )
}

/**
 * Dialogue de caution, à double usage : création (« state.mode === 'create' »)
 * ou édition d'une caution existante (« 'edit' », préremplie). Même champs
 * (chambre, montant, commentaire libre), bouton de confirmation désactivé tant
 * que chambre/montant ne sont pas valides (miroir `CloseSheetDialog`).
 */
function CautionDialog({
  state,
  onOpenChange,
  onSubmit,
}: {
  state: { mode: 'create' } | { mode: 'edit'; caution: Caution } | null
  onOpenChange: (open: boolean) => void
  onSubmit: (input: { room: number; amount: number; comment: string }) => void
}) {
  const editing = state?.mode === 'edit' ? state.caution : null
  const [room, setRoom] = useState('')
  const [amount, setAmount] = useState(0)
  const [comment, setComment] = useState('')

  // (Re)préremplit à chaque ouverture : vide en création, valeurs existantes en
  // édition — jamais la saisie laissée par un dialogue précédent.
  useEffect(() => {
    if (!state) return
    setRoom(editing ? String(editing.room) : '')
    setAmount(editing ? editing.amount : 0)
    setComment(editing ? editing.comment : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const roomNum = Number(room)
  // Contre le VRAI inventaire (102-114, 201-214, …, 621-631) — pas une plage
  // 1-80 (TOTAL_ROOMS n'est qu'un COMPTE, pas les numéros réels).
  const valid = ALL_ROOMS.includes(roomNum) && amount > 0

  function confirm() {
    if (!valid) return
    onSubmit({ room: roomNum, amount, comment: comment.trim() })
  }

  return (
    <Dialog open={state !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {editing ? 'Modifier la caution' : 'Nouvelle caution'}
          </DialogTitle>
          <DialogDescription>
            Dépôt en espèces pris à un client, à rendre plus tard.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="caution-room">Chambre</Label>
            <Input
              id="caution-room"
              inputMode="numeric"
              autoFocus
              value={room}
              onChange={(e) => setRoom(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="102"
            />
          </div>
          <div className="grid gap-1.5">
            {/* MoneyInput ne prend pas d'id (pas de htmlFor à lui associer). */}
            <Label>Montant</Label>
            <MoneyInput
              value={amount}
              onChange={setAmount}
              disabled={false}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="caution-comment">Commentaire (facultatif)</Label>
            <Textarea
              id="caution-comment"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Précision libre…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={confirm} disabled={!valid}>
            {editing ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Déplace le focus au champ voisin en BOUCLE (ne sort jamais de la liste
 *  fournie, triée dans l'ordre de tabulation voulu). Partagé par la grille des
 *  montants et celle des coupures : après le dernier champ on revient au
 *  premier, et Shift+Tab depuis le premier saute au dernier. */
function cycleFocus(
  e: ReactKeyboardEvent<HTMLInputElement>,
  inputs: HTMLInputElement[],
) {
  const i = inputs.indexOf(e.currentTarget)
  if (i === -1 || inputs.length === 0) return
  e.preventDefault()
  const next = (i + (e.shiftKey ? -1 : 1) + inputs.length) % inputs.length
  inputs[next].focus()
  inputs[next].select()
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
  onFill,
  tabOrder,
  onKeyDown,
  allowNegative = false,
}: {
  value: number
  onChange: (v: number) => void
  disabled: boolean
  // Double-clic : remplit le champ (report d'une somme). Absent = pas d'action.
  onFill?: () => void
  // Rang pour la tabulation en colonne (lu par handleGridTab via data-taborder).
  tabOrder?: number
  onKeyDown?: (e: ReactKeyboardEvent<HTMLInputElement>) => void
  // Autorise un montant négatif (ligne STAY N' TOUCH seulement).
  allowNegative?: boolean
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
        // "text" (clavier complet, touche "-" présente) sur la ligne qui
        // accepte le négatif — "decimal" ailleurs n'affiche pas ce signe sur
        // certains claviers virtuels tablette (iOS/Android).
        inputMode={allowNegative ? 'text' : 'decimal'}
        disabled={disabled}
        value={text}
        onChange={(e) => {
          const t = sanitizeAmount(e.target.value, { allowNegative })
          setText(t)
          onChange(amountValue(t))
        }}
        onDoubleClick={onFill}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={focused ? '' : '0'}
        title={
          onFill
            ? 'Double-clic : additionne Stay N’ Touch + Lightspeed'
            : undefined
        }
        data-taborder={tabOrder}
        className="h-8 pr-6 text-right tabular-nums print:hidden"
      />
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground print:hidden">
        €
      </span>
      {/* Impression tactile : le rendu papier d'un <input> désactivé est trop
          peu fiable selon le navigateur — texte brut à la place, formaté
          exactement comme le PDF jsPDF (même fonction fmtEur). */}
      <span className="caisse-print-value hidden print:block">
        {fmtEur(value)}
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
  onKeyDown,
}: {
  value: number
  onChange: (v: number) => void
  disabled: boolean
  // Tabulation en boucle dans la carte des coupures (handleDenomTab).
  onKeyDown?: (e: ReactKeyboardEvent<HTMLInputElement>) => void
}) {
  const [focused, setFocused] = useState(false)
  return (
    <>
      <Input
        type="text"
        inputMode="numeric"
        disabled={disabled}
        value={value === 0 ? '' : String(value)}
        onChange={(e) => onChange(countValue(e.target.value))}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={focused ? '' : '0'}
        data-denom-cell
        className="h-6 w-4/5 px-1 text-center text-sm tabular-nums print:hidden"
      />
      {/* Impression tactile : même raison que MoneyInput ci-dessus. */}
      <span className="caisse-print-count hidden print:block">
        × {value}
      </span>
    </>
  )
}

/** En-tête du tableau des montants (Source + une colonne par mode, « web »
 * responsive → « Adyen » en étroit). Partagé par le squelette de chargement et le
 * tableau réel, pour qu'ils ne divergent pas. */
function AmountsThead({ cols }: { cols: EcartKey[] }) {
  return (
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
  )
}

function AmountRow({
  label,
  rowIndex,
  cols,
  value,
  onChange,
  disabled,
  onFill,
  onCellKeyDown,
  allowNegative = false,
}: {
  label: string
  // Rang de la ligne (0 = 1re) : sert à ordonner la tabulation en colonne.
  rowIndex: number
  cols: EcartKey[]
  value: (c: EcartKey) => number | null
  onChange: (c: EcartKey, v: number) => void
  disabled: boolean
  // Valeur de report calculée par colonne (double-clic). Absent = pas de report.
  onFill?: (c: EcartKey) => number
  // Tabulation pilotée (colonne par colonne), partagée par toutes les lignes.
  onCellKeyDown?: (e: ReactKeyboardEvent<HTMLInputElement>) => void
  // Montants négatifs acceptés sur cette ligne (STAY N' TOUCH seulement).
  allowNegative?: boolean
}) {
  return (
    <tr className="border-b border-border/60">
      <td className="px-3 py-2 text-xs font-medium uppercase text-muted-foreground max-sm:whitespace-nowrap">
        {label}
      </td>
      {cols.map((c, colIndex) => {
        const v = value(c)
        return (
          <td key={c} className="px-2 py-1">
            {v === null ? (
              <span className="block text-right text-muted-foreground">—</span>
            ) : (
              <MoneyInput
                value={v}
                disabled={disabled}
                onChange={(nv) => onChange(c, nv)}
                onFill={
                  onFill && !disabled ? () => onChange(c, onFill(c)) : undefined
                }
                // Ordre colonne-major : colonne × 3 lignes + rang de la ligne.
                tabOrder={colIndex * 3 + rowIndex}
                onKeyDown={onCellKeyDown}
                allowNegative={allowNegative}
              />
            )}
          </td>
        )
      })}
    </tr>
  )
}
