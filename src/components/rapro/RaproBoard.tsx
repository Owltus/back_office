import {
  useEffect,
  useState,
  type ComponentType,
  type CSSProperties,
} from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  Ban,
  BedDouble,
  Info,
  LineChart,
  RotateCcw,
  Scale,
  Sparkles,
  UserX,
} from 'lucide-react'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import { DatePickerButton } from '#/components/form/fields.tsx'
import { LockBadge } from '#/components/shared/LockBadge.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { PrintBlockedDialog } from '#/components/shared/PrintBlockedDialog.tsx'
import { PrintButton } from '#/components/shared/PrintButton.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { ButtonGroup } from '#/components/shared/ButtonGroup.tsx'
import { StepNav } from '#/components/shared/StepNav.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { usePrintShortcut } from '#/components/shared/usePrintShortcut.ts'
import { useStepNavKeys } from '#/components/shared/useStepNavKeys.ts'
import { Button } from '#/components/ui/button.tsx'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuTrigger,
} from '#/components/ui/context-menu.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip.tsx'
import {
  fetchDay as fetchPdjDay,
  fetchServiceDates,
} from '#/lib/pdj/service.ts'
import { parseDateStr } from '#/lib/poster/dateFormatter.ts'
import {
  carryOver,
  carryoverWindow,
  type DaySnapshot,
} from '#/lib/rapro/carryover.ts'
import {
  CELL_STATES,
  cellState,
  countStats,
  LEGEND_ORDER,
  STATUS_LABEL,
  statusOf,
  toggleClean,
} from '#/lib/rapro/constants.ts'
import { addDays, clampDay, today } from '#/lib/rapro/day.ts'
import { printRaproSheet } from '#/lib/rapro/pdf.ts'
import { isReconciled, reconcile } from '#/lib/rapro/reconcile.ts'
import { FLOORS } from '#/lib/rapro/rooms.ts'
import { missingSources, type MissingSource } from '#/lib/rapro/sources.ts'
import {
  clearRoom,
  fetchDay,
  fetchOfficialOcc,
  fetchOldestDay,
  fetchSheet,
  fetchValidatedDays,
  materializeCleaned,
  reopenSheet,
  saveComment,
  setStatus,
  validateSheet,
} from '#/lib/rapro/service.ts'
import type { RaproDay, RaproSheet, RoomStatus } from '#/lib/rapro/types.ts'
import { cn } from '#/lib/utils.ts'

const EMPTY: ReadonlyMap<number, RoomStatus> = new Map()

/** Statuts d'exception du menu contextuel (clic droit). « Nettoyée » et « Refus »
 * n'y figurent PAS : ils s'appliquent au clic gauche (bascule). */
const ROOM_STATUS_ORDER: RoomStatus[] = ['non_nettoyee', 'noshow']

/**
 * Rapprochement de chambres — suivi ménage par chambre et par jour.
 *
 * Cards de synthèse (style PDJ) + grille étages → chambres. L'occupation (donc
 * le nombre de chambres vendues ET le grisé des non vendues) vient du PDJ, une
 * seule et même source → tout reste synchro avec ce qu'on voit dans la grille.
 * Postulat : une chambre vendue est NETTOYÉE par défaut. Le CLIC GAUCHE bascule
 * entre nettoyée et refus (geste courant) ; le CLIC DROIT ouvre un menu pour les
 * statuts d'exception (Bloquée / No-show). L'état est persisté par (jour,
 * chambre), en optimiste — seules les exceptions sont stockées. Écriture
 * super/admin — RLS.
 */
