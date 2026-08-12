import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowUp,
  Coffee,
  FileUp,
  LineChart,
  Star,
  Trash2,
} from 'lucide-react'

import { EmptyCanvas } from '#/components/shared/EmptyCanvas.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { ConfirmDialog } from '#/components/shared/ConfirmDialog.tsx'
import { PrintBlockedDialog } from '#/components/shared/PrintBlockedDialog.tsx'
import { PrintButton } from '#/components/shared/PrintButton.tsx'
import { StatTile } from '#/components/shared/StatTile.tsx'
import { usePrintShortcut } from '#/components/shared/usePrintShortcut.ts'
import { ButtonGroup } from '#/components/shared/ButtonGroup.tsx'
import { StepNav } from '#/components/shared/StepNav.tsx'
import { useStepNavKeys } from '#/components/shared/useStepNavKeys.ts'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { DatePickerButton } from '#/components/form/fields.tsx'
import { useAuth } from '#/components/auth/AuthContext.tsx'
import { capitalize, cn } from '#/lib/utils.ts'
import { MANUAL_IMPORT_ENABLED_FOR_ALL } from '#/lib/repjour/constants.ts'
import { errorMessage } from '#/lib/errors.ts'
import { printWithTitle } from '#/lib/print.ts'
import {
  ALL_ROOMS,
  localDateStr,
  mergeCsvFiles,
  stayKind,
} from '#/lib/pdj/csv.ts'
import type { ManualKind } from '#/lib/pdj/csv.ts'
import { businessDateStr, businessNow } from '#/lib/businessDay.ts'
import {
  deleteAddonProductionDay,
  deleteDay,
  fetchAddonProduction,
  fetchAllAddonProduction,
  fetchAllInHouseCovers,
  fetchDay,
  fetchServiceDates,
  importAddonProduction,
  importRows,
  purgeOldGuestNames,
  setManualServe,
  setServed,
} from '#/lib/pdj/service.ts'
import type { AddonProductionDbRow, PdjDayRow } from '#/lib/pdj/service.ts'
import { canEditPdjDay } from '#/lib/pdj/editability.ts'
import { breakfastServiceDate, parseAddonProduction } from '#/lib/pdj/addon.ts'
import {
  computeCaptageBenchmark,
  computeDailyBenchmark,
  computeOccupancyBenchmark,
  computePdjAmounts,
  countCovers,
} from '#/lib/pdj/amounts.ts'
import { fmtEur, fmtInt, fmtPctInt } from '#/lib/pdj/format.ts'

/* --------------------------------------------------------------------------
 * Petit-déjeuner (PDJ) — portage de l'app "Breakfast Tracker", désormais
 * PERSISTÉ dans Supabase (table pdj_breakfasts) et conforme RGPD.
 *
 *   - un jour de service à la fois, chargé depuis la base (useQuery), avec un
 *     sélecteur de jour (historique) ;
 *   - import CSV daté (upsert idempotent) réservé aux rôles super/admin ;
 *   - saisie de consommation « PDJ servi » par chambre (persistée) ;
 *   - purge RGPD des noms des jours écoulés au montage (rôles habilités).
 *
 * Rendu écran : thème sombre (cartes stats + tableaux par étage). Impression :
 * document A4 portrait fidèle (cases à cocher au stylo, footer stats fixe).
 * ------------------------------------------------------------------------ */

const fmtDate = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

// Date longue et lisible pour le titre de page (façon repjour).
const fmtTitle = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

// Montant HT pour le PDF : le nombre formaté + un « HT » plus petit et grisé.
function htPrice(n: number) {
  return (
    <>
      {fmtEur(n, 2)}
      <span className="pdj-revenue-ht">HT</span>
    </>
  )
}

// Sous-texte grisé sous la valeur d'une card (façon RepJour), TOUJOURS masqué à
// l'impression : les sous-textes n'apparaissent qu'à l'écran, jamais dans le PDF.
function subMuted(content: string) {
  return (
    <span className="text-[0.7rem] font-medium text-muted-foreground print:hidden">
      {content}
    </span>
  )
}

// Détection d'un CSV « Addon Production » sur son CONTENU (pas son nom) : soit
// l'en-tête explicite « Addon Production » du préambule, soit la paire
// « Total Count » + « Total Revenue » SANS « Guest Name » (qui, elle, signe un
// In-House). Départage l'aiguillage de l'import (voir loadFiles).
function isAddonCsv(content: string): boolean {
  if (content.includes('Addon Production')) return true
  return (
    content.includes('Total Count') &&
    content.includes('Total Revenue') &&
    !content.includes('Guest Name')
  )
}

