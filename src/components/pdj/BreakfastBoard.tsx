import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Coffee,
  FileUp,
  LineChart,
  Minus,
  Plus,
  Printer,
  Receipt,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'

import { EmptyCanvas } from '#/components/shared/EmptyCanvas.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { ConfirmDialog } from '#/components/shared/ConfirmDialog.tsx'
import { PrintBlockedDialog } from '#/components/shared/PrintBlockedDialog.tsx'
import { PrintButton } from '#/components/shared/PrintButton.tsx'
import { HelpDialogHeader } from '#/components/shared/HelpDialogHeader.tsx'
import { HelpGlyph } from '#/components/shared/HelpGlyph.tsx'
import { PdjHelpPanel } from '#/components/pdj/PdjHelpPanel.tsx'
import { GuestRow } from '#/components/pdj/GuestRow.tsx'
import { StatTile } from '#/components/shared/StatTile.tsx'
import { usePrintShortcut } from '#/components/shared/usePrintShortcut.ts'
import { ButtonGroup } from '#/components/shared/ButtonGroup.tsx'
import {
  MobileToolbar,
  ToolbarCell,
} from '#/components/shared/MobileToolbar.tsx'
import { useResponsiveShell } from '#/components/shared/useResponsiveShell.ts'
import { StepNav } from '#/components/shared/StepNav.tsx'
import { useStepNavKeys } from '#/components/shared/useStepNavKeys.ts'
import { useKeySequence } from '#/components/shared/useKeySequence.ts'
import { useNow } from '#/components/shared/useNow.ts'
import { Tip } from '#/components/shared/Tip.tsx'
import { useNavbarSubtitle } from '#/lib/navbarSubtitle.ts'
import { Button } from '#/components/ui/button.tsx'
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
import { capitalize, cn } from '#/lib/utils.ts'
import { errorMessage } from '#/lib/errors.ts'
import { printWithTitle } from '#/lib/print.ts'
import {
  ALL_ROOMS,
  localDateStr,
  mergeCsvFiles,
  stayKind,
} from '#/lib/pdj/csv.ts'
import type { ManualKind } from '#/lib/pdj/csv.ts'
import {
  businessDateStr,
  businessNow,
  isManualImportOpen,
  isManualModeHour,
} from '#/lib/businessDay.ts'
import {
  deleteAddonProductionDay,
  deleteDay,
  fetchAddonProduction,
  fetchAllAddonProduction,
  fetchDailyAgg,
  fetchDay,
  fetchExternalsCount,
  fetchServiceDates,
  importAddonProduction,
  PDJ_DATES_KEY,
  importRows,
  purgeOldGuestNames,
  setExternalsCount,
  setManualServe,
  setServed,
} from '#/lib/pdj/service.ts'
import type { AddonProductionDbRow, PdjDayRow } from '#/lib/pdj/service.ts'
import { supabase } from '#/lib/supabase.ts'
import { canEditPdjDay } from '#/lib/pdj/editability.ts'
import { breakfastServiceDate, parseAddonProduction } from '#/lib/pdj/addon.ts'
import { computeAggBenchmarks } from '#/lib/pdj/amounts.ts'
import { detectTarifs } from '#/lib/pdj/tarif.ts'
import {
  billedRevenueTtc,
  dayUnitPrices,
  includedByCode,
  topPrice,
} from '#/lib/pdj/pricing.ts'
import { purgeGate } from '#/lib/pdj/purgeGate.ts'
import { fileTooLarge, MAX_CSV_BYTES } from '#/lib/shared/files.ts'
import { computePdjCA } from '#/lib/pdj/breakdown.ts'
import { autoModeTargets } from '#/lib/pdj/automode.ts'
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
  const { isNavbarMobile, isTouchDevice, isPhoneWidth } = useResponsiveShell()
  // Tablette tactile EN LARGEUR (typiquement paysage) : ni un seuil de plus,
  // juste ces deux signaux déjà en place. Pilote la largeur max du document
  // (cf. plus bas) — jamais vrai à la souris ni sur téléphone. La grille des
  // étages (`.pdj-floors`, pdj.css) n'a plus besoin de ce signal : ses
  // paliers (900/1280px, propres au contenu des tableaux d'étage — pas
  // ceux des tuiles KPI) sont de simples seuils de largeur, valables en
  // tactile comme à la souris.
  const wideTouch = isTouchDevice && !isNavbarMobile
  // Tablette tactile EN PORTRAIT (768-1023px de large, ni téléphone ni assez
  // large pour `wideTouch`) : pilote le retrait de la tuile « Taux de
  // captage » (gain de place, demande utilisateur) — jamais vrai à la
  // souris, sur téléphone, ni en largeur (wideTouch déjà couvert).
  const tabletPortrait = isTouchDevice && !isPhoneWidth && isNavbarMobile
  const navigate = useNavigate()
  const { can, pageLevel } = useAuth()
  const canEdit = can('pdj', 'ecriture')
  const isAdmin = can('pdj', 'gestion')
  // Import manuel : voir `canManualImport` plus bas (gestion toujours ; écriture
  // seulement en MODE MANUEL, quand le In-House du jour n'est pas arrivé après 03h).
  // La saisie « servi » reste, elle, sous `canEdit` (inchangée).
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

  // Retour transitoire (« automode » + échecs d'enregistrement) : message bref
  // (~3,5 s), jamais imprimé, coloré selon la tonalité (succès / avertissement).
  // Un seul timer, réarmé à chaque message.
  const [autoMsg, setAutoMsg] = useState<{
    text: string
    tone: 'ok' | 'warn'
  } | null>(null)
  const autoMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashAuto = useCallback((text: string, tone: 'ok' | 'warn' = 'ok') => {
    setAutoMsg({ text, tone })
    if (autoMsgTimer.current) clearTimeout(autoMsgTimer.current)
    autoMsgTimer.current = setTimeout(() => setAutoMsg(null), 3500)
  }, [])
  // Timers de l'animation « cases cochées une à une » (automode) : nettoyés au
  // démontage ET avant chaque relance, pour ne pas cocher après coup.
  const autoTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  // Vrai PENDANT l'animation « automode » : le canal realtime ignore alors les
  // échos (nos propres écritures reviennent en < 1 s et rempliraient les cases
  // d'un coup, court-circuitant le décalage voulu).
  const autoRunningRef = useRef(false)
  const clearAutoTimers = useCallback(() => {
    for (const id of autoTimersRef.current) clearTimeout(id)
    autoTimersRef.current = []
    autoRunningRef.current = false
  }, [])
  useEffect(
    () => () => {
      if (autoMsgTimer.current) clearTimeout(autoMsgTimer.current)
      clearAutoTimers()
    },
    [clearAutoTimers],
  )

  // Jours de service disponibles (du plus récent au plus ancien). Clé partagée
  // avec l'analytique PDJ et le board rapro ; ne change qu'à l'import, qui
  // invalide le préfixe ['pdj'] → 5 min de fraîcheur suffisent.
  const { data: dates = [] } = useQuery({
    queryKey: PDJ_DATES_KEY,
    queryFn: fetchServiceDates,
    staleTime: 5 * 60_000,
  })

  // Purge RGPD (rôles habilités) : anonymise les noms à partir de J-2
  // (aujourd'hui et J-1 conservés), garde les stats. Idempotent, silencieux si
  // rien à purger. UNE fois par jour hôtelier et par poste (`purgeGate`, état
  // de module) : l'ancien `useRef` repartait à zéro à chaque montage du board,
  // soit un UPDATE de masse à chaque visite de la page (audit 2026-09-06).
  useEffect(() => {
    if (!canEdit || !purgeGate.claim(yesterday)) return
    purgeOldGuestNames(yesterday)
      // La purge n'anonymise QUE des noms de jours passés → seules les vues « jour »
      // peuvent être périmées. On n'invalide donc que `['pdj','day']` (ciblé), pas
      // le préfixe `['pdj']` entier qui rejouait aussi dates + agrégats + benchmark
      // (les scans lourds) sur CHAQUE montage éditeur.
      .then(() => queryClient.invalidateQueries({ queryKey: ['pdj', 'day'] }))
      .catch((err) => {
        purgeGate.release(yesterday)
        console.error('[pdj] purge RGPD échouée', err)
      })
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

  // Horloge de rendu (1 min) : le mode manuel s'ouvre à 03h sans autre signal.
  const now = useNow()
  // MODE MANUEL (écriture) : l'ingestion du In-House est AUTOMATIQUE (Edge
  // Function import-report, vers 02h30). Si le PMS ne transmet pas, l'écriture
  // peut déposer l'extraction manuelle à partir de 03h, uniquement sur le JOUR
  // COURANT encore vide. La gestion importe toujours. Règle pure :
  // lib/businessDay.ts (isManualImportOpen). Côté base, pdj_breakfasts et
  // pdj_addon_production sont déjà ouverts à l'écriture sur J-3.
  const manualImportOpen =
    selectedDate === today &&
    !loading &&
    isManualImportOpen({ now, dataReceived: hasData })
  const canManualImport = isAdmin || (canEdit && manualImportOpen)

  // Temps réel du JOUR affiché : un cochage (ou une saisie manuelle) fait par un
  // AUTRE utilisateur apparaît en direct, sans rafraîchir la page. On s'abonne aux
  // changements de `pdj_breakfasts` filtrés sur `service_date` (côté serveur, la
  // RLS s'applique aussi au realtime), et on PATCHE le cache du jour chambre par
  // chambre — jamais de refetch : cela préserverait aussi bien nos maj optimistes
  // en vol que les cases des autres. Le canal se réabonne au changement de jour.
  useEffect(() => {
    if (!selectedDate) return
    const channel = supabase
      .channel(`pdj-day-${selectedDate}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pdj_breakfasts',
          filter: `service_date=eq.${selectedDate}`,
        },
        (payload) => {
          // Pendant l'animation « automode », nos propres échos arriveraient d'un
          // coup et rempliraient les cases sans le décalage : on les ignore.
          if (autoRunningRef.current) return
          queryClient.setQueryData<PdjDayRow[]>(
            ['pdj', 'day', selectedDate],
            (old) => {
              const list = old ?? []
              if (payload.eventType === 'DELETE') {
                const id = (payload.old as { id?: string }).id
                return id ? list.filter((r) => r.id !== id) : list
              }
              const row = payload.new as PdjDayRow
              if (!row || typeof row.room !== 'number') return list
              if (list.some((r) => r.room === row.room)) {
                return list.map((r) =>
                  r.room === row.room ? { ...r, ...row } : r,
                )
              }
              return [...list, row]
            },
          )
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [selectedDate, queryClient])

  // Mode « détail financier » : bascule le tableau (Nom→OTA, Statut→code PDJ,
  // Visites→prix HT) sans quitter la page. Écran uniquement — l'impression garde
  // la feuille nominative (cf. pdj.css, @media print force le mode normal).
  const [financeMode, setFinanceMode] = useState(false)

  // Extras du jour = couverts servis en chambre au-delà des inclus (cf. amounts.ts).
  const roomExtrasCount = useMemo(
    () =>
      (dayRows ?? []).reduce(
        (s, r) => s + Math.max(0, r.breakfasts_served - r.breakfasts_included),
        0,
      ),
    [dayRows],
  )

  // Externes du jour (bouton « Externe », dialogue +/-) : clients venus manger
  // sans être logés à l'hôtel. Requête indépendante des lignes chambre — le
  // compteur existe même sur un jour sans In-House. Défaut 0 (aucune ligne).
  const { data: externalsCount = 0 } = useQuery({
    queryKey: ['pdj', 'externals', selectedDate],
    queryFn: () => fetchExternalsCount(selectedDate),
    enabled: !!selectedDate,
  })
  const [externalsOpen, setExternalsOpen] = useState(false)
  // Modal d'aide : tutoriel factuel de la page (bouton « ? » de la barre
  // d'actions, même geste que RepJour, Rapprochement et Parking).
  const [helpOpen, setHelpOpen] = useState(false)

  // Extras TOTAUX du jour = chambre + externes. Source UNIQUE, partagée par la
  // card « PDJ Extra » (compteur) et le calcul des montants (computePdjCA).
  const extrasCount = roomExtrasCount + externalsCount

  // Saisie du nombre d'externes : maj optimiste du cache puis persistance : même
  // schéma que `handleServe` (rollback + message si le jour est hors fenêtre).
  const handleExternalsChange = useCallback(
    (n: number) => {
      if (!dayEditable || !selectedDate) return
      const next = Math.max(0, n)
      queryClient.setQueryData(['pdj', 'externals', selectedDate], next)
      setExternalsCount(selectedDate, next).catch((err) => {
        console.error('[pdj] externes : enregistrement échoué', err)
        void queryClient.invalidateQueries({
          queryKey: ['pdj', 'externals', selectedDate],
        })
        flashAuto(
          'Enregistrement refusé : jour hors fenêtre ou droit insuffisant.',
          'warn',
        )
      })
    },
    [dayEditable, selectedDate, queryClient, flashAuto],
  )

  // Tarifs unitaires par code, DÉTECTÉS dans l'Addon (dynamique, rien en dur ;
  // cf. tarif.ts). Chargé une fois, mis en cache (partagé avec la fiche financière).
  const { data: allAddon } = useQuery({
    queryKey: ['pdj', 'addon-all'],
    queryFn: fetchAllAddonProduction,
  })
  // Tarifs de RÉFÉRENCE, déduits de tout l'historique. Depuis le 2026-09-12 ils
  // ne servent plus que de REPLI : le prix réel se lit dans la facturation du
  // jour (cf. `dayPrices` juste en dessous).
  const referenceTarifs = useMemo(() => detectTarifs(allAddon ?? []), [allAddon])

  // Facturation du PMS pour le jour affiché : c'est elle qui fait le chiffre
  // d'affaires. Lecture légère (au plus trois lignes, une par code).
  const { data: dayAddon } = useQuery({
    queryKey: ['pdj', 'addon-day', selectedDate],
    queryFn: () => fetchAddonProduction(selectedDate),
    enabled: !!selectedDate,
  })

  // Prix RÉELS du jour, par code : recette ÷ inclus. Ils suivent d'eux-mêmes
  // une remise ou un changement de tarif, là où le prix deviné exigeait que
  // toutes les recettes restent des multiples exacts — c'est ce qui avait cassé
  // le 2026-09-12 (une remise de 8 € avait fait tomber le tarif de 19 € à 1 €).
  const dayPrices = useMemo(
    () =>
      dayUnitPrices(
        dayAddon ?? [],
        includedByCode(dayRows ?? []),
        referenceTarifs,
      ),
    [dayAddon, dayRows, referenceTarifs],
  )
  // Conservé sous le nom `tarifs` : c'est ce que consomment la fiche par chambre
  // (`GuestRow`) et les calculs ci-dessous.
  const tarifs = dayPrices

  // Prix FORT : celui des extras, des externes et des offerts. Le plus élevé
  // des prix connus — ceux du jour ET ceux de référence : une remise accordée à
  // une réservation ne baisse pas le prix d'un petit-déjeuner pris au comptoir.
  const extraTtc = useMemo(
    () => topPrice(dayPrices, referenceTarifs),
    [dayPrices, referenceTarifs],
  )
  const topTtcLabel =
    extraTtc != null ? ` (${fmtEur(extraTtc, 2)} TTC)` : ''

  // Montants HT du jour. Les INCLUS valent ce que le PMS a facturé (recette
  // réelle, remises et groupes postés en bloc compris) ; les extras et les
  // externes, absents de cette facturation, sont valorisés au PRIX FORT du jour.
  // SOURCE UNIQUE du CA (fiche, cartes, PDF) → le même chiffre partout.
  const ca = useMemo(
    () =>
      computePdjCA(
        dayRows ?? [],
        tarifs,
        externalsCount,
        dayAddon ? billedRevenueTtc(dayAddon) : null,
        extraTtc,
      ),
    [dayRows, tarifs, externalsCount, dayAddon, extraTtc],
  )

  // Écart entre ce que le PMS a facturé et ce que les chambres expliquent : un
  // groupe posté en bloc, ou un décalage entre l'instantané In-House et la
  // facturation. On le DIT au lieu de le taire — mais seulement quand il existe
  // (au-delà d'un euro, pour ne pas signaler un arrondi).
  const ecartNonVentile = useMemo(
    () =>
      ca.billed ? Math.round((ca.includedHt - ca.rebuiltHt) * 100) / 100 : 0,
    [ca],
  )
  const inclusHint = useMemo(() => {
    const base = ca.billed
      ? "Petits-déjeuners dus ce jour. Le montant est celui que le PMS a réellement facturé (remises comprises), converti en HT — il n'est plus reconstitué à partir d'un prix supposé."
      : "Petits-déjeuners dus ce jour : inclus au tarif de la réservation, facturés même si le client ne les a pas encore pris. Aucune facturation reçue pour ce jour : le montant est une estimation au prix de référence."
    if (Math.abs(ecartNonVentile) < 1) return base
    return ecartNonVentile > 0
      ? `${base} ${fmtEur(ecartNonVentile, 2)} de cette facturation ne sont rattachés à aucune chambre (groupe posté en bloc).`
      : `${base} Les chambres portent ${fmtEur(-ecartNonVentile, 2)} de plus que ce qui a été facturé — décalage à vérifier.`
  }, [ca.billed, ecartNonVentile])
  const caHint = useMemo(
    () =>
      `Chiffre d'affaires HT du petit-déjeuner ce jour : ${
        ca.billed
          ? 'la recette réellement facturée par le PMS pour les inclus'
          : 'les inclus estimés au prix de référence, faute de facturation reçue'
      }, plus les extras et les externes valorisés au prix le plus élevé connu${topTtcLabel}. Les gratuités en sont exclues.`,
    [ca.billed, topTtcLabel],
  )

  // Repères « moyenne par jour » (total HT, captage, occupation) sur TOUT
  // l'historique. Lus depuis la VUE d'agrégation `pdj_daily_agg` (quelques lignes
  // par jour) au lieu de scanner la table entière — mêmes chiffres, une fraction
  // du coût. Chaque jour de l'historique y porte SA recette : le prix de
  // référence n'intervient qu'en repli, jour par jour (surtout PAS le prix du
  // jour affiché, qui n'a rien à dire des mois précédents).
  // `benchmark` reste `undefined` tant que l'agrégat charge
  // (rendu inchangé : les sous-textes n'apparaissent qu'ensuite).
  // Clé PARTAGÉE avec le seuil de rupture de PdjAnalytiqueMoisBoard : même
  // lecture (toute la vue), un seul scan en cache au lieu de deux (audit 2026-09-06).
  const { data: aggAll } = useQuery({
    queryKey: ['pdj', 'analytics', 'all-history'],
    queryFn: () => fetchDailyAgg('2000-01-01', '2100-12-31'),
    staleTime: 5 * 60_000,
  })
  const benchmark = useMemo(
    () => (aggAll ? computeAggBenchmarks(aggAll, referenceTarifs) : undefined),
    [aggAll, referenceTarifs],
  )

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
    if (!canManualImport || fileList.length === 0) return
    setError('')

    const csvFiles = fileList.filter((f) =>
      f.name.toLowerCase().endsWith('.csv'),
    )
    const nonCsv = fileList.length - csvFiles.length
    if (csvFiles.length === 0) {
      setError('Aucun fichier .csv dans la sélection.')
      return
    }
    const tooLarge = csvFiles
      .map((f) => fileTooLarge(f, MAX_CSV_BYTES))
      .find(Boolean)
    if (tooLarge) {
      setError(tooLarge)
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
        } else if (
          !isAdmin &&
          result.dates.some((d) => d > businessDateStr())
        ) {
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
      // Un « offert » ne doit jamais dépasser le nombre servi : si on redescend
      // le servi en-dessous de l'offert déjà posé, on le borne au passage.
      const currentOffert =
        dayRows?.find((r) => r.room === room)?.breakfasts_offert ?? 0
      const offert = Math.min(currentOffert, n)
      queryClient.setQueryData<PdjDayRow[]>(
        ['pdj', 'day', selectedDate],
        (old) =>
          old?.map((r) =>
            r.room === room
              ? {
                  ...r,
                  breakfasts_served: n,
                  served: n > 0,
                  breakfasts_offert: offert,
                }
              : r,
          ),
      )
      setServed(selectedDate, room, n, offert).catch((err) => {
        console.error('[pdj] enregistrement de la consommation échoué', err)
        // Resynchronise (annule la coche optimiste) ET explique le revert, sinon
        // la case « rebondirait » sans raison visible (rejet RLS silencieux).
        void queryClient.invalidateQueries({
          queryKey: ['pdj', 'day', selectedDate],
        })
        flashAuto(
          'Enregistrement refusé : jour hors fenêtre ou droit insuffisant.',
          'warn',
        )
      })
    },
    [dayEditable, selectedDate, dayRows, queryClient, flashAuto],
  )

  // Marque (clic droit) une case « offert » (gratuite) sur une chambre occupée
  // SANS PDJ inclus : `n` = nombre d'extras offerts « jusqu'ici » (curseur, même
  // logique que `handleServe`) ; sert aussi le servi si on offre une case pas
  // encore cochée (offrir sert forcément le petit-déjeuner).
  const handleOffert = useCallback(
    (room: number, n: number) => {
      if (!dayEditable || !selectedDate) return
      const current = dayRows?.find((r) => r.room === room)
      const served = Math.max(current?.breakfasts_served ?? 0, n)
      queryClient.setQueryData<PdjDayRow[]>(
        ['pdj', 'day', selectedDate],
        (old) =>
          old?.map((r) =>
            r.room === room
              ? {
                  ...r,
                  breakfasts_served: served,
                  served: served > 0,
                  breakfasts_offert: n,
                }
              : r,
          ),
      )
      setServed(selectedDate, room, served, n).catch((err) => {
        console.error('[pdj] marquage « offert » échoué', err)
        void queryClient.invalidateQueries({
          queryKey: ['pdj', 'day', selectedDate],
        })
        flashAuto(
          'Enregistrement refusé : jour hors fenêtre ou droit insuffisant.',
          'warn',
        )
      })
    },
    [dayEditable, selectedDate, dayRows, queryClient, flashAuto],
  )

  // « automode » : cheat code de cochage auto. On tape « automode » au clavier
  // (sans champ) → pour le JOUR affiché, coche le dû facturé (breakfasts_included)
  // de chaque chambre facturée pas encore saisie (cf. autoModeTargets). Une seule
  // maj optimiste du cache pour les N chambres, puis persistance en lot ; rollback
  // si échec. Respecte `dayEditable` (RLS : la gestion coche tout jour).
  const runAutoMode = useCallback(() => {
    if (!dayEditable || !selectedDate) return
    const targets = autoModeTargets(dayRows ?? [])
    if (targets.length === 0) return
    clearAutoTimers()
    // Gèle le canal realtime le temps de l'animation (cf. autoRunningRef).
    autoRunningRef.current = true
    // Ordre ALÉATOIRE (Fisher-Yates) → jolie apparition en désordre.
    const shuffled = targets.slice()
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    // Cadence rapide mais visible, BORNÉE (pas d'attente longue même à 80
    // chambres). Chaque case se coche par une maj optimiste décalée ; la
    // transition CSS du bouton fait le fondu. Léger jitter aléatoire.
    const perStep = Math.min(
      45,
      Math.max(12, Math.round(900 / shuffled.length)),
    )
    shuffled.forEach((t, i) => {
      const delay = i * perStep + Math.random() * perStep
      const id = setTimeout(() => {
        queryClient.setQueryData<PdjDayRow[]>(
          ['pdj', 'day', selectedDate],
          (old) =>
            old?.map((r) =>
              r.room === t.room
                ? {
                    ...r,
                    breakfasts_served: t.served,
                    served: true,
                    // Miroir du `0` passé à `setServed` juste en dessous.
                    breakfasts_offert: 0,
                  }
                : r,
            ),
        )
      }, delay)
      autoTimersRef.current.push(id)
    })
    // Fin d'animation : on rouvre le canal realtime (marge après la dernière case).
    const resetId = setTimeout(
      () => {
        autoRunningRef.current = false
      },
      shuffled.length * perStep + 400,
    )
    autoTimersRef.current.push(resetId)
    // Persistance en lot, immédiate (indépendante de l'animation). AUCUN bandeau
    // après l'automode : l'animation est le seul retour. Échec (RLS/réseau) → on
    // stoppe l'animation et on resynchronise sur l'état réel persisté (les coches
    // non enregistrées disparaissent).
    // `0` en 4e argument : l'automode ne cible que des chambres NON saisies
    // (`breakfasts_served === 0`, cf. autoModeTargets) — aucune gratuité servie
    // ne peut y exister. On borne donc explicitement, comme `handleServe`,
    // plutôt que de laisser survivre une valeur morte dans la colonne.
    void Promise.all(
      targets.map((t) => setServed(selectedDate, t.room, t.served, 0)),
    ).catch((err) => {
      console.error('[pdj] automode : écriture échouée', err)
      clearAutoTimers()
      void queryClient.invalidateQueries({
        queryKey: ['pdj', 'day', selectedDate],
      })
    })
  }, [dayEditable, selectedDate, dayRows, queryClient, clearAutoTimers])

  // Écoute « automode » tant que le compte a le droit d'écrire (garde focus
  // incluse dans le hook). Portée limitée au board : l'écouteur part au démontage.
  //
  // DÉCISION PRODUIT (plan responsive-tactile-multi-pages, D1, tranchée par
  // l'utilisateur) : ce raccourci reste VOLONTAIREMENT réservé au clavier
  // physique de bureau — aucun déclencheur tactile équivalent (bouton discret,
  // appui long, geste dédié…) n'est construit ici. Sur un usage tactile pur
  // (tablette sans clavier), l'automode est donc totalement inatteignable ;
  // c'est un choix assumé, pas un oubli.
  useKeySequence('automode', runAutoMode, { enabled: canEdit })

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
            return list.filter(
              (r) => !(r.room === room && r.manual_kind != null),
            )
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
                    // Miroir de `setManualServe` : une ligne manuelle porte sa
                    // gratuité dans `manual_kind`, jamais dans cette colonne.
                    breakfasts_offert: 0,
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
            breakfasts_offert: 0,
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

  // Sous 1024px, la Navbar globale affiche ce jour sous « Petit-déjeuner » (à
  // la place de la marque) — le titre de page ci-dessus s'efface d'autant
  // (cf. `title` de PageHeader). GATÉ par `isNavbarMobile` : sans ce garde, le
  // sous-titre resterait posé même quand la Navbar n'en montre plus rien
  // (≥ 1024px). Pas de `useNavbarBadge` ici : PDJ n'a pas de statut clôturé/
  // ouvert façon `LockBadge` (le badge du PageHeader est le segmented control
  // service/financier, qui reste dans l'en-tête, pas dans la Navbar).
  useNavbarSubtitle(isNavbarMobile ? titleDate : null)

  return (
    // `max-w-5xl` centre le contenu comme sur RepJour. Neutralisé à
    // l'impression (la feuille A4 impose déjà sa largeur, voir pdj.css) ET
    // en tablette tactile en largeur (`wideTouch`) : sur un écran plus large
    // que 1024px, `max-w-5xl` laissait de grandes marges mortes de part et
    // d'autre (retour utilisateur) — sans objet en tablette portrait
    // (`tabletPortrait`), déjà plus étroite que ce plafond.
    // `pb-20` réserve la place de la barre d'outils basse tactile (cf. fin du
    // composant) pour qu'elle ne masque jamais la fin du contenu.
    <div
      className={cn(
        'pdj-doc mx-auto flex w-full min-w-0 flex-1 flex-col gap-5 print:max-w-none',
        wideTouch ? 'max-w-none' : 'max-w-5xl',
        // `print:pb-0` : cette réserve n'a de sens qu'à l'écran (place pour
        // la barre d'outils basse fixe, elle-même masquée à l'impression,
        // cf. MobileToolbar) — sans lui, un `pb-20` (80px) inutile s'ajoutait
        // au document imprimé. Même mécanisme que `print:max-w-none`
        // ci-dessus (le variant `print:` l'emporte sans `!important`).
        isTouchDevice && 'pb-20 print:pb-0',
      )}
    >
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

      {autoMsg && (
        <div
          role="status"
          className={cn(
            'rounded-md border px-3 py-2 text-sm font-medium print:hidden',
            autoMsg.tone === 'ok'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
          )}
        >
          {autoMsg.text}
        </div>
      )}

      {/* En-tête TOUJOURS rendu : le titre du jour est connu d'emblée, il ne doit
          pas apparaître après coup. Seule la navigation (StepNav) reste
          conditionnée à `canNavigate` À L'INTÉRIEUR des actions. */}
      <PageHeader
        // Sous 1024px, le jour vit dans la Navbar globale (sous-titre, posé par
        // useNavbarSubtitle ci-dessous) : `undefined` plutôt qu'un contenu
        // masqué en CSS, pour que la ligne titre de PageHeader ne réserve plus
        // sa hauteur. Même seuil que la Navbar elle-même (hamburger ↔ onglets),
        // pas celui, indépendant, des tuiles/tableaux PDJ.
        title={isNavbarMobile ? undefined : titleDate}
        // Sur écran tactile, ce groupe entier laisse la place à la barre
        // d'outils basse fixe (cf. fin du composant) — même mécanisme que
        // Rapro. `undefined` (pas un `hidden` CSS) : PageHeader ne rend alors
        // littéralement rien pour ce prop.
        actions={
          isTouchDevice ? undefined : (
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
              {/* Bouton « Externe » — exceptionnellement du texte, pas d'icône : ouvre
                le dialogue +/- du nombre de clients venus manger sans être logés à
                l'hôtel (s'additionne au PDJ Extra du jour, cf. card ci-dessous).
                Réservé aux rôles qui peuvent saisir la conso (mêmes droits que les
                cases « servi »). */}
              {canEdit && (
                <Tip label="Ajouter des petits-déjeuners servis à des clients non logés à l'hôtel">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setExternalsOpen(true)}
                    aria-label="Petits-déjeuners externes"
                  >
                    Externe
                  </Button>
                </Tip>
              )}
              {/* Bascule « vue service ↔ détail financier » : segmented control
                dans le style des boutons d'action (bordure outline, hauteur
                icon-sm), un seul actif à la fois. La pastille bleue GLISSE
                d'une position à l'autre (translate animé) au lieu de sauter.
                Réétiquette le tableau à l'écran ; jamais imprimé.
                Vivait auparavant dans le `badge` du titre (aligné à part,
                détaché du reste des actions), puis en tête d'`actions` — placée
                ici, après « Externe », à la demande de l'utilisateur. Réservée
                à la souris (le bloc `actions` entier l'est déjà) : sur écran
                tactile, la bascule vit dans la barre d'outils basse (cf. fin
                du composant). */}
              {hasData && (
                <div className="pdj-seg relative inline-flex h-8 items-center overflow-hidden rounded-md border bg-background shadow-xs print:hidden dark:border-input dark:bg-input/30">
                  {/* Pastille active : remplit TOUTE la hauteur (inset-y-0) et la
                    largeur d'un bouton (w-7), collée aux bordures. Ses coins sont
                    clippés par l'arrondi du conteneur (overflow-hidden) → elle
                    épouse exactement le cadre. Position par `left` inline (aucune
                    composition Tailwind, contrairement à `transform`) : service = 0,
                    financier = largeur d'un bouton (1,75rem). Transition en CSS. */}
                  <span
                    data-thumb
                    aria-hidden="true"
                    style={{ left: financeMode ? '1.75rem' : '0' }}
                    className="pointer-events-none absolute inset-y-0 w-7 bg-primary"
                  />
                  <Tip label="Vue service">
                    <button
                      type="button"
                      onClick={() => setFinanceMode(false)}
                      aria-label="Vue service"
                      aria-pressed={!financeMode}
                      className="relative z-10 flex size-7 items-center justify-center rounded-[5px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <Users
                        className={cn(
                          'size-4 transition-colors duration-200',
                          financeMode
                            ? 'text-muted-foreground'
                            : 'text-primary-foreground',
                        )}
                      />
                    </button>
                  </Tip>
                  <Tip label="Détail financier">
                    <button
                      type="button"
                      onClick={() => setFinanceMode(true)}
                      aria-label="Détail financier"
                      aria-pressed={financeMode}
                      className="relative z-10 flex size-7 items-center justify-center rounded-[5px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <Receipt
                        className={cn(
                          'size-4 transition-colors duration-200',
                          financeMode
                            ? 'text-primary-foreground'
                            : 'text-muted-foreground',
                        )}
                      />
                    </button>
                  </Tip>
                </div>
              )}
              {/* Groupe « actions de page » : aide + analytique + import +
                  impression. L'aide vient en tête, comme sur les autres pages. */}
              <ButtonGroup>
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
              {/* Groupe « navigation temporelle », collé au bord droit.
                `enlargeOnNarrow={false}` sur les deux : ce groupe n'est
                JAMAIS montré sur écran tactile (barre basse dédiée dès qu'un
                doigt est détecté, cf. plus haut) — l'agrandir à un simple
                rétrécissement de fenêtre désaccorderait sa taille de celle
                des boutons voisins, restés fixes. */}
              {canNavigate && (
                <StepNav
                  onPrev={gotoOlder}
                  onNext={gotoNewer}
                  prevLabel="Jour précédent"
                  nextLabel="Jour suivant"
                  prevDisabled={dateIdx < 0 || dateIdx >= navDates.length - 1}
                  nextDisabled={dateIdx <= 0}
                  enlargeOnNarrow={false}
                >
                  <DatePickerButton
                    value={selectedDate}
                    onChange={selectNearestDate}
                    ariaLabel="Choisir un jour"
                    max={today}
                    enabledDates={navDates}
                    todayValue={today}
                    enlargeOnNarrow={false}
                  />
                </StepNav>
              )}
            </>
          )
        }
        // Ce groupe n'existe qu'en mode souris (cf. `isTouchDevice` ci-dessus) :
        // toujours collé au bord droit, jamais écarté aux deux bords même en
        // fenêtre étroite (le repli « aux deux bords », pensé pour la portée du
        // pouce sur téléphone, n'a alors plus de sens).
        actionsAlign="end"
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
            {!isAdmin && (
              <div className="text-xs text-amber-500/90">
                Mode manuel : le PMS n'a pas transmis le In-House de cette nuit.
              </div>
            )}
          </EmptyCanvas>
        ) : (
          <EmptyCanvas className="empty-canvas min-h-[340px] flex-col gap-3 text-center text-muted-foreground">
            <Coffee className="size-10 opacity-40" />
            <p className="text-sm font-medium">
              Aucune donnée de petit-déjeuner disponible.
            </p>
            <p className="text-xs">
              {selectedDate === today && !isManualModeHour(now)
                ? "Le rapport de cette nuit n'est pas encore arrivé."
                : 'Un responsable doit importer le rapport du jour.'}
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
                externalsCount > 0 && 'pdj-stats-grid--with-externals',
                ca.offertNb > 0 && 'pdj-stats-grid--with-offert',
                // 5 tuiles au lieu de 6 en tablette portrait (« Taux de
                // captage » retirée juste en dessous, gain de place) : la
                // rangée doit rester pleine, pas de tuile orpheline.
                tabletPortrait && 'pdj-stats-grid--tablet-portrait',
              )}
            >
              <StatTile
                className="pdj-stat-neutral"
                value={stats.rooms}
                label="Chambres occupées"
                accent="#818cf8"
                hint="Nombre de chambres occupées ce jour (présentes dans l'import In-House), qu'elles aient du petit-déjeuner inclus ou non."
                sub={
                  benchmark && benchmark.occupancy.avgRooms != null
                    ? subMuted(`moy. ${fmtInt(benchmark.occupancy.avgRooms)}/j`)
                    : undefined
                }
              />
              <StatTile
                className="pdj-stat-neutral"
                value={stats.guests}
                label="Clients"
                accent="#38bdf8"
                hint="Nombre total de clients logés ce jour, toutes chambres occupées confondues."
                sub={
                  benchmark && benchmark.occupancy.avgGuests != null
                    ? subMuted(
                        `moy. ${fmtInt(benchmark.occupancy.avgGuests)}/j`,
                      )
                    : undefined
                }
              />
              <StatTile
                value={stats.breakfasts}
                label="PDJ inclus"
                accent="#34d399"
                hint={inclusHint}
                sub={
                  ca.inclusNb > 0 || ca.includedHt > 0
                    ? subMuted(fmtEur(ca.includedHt, 2))
                    : undefined
                }
              />
              <StatTile
                // Détail écran : « extra chambre + externe » tant qu'il y a au
                // moins un externe (sinon le simple total, comme avant — les deux
                // valent le même nombre quand externalsCount = 0).
                value={
                  externalsCount > 0
                    ? `${roomExtrasCount} + ${externalsCount}`
                    : extrasCount
                }
                label={externalsCount > 0 ? 'PDJ Extra + Externe' : 'PDJ Extra'}
                accent="#fbbf24"
                printHidden
                hint={`Petits-déjeuners servis au-delà de ce qui était inclus, plus les externes (clients non logés, bouton « Externe »). Le petit-déjeuner facturé par le PMS ne les contient pas : ils sont valorisés à part, au prix le plus élevé connu${topTtcLabel}.`}
                sub={
                  extrasCount > 0 ? subMuted(fmtEur(ca.extrasHt, 2)) : undefined
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
              {/* Tuile PDF-seule (pas d'équivalent écran) : détail des externes
                  compris dans « PDJ Extra » ci-dessus, uniquement s'il y en a au
                  moins un (sinon rien à préciser — pas de tuile à 0). AMBRE comme
                  « PDJ Extra » dont ils font partie (extra FACTURÉ) : le violet
                  est réservé aux gratuités, sinon les deux tuiles voisines du
                  footer PDF sont indiscernables (libellé à 5,5 px). */}
              {externalsCount > 0 && (
                <StatTile
                  className="stat-tile--screen-hidden"
                  value={externalsCount}
                  label="Externes"
                  accent="#fbbf24"
                />
              )}
              {/* Tuile PDF-seule : petits-déjeuners OFFERTS (gratuits, clic droit
                  sur la case / bouton manuel) parmi les extras ci-dessus,
                  uniquement s'il y en a au moins un — même violet que la case
                  cochée à l'écran (cf. pdj.css, .pdj-checked-offert). */}
              {ca.offertNb > 0 && (
                <StatTile
                  className="stat-tile--screen-hidden"
                  value={ca.offertNb}
                  label="Gratuités"
                  accent="#c084fc"
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
                hint={caHint}
                value={ca.totalHt > 0 ? fmtEur(ca.totalHt, 2) : fmtEur(0, 0)}
                sub={
                  benchmark && benchmark.total.avgTotalHT != null
                    ? subMuted(
                        `moy. ${fmtEur(benchmark.total.avgTotalHT, 2)}/j`,
                      )
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
                  donnée). Sous-texte = moyenne sur les jours avec servi saisi.
                  Retirée en tablette portrait (`tabletPortrait`) pour gagner
                  de la place (demande utilisateur) — `printHidden` la
                  masquait déjà à l'impression, donc rien à changer côté PDF. */}
              {!tabletPortrait && (
                <StatTile
                  printHidden
                  label="Taux de captage"
                  accent="#f472b6"
                  hint="Part des clients logés ayant pris un petit-déjeuner ce jour (inclus + extras ÷ clients). « — » si aucune donnée client."
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
                      ? subMuted(
                          `moy. ${fmtPctInt(benchmark.captage.avgCaptage)}/j`,
                        )
                      : undefined
                  }
                />
              )}
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
            {/* Cases « € » — impression uniquement, montants HT. Mêmes chiffres
                que les tuiles de l'écran : les inclus valent la recette
                réellement facturée par le PMS ce jour-là, les extras le prix
                fort du jour. Vides faute de chiffre (comportement historique,
                saisie manuelle au stylo). */}
            <div
              className={
                'pdj-stats-grid pdj-stats-revenue' +
                (ca.extrasHt > 0 ? '' : ' pdj-revenue-faded')
              }
            >
              <div className="pdj-revenue">
                <div className="pdj-revenue-value">
                  {ca.inclusNb > 0 || ca.includedHt > 0
                    ? htPrice(ca.includedHt)
                    : ' '}
                </div>
                <div className="pdj-revenue-label">PDJ Inclus €</div>
              </div>
              <div className="pdj-revenue">
                {/* Extra rempli seulement s'il y a des extras chiffrables ;
                    sinon case gardée, valeur vide (décision D1). */}
                <div className="pdj-revenue-value">
                  {ca.extrasHt > 0 ? htPrice(ca.extrasHt) : ' '}
                </div>
                <div className="pdj-revenue-label">PDJ Extra €</div>
              </div>
              <div className="pdj-revenue">
                {/* Total affiché SEULEMENT si au moins 1 extra est sélectionné :
                    sans extra, Total == Inclus (redondant) et changerait dès qu'on
                    coche un extra → on n'imprime pas un chiffre provisoire. Même
                    condition que la case Extra. */}
                <div className="pdj-revenue-value">
                  {ca.extrasHt > 0 ? htPrice(ca.totalHt) : ' '}
                </div>
                <div className="pdj-revenue-label">Total €</div>
              </div>
            </div>
          </div>

          {/* Tableaux par étage. La classe `pdj-finance` bascule l'affichage en
              mode détail financier (CSS) — écran uniquement, l'impression revient
              au mode nominatif. Grille en 3 paliers (1 → 2 → 3 colonnes), sur
              des seuils (900/1280px, pdj.css) propres au contenu des étages —
              délibérément distincts de ceux des tuiles KPI (768/1024px), pour
              rester plus longtemps sur chaque palier. Aucun modificateur JS
              dédié requis, souris et tactile s'y comportent pareil. */}
          <div className={cn('pdj-floors', financeMode && 'pdj-finance')}>
            {floors.map(({ floor, rooms }) => (
              <div key={floor} className="pdj-floor">
                <table>
                  <tbody>
                    {rooms.map((room) => (
                      <GuestRow
                        key={room}
                        room={room}
                        row={byRoom.get(room)}
                        tarifs={tarifs}
                        canEdit={dayEditable}
                        onServe={handleServe}
                        onManual={handleManual}
                        onOffert={handleOffert}
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

      <ExternalsDialog
        open={externalsOpen}
        onOpenChange={setExternalsOpen}
        count={externalsCount}
        canEdit={dayEditable}
        onChange={handleExternalsChange}
      />

      {/* Modal d'aide : tutoriel factuel de la page (bouton « ? »). Le contenu
          reste en place dessous. */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
          <HelpDialogHeader
            icon={<HelpGlyph />}
            title="Comment fonctionne le petit-déjeuner"
            description="Le pointage des couverts du matin, étape par étape."
          />
          {/* Seul le corps défile : l'en-tête (flex shrink-0) reste fixe en haut. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <PdjHelpPanel />
          </div>
        </DialogContent>
      </Dialog>

      {/* Barre d'outils basse (écran tactile uniquement, peu importe la largeur
          — téléphone OU tablette) : même socle partagé que Rapro
          (`MobileToolbar`/`ToolbarCell`, shared/), pas une réécriture locale.
          Pager Préc./Suiv. jour aux deux bords (pattern de feuilletage, comme
          Rapro — pas de bouton calendrier séparé, le jour affiché en Navbar
          reste purement informatif).

          « Externe » (dialogue +/- clients non logés à l'hôtel) figure ICI,
          à TOUTE largeur tactile (téléphone et tablette) : geste d'écriture
          courant, pas réservé au bureau.

          Importer et la suppression admin, retirés (peu utiles en usage
          tactile courant — import CSV et suppression restent des gestes de
          bureau/admin ponctuels) : la place libérée revient à la bascule
          Vue service ↔ Détail financier (ex-badge d'en-tête, cf. plus haut),
          qui doit rester accessible sur toute largeur tactile.
          Téléphone (`isPhoneWidth`) : UNE seule cellule, qui fonctionne comme
          un interrupteur (icône/libellé = vue COURANTE, un tap bascule vers
          l'autre) — l'écran le plus étroit n'a pas la place pour deux
          cellules adjacentes en plus des 4 autres. Tablette : les DEUX
          cellules restent adjacentes et visibles en permanence (`active`
          indique laquelle est sélectionnée), plus lisible qu'un
          interrupteur unique quand la largeur le permet — même principe que
          le segmented control desktop. */}
      <MobileToolbar visible={isTouchDevice}>
        <ToolbarCell
          icon={<ChevronLeft className="size-5" />}
          label="Préc."
          ariaLabel="Jour précédent"
          onClick={gotoOlder}
          disabled={dateIdx < 0 || dateIdx >= navDates.length - 1}
          bordered={false}
        />
        {canEdit && (
          <ToolbarCell
            icon={<UserPlus className="size-5" />}
            label="Externe"
            ariaLabel="Petits-déjeuners externes"
            onClick={() => setExternalsOpen(true)}
          />
        )}
        {/* Aide : seulement hors téléphone. Sur la largeur la plus étroite, la
            barre porte déjà cinq cellules (pager, externe, analytique,
            impression, bascule de vue) — une sixième les rendrait illisibles. */}
        {!isPhoneWidth && (
          <ToolbarCell
            icon={<HelpGlyph className="size-5" />}
            label="Aide"
            ariaLabel="Comment ça marche"
            onClick={() => setHelpOpen(true)}
          />
        )}
        <ToolbarCell
          icon={<LineChart className="size-5" />}
          label="Analytique"
          ariaLabel="Vue analytique"
          onClick={() => navigate({ to: '/pdj/analytique' })}
        />
        <ToolbarCell
          icon={<Printer className="size-5" />}
          label="Imprimer"
          ariaLabel={hasData ? 'Imprimer / PDF' : 'Aucune donnée à imprimer'}
          onClick={handlePrint}
          disabled={!hasData}
        />
        {hasData && isPhoneWidth && (
          // Interrupteur unique : icône/libellé montrent la vue COURANTE, le
          // tap bascule vers l'autre. `active` la teinte pour rester
          // repérable au milieu de cellules à icône neutre.
          <ToolbarCell
            icon={
              financeMode ? (
                <Receipt className="size-5" />
              ) : (
                <Users className="size-5" />
              )
            }
            label={financeMode ? 'Financier' : 'Service'}
            ariaLabel={
              financeMode
                ? 'Basculer vers la vue service'
                : 'Basculer vers le détail financier'
            }
            onClick={() => setFinanceMode(!financeMode)}
            active
          />
        )}
        {hasData && !isPhoneWidth && (
          <>
            <ToolbarCell
              icon={<Users className="size-5" />}
              label="Service"
              ariaLabel="Vue service"
              onClick={() => setFinanceMode(false)}
              active={!financeMode}
            />
            <ToolbarCell
              icon={<Receipt className="size-5" />}
              label="Financier"
              ariaLabel="Détail financier"
              onClick={() => setFinanceMode(true)}
              active={financeMode}
            />
          </>
        )}
        <ToolbarCell
          icon={<ChevronRight className="size-5" />}
          label="Suiv."
          ariaLabel="Jour suivant"
          onClick={gotoNewer}
          disabled={dateIdx <= 0}
        />
      </MobileToolbar>
    </div>
  )
}

/*
 * Dialogue « Externe » : nombre de clients venus prendre le petit-déjeuner sans
 * être logés à l'hôtel, pour le jour affiché. Un simple stepper +/- (pas de
 * bouton « enregistrer » : chaque clic persiste directement, comme le reste de
 * la saisie PDJ). Désactivé hors fenêtre d'écriture (`canEdit` = `dayEditable`).
 */
function ExternalsDialog({
  open,
  onOpenChange,
  count,
  canEdit,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  count: number
  canEdit: boolean
  onChange: (next: number) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Petits-déjeuners externes</DialogTitle>
          <DialogDescription>
            Clients non logés à l'hôtel, comptés en PDJ Extra.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center gap-5 py-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={!canEdit || count <= 0}
            onClick={() => onChange(count - 1)}
            aria-label="Retirer un externe"
          >
            <Minus />
          </Button>
          <span className="w-16 text-center text-3xl font-bold tabular-nums">
            {count}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={!canEdit}
            onClick={() => onChange(count + 1)}
            aria-label="Ajouter un externe"
          >
            <Plus />
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const { isNavbarMobile, isTouchDevice, isPhoneWidth } = useResponsiveShell()
  const tabletPortrait = isTouchDevice && !isPhoneWidth && isNavbarMobile
  // 5 tuiles en tablette portrait (« Taux de captage » retirée du vrai
  // contenu, cf. son commentaire plus bas), 6 sinon.
  const statTileCount = tabletPortrait ? 5 : 6
  return (
    <>
      {/* Rangée de tuiles dans LEUR vraie grille (`pdj-stats-grid`), à la
          forme du composant StatTile (liseré + libellé + valeur) pour coller
          au réel et ne rien décaler. */}
      <div className="pdj-stats" aria-hidden="true">
        <div className="pdj-stats-grid">
          {Array.from({ length: statTileCount }).map((_, i) => (
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
          en-têtes réels (invariants), et autant de lignes que de chambres.
          Même grille que le vrai contenu (cf. son commentaire), pour ne rien
          décaler à l'arrivée des données. */}
      <div className="pdj-floors" aria-hidden="true">
        {FLOOR_ROOM_COUNTS.map((count, i) => (
          <div key={i} className="pdj-floor">
            <table>
              <tbody>
                {Array.from({ length: count }).map((_, r) => (
                  <tr key={r}>
                    <td className="pdj-room">
                      <Skeleton className="h-3 w-8" />
                    </td>
                    <td>
                      <Skeleton className="h-3 w-24" />
                    </td>
                    <td className="pdj-c pdj-status">
                      <Skeleton className="mx-auto h-3 w-4" />
                    </td>
                    <td className="pdj-c pdj-stay-count">
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