export function RaproBoard({ initialDate }: { initialDate?: string }) {
  const { user, role } = useAuth()
  const isWriter = role === 'super_utilisateur' || role === 'admin'
  const queryClient = useQueryClient()

  const [selectedDate, setSelectedDate] = useState(() => initialDate ?? today())
  const todayStr = today()

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

  // Feuille jour : clôture + commentaire (table rapro_sheets, au niveau jour).
  const { data: sheet } = useQuery({
    queryKey: ['rapro', 'sheet', selectedDate],
    queryFn: () => fetchSheet(selectedDate),
  })
  const isValidated = sheet?.status === 'validated'
  // Verrou : dès qu'un jour est clôturé, tout est figé (grille + commentaire).
  const canEditFields = isWriter && !isValidated
  const [comment, setComment] = useState('')
  useEffect(() => {
    setComment(sheet?.comment ?? '')
  }, [sheet?.reportDate, sheet?.comment])
  const [pdfBusy, setPdfBusy] = useState(false)
  // Chambre dont le menu contextuel est ouvert : on lui garde le style de survol.
  const [menuRoom, setMenuRoom] = useState<number | null>(null)

  // OCC officiel du PMS à J-1 (décalage de datage). Sert d'unique CONTRÔLE
  // comptable : si l'occupation PDJ diffère du PMS, on l'alerte (c'est là que les
  // arrivées tardives / corrections apparaissent). Absent si RepJour non importé.
  const { data: officialOcc, isSuccess: occControlLoaded } = useQuery({
    queryKey: ['rapro', 'occ-control', addDays(selectedDate, -1)],
    queryFn: () => fetchOfficialOcc(addDays(selectedDate, -1)),
  })

  // Occupation PAR CHAMBRE (PDJ) : source unique des chambres vendues + du grisé.
  const { data: pdjRows } = useQuery({
    queryKey: ['pdj', 'day', selectedDate],
    queryFn: () => fetchPdjDay(selectedDate),
  })
  const occupied = new Set((pdjRows ?? []).map((r) => r.room))
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

  const stats = countStats(statuses, occupied)

  // Roulement (report) DÉRIVÉ : on relit une fenêtre bornée de jours précédents
  // (statuts rapro + occupation PDJ), mêmes clés → cache partagé avec la
  // navigation. `carried` = chambres dues antérieurement, jamais résolues depuis.
  const windowDays = carryoverWindow(selectedDate, lowerDay)
  const raproWindow = useQueries({
    queries: windowDays.map((d) => ({
      queryKey: ['rapro', 'day', d],
      queryFn: () => fetchDay(d),
    })),
  })
  const pdjWindow = useQueries({
    queries: windowDays.map((d) => ({
      queryKey: ['pdj', 'day', d],
      queryFn: () => fetchPdjDay(d),
    })),
  })
  // Jours CLÔTURÉS de la fenêtre : seuls eux font rouler leurs chambres non faites.
  const { data: validatedDays } = useQuery({
    queryKey: [
      'rapro',
      'validated-window',
      windowDays[0] ?? selectedDate,
      windowDays[windowDays.length - 1] ?? selectedDate,
    ],
    queryFn: () =>
      fetchValidatedDays(
        windowDays[0] ?? selectedDate,
        windowDays[windowDays.length - 1] ?? selectedDate,
      ),
    enabled: windowDays.length > 0,
  })
  const closedDays = validatedDays ?? new Set<string>()
  const past: DaySnapshot[] = windowDays.map((d, i) => ({
    statuses: raproWindow[i]?.data?.statuses ?? EMPTY,
    occupied: new Set((pdjWindow[i]?.data ?? []).map((r) => r.room)),
    closed: closedDays.has(d),
  }))
  const carried = carryOver(past)

  // Réconciliation sur le DÛ ÉLARGI (occupées du jour ∪ reportées).
  const dueSet = new Set(occupied)
  for (const r of carried) dueSet.add(r)
  const rec = reconcile(statuses, dueSet)
  const reconciled = isReconciled(rec)
  const hasDue = dueSet.size > 0
  // Fenêtre de report résolue ? Tant qu'une requête de la fenêtre est en vol,
  // `carried` est incomplet : afficher « Aucune donnée » sur un jour sans
  // occupation directe mais À REPORTS serait un faux vide, effacé une fraction de
  // seconde après. On attend donc la fenêtre AVANT de conclure au vide (la grille,
  // elle, n'est pas bloquée : elle se colore au fur et à mesure).
  const windowResolved =
    raproWindow.every((q) => !q.isPending) && pdjWindow.every((q) => !q.isPending)
  // État vide seulement si aucune occupation ce jour ET aucune reportée (fenêtre
  // résolue).
  const showEmptyState = noOccupancy && windowResolved && carried.size === 0
  /* Sans la moindre donnée, aucun compteur ne veut rien dire : les six cards
     affichent « — ». Un zéro se lirait « rien à faire », alors qu'il faut lire
     « rien de connu » — la nuance sépare une journée réglée d'un import oublié. */
  const dash = (v: number | string) => (showEmptyState ? '—' : v)
  const isDue = (room: number) => occupied.has(room) || carried.has(room)
  // Erreur réseau persistante sur un jour de la fenêtre → roulement possiblement
  // incomplet : on le signale via la bannière d'erreur (pas de sous-comptage muet).
  const windowError =
    raproWindow.some((q) => q.isError) || pdjWindow.some((q) => q.isError)

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
  const inHouseExclComp = occupied.size - freeRooms
  const occGap =
    isValidated &&
    hasOccupancy &&
    officialOcc != null &&
    officialOcc !== inHouseExclComp
      ? inHouseExclComp - officialOcc
      : null

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

  // Écriture optimiste d'un lot de statuts (jour courant) : snapshot → maj cache
  // → persistance parallèle → rollback réel par snapshot en cas d'échec (fiable
  // même hors ligne). Chemin unique partagé par la chambre seule et l'étage.
  async function applyStatuses(changes: Array<[number, RoomStatus]>) {
    if (!canEditFields || !isSuccess || changes.length === 0) return
    const key = ['rapro', 'day', selectedDate]
    await queryClient.cancelQueries({ queryKey: key })
    const prev = queryClient.getQueryData<RaproDay>(key)
    const nextStatuses = new Map(statuses)
    // On stocke le statut posé, y compris `nettoyee`. Le retour à l'origine passe
    // par `clearRooms`, pas par ici.
    for (const [room, status] of changes) {
      nextStatuses.set(room, status)
    }
    queryClient.setQueryData<RaproDay>(key, {
      reportDate: selectedDate,
      statuses: nextStatuses,
    })
    try {
      await Promise.all(
        changes.map(([room, status]) => setStatus(selectedDate, room, status)),
      )
    } catch {
      queryClient.setQueryData(
        key,
        prev ?? { reportDate: selectedDate, statuses: new Map() },
      )
    }
  }

  // Efface l'état de chambres (retour à l'ORIGINE : ligne supprimée). Même patron
  // optimiste + rollback. Sert au rollback d'étage et à repasser une chambre non
  // vendue en grisé.
  async function clearRooms(rooms: number[]) {
    if (!canEditFields || !isSuccess || rooms.length === 0) return
    const key = ['rapro', 'day', selectedDate]
    await queryClient.cancelQueries({ queryKey: key })
    const prev = queryClient.getQueryData<RaproDay>(key)
    const nextStatuses = new Map(statuses)
    for (const room of rooms) {
      nextStatuses.delete(room)
    }
    queryClient.setQueryData<RaproDay>(key, {
      reportDate: selectedDate,
      statuses: nextStatuses,
    })
    try {
      await Promise.all(rooms.map((room) => clearRoom(selectedDate, room)))
    } catch {
      queryClient.setQueryData(
        key,
        prev ?? { reportDate: selectedDate, statuses: new Map() },
      )
    }
  }

  // Clic gauche = bascule. Vendue : nettoyée ↔ refus. Non vendue : ROTATION non
  // vendue (grise) → nettoyée → refus → non vendue. (« Bloquée » reste au clic
  // droit.)
  function toggle(room: number) {
    if (isDue(room)) {
      return applyStatuses([[room, toggleClean(statusOf(statuses, room))]])
    }
    if (!statuses.has(room)) return applyStatuses([[room, 'nettoyee']])
    if (statusOf(statuses, room) === 'nettoyee') {
      return applyStatuses([[room, 'refus']])
    }
    return clearRooms([room])
  }

  // Clic droit — statut choisi.
  function setBase(room: number, base: RoomStatus) {
    return applyStatuses([[room, base]])
  }

  // Bouton d'en-tête d'étage : ROLLBACK à l'état d'origine. Toute chambre de
  // l'étage ayant reçu un statut (bloquée, refus) repasse en « nettoyée » (le
  // défaut : suppression de la ligne). Sert à annuler d'un geste les saisies
  // erronées d'un étage.
  function resetFloor(rooms: number[]) {
    return clearRooms(rooms.filter((r) => statuses.has(r)))
  }

  // --- Clôture / réouverture / impression (feuille jour) -------------------
  // Clôturer ou réouvrir un jour change l'ensemble des jours CLÔTURÉS, seule base
  // de l'analytique (récap facturable). On invalide donc son cache (préfixe
  // `monthly-counts` → vues annuelle ET mensuelle) pour qu'il se resynchronise
  // sans rechargement complet de la page.
  const invalidateAnalytique = () =>
    queryClient.invalidateQueries({ queryKey: ['rapro', 'monthly-counts'] })
  // Exécute une mutation de feuille puis resynchronise le cache (échec
  // silencieux : l'invalidation rétablit l'état réel du serveur).
  function refreshSheet(run: () => Promise<void>) {
    run()
      .catch(() => {})
      .finally(() =>
        Promise.all([
          queryClient.invalidateQueries({
            queryKey: ['rapro', 'sheet', selectedDate],
          }),
          invalidateAnalytique(),
        ]),
      )
  }
  function handleClose() {
    if (!user) return
    // Matérialise les chambres vendues encore au défaut (nettoyée implicite, sans
    // ligne) pour que le récap facturable les compte, PUIS clôture (commentaire
    // dans le même upsert ; signataire posé serveur). On invalide aussi le jour,
    // qui gagne de nouvelles lignes nettoyée, et l'analytique (nouveau jour clôturé).
    const toMaterialize = [...occupied].filter((r) => !statuses.has(r))
    materializeCleaned(selectedDate, toMaterialize)
      .then(() => validateSheet(selectedDate, comment))
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
    refreshSheet(() => reopenSheet(selectedDate))
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
            sold: occupied.size,
            clean: stats.clean,
            balance: rec.pending,
            carried: carried.size,
            refus: stats.refus,
            noshow: stats.noshow,
          },
          comment,
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
    if (showEmptyState) {
      setPrintBlocked('Aucune donnée pour ce jour. Importez les exports du PMS.')
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
  const title = label.charAt(0).toUpperCase() + label.slice(1)

  /* Bouton d'état du jour, rendu en bas de page (sous les commentaires), là où
     se termine la saisie — comme sur la feuille de caisse. Texte seul : le
     libellé dit déjà l'action, et un cadenas y ajoutait surtout une ambiguïté
     (illustre-t-il l'état courant, ou celui qu'on va atteindre ?).

     Sans occupation il n'y a rien à clôturer : le bouton disparaît, comme le
     commentaire. Clôturer un jour vide n'aurait figé que du vide, et aurait
     surtout fait croire que le ménage du jour était traité.

     Le poids visuel suit l'intention, comme sur la feuille de caisse : clôturer
     est la SUITE du travail (bouton plein), réouvrir en est le RETOUR EN ARRIÈRE
     (contour vert, accordé à la pastille d'en-tête). */
  const stateAction = !isWriter || showEmptyState ? null : !isValidated ? (
    // Avertissement non bloquant (D5) au survol si la balance n'est pas à zéro ;
    // le compteur visible vit dans la card « Reste à faire ».
    <Tip
      label={
        rec.pending > 0
          ? `${rec.pending} chambre(s) encore à faire`
          : 'Fige la grille et le commentaire du jour'
      }
    >
      <Button className="w-full" onClick={handleClose}>
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
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4">
      <PageHeader
        title={title}
        // Rien à verrouiller sans donnée, et rien à annoncer avant que
        // l'occupation et la feuille soient chargées : la pastille se
        // contredirait le temps d'un rendu.
        badge={
          pdjRows !== undefined &&
          sheet !== undefined &&
          !showEmptyState && (
            <LockBadge
              locked={isValidated}
              label={isValidated ? 'Clôturé' : 'Ouvert'}
              hint={
                isValidated
                  ? 'Grille et commentaire figés. Réouvrez le rapprochement pour les modifier.'
                  : 'Saisie en cours, enregistrée à chaque clic.'
              }
            />
          )
        }
        actions={
          <>
            {/* Groupe « actions de page » : vue analytique + impression. */}
            <ButtonGroup>
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
          {/* Squelette-reflet : la rangée de cinq cartes de synthèse puis la
              grille des étages (une colonne par étage), aux mêmes gabarits que le
              contenu réel pour ne rien décaler à l'arrivée des données. */}
          <div className="rapro-stats" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rapro-stat">
                <Skeleton className="h-2.5 w-2/3" />
                <div className="rapro-stat-row">
                  <Skeleton className="size-6 rounded-md" />
                  <Skeleton className="ml-auto h-5 w-8" />
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
          {Math.abs(occGap) > 1 ? 'chambres' : 'chambre'} : {inHouseExclComp}{' '}
          {inHouseExclComp > 1 ? 'occupées' : 'occupée'} cette nuit d'après le
          rooming, mais {officialOcc} d'après le rapport comptable. Ce n'est pas une
          gratuité — à vérifier (souvent une arrivée ou une annulation de dernière
          minute présente dans un seul des deux rapports).
        </div>
      )}

      <div className="rapro-stats">
        <Stat
          value={dash(hasOccupancy ? occupied.size : '—')}
          label="Vendues"
          icon={BedDouble}
          accent="#818cf8"
          hint="Chambres occupées à traiter aujourd'hui."
        />
        <Stat
          value={dash(stats.clean)}
          label="Nettoyées"
          icon={Sparkles}
          accent="#34d399"
          hint="Chambres nettoyées aujourd'hui (facturées)."
        />
        <Stat
          value={dash(hasDue ? rec.pending : '—')}
          label="Reste à faire"
          icon={Scale}
          accent={reconciled ? '#34d399' : '#fbbf24'}
          hint="Chambres encore à nettoyer (bloquées). Zéro = tout est fait."
        />
        <Stat
          value={dash(stats.refus)}
          label="Refus"
          icon={Ban}
          accent="#fbbf24"
          hint="Client a refusé le ménage."
        />
        <Stat
          value={dash(stats.noshow)}
          label="No-show"
          icon={UserX}
          accent="#a78bfa"
          hint="Vendue mais client absent (hors charge)."
        />
      </div>

      {!showEmptyState && optionalMissing.length > 0 && (
        <div className="rapro-occ-alert">
          {optionalMissing.map((m) => (
            <p key={m.file}>
              {m.file} du {sourceDate(m.date)} non importé (onglet {m.tab}).
              Indisponible : {m.impact}.
            </p>
          ))}
        </div>
      )}

      {showEmptyState ? (
        // `rapro-empty-card` s'étire pour occuper la hauteur laissée libre :
        // sans occupation, la page se terminerait sinon bien plus haut que la
        // feuille de caisse, et le bouton de clôture flotterait au milieu.
        <div className="rapro-card rapro-empty-card">
          <div className="rapro-empty">
            <Info className="rapro-empty-icon" />
            <h2 className="rapro-empty-title">
              Aucune donnée pour le {sourceDate(selectedDate)}
            </h2>
            {missing.length > 0 && <MissingList items={missing} />}
          </div>
        </div>
      ) : (
        <div className={cn('rapro-floors', !canEditFields && 'is-locked')}>
          {FLOORS.map(({ floor, rooms }) => {
            // Bouton de rollback actif seulement si au moins une chambre de
            // l'étage porte un statut (≠ nettoyée par défaut) à annuler.
            const hasStatus = rooms.some((r) => statuses.has(r))
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
                    // Grisée seulement si NON touchée (pas de ligne) ET non vendue.
                    // Une chambre non vendue explicitement marquée montre sa couleur.
                    const isEmpty = !statuses.has(room) && !isDue(room)
                    const isCarried = carried.has(room)
                    const cls = CELL_STATES[cellState(status, isEmpty)].webClass
                    const label = `Chambre ${room} — ${STATUS_LABEL[status]}${isEmpty ? ' — non vendue' : ''}${isCarried ? ' — bloquée la veille' : ''}`
                    const btn = (
                      <button
                        key={room}
                        type="button"
                        onClick={() => toggle(room)}
                        disabled={!isSuccess}
                        aria-label={label}
                        title={label}
                        className={cn(
                          'rapro-room',
                          cls,
                          isCarried && 'rapro-room-carried',
                          menuRoom === room && 'is-active',
                        )}
                      >
                        {room}
                      </button>
                    )
                    // Jour clôturé / lecture seule : bouton simple, sans menu.
                    if (!canEditFields) return btn
                    return (
                      <ContextMenu
                        key={room}
                        onOpenChange={(open) =>
                          setMenuRoom(open ? room : null)
                        }
                      >
                        <ContextMenuTrigger asChild>{btn}</ContextMenuTrigger>
                        <ContextMenuContent className="w-48">
                          {/* Statut d'exception (« Bloquée ») ; nettoyée/refus = clic gauche. */}
                          <ContextMenuRadioGroup
                            value={status}
                            onValueChange={(v) => setBase(room, v as RoomStatus)}
                          >
                            {ROOM_STATUS_ORDER.map((s) => (
                              <ContextMenuRadioItem key={s} value={s}>
                                <span
                                  className={cn(
                                    'rapro-legend-dot',
                                    CELL_STATES[cellState(s, false)].legendMod,
                                  )}
                                />
                                {STATUS_LABEL[s]}
                              </ContextMenuRadioItem>
                            ))}
                          </ContextMenuRadioGroup>
                        </ContextMenuContent>
                      </ContextMenu>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!showEmptyState && (
        <div className="rapro-legend">
          {/* « Non vendue » (empty) masquée de la légende à la demande — le rendu
              grisé des cases non vendues, lui, reste (via CELL_STATES/cellState). */}
          {LEGEND_ORDER.filter((st) => st !== 'empty').map((st) => (
            <span key={st} className="rapro-legend-item">
              <span
                className={cn('rapro-legend-dot', CELL_STATES[st].legendMod)}
              />
              {CELL_STATES[st].label}
            </span>
          ))}
        </div>
      )}

      {/* Un jour sans occupation n'a rien à commenter ni à clôturer : l'écran se
          réduit à l'état vide, qui absorbe la place laissée libre. */}
      {!showEmptyState && (
      <div className="rapro-comment flex-1">
        <h2 className="rapro-comment-title">Commentaires</h2>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onBlur={() => {
            if (!canEditFields) return
            // Garde le cache sheet en phase avec la valeur persistée : sinon
            // l'effet d'hydratation ré-injecterait une valeur périmée au retour
            // sur le jour (staleTime 60 s), faisant « disparaître » le commentaire.
            queryClient.setQueryData<RaproSheet | null>(
              ['rapro', 'sheet', selectedDate],
              (prev) =>
                prev
                  ? { ...prev, comment }
                  : {
                      reportDate: selectedDate,
                      status: 'draft',
                      comment,
                      validatedAt: null,
                    },
            )
            saveComment(selectedDate, comment).catch(() => {})
          }}
          disabled={!canEditFields}
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
      )}

      {stateAction}
        </>
      )}

      <PrintBlockedDialog
        open={printBlocked !== ''}
        onOpenChange={(open) => !open && setPrintBlocked('')}
        reason={printBlocked}
      />
    </div>
  )
}

/** 'YYYY-MM-DD' → « 9 juillet 2026 » (jour de l'export à importer). */
function sourceDate(date: string): string {
  const d = parseDateStr(date)
  return d ? format(d, 'd MMMM yyyy', { locale: fr }) : date
}

/** Exports PMS à importer pour débloquer la page (cf. `missingSources`), en une
 * phrase. Ni date — celle du titre suffit —, ni onglet, ni encadré : nommer les
 * fichiers suffit à savoir quoi faire. */
function MissingList({ items }: { items: MissingSource[] }) {
  return (
    <p className="rapro-missing">
      Importez{' '}
      {items.map((m, i) => (
        <span key={m.file}>
          {i > 0 && (i === items.length - 1 ? ' et ' : ', ')}
          <strong>{m.file}</strong>
        </span>
      ))}
      .
    </p>
  )
}

/** Carte KPI (style PDJ) : icône teintée + valeur + libellé. `hint` = explication
 * au survol (tooltip), pour comprendre d'où vient la donnée. */
function Stat({
  value,
  label,
  icon: Icon,
  accent,
  hint,
}: {
  value: number | string
  label: string
  icon: ComponentType<{ className?: string }>
  accent: string
  hint?: string
}) {
  const card = (
    <div
      className={cn('rapro-stat', hint && 'cursor-help')}
      style={{ '--rapro-accent': accent } as CSSProperties}
    >
      <span className="rapro-stat-label">{label}</span>
      <span className="rapro-stat-row">
        <span className="rapro-stat-icon">
          <Icon className="size-3.5" />
        </span>
        <span className="rapro-stat-value">{value}</span>
      </span>
    </div>
  )
  if (!hint) return card
  return (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent className="max-w-56 select-none text-center leading-snug">
        {hint}
      </TooltipContent>
    </Tooltip>
  )
}
