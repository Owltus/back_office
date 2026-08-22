import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, LineChart, Printer, RotateCcw } from 'lucide-react'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import { DatePickerButton } from '#/components/form/fields.tsx'
import { LockBadge } from '#/components/shared/LockBadge.tsx'
import { useNavbarBadge, useNavbarSubtitle } from '#/lib/navbarSubtitle.ts'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { PrintBlockedDialog } from '#/components/shared/PrintBlockedDialog.tsx'
import { PrintButton } from '#/components/shared/PrintButton.tsx'
import { StatTile } from '#/components/shared/StatTile.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { ButtonGroup } from '#/components/shared/ButtonGroup.tsx'
import { StepNav } from '#/components/shared/StepNav.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { usePrintShortcut } from '#/components/shared/usePrintShortcut.ts'
import { useStepNavKeys } from '#/components/shared/useStepNavKeys.ts'
import { Button } from '#/components/ui/button.tsx'
import { Dialog, DialogContent } from '#/components/ui/dialog.tsx'
import { HelpDialogHeader } from '#/components/shared/HelpDialogHeader.tsx'
import { HelpGlyph } from '#/components/shared/HelpGlyph.tsx'
import { ACCENT } from '#/components/analytique/accents.ts'
import { MouseGlyph } from '#/components/rapro/MouseGlyph.tsx'
import { RaproHelpPanel } from '#/components/rapro/RaproHelpPanel.tsx'
import { CloseSheetDialog } from '#/components/shared/CloseSheetDialog.tsx'
import type { CloseIssue } from '#/components/shared/CloseSheetDialog.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import { fetchServiceDates } from '#/lib/pdj/service.ts'
import { parseDateStr } from '#/lib/poster/dateFormatter.ts'
import { carryOver, carryoverWindow } from '#/lib/rapro/carryover.ts'
import type { DaySnapshot } from '#/lib/rapro/carryover.ts'
import {
  CATEGORY_COLOR,
  CELL_STATES,
  cellState,
  countStats,
  LEGEND_ORDER,
  nextFill,
  statusOf,
} from '#/lib/rapro/constants.ts'
import { addDays, clampDay, today } from '#/lib/rapro/day.ts'
import { canReconcileDay } from '#/lib/rapro/editability.ts'
import { printRaproSheet } from '#/lib/rapro/pdf.ts'
import { reconcile } from '#/lib/rapro/reconcile.ts'
import { FLOORS } from '#/lib/rapro/rooms.ts'
import { missingSources } from '#/lib/rapro/sources.ts'
import {
  fetchDay,
  fetchOccupancy,
  fetchOfficialOcc,
  fetchOldestDay,
  fetchSheet,
  materializeCleaned,
  purgeMaterialized,
  reopenSheet,
  saveComment,
  setRoom,
  validateSheet,
} from '#/lib/rapro/service.ts'
import type { RaproDay, RaproSheet, RoomStatus } from '#/lib/rapro/types.ts'
import { capitalize, cn } from '#/lib/utils.ts'

const EMPTY: ReadonlyMap<number, RoomStatus> = new Map()
const EMPTY_MANUAL: ReadonlySet<number> = new Set()
const EMPTY_MATERIALIZED: ReadonlySet<number> = new Set()

/**
 * Rapprochement de chambres — suivi ménage par chambre et par jour.
 *
 * Cards de synthèse (style PDJ) + grille étages → chambres. L'occupation (donc
 * le nombre de chambres vendues ET le grisé des non vendues) vient du PDJ, une
 * seule et même source → tout reste synchro avec ce qu'on voit dans la grille.
 * Postulat : une chambre vendue est NETTOYÉE par défaut. Un CLIC fait défiler le
 * cycle des statuts (nettoyée → refus → bloquée → défaut). L'état est
 * persisté par (jour, chambre), en optimiste — seules les exceptions sont
 * stockées. Écriture super/admin — RLS.
 */
/** Libellé de tuile responsive : le texte OFFICIEL dès qu'il y a la place
 * (largeur d'écran >= 640px, seuil Tailwind `sm`), une version abrégée en
 * dessous — pour les deux seuls libellés assez longs pour passer sur deux
 * lignes dans une tuile étroite (« Bloquées du jour » / « Bloquées de la
 * veille »), ce qui étirait toute la rangée de cartes (grille en stretch) à
 * la hauteur de cette tuile. */
function statLabel(full: string, short: string) {
  return (
    <>
      <span className="hidden sm:inline">{full}</span>
      <span className="sm:hidden">{short}</span>
    </>
  )
}

// Sous 1024px, le jour et le statut vivent dans la Navbar globale (voir
// useNavbarSubtitle/useNavbarBadge plus bas) : `title`/`badge` passent alors à
// `undefined` plutôt qu'à un contenu masqué en CSS. Sous 640px, la barre
// d'outils basse fixe remplace en plus les actions du haut : `actions` passe
// lui aussi à `undefined`. Dans les deux cas, un contenu masqué en CSS plutôt
// qu'absent aurait laissé PageHeader exister comme élément flex VIDE dans la
// page — le `gap` du conteneur parent réserve de la place autour de tout
// élément rendu, même sans contenu visible à l'intérieur. Seul `undefined`
// (PageHeader renvoie alors `null`, cf. shared/PageHeader.tsx) sort vraiment
// l'élément du flux et referme le vide entre la Navbar et les cartes.
function useMatchMedia(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const update = () => setMatches(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [query])
  return matches
}

