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
  CalendarDays,
  CheckCheck,
  History,
  Info,
  RotateCcw,
  Scale,
  Sparkles,
  UserX,
} from 'lucide-react'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import { DatePickerButton } from '#/components/form/fields.tsx'
import { LockBadge } from '#/components/shared/LockBadge.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { PrintButton } from '#/components/shared/PrintButton.tsx'
import { StepNav } from '#/components/shared/StepNav.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
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
  nextStatus,
  STATUS_LABEL,
  statusOf,
} from '#/lib/rapro/constants.ts'
import { addDays, clampDay, today } from '#/lib/rapro/day.ts'
import { printRaproSheet } from '#/lib/rapro/pdf.ts'
import { isReconciled, reconcile } from '#/lib/rapro/reconcile.ts'
import { FLOORS } from '#/lib/rapro/rooms.ts'
import { missingSources, type MissingSource } from '#/lib/rapro/sources.ts'
import {
  fetchDay,
  fetchOfficialOcc,
  fetchOldestDay,
  fetchSheet,
  fetchValidatedDays,
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
  const carried = carryOver(past, { statuses, occupied, closed: isValidated })

  // Réconciliation sur le DÛ ÉLARGI (occupées du jour ∪ reportées).
  const dueSet = new Set(occupied)
  for (const r of carried) dueSet.add(r)
  const rec = reconcile(statuses, dueSet)
  const reconciled = isReconciled(rec)
  const hasDue = dueSet.size > 0
  // État vide seulement si aucune occupation ce jour ET aucune reportée.
  const showEmptyState = noOccupancy && carried.size === 0
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
  // entre l'occupation In-House (base de la grille) et Comparison (chiffre
  // officiel). Non nul = arrivées après clôture / correction à vérifier.
  const occGap =
    isValidated &&
    hasOccupancy &&
    officialOcc != null &&
    officialOcc !== occupied.size
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
    return applyStatuses(
      targets.map((r): [number, RoomStatus] => [r, newStatus]),
    )
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
            <Tip label="Récap mensuel">
              <Button asChild variant="outline" size="sm">
                <Link to="/rapro-mois" aria-label="Récap mensuel">
                  <CalendarDays />
                  <span className="hidden sm:inline">Récap</span>
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

      {occGap !== null && (
        <div className="rapro-occ-alert">
          Occupation In-House {occupied.size} et Comparison {officialOcc} ne
          concordent pas. Écart de {Math.abs(occGap)}{' '}
          {Math.abs(occGap) > 1 ? 'chambres' : 'chambre'} à vérifier.
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
          hint="Chambres encore à nettoyer. Zéro = tout est fait."
        />
        <Stat
          value={dash(carried.size)}
          label="Reportées"
          icon={History}
          accent="#fb923c"
          hint="Restées à faire depuis un jour précédent."
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
          accent="#64748b"
          hint="Chambre marquée à la main dans la grille."
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

      {/* Un jour sans occupation n'a rien à commenter ni à clôturer : l'écran se
          réduit à l'état vide, qui absorbe la place laissée libre. */}
      {!showEmptyState && (
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
      )}

      {stateAction}
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
      <TooltipContent className="max-w-56 text-center leading-snug">
        {hint}
      </TooltipContent>
    </Tooltip>
  )
}
