import { useEffect, useState } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { LineChart, RotateCcw } from 'lucide-react'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import { DatePickerButton } from '#/components/form/fields.tsx'
import { LockBadge } from '#/components/shared/LockBadge.tsx'
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
import { Textarea } from '#/components/ui/textarea.tsx'
import {
  fetchDay as fetchPdjDay,
  fetchServiceDates,
} from '#/lib/pdj/service.ts'
import { parseDateStr } from '#/lib/poster/dateFormatter.ts'
import { carryOver, carryoverWindow } from '#/lib/rapro/carryover.ts'
import type { DaySnapshot } from '#/lib/rapro/carryover.ts'
import {
  CATEGORY_COLOR,
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
import { reconcile } from '#/lib/rapro/reconcile.ts'
import { FLOORS } from '#/lib/rapro/rooms.ts'
import { missingSources } from '#/lib/rapro/sources.ts'
import {
  clearRoom,
  fetchDay,
  fetchOfficialOcc,
  fetchOldestDay,
  fetchSheet,
  materializeCleaned,
  reopenSheet,
  saveComment,
  setStatus,
  validateSheet,
} from '#/lib/rapro/service.ts'
import type { RaproDay, RaproSheet, RoomStatus } from '#/lib/rapro/types.ts'
import { capitalize, cn } from '#/lib/utils.ts'

const EMPTY: ReadonlyMap<number, RoomStatus> = new Map()

/**
 * Rapprochement de chambres — suivi ménage par chambre et par jour.
 *
 * Cards de synthèse (style PDJ) + grille étages → chambres. L'occupation (donc
 * le nombre de chambres vendues ET le grisé des non vendues) vient du PDJ, une
 * seule et même source → tout reste synchro avec ce qu'on voit dans la grille.
 * Postulat : une chambre vendue est NETTOYÉE par défaut. Un CLIC fait défiler le
 * cycle des statuts (nettoyée → refus → no-show → bloquée → défaut). L'état est
 * persisté par (jour, chambre), en optimiste — seules les exceptions sont
 * stockées. Écriture super/admin — RLS.
 */
export function RaproBoard({ initialDate }: { initialDate?: string }) {
  const { user, can } = useAuth()
  const isWriter = can('rapro', 'ecriture')
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
              validatedAt: null,
            },
    )
    saveComment(selectedDate, next).catch(() => {})
  }
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

  // « Vendues » EFFECTIVES : l'occupation PDJ + les chambres NON vendues
  // auxquelles on a posé un statut à la main. Une non vendue marquée compte alors
  // comme vendue (carte Vendues) ET dans sa carte de statut (Nettoyées/Refus/…).
  const effectiveSold = new Set(occupied)
  for (const room of statuses.keys()) effectiveSold.add(room)
  const stats = countStats(statuses, effectiveSold)

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
  }))
  const carried = carryOver(past)

  // Réconciliation sur le DÛ ÉLARGI (occupées du jour ∪ reportées).
  const dueSet = new Set(occupied)
  for (const r of carried) dueSet.add(r)
  const rec = reconcile(statuses, dueSet)
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
  const isDue = (room: number) => occupied.has(room) || carried.has(room)
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

  // Cœur d'écriture optimiste (jour courant), partagé par la pose de statut et
  // l'effacement : snapshot → mutation locale de la Map → maj cache → persistance
  // parallèle → rollback réel par snapshot en cas d'échec (fiable même hors ligne).
  // `editDraft` décrit la mutation locale d'un item, `persistOne` sa persistance.
  async function mutateRooms<T>(
    items: T[],
    editDraft: (draft: Map<number, RoomStatus>, item: T) => void,
    persistOne: (item: T) => Promise<void>,
  ) {
    if (!canEditFields || !isSuccess || items.length === 0) return
    const key = ['rapro', 'day', selectedDate]
    await queryClient.cancelQueries({ queryKey: key })
    const prev = queryClient.getQueryData<RaproDay>(key)
    const nextStatuses = new Map(statuses)
    for (const item of items) editDraft(nextStatuses, item)
    queryClient.setQueryData<RaproDay>(key, {
      reportDate: selectedDate,
      statuses: nextStatuses,
    })
    try {
      await Promise.all(items.map(persistOne))
    } catch {
      queryClient.setQueryData(
        key,
        prev ?? { reportDate: selectedDate, statuses: new Map() },
      )
    }
  }

  // Pose un lot de statuts (on stocke le statut posé, y compris `nettoyee` ; le
  // retour à l'origine passe par `clearRooms`).
  const applyStatuses = (changes: Array<[number, RoomStatus]>) =>
    mutateRooms(
      changes,
      (draft, [room, status]) => draft.set(room, status),
      ([room, status]) => setStatus(selectedDate, room, status),
    )

  // Efface l'état de chambres (retour à l'ORIGINE : ligne supprimée). Sert au
  // rollback d'étage et à repasser une chambre non vendue en grisé.
  const clearRooms = (rooms: number[]) =>
    mutateRooms(
      rooms,
      (draft, room) => draft.delete(room),
      (room) => clearRoom(selectedDate, room),
    )

  // Clic sur une chambre = cycle des couleurs, IDENTIQUE pour les vendues et les
  // non vendues : Nettoyée → Refus → No-show → Bloquée → défaut. Le « défaut »
  // efface la ligne — vendue : redevient Nettoyée (verte) ; non vendue : redevient
  // grisée. Cas particulier : une non vendue SANS ligne part du gris, son premier
  // clic pose Nettoyée (sinon `nextStatus(nettoyee)` sauterait directement à Refus).
  function toggle(room: number) {
    if (!isDue(room) && !statuses.has(room)) {
      return applyStatuses([[room, 'nettoyee']])
    }
    const next = nextStatus(statusOf(statuses, room))
    return next === 'nettoyee'
      ? clearRooms([room])
      : applyStatuses([[room, next]])
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
            sold: effectiveSold.size,
            clean: stats.clean,
            bloquee: stats.todo,
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
  const stateAction = !isWriter ? null : !isValidated ? (
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
        // Rien à annoncer avant que l'occupation et la feuille soient chargées :
        // la pastille se contredirait le temps d'un rendu. En secours, on affiche
        // « Ouvert » de base (grille de secours exploitable, clôturable).
        badge={
          pdjRows !== undefined &&
          sheet !== undefined && (
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
          {/* Squelette-reflet : la rangée de six tuiles de synthèse puis la
              grille des étages (une colonne par étage), aux mêmes gabarits que le
              contenu réel pour ne rien décaler à l'arrivée des données. */}
          <div className="rapro-stats" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, i) => (
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
            <StatTile
              value={dash(effectiveSold.size)}
              label="Vendues"
              accent="#818cf8"
              hint="Chambres occupées à traiter aujourd'hui."
            />
            <StatTile
              value={dash(stats.clean)}
              label="Nettoyées"
              accent={CATEGORY_COLOR.nettoyee}
              hint="Chambres nettoyées aujourd'hui (facturées)."
            />
            <StatTile
              value={dash(stats.refus)}
              label="Refus"
              accent={CATEGORY_COLOR.refus}
              hint="Client a refusé le ménage."
            />
            <StatTile
              value={dash(stats.noshow)}
              label="No-show"
              accent={CATEGORY_COLOR.noshow}
              hint="Vendue mais client absent (hors charge)."
            />
            <StatTile
              value={dash(stats.todo)}
              label="Bloquées"
              accent={CATEGORY_COLOR.bloquee}
              hint="Chambres occupées non nettoyées (bloquées, restent dues)."
            />
            {/* Bloquées la veille (reportées) : carte affichée SEULEMENT s'il y en a. */}
            {carried.size > 0 && (
              <StatTile
                value={carried.size}
                label="Bloquées la veille"
                accent={CATEGORY_COLOR.bloquee}
                hint="Chambres bloquées un jour précédent, non encore résolues (liseré rouge)."
              />
            )}
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
                      const cls =
                        CELL_STATES[cellState(status, isEmpty)].webClass
                      const label = `Chambre ${room} — ${STATUS_LABEL[status]}${isEmpty ? ' — non vendue' : ''}${isCarried ? ' — bloquée la veille' : ''}`
                      // Clic = cycle des statuts (plus de menu contextuel). Un jour
                      // clôturé reste figé : les mutations sont gardées par
                      // `canEditFields`, le clic n'a alors aucun effet.
                      return (
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

          <div className="rapro-legend">
            {/* « Non vendue » (empty) ne figure pas dans LEGEND_ORDER ; le rendu
              grisé des cases non vendues, lui, reste (via CELL_STATES/cellState). */}
            {LEGEND_ORDER.map((st) => (
              <span key={st} className="rapro-legend-item">
                <span
                  className={cn('rapro-legend-dot', CELL_STATES[st].legendMod)}
                />
                {CELL_STATES[st].label}
              </span>
            ))}
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
            onCommit={commitComment}
          />

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
  onCommit,
}: {
  reportDate: string
  initialComment: string
  disabled: boolean
  onCommit: (comment: string) => void
}) {
  const [text, setText] = useState(initialComment)
  useEffect(() => {
    setText(initialComment)
  }, [reportDate, initialComment])
  return (
    <div className="rapro-comment flex-1">
      <h2 className="rapro-comment-title">Commentaires</h2>
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