export function RaproBoard({ initialDate }: { initialDate?: string }) {
  const isNavbarMobile = useMatchMedia('(max-width: 1023.98px)')
  const showTopToolbar = useMatchMedia('(min-width: 640px)')
  const { user, pageLevel } = useAuth()
  // Niveau effectif : sert au verrou PAR JOUR. Écriture n'agit que dans la fenêtre
  // de grâce (J-0..J-2) ; la gestion peut agir sur n'importe quel jour (cf.
  // lib/rapro/editability.ts).
  const level = pageLevel('rapro')
  const queryClient = useQueryClient()

  const [selectedDate, setSelectedDate] = useState(() => initialDate ?? today())
  const todayStr = today()
  // Le jour affiché est-il actionnable (édition grille, clôture, réouverture) ?
  // Lecture : jamais. Écriture : seulement dans la fenêtre J-2. Gestion : toujours.
  const dayEditable = canReconcileDay(selectedDate, todayStr, level)

  const { data: oldestDay, isError: oldestError } = useQuery({
    queryKey: ['rapro', 'oldest'],
    queryFn: fetchOldestDay,
  })
  // Jours ayant des données PDJ (comme la navigation du petit-déj) : on peut
  // reculer jusqu'au plus ancien, même si rapro_rooms est encore vide.
  const { data: serviceDates } = useQuery({
    queryKey: ['rapro', 'service-dates'],
    queryFn: fetchServiceDates,
  })
  const pdjOldest = serviceDates?.length
    ? serviceDates[serviceDates.length - 1]
    : null
  const lowerCandidates = [oldestDay, pdjOldest].filter(
    (d): d is string => d != null,
  )
  const lowerDay = lowerCandidates.length
    ? lowerCandidates.reduce((a, b) => (a < b ? a : b))
    : todayStr
  const atLatest = selectedDate >= todayStr
  const atLower = selectedDate <= lowerDay

  // Jours sélectionnables dans le calendrier = ceux qu'on POSSÈDE (données PDJ),
  // plus le jour courant (toujours atteignable, même sans données). Les autres —
  // trous dans l'historique, futur — sont grisés. `undefined` tant que la liste
  // n'est pas chargée (on ne grise rien, on garde min/max).
  const pickerDates = serviceDates
    ? serviceDates.includes(todayStr)
      ? serviceDates
      : [...serviceDates, todayStr]
    : undefined

  const {
    data: day,
    isError,
    isSuccess,
  } = useQuery({
    queryKey: ['rapro', 'day', selectedDate],
    queryFn: () => fetchDay(selectedDate),
  })
  const statuses = day?.statuses ?? EMPTY
  const dayCarriedManual = day?.carriedManual ?? EMPTY_MANUAL
  const dayMaterialized = day?.materialized ?? EMPTY_MATERIALIZED

  // Feuille jour : clôture + commentaire (table rapro_sheets, au niveau jour).
  const { data: sheet } = useQuery({
    queryKey: ['rapro', 'sheet', selectedDate],
    queryFn: () => fetchSheet(selectedDate),
  })
  const isValidated = sheet?.status === 'validated'
  // Verrou : éditable seulement si le jour est actionnable (niveau + fenêtre) ET
  // non clôturé. Un jour clôturé se fige ; un jour hors fenêtre (écriture) aussi,
  // même s'il n'est pas clôturé.
  const canEditFields = dayEditable && !isValidated
  // Commentaire COMMITÉ (hydraté depuis la feuille, mis à jour au blur du champ ;
  // la frappe vit dans RaproCommentCard). Lu par le PDF et la clôture.
  const [comment, setComment] = useState('')
  useEffect(() => {
    setComment(sheet?.comment ?? '')
  }, [sheet?.reportDate, sheet?.comment])
  // Persiste le commentaire au blur : maj de l'état parent + du cache sheet (sinon
  // l'hydratation ré-injecterait une valeur périmée au retour sur le jour, staleTime
  // 60 s, faisant « disparaître » le commentaire) + écriture serveur best-effort.
  function commitComment(next: string) {
    if (!canEditFields) return
    setComment(next)
    queryClient.setQueryData<RaproSheet | null>(
      ['rapro', 'sheet', selectedDate],
      (prev) =>
        prev
          ? { ...prev, comment: next }
          : {
              reportDate: selectedDate,
              status: 'draft',
              comment: next,
              operatorName: '',
              validatedAt: null,
            },
    )
    saveComment(selectedDate, next).catch(() => {})
  }
  const [pdfBusy, setPdfBusy] = useState(false)
  // Modal d'aide : tutoriel factuel de la page (bouton « ? » de la barre d'actions).
  const [helpOpen, setHelpOpen] = useState(false)
  // Modal de clôture : nom de l'hôtelier saisi avant de figer le jour (comme caisse).
  const [closeOpen, setCloseOpen] = useState(false)
  const [hotelierName, setHotelierName] = useState('')
  // OCC officiel du PMS à J-1 (décalage de datage). Sert d'unique CONTRÔLE
  // comptable : si l'occupation PDJ diffère du PMS, on l'alerte (c'est là que les
  // arrivées tardives / corrections apparaissent). Absent si RepJour non importé.
  const { data: officialOcc, isSuccess: occControlLoaded } = useQuery({
    queryKey: ['rapro', 'occ-control', addDays(selectedDate, -1)],
    queryFn: () => fetchOfficialOcc(addDays(selectedDate, -1)),
  })

  // Occupation PAR CHAMBRE (In-House) : source unique des chambres vendues + du
  // grisé. Lue via la vue `rapro_occupancy` (sans nom client, gardée sur la page
  // rapro) et non directement dans pdj_breakfasts : un compte rapro sans droit pdj
  // voit quand même l'occupation, sans recevoir de donnée nominative.
  const { data: pdjRows } = useQuery({
    queryKey: ['rapro', 'occupancy', selectedDate],
    queryFn: () => fetchOccupancy(selectedDate),
  })
  // Une ligne `manual_kind` non nul (day-use, PDJ extra saisi à la main…) n'est PAS
  // une réservation In-House : elle ne doit jamais rendre une chambre « vendue »
  // ici (sinon un simple PDJ ajouté à la main sur une chambre non vendue la fait
  // passer facturable au rapprochement). Exclue au même titre qu'une offerte,
  // mais AVANT toute dérivation (occupied EST la source unique du board).
  const occupied = new Set(
    (pdjRows ?? [])
      .filter((r) => r.manual_kind == null)
      .map((r) => r.room),
  )
  const hasOccupancy = occupied.size > 0
  // Requête PDJ résolue mais vide → occupation indisponible ce jour (≠ chargement).
  const noOccupancy = pdjRows !== undefined && occupied.size === 0

  // Gate d'affichage : tant que l'occupation (PDJ), la feuille du jour OU les
  // statuts ménage (`day`) ne sont pas résolus, cartes et grille afficheraient des
  // valeurs par défaut puis se corrigeraient (flash staggered). Sans `day`, la
  // grille se peignait « toutes chambres non nettoyées » (couleurs + compteurs
  // faux) une fraction de seconde avant de se recolorer — c'était le défaut le plus
  // visible. On rend un squelette-reflet à la place. La fenêtre de report (jusqu'à
  // 7 jours) ne bloque PAS ici — trop coûteux au premier rendu ; elle est gérée
  // plus bas par une garde ciblée sur l'état vide. Le contrôle comptable et le plus
  // ancien jour s'hydratent après, sans bloquer.
  const loading =
    pdjRows === undefined || sheet === undefined || day === undefined

  // Exports PMS manquants. Calculés seulement une fois les DEUX requêtes
  // résolues : pendant le chargement, tout paraîtrait manquant.
  const sourcesLoaded = pdjRows !== undefined && occControlLoaded
  const missing = sourcesLoaded
    ? missingSources({
        hasOccupancy,
        hasOfficialOcc: officialOcc != null,
        date: selectedDate,
        previousDate: addDays(selectedDate, -1),
      })
    : []
  // Le Comparison ne bloque rien : il se signale à côté de la grille, pas à sa place.
  const optionalMissing = missing.filter((m) => !m.required)

  // Roulement (report) DÉRIVÉ : on relit une fenêtre bornée de jours précédents
  // (statuts rapro SEULS — le roulement ne dépend PAS de l'occupation PDJ), mêmes
  // clés → cache partagé avec la navigation. `carried` = chambres bloquées un jour
  // antérieur, encore marquées bloquées jusqu'à la veille incluse.
  const windowDays = carryoverWindow(selectedDate, lowerDay)
  const raproWindow = useQueries({
    queries: windowDays.map((d) => ({
      queryKey: ['rapro', 'day', d],
      queryFn: () => fetchDay(d),
    })),
  })
  const past: DaySnapshot[] = windowDays.map((_, i) => ({
    statuses: raproWindow[i]?.data?.statuses ?? EMPTY,
    carriedManual: raproWindow[i]?.data?.carriedManual ?? EMPTY_MANUAL,
  }))
  // Liseré « bloquée la veille » = roulement DÉRIVÉ du passé (intouchable) ∪ flag
  // MANUEL posé aujourd'hui même (modifiable / retirable au double-clic).
  const carriedDerived = carryOver(past)
  const carried = new Set(carriedDerived)
  for (const r of dayCarriedManual) carried.add(r)

  // « Vendues » = occupation RÉELLE du jour. Une chambre colorée à la main ne
  // compte comme vendue que si elle n'est PAS reportée : c'est alors une
  // correction d'occupation (In-House a raté une vente). Une reportée non occupée
  // n'a PAS été vendue aujourd'hui — elle l'a été la veille ; la couleur qu'on lui
  // pose ne dit que si son ménage en retard (rattrapage) est fait. Elle ne gonfle
  // donc jamais les vendues (c'était le bug : « toute couleur = vendue »).
  const effectiveSold = new Set(occupied)
  for (const [room, s] of statuses) {
    // « non_vendue » = correction INVERSE : le PMS a compté une vente inexistante
    // → on RETIRE la chambre des vendues (grise, hors charge). Sinon une couleur
    // sur une non-reportée vaut correction d'occupation (In-House a raté une vente).
    if (s === 'non_vendue') effectiveSold.delete(room)
    else if (!carried.has(room)) effectiveSold.add(room)
  }

  // Réconciliation sur le DÛ ÉLARGI (occupées du jour ∪ reportées). Une chambre
  // déclarée « non vendue » (correction inverse) sort du dû : plus aucun ménage.
  const dueSet = new Set(occupied)
  for (const r of carried) dueSet.add(r)
  for (const [room, s] of statuses) if (s === 'non_vendue') dueSet.delete(room)
  const rec = reconcile(statuses, dueSet, occupied)
  // Décompte des cards (Nettoyées / Refus / Bloquées du jour) sur les VENDUES
  // EFFECTIVES uniquement (occupées ∪ corrections d'occupation) : une reportée non
  // vendue n'y entre pas, donc elle ne peut plus fausser « Bloquées du jour » ni
  // « Refus » — elle vit dans « Bloquées de la veille » et la réconciliation.
  const stats = countStats(statuses, effectiveSold)
  // Rattrapages : ménages FAITS aujourd'hui sur une chambre reportée NON vendue
  // (statut `rattrapage`, donc hors `effectiveSold` → absents de `stats.clean`).
  // Ils sont facturables (Option A) : on les rajoute au total « Nettoyées » sans
  // les compter en vendues. `!effectiveSold.has` évite tout double comptage.
  let rattrapages = 0
  for (const [room, s] of statuses)
    if (s === 'rattrapage' && !effectiveSold.has(room)) rattrapages++
  const cleanedCount = stats.clean + rattrapages
  // Balance « coup d'œil » : contrôle que les catégories affichées retombent sur les
  // Vendues — Nettoyées + Refus + Bloquées du jour − Bloquées de la veille − Vendues.
  // Calculée sur les MÊMES nombres que les cartes → toujours cohérente avec ce qu'on
  // lit à l'écran : 0 = « Tout va bien », sinon l'écart signé signale un décompte qui
  // ne tombe pas juste (typiquement des bloquées de la veille pas encore rattrapées).
  const balanceDelta =
    cleanedCount + stats.refus + stats.todo - carried.size - effectiveSold.size
  const balanced = balanceDelta === 0
  // Fenêtre de report résolue ? Tant qu'une requête de la fenêtre est en vol,
  // `carried` est incomplet : afficher « Aucune donnée » sur un jour sans
  // occupation directe mais À REPORTS serait un faux vide, effacé une fraction de
  // seconde après. On attend donc la fenêtre AVANT de conclure au vide (la grille,
  // elle, n'est pas bloquée : elle se colore au fur et à mesure).
  const windowResolved = raproWindow.every((q) => !q.isPending)
  // Aucune occupation ce jour ET aucune reportée (fenêtre résolue) : In-House
  // n'est pas importé (ou jour sans client). On NE bloque plus l'écran — on rend
  // une GRILLE DE SECOURS où chaque chambre est non vendue (grisée) et saisissable
  // à la main : un pansement pour que l'hôtelier travaille malgré l'export manquant.
  // L'affichage normal (occupation, vendues, roulement) revient dès l'import.
  const fallbackMode = noOccupancy && windowResolved && carried.size === 0
  /* En secours SANS la moindre saisie, aucun compteur ne veut rien dire : les
     cards affichent « — » (rien de connu), pas un « 0 » qui se lirait « rien à
     faire ». Dès la première chambre marquée à la main, les vrais compteurs
     reviennent. */
  const showDash = fallbackMode && effectiveSold.size === 0
  const dash = (v: number | string) => (showDash ? '—' : v)
  // Erreur réseau persistante sur un jour de la fenêtre → roulement possiblement
  // incomplet : on le signale via la bannière d'erreur (pas de sous-comptage muet).
  const windowError = raproWindow.some((q) => q.isError)

  // Contrôle comptable, UNIQUEMENT sur un jour clôturé (données finales) : écart
  // entre le rooming In-House (base de la grille) et l'officiel (Comparison /
  // rj_nuitees). Les chambres OFFERTES (tarif 0 : gratuité, house-use) comptent
  // dans le rooming mais PAS dans l'officiel (« Occupied Rooms hors complimentary »)
  // — on les retire AVANT de comparer, pour ne pas alerter sur un écart qui n'est
  // qu'une gratuité (comportement attendu). Un écart résiduel = arrivée / annulation
  // de dernière minute présente dans un seul des deux rapports, à vérifier.
  const freeRooms = (pdjRows ?? []).filter(
    (r) => r.adr != null && Number(r.adr) === 0,
  ).length
  // Day-use (manual_kind) : déjà HORS `occupied` (voir plus haut) — donc déjà hors
  // de ce comparatif, pas de soustraction séparée à faire ici.
  const inHouseExclComp = occupied.size - freeRooms
  const occGap =
    isValidated &&
    hasOccupancy &&
    officialOcc != null &&
    officialOcc !== inHouseExclComp
      ? inHouseExclComp - officialOcc
      : null
  // Même écart, mais calculé AUSSI en brouillon : le modal de clôture doit le
  // montrer AVANT de figer (occGap ci-dessus reste réservé à la bannière du jour
  // déjà clôturé). officialOcc est re-testé pour que TS le sache non nul.
  const occGapDraft =
    hasOccupancy && officialOcc != null && officialOcc !== inHouseExclComp
      ? inHouseExclComp - officialOcc
      : null

  // Verdict du modal de clôture : on agrège TOUS les contrôles (pas seulement les
  // chambres à faire), chacun expliqué pour un débutant. Non bloquant.
  const closeIssues: CloseIssue[] = []
  if (rec.pending > 0) {
    const many = rec.pending > 1
    closeIssues.push({
      title: `${rec.pending} chambre${many ? 's' : ''} bloquée${many ? 's' : ''} non traitée${many ? 's' : ''}`,
      detail: many
        ? 'Elles restent dues et réapparaîtront demain (report). Elles ne sont pas facturées comme nettoyées.'
        : "Elle reste due et réapparaîtra demain (report). Elle n'est pas facturée comme nettoyée.",
    })
  }
  if (occGapDraft !== null && officialOcc != null) {
    const many = Math.abs(occGapDraft) > 1
    closeIssues.push({
      title: `Écart d'occupation : ${Math.abs(occGapDraft)} chambre${many ? 's' : ''}`,
      detail: `${inHouseExclComp} occupée${inHouseExclComp > 1 ? 's' : ''} d'après le rooming, ${officialOcc} d'après le rapport comptable. Souvent une arrivée ou une annulation de dernière minute, à vérifier.`,
    })
  }
  for (const m of optionalMissing) {
    closeIssues.push({
      title: `${m.file} non importé`,
      detail: `Sans lui, ${m.impact} n'est pas possible. Le reste du rapprochement reste valable.`,
    })
  }
  if (fallbackMode) {
    closeIssues.push({
      title: 'Rooming non importé (mode secours)',
      detail:
        "Le rapport In-House n'a pas été importé, les chambres ont été saisies à la main. Vérifie qu'aucune n'a été oubliée.",
    })
  }
  if (windowError) {
    closeIssues.push({
      title: 'Vérification des reports incomplète',
      detail:
        'Le calcul des chambres reportées des jours précédents a échoué (réseau). Recharge la page avant de clôturer.',
    })
  }

  function goStep(delta: number) {
    setSelectedDate((cur) => clampDay(addDays(cur, delta), lowerDay, todayStr))
  }
  function goDate(value: string) {
    setSelectedDate(clampDay(value, lowerDay, todayStr))
  }

  // ← / → parcourent les jours (bornés), Alt revient sur aujourd'hui.
  useStepNavKeys({
    onPrev: () => goStep(-1),
    onNext: () => goStep(1),
    onToday: () => goDate(todayStr),
    prevDisabled: atLower,
    nextDisabled: atLatest,
  })

  // Cœur d'écriture optimiste (jour courant), partagé par la pose de statut et
  // l'effacement : snapshot → mutation locale de la Map → maj cache → persistance
  // parallèle → rollback réel par snapshot en cas d'échec (fiable même hors ligne).
  // `editDraft` décrit la mutation locale d'un item, `persistOne` sa persistance.
  async function mutateDay(
    edit: (statuses: Map<number, RoomStatus>, manual: Set<number>) => void,
    persist: () => Promise<void>,
  ) {
    if (!canEditFields || !isSuccess) return
    const key = ['rapro', 'day', selectedDate]
    await queryClient.cancelQueries({ queryKey: key })
    const prev = queryClient.getQueryData<RaproDay>(key)
    const nextStatuses = new Map(statuses)
    const nextManual = new Set(dayCarriedManual)
    edit(nextStatuses, nextManual)
    queryClient.setQueryData<RaproDay>(key, {
      reportDate: selectedDate,
      statuses: nextStatuses,
      carriedManual: nextManual,
      // Édition de couleur/liseré : le flag `materialized` (posé à la clôture) est
      // inchangé → on le reporte tel quel (vide sur un jour ouvert en pratique).
      materialized: new Set(dayMaterialized),
    })
    try {
      await persist()
    } catch {
      queryClient.setQueryData(
        key,
        prev ?? {
          reportDate: selectedDate,
          statuses: new Map(),
          carriedManual: new Set(),
          materialized: new Set(),
        },
      )
    }
  }

  // Pose la COULEUR d'une chambre (`null` = aucune couleur) en PRÉSERVANT son
  // liseré manuel. `null` retire la couleur → hors de la map, la chambre redevient
  // grise (non vendue) ou verte par défaut (vendue). `setRoom` applique la même
  // règle côté base (aucune couleur + aucun liseré = pas de ligne).
  function setColor(room: number, status: RoomStatus | null) {
    const manual = dayCarriedManual.has(room)
    return mutateDay(
      (st) => {
        if (status === null) st.delete(room)
        else st.set(room, status)
      },
      () => setRoom(selectedDate, room, status, manual),
    )
  }

  // Clic GAUCHE = cycle des COULEURS via `nextFill`, selon la situation de la
  // chambre : VENDUE (vert → refus → bloquée → vert) ; REPORTÉE non vendue (gris →
  // rattrapage → bloquée → gris : on ne fait que solder le ménage en retard) ; non
  // vendue non reportée (gris → vert → refus → bloquée → gris : correction
  // d'occupation). Le liseré « bloquée la veille » (clic droit) est ORTHOGONAL et
  // préservé.
  function toggle(room: number) {
    const current = statuses.get(room) ?? null
    return setColor(
      room,
      nextFill(current, occupied.has(room), carried.has(room)),
    )
  }

  // Clic DROIT = pose / retire le sur-statut « bloquée la veille » À LA MAIN sur le
  // jour courant. INTOUCHABLE si le liseré vient du roulement AUTOMATIQUE (dérivé
  // du passé) : seul le flag posé aujourd'hui se bascule. Orthogonal à la couleur :
  // on REPOSE la couleur COURANTE telle quelle (`null` si aucune) → une chambre
  // grise reste GRISE (elle ne devient plus verte, c'était l'autre moitié du bug).
  function toggleManual(room: number) {
    if (carriedDerived.has(room)) return
    const next = !dayCarriedManual.has(room)
    const status = statuses.get(room) ?? null
    return mutateDay(
      (_st, mn) => {
        if (next) mn.add(room)
        else mn.delete(room)
      },
      () => setRoom(selectedDate, room, status, next),
    )
  }

  // Équivalent tactile du clic droit : au tactile, il n'existe littéralement
  // pas — sans ceci, « bloquée la veille » serait injoignable au doigt. Appui
  // simple = `toggle` (inchangé) ; appui long (500ms) = `toggleManual`. Un SEUL
  // ref pour toute la grille (une seule chambre pressée à la fois) plutôt qu'un
  // hook par chambre : `useRef`/`useState` ne peuvent pas s'appeler dans la
  // boucle `.map()` qui rend les chambres. `pointerType` filtre la souris : un
  // clic gauche maintenu sur ordinateur ne doit PAS déclencher l'appui long,
  // qui reste sa propre voie (clic droit, `onContextMenu`).
  //
  // `pressingRoom` (état, pas juste le ref) : un geste invisible n'est pas une
  // bonne UX — sans retour visuel PENDANT l'appui, rien ne dit à l'utilisateur
  // qu'il se passe quelque chose avant les 500ms, ni qu'il maintient la bonne
  // pression. Pilote l'anneau animé (.rapro-room-pressing, rapro.css), calé sur
  // la MÊME durée que le seuil de déclenchement — la barre se remplit pile
  // quand l'action se déclenche, pas un chrono arbitraire.
  const longPress = useRef<{ timer: number | null; fired: boolean }>({
    timer: null,
    fired: false,
  })
  const [pressingRoom, setPressingRoom] = useState<number | null>(null)
  function startLongPress(room: number, pointerType: string) {
    if (pointerType !== 'touch' && pointerType !== 'pen') return
    longPress.current.fired = false
    setPressingRoom(room)
    longPress.current.timer = window.setTimeout(() => {
      longPress.current.fired = true
      setPressingRoom(null)
      toggleManual(room)
    }, 500)
  }
  function cancelLongPress() {
    if (longPress.current.timer != null) {
      window.clearTimeout(longPress.current.timer)
      longPress.current.timer = null
    }
    setPressingRoom(null)
  }
  // L'appui long relâché déclenche AUSSI un `click` juste après (comportement
  // natif du navigateur) : sans ce garde-fou, la chambre basculerait deux fois
  // (bloquée la veille ET couleur suivante) pour un seul geste.
  function handleRoomTap(room: number) {
    if (longPress.current.fired) {
      longPress.current.fired = false
      return
    }
    toggle(room)
  }

  // Bouton d'en-tête d'étage : ROLLBACK total à l'origine. Toute chambre de
  // l'étage portant un statut OU un liseré manuel repasse au défaut (ligne
  // supprimée). Sert à annuler d'un geste les saisies erronées d'un étage.
  function resetFloor(rooms: number[]) {
    const toReset = rooms.filter(
      (r) => statuses.has(r) || dayCarriedManual.has(r),
    )
    if (toReset.length === 0) return
    return mutateDay(
      (st, mn) => {
        for (const r of toReset) {
          st.delete(r)
          mn.delete(r)
        }
      },
      async () => {
        await Promise.all(
          toReset.map((r) => setRoom(selectedDate, r, null, false)),
        )
      },
    )
  }

  // --- Clôture / réouverture / impression (feuille jour) -------------------
  // Clôturer ou réouvrir un jour change l'ensemble des jours CLÔTURÉS, seule base
  // de l'analytique (récap facturable). On invalide donc son cache (préfixe
  // `monthly-counts` → vues annuelle ET mensuelle) pour qu'il se resynchronise
  // sans rechargement complet de la page.
  const invalidateAnalytique = () =>
    queryClient.invalidateQueries({ queryKey: ['rapro', 'daily-agg'] })
  // Ouvre le modal de clôture, en pré-remplissant le nom déjà posé (cas d'une
  // réouverture puis re-clôture).
  function openCloseModal() {
    setHotelierName(sheet?.operatorName ?? '')
    setCloseOpen(true)
  }
  function handleConfirmClose() {
    if (!user) return
    const name = hotelierName.trim()
    if (!name) return
    setCloseOpen(false)
    // Matérialise les chambres vendues encore au défaut (nettoyée implicite, sans
    // ligne) pour que le récap facturable les compte, PUIS clôture (commentaire +
    // nom de l'hôtelier dans le même upsert ; validated_by posé serveur). On
    // invalide aussi le jour (nouvelles lignes nettoyée) et l'analytique.
    const toMaterialize = [...occupied].filter((r) => !statuses.has(r))
    materializeCleaned(selectedDate, toMaterialize)
      .then(() => validateSheet(selectedDate, comment, name))
      .catch(() => {})
      .finally(() =>
        Promise.all([
          queryClient.invalidateQueries({
            queryKey: ['rapro', 'sheet', selectedDate],
          }),
          queryClient.invalidateQueries({
            queryKey: ['rapro', 'day', selectedDate],
          }),
          invalidateAnalytique(),
        ]),
      )
  }
  function handleReopen() {
    // A5 : à la réouverture, purger les lignes 'nettoyee' MATÉRIALISÉES à la
    // clôture (une vente annulée depuis ne doit plus être facturée ELIOR en
    // fantôme). Les corrections manuelles (materialized = false) sont épargnées ;
    // le liseré « bloquée la veille » est préservé (purgeMaterialized).
    const toPurge = [...dayMaterialized].map((room) => ({
      room,
      carriedManual: dayCarriedManual.has(room),
    }))
    reopenSheet(selectedDate)
      .then(() =>
        toPurge.length ? purgeMaterialized(selectedDate, toPurge) : undefined,
      )
      .catch(() => {})
      .finally(() =>
        Promise.all([
          queryClient.invalidateQueries({
            queryKey: ['rapro', 'sheet', selectedDate],
          }),
          queryClient.invalidateQueries({
            queryKey: ['rapro', 'day', selectedDate],
          }),
          invalidateAnalytique(),
        ]),
      )
  }
  async function handleGeneratePdf() {
    setPdfBusy(true)
    try {
      const [yy, mm, dd] = selectedDate.split('-')
      await printRaproSheet(
        {
          titleDate: title,
          statuses,
          occupied,
          carried,
          counts: {
            sold: effectiveSold.size,
            clean: cleanedCount,
            bloquee: stats.todo,
            refus: stats.refus,
          },
          comment,
          operatorName: sheet?.operatorName ?? '',
          validatedAt: sheet?.validatedAt ?? null,
        },
        `Rapprochement_${dd}-${mm}-${yy}`,
      )
    } catch {
      // Silencieux : l'impression est un confort, pas un flux critique.
    } finally {
      setPdfBusy(false)
    }
  }

  /* Ctrl+P emprunte la même porte que le bouton : le PDF jsPDF, jamais le rendu
     brut du DOM. Deux refus possibles, et ils ne se confondent pas — sans
     données, dire « clôturez » serait un cul-de-sac, puisque le bouton de
     clôture est justement absent ce jour-là. */
  const [printBlocked, setPrintBlocked] = useState('')
  usePrintShortcut(() => {
    if (pdfBusy) return
    if (fallbackMode) {
      setPrintBlocked(
        'Aucune donnée pour ce jour. Importez les exports du PMS.',
      )
      return
    }
    if (!isValidated) {
      setPrintBlocked(
        "Le rapprochement n'est pas clôturé. Clôturez-le pour imprimer la feuille.",
      )
      return
    }
    void handleGeneratePdf()
  })

  const parsed = parseDateStr(selectedDate)
  const label = parsed
    ? format(parsed, 'EEEE d MMMM yyyy', { locale: fr })
    : selectedDate
  const title = capitalize(label)
  // Sous 1024px, la Navbar globale affiche ce jour sous « Rapprochement » (à la
  // place de la marque) — le titre de page ci-dessous s'efface d'autant pour ne
  // pas le répéter. Se retire tout seul au démontage (changement de page).
  //
  // Rendu TAPPABLE (DatePickerButton, trigger personnalisé) plutôt qu'un texte
  // plat : la barre d'outils basse mobile n'a plus de bouton calendrier dédié
  // (retiré — cf. la barre plus bas) précisément parce qu'un jour affiché déjà
  // visible ici, sur lequel on peut taper pour en choisir un autre, rend ce
  // bouton séparé redondant plutôt que de le caser une deuxième fois quelque
  // part. Le popover et sa logique (bornes, jours désactivés) restent ceux de
  // DatePickerButton — seul le déclencheur change.
  //
  // `useMemo` (pas l'élément recréé en ligne à chaque rendu) : `useNavbarSubtitle`
  // dépend de l'IDENTITÉ de l'élément (`useEffect([node])`) — un objet JSX neuf à
  // chaque rendu de RaproBoard aurait reposé le sous-titre en boucle (une simple
  // frappe dans le commentaire, par ex., aurait suffi), la Navbar se re-rendant à
  // chaque fois pour rien. Recalculé seulement quand une des dépendances change
  // vraiment.
  const navbarSubtitle = useMemo(
    () => (
      <DatePickerButton
        value={selectedDate}
        onChange={goDate}
        min={lowerDay}
        max={todayStr}
        enabledDates={pickerDates}
        todayValue={todayStr}
        ariaLabel="Choisir un jour"
        trigger={
          <button
            type="button"
            className="-mx-1 -my-0.5 truncate rounded px-1 py-0.5 text-left text-xs text-muted-foreground underline decoration-dotted underline-offset-2"
          >
            {title}
          </button>
        }
      />
    ),
    [selectedDate, lowerDay, todayStr, pickerDates, title, goDate],
  )
  useNavbarSubtitle(navbarSubtitle)

  // Rien à annoncer avant que l'occupation et la feuille soient chargées : la
  // pastille se contredirait le temps d'un rendu. En secours, on affiche
  // « Ouvert » de base (grille de secours exploitable, clôturable). Posé à la
  // fois dans la Navbar (< 1024px, à côté du hamburger) et dans l'en-tête de
  // page (≥ 1024px) — un seul des deux est visible à la fois (cf. PageHeader).
  const statusBadge = pdjRows !== undefined && sheet !== undefined && (
    <LockBadge
      locked={isValidated}
      label={isValidated ? 'Clôturé' : 'Ouvert'}
      compact
      hint={
        isValidated
          ? 'Grille et commentaire figés. Réouvrez le rapprochement pour les modifier.'
          : 'Saisie en cours, enregistrée à chaque clic.'
      }
    />
  )
  useNavbarBadge(statusBadge)

  /* Bouton d'état du jour, rendu en bas de page (sous les commentaires), là où
     se termine la saisie — comme sur la feuille de caisse. Texte seul : le
     libellé dit déjà l'action, et un cadenas y ajoutait surtout une ambiguïté
     (illustre-t-il l'état courant, ou celui qu'on va atteindre ?).

     Présent de base, y compris en mode secours (In-House manquant) : l'hôtelier
     doit pouvoir clôturer le jour qu'il vient de saisir à la main, sans attendre
     un import qui ne viendra peut-être pas.

     Le poids visuel suit l'intention, comme sur la feuille de caisse : clôturer
     est la SUITE du travail (bouton plein), réouvrir en est le RETOUR EN ARRIÈRE
     (contour vert, accordé à la pastille d'en-tête). */
  const stateAction = !dayEditable ? null : !isValidated ? (
    // Avertissement non bloquant (D5) au survol si la balance n'est pas à zéro ;
    // le compteur visible vit dans la card « Reste à faire ».
    <Tip
      label={
        rec.pending > 0
          ? `${rec.pending} chambre(s) encore à faire`
          : 'Fige la grille et le commentaire du jour'
      }
    >
      <Button className="w-full" onClick={openCloseModal}>
        Clôturer le rapprochement
      </Button>
    </Tip>
  ) : (
    <Tip label="Rend la grille et le commentaire modifiables">
      <Button
        variant="outline"
        className="w-full border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-500 dark:hover:bg-emerald-500/10"
        onClick={handleReopen}
      >
        Réouvrir le rapprochement
      </Button>
    </Tip>
  )

  return (
    // Le PDF passe par jsPDF, pas par le DOM : rien à neutraliser en impression.
    // Pas de `min-h-0` : la page suit son flux (flex-1 la fait remplir le viewport
    // quand tout tient — bouton de clôture collé en bas), mais dès que le contenu
    // dépasse (fenêtre courte, alerte multi-lignes), elle grandit et `main` défile,
    // plutôt que d'écraser la zone commentaire jusqu'à la faire disparaître.
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 max-sm:pb-20">
      <PageHeader
        // Sous 1024px, le jour et le statut vivent dans la Navbar globale
        // (sous-titre + badge à côté du hamburger, posés par useNavbarSubtitle/
        // useNavbarBadge ci-dessous) : `undefined` plutôt qu'un contenu masqué
        // en CSS, pour que la ligne titre de PageHeader ne réserve plus du
        // tout sa hauteur (le vide entre la Navbar et les cartes de synthèse).
        // Au-delà de 1024px, la Navbar revient aux onglets et titre/badge
        // reprennent leur place normale ici.
        title={isNavbarMobile ? undefined : title}
        badgeAlign="end"
        badge={isNavbarMobile ? undefined : statusBadge}
        // Sous 640px, ce groupe entier laisse la place à la barre d'outils
        // basse fixe (cf. fin du composant) : une vraie barre d'app mobile
        // (icône + libellé, portée du pouce), pas des boutons de bureau
        // rétrécis. `undefined` (pas un `hidden` CSS) : PageHeader ne rend
        // alors littéralement rien pour ce prop, au lieu d'un groupe présent
        // mais invisible qui réserverait quand même sa part du `gap` parent.
        actions={
          !showTopToolbar ? undefined : (
            <>
            {/* Groupe « actions de page » : aide + vue analytique + impression. */}
            <ButtonGroup>
              {/* Aide : ouvre le tutoriel de la page (même bouton « ? » que
                  RepJour, tout à gauche du groupe). */}
              <Tip label="Comment ça marche">
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setHelpOpen(true)}
                  aria-label="Comment ça marche"
                >
                  <HelpGlyph />
                </Button>
              </Tip>
              <Tip label="Vue analytique">
                <Button asChild variant="outline" size="icon-sm">
                  <Link to="/rapro/analytique" aria-label="Vue analytique">
                    <LineChart />
                  </Link>
                </Button>
              </Tip>
              {/* Impression : toujours présente, mais désactivée tant que le jour
                  n'est pas clôturé — l'infobulle porte alors la raison. Le bouton
                  de clôture, lui, ferme la page (sous les commentaires). */}
              <PrintButton
                onClick={handleGeneratePdf}
                iconOnly
                disabled={!isValidated || pdfBusy}
                tipLabel={
                  isValidated
                    ? 'Imprimer / PDF'
                    : 'Clôturez le rapprochement pour imprimer la feuille'
                }
              />
            </ButtonGroup>
            {/* Groupe « navigation temporelle », collé au bord droit. */}
            <StepNav
              onPrev={() => goStep(-1)}
              onNext={() => goStep(1)}
              prevLabel="Jour précédent"
              nextLabel="Jour suivant"
              prevDisabled={atLower}
              nextDisabled={atLatest}
            >
              <DatePickerButton
                value={selectedDate}
                onChange={goDate}
                min={lowerDay}
                max={todayStr}
                enabledDates={pickerDates}
                todayValue={todayStr}
                ariaLabel="Choisir un jour"
              />
            </StepNav>
            </>
          )
        }
      />

      {(isError || oldestError || windowError) && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Impossible de charger les données (connexion ?). La navigation dans
          l'historique peut être limitée ; réessayez en changeant de jour puis
          en revenant.
        </div>
      )}

      {loading ? (
        <>
          {/* Squelette-reflet : la rangée de six tuiles de synthèse puis la
              grille des étages (une colonne par étage), aux mêmes gabarits que le
              contenu réel pour ne rien décaler à l'arrivée des données. */}
          <div className="rapro-stats" aria-hidden="true">
            {/* 6 tuiles TOUJOURS désormais (Bloquées veille comprise, même à 0) —
                le squelette doit refléter ce compte fixe pour ne rien décaler à
                l'arrivée des données. */}
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-stretch overflow-hidden rounded-xl border border-border bg-card"
              >
                <span className="w-2 shrink-0 bg-muted" aria-hidden="true" />
                <div className="flex flex-col justify-center gap-2 px-3 py-2.5">
                  <Skeleton className="h-2.5 w-16" />
                  <Skeleton className="h-5 w-10" />
                </div>
              </div>
            ))}
          </div>
          {/* Grille des étages : même structure que le vrai (`rapro-floor` >
              en-tête + `rapro-rooms`), une pastille par chambre. Les numéros de
              chambre sont invariants (seule la COULEUR de statut change au
              chargement) : reproduire la vraie grille donne une hauteur identique
              au pixel, quel que soit l'étage (13/14/14/14/14/11 chambres). */}
          <div className="rapro-floors" aria-hidden="true">
            {FLOORS.map(({ floor, rooms }) => (
              <div key={floor} className="rapro-floor">
                <div className="rapro-floor-head">
                  <span className="rapro-floor-title">Étage {floor}</span>
                </div>
                <div className="rapro-rooms">
                  {rooms.map((room) => (
                    <div key={room} className="rapro-room">
                      <Skeleton className="mx-auto h-4 w-7" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {occGap !== null && (
            <div className="rapro-occ-alert">
              Écart d'{Math.abs(occGap)}{' '}
              {Math.abs(occGap) > 1 ? 'chambres' : 'chambre'} :{' '}
              {inHouseExclComp} {inHouseExclComp > 1 ? 'occupées' : 'occupée'}{' '}
              cette nuit d'après le rooming, mais {officialOcc} d'après le
              rapport comptable. Ce n'est pas une gratuité — à vérifier (souvent
              une arrivée ou une annulation de dernière minute présente dans un
              seul des deux rapports).
            </div>
          )}

          <div className="rapro-stats">
            {/* Balance en TÊTE : contrôle de cohérence « coup d'œil ». Nettoyées +
                Refus + Bloquées du jour − Bloquées de la veille doit retomber sur les
                Vendues. Liseré GRIS neutre (seule tuile ainsi → la carte de synthèse se
                démarque des compteurs colorés) ; la VALEUR reste VERTE (« 0 » juste) ou
                ROUGE (« +X / −X » écart) — on ne colore donc PAS le texte avec la
                couleur du liseré (pas de `coloredValue`). En secours sans saisie, « — ». */}
            <StatTile
              value={
                showDash ? (
                  '—'
                ) : (
                  <span
                    style={{
                      color: balanced
                        ? CATEGORY_COLOR.nettoyee
                        : CATEGORY_COLOR.bloquee,
                    }}
                  >
                    {balanced
                      ? '0'
                      : `${balanceDelta > 0 ? '+' : '−'}${Math.abs(balanceDelta)}`}
                  </span>
                )
              }
              label="Balance"
              accent={ACCENT.slate}
              hint="Nettoyées + Refus + Bloquées du jour − Bloquées de la veille doit retomber sur les Vendues. « 0 » quand le compte est juste ; sinon l'écart (+/−) est à vérifier."
            />
            <StatTile
              value={dash(effectiveSold.size)}
              label="Vendues"
              accent="#818cf8"
              hint="Chambres occupées à traiter aujourd'hui."
            />
            <StatTile
              value={dash(cleanedCount)}
              label="Nettoyées"
              accent={CATEGORY_COLOR.nettoyee}
              hint="Ménages faits aujourd'hui, facturés (dont rattrapages sur reportées non vendues)."
            />
            <StatTile
              value={dash(stats.refus)}
              label="Refus"
              accent={CATEGORY_COLOR.refus}
              hint="Client a refusé le ménage."
            />
            <StatTile
              value={dash(stats.todo)}
              label={statLabel('Bloquées du jour', 'BLOQ. JOUR')}
              accent={CATEGORY_COLOR.bloquee}
              hint="Chambres non nettoyées aujourd'hui, reportées à demain."
            />
            {/* Bloquées de la veille (reportées) : carte TOUJOURS affichée (même à 0)
                — la grille de 6 cartes reste stable au lieu de passer de 5 à 6
                selon les jours, ce qui décalait la mise en page en responsive. */}
            <StatTile
              value={dash(carried.size)}
              label={statLabel('Bloquées de la veille', 'BLOQ. VEILLE')}
              accent={CATEGORY_COLOR.bloquee}
              hint="Chambres bloquées hier, encore à nettoyer aujourd'hui."
            />
          </div>

          {!fallbackMode && optionalMissing.length > 0 && (
            <div className="rapro-occ-alert">
              {optionalMissing.map((m) => (
                <p key={m.file}>
                  {m.file} du {sourceDate(m.date)} non importé (onglet {m.tab}).
                  Indisponible : {m.impact}.
                </p>
              ))}
            </div>
          )}

          {/* Mode secours : In-House manquant → bannière d'explication au-dessus de
          la grille (elle-même rendue toutes chambres non vendues). On nomme
          l'export à importer pour lever le secours ; entre-temps l'hôtelier
          saisit les statuts à la main. */}
          {fallbackMode && (
            <div className="rapro-occ-alert">
              <p>
                Rooming <strong>In-House Guests</strong> non importé pour le{' '}
                {sourceDate(selectedDate)} : grille de secours, toutes les
                chambres sont considérées comme non vendues. Vous pouvez saisir
                les statuts à la main ; l'affichage normal revient dès l'import.
              </p>
            </div>
          )}

          <div className={cn('rapro-floors', !canEditFields && 'is-locked')}>
            {FLOORS.map(({ floor, rooms }) => {
              // Bouton de rollback actif seulement si au moins une chambre de
              // l'étage porte une couleur OU un liseré manuel à annuler.
              const hasStatus = rooms.some(
                (r) => statuses.has(r) || dayCarriedManual.has(r),
              )
              return (
                <div key={floor} className="rapro-floor">
                  <div className="rapro-floor-head">
                    <span className="rapro-floor-title">Étage {floor}</span>
                    {canEditFields && (
                      <button
                        type="button"
                        className="rapro-floor-action"
                        onClick={() => resetFloor(rooms)}
                        disabled={!isSuccess || !hasStatus}
                        title="Rétablir l'état d'origine de l'étage"
                        aria-label={`Rétablir l'état d'origine de l'étage ${floor}`}
                      >
                        <RotateCcw className="size-4" />
                      </button>
                    )}
                  </div>
                  <div className="rapro-rooms">
                    {rooms.map((room) => {
                      const status = statusOf(statuses, room)
                      // Grise si AUCUNE couleur explicite ET non vendue — que la
                      // chambre soit reportée (liseré) ou non : le liseré est
                      // ORTHOGONAL, il ne colore pas le fond. Une couleur posée
                      // (même sur une non vendue) montre sa couleur.
                      const isEmpty = !statuses.has(room) && !occupied.has(room)
                      const isCarried = carried.has(room)
                      const visual = cellState(status, isEmpty)
                      const cls = CELL_STATES[visual].webClass
                      // Libellé = état VISUEL (une grise dit « Non vendue », pas
                      // « Nettoyée » par défaut) + mention du liseré reporté.
                      const roomLabel = `Chambre ${room} — ${CELL_STATES[visual].label}${isCarried ? ' — bloquée de la veille' : ''}`
                      // Souris : clic GAUCHE = cycle des couleurs (instantané) ; clic
                      // DROIT = pose/retire le liseré « bloquée la veille » À LA MAIN.
                      // Tactile (pas de clic droit) : appui simple = clic gauche,
                      // appui long (500ms) = clic droit — cf. startLongPress/
                      // handleRoomTap. Un jour clôturé reste figé (mutations gardées
                      // par `canEditFields`).
                      return (
                        <button
                          key={room}
                          type="button"
                          onClick={() => handleRoomTap(room)}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            toggleManual(room)
                          }}
                          onPointerDown={(e) => startLongPress(room, e.pointerType)}
                          onPointerUp={cancelLongPress}
                          onPointerLeave={cancelLongPress}
                          onPointerCancel={cancelLongPress}
                          disabled={!isSuccess}
                          aria-label={roomLabel}
                          title={roomLabel}
                          className={cn(
                            'rapro-room',
                            cls,
                            isCarried && 'rapro-room-carried',
                            pressingRoom === room && 'rapro-room-pressing',
                          )}
                        >
                          {room}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Tuto simple à GAUCHE (les deux gestes : souris + action courte, sans
              « clic gauche/droit » — le glyphe montre déjà le bouton), et tous les
              statuts couleur à DROITE. « Non vendue » (grisé) se lit sans légende.
              Souris uniquement (≥ 640px) : sous 640px, l'appui simple/long est
              jugé assez instinctif pour ne pas avoir besoin d'être rappelé — le
              geste lui-même reste actif à toute largeur (cf. startLongPress),
              seule cette légende texte est réservée au bureau. */}
          <div className="rapro-legend">
            <span className="hidden sm:contents">
              <span className="rapro-legend-group">
                <span className="rapro-legend-item">
                  <MouseGlyph side="left" />
                  change le statut
                </span>
                <span className="rapro-legend-item">
                  <MouseGlyph side="right" />
                  bloquée de la veille
                </span>
              </span>
            </span>
            <span className="rapro-legend-group">
              {LEGEND_ORDER.map((st) => (
                <span key={st} className="rapro-legend-item">
                  <span
                    className={cn('rapro-legend-dot', CELL_STATES[st].legendMod)}
                  />
                  {CELL_STATES[st].label}
                </span>
              ))}
              {/* « Bloquée de la veille » : AJOUTÉE DYNAMIQUEMENT à la légende
                  seulement s'il y en a au moins une ce jour — contrairement à la
                  carte de synthèse (désormais toujours affichée, même à 0), un
                  repère de légende pour un liseré absent de la grille n'aurait
                  aucun sens. */}
              {carried.size > 0 && (
                <span className="rapro-legend-item">
                  <span className="rapro-legend-carried" />
                  Bloquée de la veille
                </span>
              )}
            </span>
          </div>

          {/* Zone commentaire présente de base, y compris en mode secours :
              l'hôtelier peut annoter le jour dès l'arrivée (ex. « In-House
              manquant, saisie manuelle »), avant même toute saisie de statut.
              Champ ISOLÉ dans son propre composant : la frappe n'y re-render plus
              tout le board (donc pas de reconstruction des Set ni de la fenêtre de
              report à chaque touche) ; la valeur ne remonte qu'au blur. */}
          <RaproCommentCard
            reportDate={selectedDate}
            initialComment={comment}
            disabled={!canEditFields}
            operatorName={isValidated ? sheet.operatorName : ''}
            onCommit={commitComment}
          />

          {stateAction}
        </>
      )}

      {/* Modal d'aide : tutoriel factuel de la page (bouton « ? »). Le contenu
          reste en place dessous. */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
          <HelpDialogHeader
            icon={<HelpGlyph />}
            title="Comment fonctionne le rapprochement"
            description="Le suivi du ménage des chambres, étape par étape."
          />
          {/* Seul le corps défile : l'en-tête (flex shrink-0) reste fixe en haut. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <RaproHelpPanel />
          </div>
        </DialogContent>
      </Dialog>

      <PrintBlockedDialog
        open={printBlocked !== ''}
        onOpenChange={(open) => !open && setPrintBlocked('')}
        reason={printBlocked}
      />

      {/* Modal de clôture : verdict didactique + nom de l'hôtelier + clôture. */}
      <CloseSheetDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        title="Clôturer le rapprochement"
        subtitle={title}
        issues={closeIssues}
        okTitle="Rapprochement complet"
        okReason="Toutes les chambres occupées sont traitées, et l'occupation correspond au rapport comptable."
        hotelierName={hotelierName}
        onHotelierNameChange={setHotelierName}
        onConfirm={handleConfirmClose}
      />

      {/* Barre d'outils basse (mobile uniquement, < 640px) : une vraie barre
          d'app mobile — icône + libellé, portée du pouce — plutôt que les
          boutons de bureau simplement rétrécis. `fixed` échappe au scroll de
          `<main>` (aucun ancêtre ne pose de `transform`/`contain`, donc elle
          reste bien pinnée à la fenêtre) ; `max-sm:pb-20` sur le conteneur
          racine ci-dessus réserve la place pour qu'elle ne masque jamais la
          fin du contenu (commentaire, bouton Clôturer). Aide/Analytique/
          Imprimer gardent leurs handlers exacts de la barre du haut.
          Navigation temporelle : PAS le cluster StepNav+calendrier compressé
          dans une seule cellule (jugé peu pratique en mobile) — Précédent et
          Suivant deviennent chacun leur propre cellule pleine largeur, aux
          deux BORDS de la barre. C'est le pattern natif du feuilletage
          (pager) : au pouce, les bords d'un écran se rejoignent plus
          naturellement qu'un cluster étroit coincé dans un coin, et l'usage
          réel de cette page est justement de feuilleter les jours en continu.
          Le bouton calendrier séparé disparaît : le jour affiché en Navbar
          (sous-titre, useNavbarSubtitle ci-dessus) est maintenant lui-même
          tappable pour choisir une date arbitraire — un deuxième bouton
          calendrier ici aurait été redondant. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-border bg-card/95 backdrop-blur-md sm:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <button
          type="button"
          onClick={() => goStep(-1)}
          disabled={atLower}
          aria-label="Jour précédent"
          className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-muted-foreground transition-colors active:bg-accent active:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronLeft className="size-5" />
          <span className="text-[11px] font-medium">Préc.</span>
        </button>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          aria-label="Comment ça marche"
          className="flex flex-1 flex-col items-center justify-center gap-0.5 border-l border-border py-2 text-muted-foreground transition-colors active:bg-accent active:text-foreground"
        >
          <HelpGlyph className="size-5" />
          <span className="text-[11px] font-medium">Aide</span>
        </button>
        <Link
          to="/rapro/analytique"
          aria-label="Vue analytique"
          className="flex flex-1 flex-col items-center justify-center gap-0.5 border-l border-border py-2 text-muted-foreground transition-colors active:bg-accent active:text-foreground"
        >
          <LineChart className="size-5" />
          <span className="text-[11px] font-medium">Analytique</span>
        </Link>
        <button
          type="button"
          onClick={handleGeneratePdf}
          disabled={!isValidated || pdfBusy}
          aria-label="Imprimer / PDF"
          className="flex flex-1 flex-col items-center justify-center gap-0.5 border-l border-border py-2 text-muted-foreground transition-colors active:bg-accent active:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <Printer className="size-5" />
          <span className="text-[11px] font-medium">Imprimer</span>
        </button>
        <button
          type="button"
          onClick={() => goStep(1)}
          disabled={atLatest}
          aria-label="Jour suivant"
          className="flex flex-1 flex-col items-center justify-center gap-0.5 border-l border-border py-2 text-muted-foreground transition-colors active:bg-accent active:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronRight className="size-5" />
          <span className="text-[11px] font-medium">Suiv.</span>
        </button>
      </nav>
    </div>
  )
}

/** 'YYYY-MM-DD' → « 9 juillet 2026 » (jour de l'export à importer). */
function sourceDate(date: string): string {
  const d = parseDateStr(date)
  return d ? format(d, 'd MMMM yyyy', { locale: fr }) : date
}

/**
 * Carte commentaire du jour, à état LOCAL : la frappe reste dans ce composant et
 * ne re-render pas le board (donc pas de reconstruction des dérivations à chaque
 * touche). La valeur ne remonte au parent qu'au blur (`onCommit`) — la persistance
 * au blur, déjà en place, en fait le moment naturel. Le texte se resynchronise sur
 * `initialComment` au changement de jour et à l'hydratation de la feuille.
 */
function RaproCommentCard({
  reportDate,
  initialComment,
  disabled,
  operatorName,
  onCommit,
}: {
  reportDate: string
  initialComment: string
  disabled: boolean
  operatorName: string
  onCommit: (comment: string) => void
}) {
  const [text, setText] = useState(initialComment)
  useEffect(() => {
    setText(initialComment)
  }, [reportDate, initialComment])
  return (
    <div className="rapro-comment flex-1">
      <div className="flex items-center justify-between gap-2">
        <h2 className="rapro-comment-title">Commentaires</h2>
        {operatorName && (
          <span className="text-sm font-medium text-muted-foreground">
            {operatorName}
          </span>
        )}
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onCommit(text)}
        disabled={disabled}
        placeholder="Remarques du jour…"
        // Hauteur FLEXIBLE : la zone commentaires absorbe la place restante et
        // sert de variable d'ajustement. Quand l'alerte de contrôle d'occupation
        // passe sur plusieurs lignes, c'est ce champ qui se réduit — le bouton de
        // clôture ne se décale pas. `min-h-16` est un PLANCHER : le champ absorbe
        // jusqu'à cette hauteur puis s'arrête (jamais 0, jamais invisible) ; passé
        // ce point, c'est la page qui défile (cf. conteneur racine sans min-h-0).
        className="min-h-16 flex-1 resize-none"
      />
    </div>
  )
}
