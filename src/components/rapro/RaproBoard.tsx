import {
  useEffect,
  useState,
  type ComponentType,
  type CSSProperties,
} from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  Ban,
  BedDouble,
  CalendarDays,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  History,
  Info,
  Lock,
  LockOpen,
  RotateCcw,
  Scale,
  Sparkles,
  UserX,
} from 'lucide-react'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import { DatePickerButton } from '#/components/form/fields.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { PrintButton } from '#/components/shared/PrintButton.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
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
  nextStatus,
  STATUS_LABEL,
  statusOf,
} from '#/lib/rapro/constants.ts'
import { addDays, clampDay, today } from '#/lib/rapro/day.ts'
import { printRaproSheet } from '#/lib/rapro/pdf.ts'
import { isReconciled, reconcile } from '#/lib/rapro/reconcile.ts'
import { FLOORS } from '#/lib/rapro/rooms.ts'
import {
  fetchDay,
  fetchOfficialOcc,
  fetchOldestDay,
  fetchSheet,
  reopenSheet,
  saveComment,
  setStatus,
  validateSheet,
} from '#/lib/rapro/service.ts'
import type { RaproDay, RaproSheet, RoomStatus } from '#/lib/rapro/types.ts'
import { cn } from '#/lib/utils.ts'

const EMPTY: ReadonlyMap<number, RoomStatus> = new Map()

/**
 * Rapprochement de chambres — suivi ménage par chambre et par jour.
 *
 * Cards de synthèse (style PDJ) + grille étages → chambres. L'occupation (donc
 * le nombre de chambres vendues ET le grisé des non vendues) vient du PDJ, une
 * seule et même source → tout reste synchro avec ce qu'on voit dans la grille.
 * Chaque chambre porte un statut ménage (nettoyée / non nettoyée / refus /
 * no-show) que l'on fait défiler au clic ; l'état est persisté par (jour,
 * chambre), en optimiste. Écriture super/admin — RLS.
 */