export function BreakfastBoard({ initialDate }: { initialDate?: string }) {
  const { can, pageLevel, grade } = useAuth()
  const canEdit = can('pdj', 'ecriture')
  const isAdmin = can('pdj', 'gestion')
  // Import manuel en SOMMEIL : l'ingestion du In-House est désormais AUTOMATIQUE
  // (Edge Function import-report). Le dépôt manuel reste réservé au GRADE admin
  // (filet de secours), sauf flag de réouverture. La saisie « servi » reste, elle,
  // sous `canEdit` (inchangée). Cf. MANUAL_IMPORT_ENABLED_FOR_ALL.
  const canManualImport =
    canEdit && (MANUAL_IMPORT_ENABLED_FOR_ALL || grade === 'admin')
  // Niveau effectif : sert au verrou PAR JOUR de la saisie (cocher les cases).
  // Écriture ne coche que dans la fenêtre J-3 ; la gestion coche n'importe quel
  // jour (cf. lib/pdj/editability.ts).
  const level = pageLevel('pdj')
  const queryClient = useQueryClient()

  // Jour hôtelier courant (Europe/Paris) figé au montage : jour affiché par
  // défaut, repère RGPD, et borne « la plus récente » de la navigation. La
  // bascule se fait à 02h et non à minuit (`businessNow`) : entre minuit et 02h
  // on reste sur la veille, dont le rapport est le dernier disponible.
  const today = useMemo(() => localDateStr(businessNow()), [])

  // Veille (J-1) : borne de conservation RGPD des noms. On garde les noms
  // d'aujourd'hui ET de J-1 (nécessaire au rapprochement parking↔PDJ) ; la purge
  // n'anonymise donc qu'à partir de J-2.
  const yesterday = useMemo(() => {
    const d = businessNow()
    d.setDate(d.getDate() - 1)
    return localDateStr(d)
  }, [])

  // On affiche TOUJOURS le jour courant par défaut (jamais le dernier jour
  // importé, qui serait obsolète) ; l'utilisateur peut ensuite remonter le temps.
  // `initialDate` (lien « jour » depuis le rapport mensuel) ouvre directement ce
  // jour-là ; absent, le comportement reste identique (aujourd'hui).
  const [selectedDate, setSelectedDate] = useState(initialDate ?? today)
  // Le jour affiché est-il « cochable » ? Lecture : jamais. Écriture : fenêtre J-3.
  // Gestion : toujours. Gouverne la grille de saisie (pas l'import, gardé à part).
  const dayEditable = canEditPdjDay(selectedDate, today, level)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Jours de service disponibles (du plus récent au plus ancien).
  const { data: dates = [] } = useQuery({
    queryKey: ['pdj', 'dates'],
    queryFn: fetchServiceDates,
  })

  // Purge RGPD au montage (une seule fois, rôles habilités) : anonymise les noms
  // à partir de J-2 (aujourd'hui et J-1 conservés), garde les stats. Idempotent,
  // silencieux si rien à purger.
  const purgedRef = useRef(false)
  useEffect(() => {
    if (purgedRef.current || !canEdit) return
    purgedRef.current = true
    purgeOldGuestNames(yesterday)
      .then(() => queryClient.invalidateQueries({ queryKey: ['pdj'] }))
      .catch((err) => console.error('[pdj] purge RGPD échouée', err))
  }, [canEdit, queryClient, yesterday])

  // Lignes du jour sélectionné. On NE met PAS de défaut `= []` : il masquerait
  // l'état `undefined` (chargement) en le confondant avec « aucune donnée » (vide
  // réel) et ferait flasher la dropzone pendant le fetch. `isPending` distingue
  // les deux. `enabled` est toujours vrai (selectedDate a une valeur par défaut :
  // aujourd'hui) → pas de squelette éternel.
  const { data: dayRows, isPending } = useQuery({
    queryKey: ['pdj', 'day', selectedDate],
    queryFn: () => fetchDay(selectedDate),
    enabled: !!selectedDate,
  })
  const loading = isPending

  const byRoom = useMemo(() => {
    const map = new Map<number, PdjDayRow>()
    for (const r of dayRows ?? []) map.set(r.room, r)
    return map
  }, [dayRows])

  const hasData = (dayRows?.length ?? 0) > 0

  // Production Addon (montants TTC par code) du jour affiché. Alimente le calcul
  // des trois montants HT injectés dans les cases « € » du PDF (impression
  // uniquement). Absente → cases vides (comportement historique).
  const { data: addonRows = [] } = useQuery({
    queryKey: ['pdj', 'addons', selectedDate],
    queryFn: () => fetchAddonProduction(selectedDate),
    enabled: !!selectedDate,
  })

  // Extras du jour = couverts servis au-delà des inclus (cf. amounts.ts). Source
  // UNIQUE, partagée par la card « PDJ Extra » (compteur) et le calcul des montants.
  const extrasCount = useMemo(
    () =>
      (dayRows ?? []).reduce(
        (s, r) => s + Math.max(0, r.breakfasts_served - r.breakfasts_included),
        0,
      ),
    [dayRows],
  )

  // Montants HT du jour : PDJ inclus / extras / total. `null` sans Addon (cases
  // laissées vides). Le calcul et l'arrondi vivent dans le métier.
  const amounts = useMemo(() => {
    if (addonRows.length === 0) return null
    const covers = countCovers(dayRows ?? [])
    // PDJ inclus saisis à la main (absents de l'Addon) → ajoutés au HT inclus.
    const manualIncludedCount = (dayRows ?? []).reduce(
      (s, r) => s + (r.manual_kind === 'inclus' ? r.breakfasts_served : 0),
      0,
    )
    return computePdjAmounts({
      addon: addonRows.map((r) => ({
        code: r.code,
        count: r.total_count,
        revenue: r.revenue_ttc,
      })),
      covers,
      manualIncludedCount,
      extrasCount,
    })
  }, [addonRows, dayRows, extrasCount])

  // Repère « moyenne par jour » : total HT moyen sur TOUS les jours ayant à la
  // fois In-House ET Addon. Requête à part (ne bloque pas la vue du jour), chargée
  // une fois. computeDailyBenchmark exclut les jours sans les deux sources.
  const { data: benchmark } = useQuery({
    queryKey: ['pdj', 'benchmark'],
    queryFn: async () => {
      const [addon, inhouse] = await Promise.all([
        fetchAllAddonProduction(),
        fetchAllInHouseCovers(),
      ])
      return {
        // Repère « total HT / jour » : jours ayant In-House ET Addon.
        total: computeDailyBenchmark(
          addon.map((r) => ({
            service_date: r.service_date,
            code: r.code,
            revenue: r.revenue_ttc,
          })),
          inhouse,
        ),
        // Repère « captage / jour » : jours ayant du servi saisi (vraies données).
        captage: computeCaptageBenchmark(inhouse),
        // Repère « occupation / jour » : chambres et clients moyens (tous jours In-House).
        occupancy: computeOccupancyBenchmark(inhouse),
      }
    },
  })

  // Le jour affiché a-t-il les DEUX sources (In-House + Addon) ? Sinon la card
  // « CA PDJ » affiche « 0 € » (pas de card sans les deux sources).
  const dayHasBoth = hasData && addonRows.length > 0

  const floors = useMemo(() => {
    const map = new Map<number, number[]>()
    for (const room of ALL_ROOMS) {
      const floor = Math.floor(room / 100)
      const list = map.get(floor)
      if (list) list.push(room)
      else map.set(floor, [room])
    }
    return [...map.entries()].map(([floor, rooms]) => ({ floor, rooms }))
  }, [])

  const stats = useMemo(() => {
    let rooms = 0
    let total = 0
    let breakfasts = 0
    let staying = 0
    let departing = 0
    for (const room of ALL_ROOMS) {
      const g = byRoom.get(room)
      if (!g) continue
      rooms++
      total += g.guests
      breakfasts += g.breakfasts_included
      const kind = stayKind(g.status)
      if (kind === 'staying') staying++
      else if (kind === 'departing') departing++
    }
    return {
      rooms,
      guests: total,
      breakfasts,
      potential: Math.max(0, total - breakfasts),
      staying,
      departing,
    }
  }, [byRoom])

  // Taux de captage du jour = (inclus + extras) ÷ clients : base = inclus (réel,
  // issu des réservations), augmente à mesure qu'on saisit des extras. « — »
  // seulement s'il n'y a aucun client (pas de données In-House).
  const captageDay =
    stats.guests > 0
      ? ((stats.breakfasts + extrasCount) / stats.guests) * 100
      : null

  // Libellés datés mémoïsés sur la seule date : deux formatages Intl (coûteux)
  // qui, sinon, se rejouaient à chaque re-render (dont chaque clic « servi »).
  const { dateLabel, titleDate } = useMemo(() => {
    const d = selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date()
    return {
      dateLabel: fmtDate.format(d),
      titleDate: capitalize(fmtTitle.format(d)),
    }
  }, [selectedDate])

  // Jours parcourables : les jours réellement importés PLUS le jour courant
  // (toujours présent, même sans données, pour pouvoir revenir sur « aujourd'hui »
  // et son import). Triés du plus récent au plus ancien.
  const navDates = useMemo(() => {
    const set = new Set(dates)
    set.add(today)
    return [...set].sort((a, b) => (a > b ? -1 : 1))
  }, [dates, today])

  // Navigation entre ces jours : jamais de jour vide « au milieu », et le contrôle
  // ne grandit pas dans le temps.
  const dateIdx = navDates.indexOf(selectedDate)
  const gotoOlder = () => {
    if (dateIdx >= 0 && dateIdx < navDates.length - 1)
      setSelectedDate(navDates[dateIdx + 1])
  }
  const gotoNewer = () => {
    if (dateIdx > 0) setSelectedDate(navDates[dateIdx - 1])
  }
  // ← / → parcourent les jours, Alt revient sur « aujourd'hui ».
  useStepNavKeys({
    onPrev: gotoOlder,
    onNext: gotoNewer,
    onToday: () => setSelectedDate(today),
    prevDisabled: dateIdx < 0 || dateIdx >= navDates.length - 1,
    nextDisabled: dateIdx <= 0,
  })

  // Sélecteur de date : cale sur le jour parcourable le plus proche.
  function selectNearestDate(target: string) {
    if (!target || navDates.length === 0) return
    if (navDates.includes(target)) {
      setSelectedDate(target)
      return
    }
    const t = new Date(target + 'T00:00:00').getTime()
    let best = navDates[0]
    let bestDiff = Infinity
    for (const d of navDates) {
      const diff = Math.abs(new Date(d + 'T00:00:00').getTime() - t)
      if (diff < bestDiff) {
        bestDiff = diff
        best = d
      }
    }
    setSelectedDate(best)
  }

  // Import d'un LOT de fichiers (drop ou sélection multiple). On trie d'abord
  // sur l'extension, puis `mergeCsvFiles` valide/dédoublonne : les fichiers
  // illisibles ou en doublon sont ignorés sans bloquer l'import du reste.
  async function loadFiles(fileList: File[]) {
    if (!canEdit || fileList.length === 0) return
    setError('')

    const csvFiles = fileList.filter((f) =>
      f.name.toLowerCase().endsWith('.csv'),
    )
    const nonCsv = fileList.length - csvFiles.length
    if (csvFiles.length === 0) {
      setError('Aucun fichier .csv dans la sélection.')
      return
    }

    try {
      const inputs = await Promise.all(
        csvFiles.map(async (f) => ({ name: f.name, content: await f.text() })),
      )

      // Aiguillage par CONTENU (pas par nom) : l'« Addon Production » agrège les
      // montants par code produit et n'a pas la structure In-House. On le route
      // vers le calcul des montants ; tout le reste suit le chemin In-House.
      const addonInputs = inputs.filter((i) => isAddonCsv(i.content))
      const inHouseInputs = inputs.filter((i) => !isAddonCsv(i.content))

      const problems: string[] = []
      let targetDate: string | null = null
      // Import réussi (In-House ou Addon), indépendamment de tout message : un
      // Addon seul n'affiche AUCUN bandeau, il ne doit donc pas retomber dans le
      // garde-fou « Aucune donnée exploitable ».
      let imported = false

      // --- In-House : chemin historique (mergeCsvFiles → importRows). ---
      if (inHouseInputs.length > 0) {
        const result = mergeCsvFiles(inHouseInputs)
        if (result.rows.length === 0) {
          // On remonte la RAISON précise par fichier (colonnes manquantes, nom
          // sans date, aucune ligne exploitable) plutôt qu'un message opaque.
          const why = result.ignored
            .map((i) => `« ${i.name} » : ${i.reason}`)
            .join(' ; ')
          problems.push(
            'In-House : aucune donnée exploitable. ' +
              (why ||
                'Fichier invalide ou mal nommé (attendu « In-House Guests _YYYYMMDD… »).'),
          )
        } else if (!isAdmin && result.dates.some((d) => d > businessDateStr())) {
          // Blocage avant 02h (sauf admin) : un fichier daté d'un jour hôtelier
          // non encore ouvert — le rapport In-House n'est tiré qu'à partir de
          // 02h — est refusé. Voir #/lib/businessDay.ts.
          problems.push(
            'Le rapport de cette nuit n’est disponible qu’à partir de 02h00 (clôture de la journée). Réessayez après cette heure.',
          )
        } else {
          await importRows(result.rows)
          imported = true
          if (result.ignored.length > 0)
            console.warn('[pdj] fichiers ignorés à l’import', result.ignored)
          // Jour le plus pertinent du lot In-House : aujourd'hui s'il en fait
          // partie, sinon le jour importé le plus récent.
          targetDate = result.dates.includes(today) ? today : result.dates[0]
        }
      }

      // --- Addon Production : parse par fichier, +1 jour, upsert. ---
      if (addonInputs.length > 0) {
        const addonRowsToImport: AddonProductionDbRow[] = []
        const addonDays = new Set<string>()
        for (const f of addonInputs) {
          const parsed = parseAddonProduction(f.content)
          if (!parsed.businessDate) {
            problems.push(
              `« ${f.name} » : date métier introuvable dans l’Addon Production.`,
            )
            continue
          }
          // Alignement +1 jour : la date lue est la date « clôture », le PDJ est
          // servi le lendemain (jour sous lequel le board range la journée).
          const serviceDate = breakfastServiceDate(parsed.businessDate)
          addonDays.add(serviceDate)
          for (const r of parsed.rows) {
            addonRowsToImport.push({
              service_date: serviceDate,
              code: r.code,
              total_count: r.count,
              revenue_ttc: r.revenue,
              source_file: f.name,
            })
          }
        }
        if (addonRowsToImport.length > 0) {
          await importAddonProduction(addonRowsToImport)
          imported = true
          // Pas de bandeau de succès pour l'Addon (convention UX : on n'affiche
          // que les anomalies) — le PDF montre désormais les montants.
          // Se placer sur le jour du petit-déjeuner importé le plus récent (si
          // l'In-House n'a pas déjà fixé la cible).
          const days = [...addonDays].sort((a, b) => (a > b ? -1 : 1))
          if (!targetDate) targetDate = days[0]
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['pdj'] })
      if (targetDate) setSelectedDate(targetDate)

      if (nonCsv > 0) {
        problems.push(
          `${nonCsv} fichier${nonCsv > 1 ? 's' : ''} non .csv ignoré${nonCsv > 1 ? 's' : ''}.`,
        )
      }

      if (problems.length > 0) setError(problems.join(' '))
      if (!imported && problems.length === 0)
        setError('Aucune donnée exploitable.')
    } catch (err) {
      setError(`Erreur lors du traitement des fichiers : ${errorMessage(err)}`)
    }
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    void loadFiles(e.target.files ? Array.from(e.target.files) : [])
    e.target.value = ''
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    void loadFiles(Array.from(e.dataTransfer.files))
  }

  // Saisie « PDJ servi » d'une chambre : mise à jour optimiste du cache puis
  // persistance ; en cas d'échec (ex. RLS), on resynchronise.
  // Stable (useCallback) : passé à chaque GuestRow mémoïsé, sinon une nouvelle
  // identité à chaque render annulerait le memo et re-rendrait les 80 lignes.
  const handleServe = useCallback(
    (room: number, n: number) => {
      if (!dayEditable || !selectedDate) return
      queryClient.setQueryData<PdjDayRow[]>(
        ['pdj', 'day', selectedDate],
        (old) =>
          old?.map((r) =>
            r.room === room ? { ...r, breakfasts_served: n, served: n > 0 } : r,
          ),
      )
      setServed(selectedDate, room, n).catch((err) => {
        console.error('[pdj] enregistrement de la consommation échoué', err)
        void queryClient.invalidateQueries({
          queryKey: ['pdj', 'day', selectedDate],
        })
      })
    },
    [dayEditable, selectedDate, queryClient],
  )

  // Saisie MANUELLE d'un PDJ dans une chambre non check-in (day-use…). Crée la
  // ligne manuelle si la chambre est vide, la met à jour sinon ; tout décoché la
  // retire. Maj optimiste du cache puis persistance (setManualServe).
  const handleManual = useCallback(
    (room: number, n: number, kind: ManualKind) => {
      if (!dayEditable || !selectedDate) return
      const included = kind === 'inclus' ? n : 0
      queryClient.setQueryData<PdjDayRow[]>(
        ['pdj', 'day', selectedDate],
        (old) => {
          const list = old ?? []
          if (n <= 0) {
            return list.filter((r) => !(r.room === room && r.manual_kind != null))
          }
          if (list.some((r) => r.room === room)) {
            return list.map((r) =>
              r.room === room
                ? {
                    ...r,
                    breakfasts_served: n,
                    served: true,
                    breakfasts_included: included,
                    manual_kind: kind,
                  }
                : r,
            )
          }
          const created: PdjDayRow = {
            id: crypto.randomUUID(),
            service_date: selectedDate,
            room,
            guest_name: null,
            status: '',
            vip: false,
            adults: 0,
            children: 0,
            guests: 0,
            no_of_nights: null,
            room_type: null,
            rate_plan: null,
            channel: null,
            company: null,
            guarantee: null,
            payment_type: null,
            addons: null,
            adr: null,
            arrival_date: null,
            departure_date: null,
            stay_count: 0,
            breakfasts_included: included,
            source_file: '',
            manual_kind: kind,
            breakfasts_served: n,
            served: true,
          }
          return [...list, created]
        },
      )
      setManualServe(selectedDate, room, n, kind).catch((err) => {
        console.error('[pdj] saisie manuelle échouée', err)
        void queryClient.invalidateQueries({
          queryKey: ['pdj', 'day', selectedDate],
        })
      })
    },
    [dayEditable, selectedDate, queryClient],
  )

  // Impression : logique D'ORIGINE, INCHANGÉE — la feuille A4 mise en forme par
  // pdj.css (@media print) via printWithTitle. C'est la trame historique validée.
  // NE PAS remplacer par un générateur jsPDF.
  function handlePrint() {
    const d = selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date()
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    printWithTitle(`Breakfast_${dd}-${mm}-${d.getFullYear()}`)
  }

  // Suppression des données du jour AFFICHÉ uniquement (ce service_date).
  // Confirmation via modale (ConfirmDialog). Réservé admin (UI) / super+admin (RLS).
  async function handleDeleteDay() {
    if (!isAdmin || !hasData || !selectedDate) return
    try {
      // Supprime les DEUX sources du jour affiché (In-House + Addon), et SEULEMENT
      // ce jour : chaque delete est borné par .eq('service_date', selectedDate).
      await Promise.all([
        deleteDay(selectedDate),
        deleteAddonProductionDay(selectedDate),
      ])
      await queryClient.invalidateQueries({ queryKey: ['pdj'] })
    } catch (err) {
      window.alert(
        'Suppression impossible : ' +
          (err instanceof Error ? err.message : 'erreur inconnue'),
      )
    }
  }

  // Ctrl+P passe par le bouton : même document (feuille A4 mise en forme par
  // pdj.css), même nom de fichier. Sur un jour sans données, il n'y aurait
  // qu'un écran vide à imprimer — on le dit plutôt que de ne rien faire.
  const [printBlocked, setPrintBlocked] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  usePrintShortcut(() => {
    if (!hasData) {
      setPrintBlocked(true)
      return
    }
    handlePrint()
  })

  // L'en-tête (titre du jour + navigation + import) est présent dès qu'il y a des
  // données à afficher OU d'autres jours à parcourir. La navigation ne s'affiche
  // que s'il existe un autre jour que « aujourd'hui » où aller.
  const canNavigate = navDates.length > 1

  return (
    // `max-w-5xl` centre le contenu comme sur RepJour. Neutralisé à
    // l'impression : la feuille A4 impose déjà sa largeur (voir pdj.css).
    <div className="pdj-doc mx-auto flex w-full min-w-0 max-w-5xl flex-1 flex-col gap-5 print:max-w-none">
      {/* En-tête compact (impression uniquement). */}
      <div className="pdj-header">
        <h1>Breakfast</h1>
        <span className="pdj-date">{dateLabel}</span>
      </div>

      {/* Input fichier caché (multi-fichiers), déclenché par la zone vide ou le
          bouton Importer. */}
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        multiple
        className="hidden"
        onChange={onInputChange}
      />

      {error && <div className="pdj-error print:hidden">{error}</div>}
      {/* Contrôle défensif des montants (anomalie seulement) : discret, à
          l'écran uniquement, jamais imprimé, jamais de card. */}
      {hasData && amounts && amounts.warnings.length > 0 && (
        <div className="rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-500 print:hidden">
          {amounts.warnings.join(' ')}
        </div>
      )}

      {/* En-tête TOUJOURS rendu : le titre du jour est connu d'emblée, il ne doit
          pas apparaître après coup. Seule la navigation (StepNav) reste
          conditionnée à `canNavigate` À L'INTÉRIEUR des actions. */}
      <PageHeader
        title={titleDate}
        actions={
          <>
            {/* Groupe « suppression » (ADMIN uniquement), isolé et à gauche :
                  supprime les données du seul jour affiché. Bouton outline, icône
                  rouge (pas de fond plein). Présent seulement s'il y a des données. */}
            {isAdmin && hasData && (
              <ButtonGroup>
                <Tip label="Supprimer les données de ce jour">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setConfirmDelete(true)}
                    aria-label="Supprimer les données de ce jour"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                </Tip>
              </ButtonGroup>
            )}
            {/* Groupe « actions de page » : analytique + import + impression. */}
            <ButtonGroup>
              <Tip label="Vue analytique">
                <Button asChild variant="outline" size="icon-sm">
                  <Link to="/pdj/analytique" aria-label="Vue analytique">
                    <LineChart />
                  </Link>
                </Button>
              </Tip>
              {canManualImport && (
                <Tip label="Importer un CSV In-House ou Addon Production">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => inputRef.current?.click()}
                    aria-label="Importer un CSV"
                  >
                    <FileUp />
                  </Button>
                </Tip>
              )}
              <PrintButton
                onClick={handlePrint}
                iconOnly
                disabled={!hasData}
                tipLabel={
                  hasData ? 'Imprimer / PDF' : 'Aucune donnée à imprimer'
                }
              />
            </ButtonGroup>
            {/* Groupe « navigation temporelle », collé au bord droit. */}
            {canNavigate && (
              <StepNav
                onPrev={gotoOlder}
                onNext={gotoNewer}
                prevLabel="Jour précédent"
                nextLabel="Jour suivant"
                prevDisabled={dateIdx < 0 || dateIdx >= navDates.length - 1}
                nextDisabled={dateIdx <= 0}
              >
                <DatePickerButton
                  value={selectedDate}
                  onChange={selectNearestDate}
                  ariaLabel="Choisir un jour"
                  max={today}
                  enabledDates={navDates}
                  todayValue={today}
                />
              </StepNav>
            )}
          </>
        }
      />

      {/* Un seul gate bascule le corps : squelette pendant le fetch (jamais la
          dropzone), contenu si données, sinon l'EmptyCanvas (vide réel). */}
      {loading ? (
        <BoardSkeleton />
      ) : !hasData ? (
        canManualImport ? (
          // Jour courant (ou jour sélectionné) sans rapport : on NE retombe PAS
          // sur d'anciennes données, on propose l'import (admin, filet de secours).
          <EmptyCanvas
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'empty-canvas min-h-[340px] cursor-pointer flex-col gap-3 p-10 text-center outline-none transition-colors',
              'hover:border-primary/60 hover:bg-secondary/30 focus-visible:ring-2 focus-visible:ring-ring',
              dragging && 'border-primary bg-secondary/40',
            )}
          >
            <div className="rounded-full bg-secondary p-4">
              <FileUp className="size-8 text-muted-foreground" />
            </div>
            <div className="text-base font-medium">
              Glissez vos fichiers CSV ici
            </div>
            <div className="text-sm text-muted-foreground">
              In-House ou Addon Production — les fichiers invalides sont ignorés
            </div>
          </EmptyCanvas>
        ) : (
          <EmptyCanvas className="empty-canvas min-h-[340px] flex-col gap-3 text-center text-muted-foreground">
            <Coffee className="size-10 opacity-40" />
            <p className="text-sm font-medium">
              Aucune donnée de petit-déjeuner disponible.
            </p>
            <p className="text-xs">
              Un responsable doit importer le rapport du jour.
            </p>
          </EmptyCanvas>
        )
      ) : (
        <>
          {/* Statistiques (footer fixe en impression). */}
          <div className="pdj-stats">
            <div
              className={cn(
                'pdj-stats-grid',
                extrasCount > 0 && 'pdj-stats-grid--with-extra',
              )}
            >
              <StatTile
                value={stats.rooms}
                label="Chambres occupées"
                accent="#818cf8"
                sub={
                  benchmark && benchmark.occupancy.avgRooms != null
                    ? subMuted(`moy. ${fmtInt(benchmark.occupancy.avgRooms)}/j`)
                    : undefined
                }
              />
              <StatTile
                value={stats.guests}
                label="Clients"
                accent="#38bdf8"
                sub={
                  benchmark && benchmark.occupancy.avgGuests != null
                    ? subMuted(`moy. ${fmtInt(benchmark.occupancy.avgGuests)}/j`)
                    : undefined
                }
              />
              <StatTile
                value={stats.breakfasts}
                label="PDJ inclus"
                accent="#34d399"
                sub={
                  amounts ? subMuted(fmtEur(amounts.includedHT, 2)) : undefined
                }
              />
              <StatTile
                value={extrasCount}
                label="PDJ Extra"
                accent="#fbbf24"
                printHidden
                sub={
                  amounts
                    ? subMuted(
                        amounts.extrasHT != null
                          ? fmtEur(amounts.extrasHT, 2)
                          : '—',
                      )
                    : undefined
                }
              />
              {/* Miroir PDF de « PDJ Extra » — conservée dans le footer du PDF
                  UNIQUEMENT s'il y a au moins un extra saisi (sinon le PDF garde
                  sa mise en page à 5 colonnes). Même card que l'écran, placée
                  juste après « PDJ inclus » (les tuiles écran-seules intercalées
                  ne s'impriment pas). */}
              {extrasCount > 0 && (
                <StatTile
                  className="stat-tile--screen-hidden"
                  value={extrasCount}
                  label="PDJ Extra"
                  accent="#fbbf24"
                />
              )}
              {/* Écran : « CA PDJ » (total HT du jour + moyenne/jour sur les
                  jours valides). PDF : on conserve « Recouche ». D'où DEUX tuiles
                  complémentaires — l'une printHidden (écran), l'autre screen-hidden
                  (PDF) — pour changer l'écran SANS toucher au footer du PDF. */}
              <StatTile
                printHidden
                label="CA PDJ"
                accent="#60a5fa"
                value={
                  dayHasBoth && amounts && amounts.totalHT != null
                    ? fmtEur(amounts.totalHT, 2)
                    : fmtEur(0, 0)
                }
                sub={
                  benchmark && benchmark.total.avgTotalHT != null
                    ? subMuted(`moy. ${fmtEur(benchmark.total.avgTotalHT, 2)}/j`)
                    : undefined
                }
              />
              <StatTile
                className="stat-tile--screen-hidden"
                value={stats.staying}
                label={
                  <>
                    Recouche
                    <ArrowDown className="pdj-label-arrow" />
                  </>
                }
                accent="#60a5fa"
              />
              {/* Taux de captage (écran uniquement) : (inclus + extras) ÷ clients
                  du jour ; « — » si la conso n'a pas été saisie (pas de vraie
                  donnée). Sous-texte = moyenne sur les jours avec servi saisi. */}
              <StatTile
                printHidden
                label="Taux de captage"
                accent="#f472b6"
                value={
                  captageDay != null ? (
                    fmtPctInt(captageDay)
                  ) : (
                    <span className="text-base font-semibold text-muted-foreground">
                      —
                    </span>
                  )
                }
                sub={
                  benchmark && benchmark.captage.avgCaptage != null
                    ? subMuted(`moy. ${fmtPctInt(benchmark.captage.avgCaptage)}/j`)
                    : undefined
                }
              />
              {/* Départ : masqué à l'ÉCRAN, conservé dans le footer du PDF (comme
                  Recouche) → écran allégé sans toucher au PDF. */}
              <StatTile
                className="stat-tile--screen-hidden"
                value={stats.departing}
                label={
                  <>
                    Départ
                    <ArrowUp className="pdj-label-arrow" />
                  </>
                }
                accent="#fb7185"
              />
            </div>
            {/* Cases « € » — impression uniquement. Valeurs calculées depuis
                l'Addon Production du jour (montants HT) ; vides sans Addon
                (comportement historique, saisie manuelle au stylo). */}
            <div
              className={
                'pdj-stats-grid pdj-stats-revenue' +
                (amounts && amounts.extrasHT != null && amounts.extrasHT > 0
                  ? ''
                  : ' pdj-revenue-faded')
              }
            >
              <div className="pdj-revenue">
                <div className="pdj-revenue-value">
                  {amounts ? htPrice(amounts.includedHT) : ' '}
                </div>
                <div className="pdj-revenue-label">PDJ Inclus €</div>
              </div>
              <div className="pdj-revenue">
                {/* Extra rempli seulement s'il y a des extras chiffrables ;
                    sinon case gardée, valeur vide (décision D1). */}
                <div className="pdj-revenue-value">
                  {amounts && amounts.extrasHT != null && amounts.extrasHT > 0
                    ? htPrice(amounts.extrasHT)
                    : ' '}
                </div>
                <div className="pdj-revenue-label">PDJ Extra €</div>
              </div>
              <div className="pdj-revenue">
                {/* Total affiché SEULEMENT si au moins 1 extra est sélectionné :
                    sans extra, Total == Inclus (redondant) et changerait dès qu'on
                    coche un extra → on n'imprime pas un chiffre provisoire. Même
                    condition que la case Extra. */}
                <div className="pdj-revenue-value">
                  {amounts &&
                  amounts.extrasHT != null &&
                  amounts.extrasHT > 0 &&
                  amounts.totalHT != null
                    ? htPrice(amounts.totalHT)
                    : ' '}
                </div>
                <div className="pdj-revenue-label">Total €</div>
              </div>
            </div>
          </div>

          {/* Tableaux par étage. */}
          <div className="pdj-floors">
            {floors.map(({ floor, rooms }) => (
              <div key={floor} className="pdj-floor">
                <table>
                  <thead>
                    <tr>
                      <th>Chambre</th>
                      <th>Nom</th>
                      <th className="pdj-c">Statut</th>
                      <th className="pdj-c">Visites</th>
                      <th className="pdj-c">Clients</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map((room) => (
                      <GuestRow
                        key={room}
                        room={room}
                        row={byRoom.get(room)}
                        canEdit={dayEditable}
                        onServe={handleServe}
                        onManual={handleManual}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </>
      )}

      <PrintBlockedDialog
        open={printBlocked}
        onOpenChange={setPrintBlocked}
        reason="Aucune donnée pour ce jour. Importez le CSV In-House Guests."
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Supprimer les données de ce jour ?"
        description={`Toutes les données du petit-déjeuner du ${titleDate} seront supprimées. Cette action est irréversible et ne touche que ce jour.`}
        confirmLabel="Supprimer"
        destructive
        onConfirm={handleDeleteDay}
      />
    </div>
  )
}

/*
 * Nombre de chambres par étage, dans l'ordre d'affichage, DÉRIVÉ de l'inventaire
 * réel (ALL_ROOMS). Chaque étage a un compte inégal (13/14/14/14/14/11) : coder
 * un `rows` fixe faisait grandir ou rétrécir chaque tableau à l'arrivée des
 * données. On calcule ici la vraie hauteur de chaque étage.
 */
const FLOOR_ROOM_COUNTS = [
  ...new Set(ALL_ROOMS.map((r) => Math.floor(r / 100))),
].map((floor) => ALL_ROOMS.filter((r) => Math.floor(r / 100) === floor).length)

/*
 * Squelette-reflet du corps pendant le chargement du jour : la rangée de 6 stats
 * puis les 6 tableaux par étage. Les DEUX réutilisent le vrai markup (`pdj-stats`,
 * `pdj-floor > table`) et donc le vrai CSS — mêmes paddings, mêmes hauteurs de
 * ligne, même nombre de lignes par étage — pour ne rien décaler à l'arrivée des
 * données. Purement décoratif ; l'en-tête, lui, est déjà rendu au-dessus. */
function BoardSkeleton() {
  return (
    <>
      {/* Rangée de 6 tuiles dans LEUR vraie grille (`pdj-stats-grid`, 6 colonnes),
          à la forme du composant StatTile (liseré + libellé + valeur) pour coller
          au réel et ne rien décaler. */}
      <div className="pdj-stats" aria-hidden="true">
        <div className="pdj-stats-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-stretch overflow-hidden rounded-xl border border-border bg-card"
            >
              <span className="w-2 shrink-0 bg-muted" aria-hidden="true" />
              <div className="flex flex-col justify-center gap-2 px-3 py-[0.55rem]">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="h-6 w-10" />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Tableaux par étage : même structure que le vrai (`pdj-floor > table`),
          en-têtes réels (invariants), et autant de lignes que de chambres. */}
      <div className="pdj-floors" aria-hidden="true">
        {FLOOR_ROOM_COUNTS.map((count, i) => (
          <div key={i} className="pdj-floor">
            <table>
              <thead>
                <tr>
                  <th>Chambre</th>
                  <th>Nom</th>
                  <th className="pdj-c">Statut</th>
                  <th className="pdj-c">Visites</th>
                  <th className="pdj-c">Clients</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: count }).map((_, r) => (
                  <tr key={r}>
                    <td className="pdj-room">
                      <Skeleton className="h-3 w-8" />
                    </td>
                    <td>
                      <Skeleton className="h-3 w-24" />
                    </td>
                    <td className="pdj-c">
                      <Skeleton className="mx-auto h-3 w-10" />
                    </td>
                    <td className="pdj-c">
                      <Skeleton className="mx-auto h-3 w-6" />
                    </td>
                    <td className="pdj-c">
                      <Skeleton className="mx-auto h-3 w-6" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </>
  )
}

// Mémoïsé : sur un clic « servi », seule la chambre modifiée reçoit un nouvel
// objet `row` (maj optimiste par référence) — les 79 autres lignes gardent leur
// référence et ne se re-rendent pas (avec `onServe` stable, cf. useCallback).
const GuestRow = memo(function GuestRow({
  room,
  row,
  canEdit,
  onServe,
  onManual,
}: {
  room: number
  row?: PdjDayRow
  canEdit: boolean
  onServe: (room: number, n: number) => void
  onManual: (room: number, n: number, kind: ManualKind) => void
}) {
  // Type de saisie manuelle (day-use/no-show) : calculé d'abord car il conditionne
  // le sens des cases « attendues » ci-dessous.
  const manualKind = row?.manual_kind ?? null
  const isManual = manualKind != null
  // Cases en GRAS = clients PRÉSENTS dans la chambre (adultes ; enfants/bébés
  // exclus ; jamais plus de 2). Une chambre occupée SANS PDJ inclus montre donc
  // aussi ses clients en gras, comme une chambre à PDJ inclus — la distinction
  // « PDJ inclus » reste lisible via le FOND VERT de la ligne (.pdj-included,
  // piloté à part par `breakfasts_included`, cf. plus bas). Une ligne MANUELLE n'a
  // pas de client réel en rooming → on garde son nombre saisi ; chambre vide → 0.
  // (Les MONTANTS et les extras restent calculés depuis `breakfasts_included`,
  // jamais depuis ce nombre de cases : servir au-delà des inclus = extra facturé.)
  const numExpected = isManual
    ? (row?.breakfasts_included ?? 0)
    : row
      ? Math.min(row.adults, 2)
      : 0
  const served = row?.breakfasts_served ?? 0
  // Minimum 2 cases pour une grille régulière ; on élargit si un PDJ « en plus »
  // a déjà été servi au-delà des attendus (pour ne pas masquer une case cochée).
  const numBoxes = Math.max(2, numExpected, served)
  // Flèche selon la nature du séjour (source unique `stayKind`) : départ vs recouche.
  const stay = row ? stayKind(row.status) : null
  const departing = stay === 'departing'
  const staying = stay === 'staying'
  // Saisie MANUELLE : une chambre VIDE (non check-in) ou déjà manuelle accepte un
  // PDJ à la main (day-use, no-show revenu…). `mKind` = son type inclus/extra
  // (défaut extra). `doServe` route le clic vers le bon canal (manuel vs normal).
  const canManual = !row || isManual
  const mKind: ManualKind = manualKind ?? 'extra'
  const doServe = (n: number) =>
    canManual ? onManual(room, n, mKind) : onServe(room, n)
  // Cases interactives : TOUTE chambre OCCUPÉE (client présent), qu'elle ait du PDJ
  // inclus OU NON — sinon on ne pouvait pas servir un PDJ EXTRA à un client d'une
  // chambre sans PDJ inclus (le clic passe alors par `onServe` : breakfasts_served
  // sur la ligne, comptés en extras puisque breakfasts_included = 0). PLUS la chambre
  // vide éditable (1re coche → ligne manuelle day-use). Une chambre occupée affiche
  // ses cases même en lecture seule (pour montrer l'état « servi »).
  const showInteractive = !!row || (!row && canEdit)
  // Double-clic « tout servir / annuler » : réservé aux lignes à couverts attendus.
  const canServe = canEdit && numExpected > 0

  return (
    <tr
      onDoubleClick={
        canServe
          ? () => doServe(served >= numExpected ? 0 : numExpected)
          : undefined
      }
      title={canServe ? 'Double-clic : tout servir / annuler' : undefined}
      className={cn(
        row && row.breakfasts_included > 0 && 'pdj-included',
        !row && 'pdj-empty',
        canServe && 'cursor-pointer select-none',
      )}
    >
      <td className="pdj-room">{room}</td>
      {isManual ? (
        // Saisie manuelle : la bande Nom / Statut / Visites (vides ici) est
        // fusionnée via colSpan — entre Chambre et Clients (cases), inchangées.
        // Par défaut, on n'affiche QUE le type en toutes lettres, centré ; le
        // toggle (compact, Extra en 1er) n'apparaît qu'au SURVOL de la bande.
        <td className="pdj-name" colSpan={3}>
          <div className="group relative flex w-full items-center justify-center">
            {/* Type en toutes lettres : reste dans le flux → fixe la hauteur de la
                ligne (identique aux autres). Juste masqué (invisible) au survol. */}
            <span className="text-xs font-medium capitalize text-muted-foreground group-hover:invisible">
              {mKind}
            </span>
            {/* Toggle SUPERPOSÉ (absolute) → n'affecte JAMAIS la hauteur : aucun
                saut au survol. Compact, centré, Extra en 1er, écran seul. */}
            <span className="absolute inset-0 hidden items-center justify-center group-hover:flex print:hidden">
              <span className="inline-flex overflow-hidden rounded-md border border-border bg-card text-xs leading-none">
                {(['extra', 'inclus'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => onManual(room, served, k)}
                    className={cn(
                      'px-2 py-0.5 font-medium capitalize transition-colors',
                      mKind === k
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {k}
                  </button>
                ))}
              </span>
            </span>
          </div>
        </td>
      ) : (
        <>
          <td className={cn('pdj-name', row?.vip && 'pdj-vip')}>
            {row?.vip && (
              <Star className="pdj-name-star size-3" fill="currentColor" />
            )}
            {row ? (row.guest_name ?? '—') : ''}
          </td>
          <td className="pdj-c">
            {departing ? (
              <ArrowUp className="pdj-status-icon" style={{ color: '#EF5350' }} />
            ) : staying ? (
              <ArrowDown className="pdj-status-icon" style={{ color: '#2196F3' }} />
            ) : null}
          </td>
          <td className="pdj-c pdj-stay-count">
            {row && row.stay_count > 1 ? row.stay_count : ' '}
          </td>
        </>
      )}
      <td className="pdj-c">
        {/* Impression : cases à cocher. Celles marquées « servi » à l'écran
            (i < served) sont pré-remplies (miroir du DOM) ; le reste est à
            cocher au stylo. */}
        <span className="pdj-checkboxes">
          {Array.from({ length: numBoxes }, (_, i) => (
            <span
              key={i}
              className={cn(
                'pdj-checkbox',
                i < numExpected && 'pdj-expected',
                i < served && 'pdj-checked',
              )}
            />
          ))}
        </span>
        {/* Écran : contrôle interactif « servi / attendu » (persisté), calqué
            sur les cases du PDF — toujours 2 cases mini. Bordure pleine en gras
            = client attendu (1 ou 2) ; bordure fine en pointillés = place
            supplémentaire (cochable à la main pour un PDJ « en plus », mais JAMAIS
            remplie par le double-clic de la ligne) ; case pleine = servi. */}
        {showInteractive && (
          <span className="inline-flex items-center gap-1 print:hidden">
            {Array.from({ length: numBoxes }, (_, i) => {
              const expected = i < numExpected
              const isServed = i < served
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => doServe(served === i + 1 ? i : i + 1)}
                  onDoubleClick={(e) => e.stopPropagation()}
                  aria-label={
                    expected
                      ? `Servi ${i + 1} sur ${numExpected}`
                      : `Servi ${i + 1} (supplémentaire)`
                  }
                  title={
                    expected
                      ? `${served} / ${numExpected} servis`
                      : 'PDJ supplémentaire (au-delà des clients attendus)'
                  }
                  className={cn(
                    'size-3.5 rounded-[3px] transition-colors',
                    isServed
                      ? 'border-2 border-emerald-500 bg-emerald-500'
                      : expected
                        ? 'border-2 border-foreground/70 bg-transparent'
                        : 'border border-dashed border-muted-foreground/40 bg-transparent',
                    canEdit
                      ? 'cursor-pointer hover:border-emerald-400'
                      : 'cursor-default',
                  )}
                />
              )
            })}
          </span>
        )}
      </td>
    </tr>
  )
})