export function RaproBoard() {
  const { user, role } = useAuth()
  const isWriter = role === 'super_utilisateur' || role === 'admin'
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [selectedDate, setSelectedDate] = useState(() => today())
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

  const { data: day, isError, isSuccess } = useQuery({
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

  // OCC officiel du PMS à J-1 (décalage de datage). Sert d'unique CONTRÔLE
  // comptable : si l'occupation PDJ diffère du PMS, on l'alerte (c'est là que les
  // arrivées tardives / corrections apparaissent). Absent si RepJour non importé.
  const { data: officialOcc } = useQuery({
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
  const past: DaySnapshot[] = windowDays.map((_, i) => ({
    statuses: raproWindow[i]?.data?.statuses ?? EMPTY,
    occupied: new Set((pdjWindow[i]?.data ?? []).map((r) => r.room)),
  }))
  const carried = carryOver(past, { statuses, occupied })

  // Réconciliation sur le DÛ ÉLARGI (occupées du jour ∪ reportées).
  const dueSet = new Set(occupied)
  for (const r of carried) dueSet.add(r)
  const rec = reconcile(statuses, dueSet)
  const reconciled = isReconciled(rec)
  const hasDue = dueSet.size > 0
  // État vide seulement si aucune occupation ce jour ET aucune reportée.
  const showEmptyState = noOccupancy && carried.size === 0
  const isDue = (room: number) => occupied.has(room) || carried.has(room)
  // Erreur réseau persistante sur un jour de la fenêtre → roulement possiblement
  // incomplet : on le signale via la bannière d'erreur (pas de sous-comptage muet).
  const windowError =
    raproWindow.some((q) => q.isError) || pdjWindow.some((q) => q.isError)

  // Contrôle comptable : écart entre l'occupation PDJ (base de la grille) et
  // l'OCC officiel du PMS. Non nul = arrivées tardives / correction à vérifier.
  const occGap =
    hasOccupancy && officialOcc != null && officialOcc !== occupied.size
      ? officialOcc - occupied.size
      : null

  function goStep(delta: number) {
    setSelectedDate((cur) => clampDay(addDays(cur, delta), lowerDay, todayStr))
  }
  function goDate(value: string) {
    setSelectedDate(clampDay(value, lowerDay, todayStr))
  }

  // Écriture optimiste d'un lot de statuts (jour courant) : snapshot → maj cache
  // → persistance parallèle → rollback réel par snapshot en cas d'échec (fiable
  // même hors ligne). Chemin unique partagé par la chambre seule et l'étage.
  async function applyStatuses(changes: Array<[number, RoomStatus]>) {
    if (!canEditFields || !isSuccess || changes.length === 0) return
    const key = ['rapro', 'day', selectedDate]
    await queryClient.cancelQueries({ queryKey: key })
    const prev = queryClient.getQueryData<RaproDay>(key)
    const nextStatuses = new Map(statuses)
    for (const [room, status] of changes) {
      if (status === 'non_nettoyee') nextStatuses.delete(room)
      else nextStatuses.set(room, status)
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

  // Fait défiler le statut d'une chambre au clic.
  function cycle(room: number) {
    return applyStatuses([[room, nextStatus(statusOf(statuses, room))]])
  }

  // Bouton d'en-tête d'étage, À BASCULE : s'il reste des chambres OCCUPÉES à
  // faire → toutes en « nettoyée » (laisse refus / no-show en l'état) ; sinon
  // (rien à faire) → RETOUR ARRIÈRE : toute chambre de l'étage ayant un statut
  // (nettoyée, refus, no-show — occupée OU non vendue) repasse en « non
  // nettoyée » (une non vendue redevient alors grisée).
  function toggleFloor(rooms: number[]) {
    const toDo = rooms.filter(
      (r) => isDue(r) && statusOf(statuses, r) === 'non_nettoyee',
    )
    const forward = toDo.length > 0
    const targets = forward
      ? toDo
      : rooms.filter((r) => statusOf(statuses, r) !== 'non_nettoyee')
    const newStatus: RoomStatus = forward ? 'nettoyee' : 'non_nettoyee'
    return applyStatuses(targets.map((r): [number, RoomStatus] => [r, newStatus]))
  }

  // --- Clôture / réouverture / impression (feuille jour) -------------------
  // Exécute une mutation de feuille puis resynchronise le cache (échec
  // silencieux : l'invalidation rétablit l'état réel du serveur).
  function refreshSheet(run: () => Promise<void>) {
    run()
      .catch(() => {})
      .finally(() =>
        queryClient.invalidateQueries({
          queryKey: ['rapro', 'sheet', selectedDate],
        }),
      )
  }
  function handleClose() {
    if (!user) return
    // Commentaire écrit dans le même upsert que la clôture (une seule requête).
    refreshSheet(() => validateSheet(selectedDate, user.id, comment))
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

  const parsed = parseDateStr(selectedDate)
  const label = parsed
    ? format(parsed, 'EEEE d MMMM yyyy', { locale: fr })
    : selectedDate
  const title = label.charAt(0).toUpperCase() + label.slice(1)

  return (
    <div className="flex flex-1 flex-col gap-4">
      <PageHeader
        title={title}
        actions={
          <>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => navigate({ to: '/rapro-mois' })}
              aria-label="Récap mensuel (ELIOR)"
              title="Récap mensuel (ELIOR)"
            >
              <CalendarDays />
            </Button>
            {isWriter &&
              (!isValidated ? (
                // Jour éditable → cadenas OUVERT (état courant) ; l'action clôture.
                // Avertissement non bloquant (D5) au survol si la balance n'est pas
                // à zéro ; le compteur visible vit dans la card « Reste à faire ».
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={handleClose}
                  aria-label="Clôturer le rapprochement"
                  title={
                    rec.pending > 0
                      ? `Clôturer (${rec.pending} chambre(s) encore à faire)`
                      : 'Clôturer'
                  }
                >
                  <LockOpen />
                </Button>
              ) : (
                // Jour clôturé → cadenas FERMÉ (état courant) ; l'action réouvre.
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={handleReopen}
                  aria-label="Réouvrir le rapprochement"
                  title="Réouvrir"
                >
                  <Lock />
                </Button>
              ))}
            {isValidated && (
              <PrintButton
                onClick={handleGeneratePdf}
                iconOnly
                disabled={pdfBusy}
              />
            )}
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => goStep(-1)}
              disabled={atLower}
              aria-label="Jour précédent"
            >
              <ChevronLeft />
            </Button>
            <DatePickerButton
              value={selectedDate}
              onChange={goDate}
              min={lowerDay}
              max={todayStr}
              ariaLabel="Choisir un jour"
            />
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => goStep(1)}
              disabled={atLatest}
              aria-label="Jour suivant"
            >
              <ChevronRight />
            </Button>
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

      {occGap !== null && (
        <div className="rapro-occ-alert">
          Contrôle : occupation PDJ {occupied.size} vs réception PMS {officialOcc}{' '}
          — écart de {Math.abs(occGap)} chambre(s) à vérifier (arrivées après
          clôture, correction…).
        </div>
      )}

      <TooltipProvider>
        <div className="rapro-stats">
          <Stat
            value={hasOccupancy ? occupied.size : '—'}
            label="Vendues"
            icon={BedDouble}
            accent="#818cf8"
            hint="Chambres occupées cette nuit : le total à traiter au ménage aujourd'hui."
          />
          <Stat
            value={stats.clean}
            label="Nettoyées"
            icon={Sparkles}
            accent="#34d399"
            hint="Chambres dont le ménage a été fait aujourd'hui — la base de la facturation du prestataire."
          />
          <Stat
            value={hasDue ? rec.pending : '—'}
            label="Reste à faire"
            icon={Scale}
            accent={reconciled ? '#34d399' : '#fbbf24'}
            hint="Chambres encore à nettoyer aujourd'hui, reportées comprises. À zéro (vert) : tout est fait ou justifié."
          />
          <Stat
            value={carried.size}
            label="Reportées"
            icon={History}
            accent="#fb923c"
            hint="Chambres non faites un jour précédent, encore à traiter : elles restent affichées jusqu'à être nettoyées, refusées ou en no-show."
          />
          <Stat
            value={stats.refus}
            label="Refus"
            icon={Ban}
            accent="#fbbf24"
            hint="Client présent ayant refusé le ménage : chambre non faite, mais justifiée."
          />
          <Stat
            value={stats.noshow}
            label="No-show"
            icon={UserX}
            accent="#64748b"
            hint="Chambre réservée mais client jamais arrivé : rien à nettoyer."
          />
        </div>
      </TooltipProvider>

      {showEmptyState ? (
        <div className="rapro-card">
          <div className="rapro-empty">
            <Info className="rapro-empty-icon" />
            <p>
              Occupation par chambre indisponible pour ce jour. Importez le
              rapport PDJ de cette date dans l'onglet PDJ pour afficher les
              chambres et leur suivi ménage.
            </p>
          </div>
        </div>
      ) : (
        <div className={cn('rapro-floors', !canEditFields && 'is-locked')}>
          {FLOORS.map(({ floor, rooms }) => {
            const hasToDo = rooms.some(
              (r) => isDue(r) && statusOf(statuses, r) === 'non_nettoyee',
            )
            const hasResolved = rooms.some(
              (r) => statusOf(statuses, r) !== 'non_nettoyee',
            )
            // Icône ↺ (retour arrière) dès qu'il n'y a plus rien à nettoyer mais
            // qu'il reste des statuts à réinitialiser (y compris non vendues).
            const floorDone = !hasToDo && hasResolved
            return (
              <div key={floor} className="rapro-floor">
                <div className="rapro-floor-head">
                  <span className="rapro-floor-title">Étage {floor}</span>
                  {canEditFields && (
                    <button
                      type="button"
                      className="rapro-floor-action"
                      onClick={() => toggleFloor(rooms)}
                      disabled={!isSuccess}
                      title={
                        floorDone
                          ? "Repasser l'étage en non nettoyé"
                          : "Marquer l'étage nettoyé"
                      }
                      aria-label={
                        floorDone
                          ? `Repasser l'étage ${floor} en non nettoyé`
                          : `Marquer l'étage ${floor} nettoyé`
                      }
                    >
                      {floorDone ? (
                        <RotateCcw className="size-4" />
                      ) : (
                        <CheckCheck className="size-4" />
                      )}
                    </button>
                  )}
                </div>
                <div className="rapro-rooms">
                  {rooms.map((room) => {
                    const status = statusOf(statuses, room)
                    const isEmpty = hasDue && !isDue(room)
                    const isCarried = carried.has(room)
                    const cls = CELL_STATES[cellState(status, isEmpty)].webClass
                    return (
                      <button
                        key={room}
                        type="button"
                        onClick={() => cycle(room)}
                        disabled={!isSuccess}
                        aria-label={`Chambre ${room} — ${STATUS_LABEL[status]}${isEmpty ? ' — non vendue' : ''}${isCarried ? ' — reportée' : ''}`}
                        title={`${STATUS_LABEL[status]}${isEmpty ? ' · non vendue' : ''}${isCarried ? ' · reportée' : ''}`}
                        className={cn(
                          'rapro-room',
                          cls,
                          isCarried && 'rapro-room-reportee',
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
      )}

      {!showEmptyState && (
        <div className="rapro-legend">
          {LEGEND_ORDER.map((st) => (
            <span key={st} className="rapro-legend-item">
              <span
                className={cn('rapro-legend-dot', CELL_STATES[st].legendMod)}
              />
              {CELL_STATES[st].label}
            </span>
          ))}
          <span className="rapro-legend-item">
            <span className="rapro-legend-dot is-reportee" />
            Reportée
          </span>
        </div>
      )}

      <div className="rapro-comment">
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
          className="min-h-24"
        />
      </div>
    </div>
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
      <span className="rapro-stat-icon">
        <Icon className="size-5" />
      </span>
      <span className="rapro-stat-body">
        <span className="rapro-stat-value">{value}</span>
        <span className="rapro-stat-label">{label}</span>
      </span>
    </div>
  )
  if (!hint) return card
  return (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent className="max-w-64">{hint}</TooltipContent>
    </Tooltip>
  )
}
