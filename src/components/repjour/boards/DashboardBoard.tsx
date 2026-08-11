import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { LineChart, Send, Settings, Trash2 } from 'lucide-react'

import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { ConfirmDialog } from '#/components/shared/ConfirmDialog.tsx'
import { PrintBlockedDialog } from '#/components/shared/PrintBlockedDialog.tsx'
import { PrintButton } from '#/components/shared/PrintButton.tsx'
import { ButtonGroup } from '#/components/shared/ButtonGroup.tsx'
import { StepNav } from '#/components/shared/StepNav.tsx'
import { useStepNavKeys } from '#/components/shared/useStepNavKeys.ts'
import { usePrintShortcut } from '#/components/shared/usePrintShortcut.ts'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Dialog, DialogContent } from '#/components/ui/dialog.tsx'
import { HelpDialogHeader } from '#/components/shared/HelpDialogHeader.tsx'
import { HelpGlyph } from '#/components/shared/HelpGlyph.tsx'
import { DatePickerButton } from '#/components/form/fields.tsx'
import { BoardSkeleton } from '#/components/repjour/BoardSkeleton.tsx'
import { AlertBanner } from '#/components/repjour/AlertBanner.tsx'
import { SendStatusBanner } from '#/components/shared/SendStatusBanner.tsx'
import { KPIDetailPanel } from '#/components/repjour/KPIDetailPanel.tsx'
import { KPITable } from '#/components/repjour/KPITable.tsx'
import { ImportSection } from '#/components/repjour/ImportSection.tsx'
import { RecipientsModal } from '#/components/repjour/RecipientsModal.tsx'
import { ServerSendDialog } from '#/components/repjour/ServerSendDialog.tsx'
import { serverReportRecipients } from '#/lib/repjour/services/recipients.ts'
import { SummaryCards } from '#/components/repjour/SummaryCards.tsx'
import { DayCrossSummary } from '#/components/repjour/DayCrossSummary.tsx'
import { useAuth } from '#/components/auth/AuthContext.tsx'
import { supabase } from '#/lib/supabase.ts'
import { businessNow } from '#/lib/businessDay.ts'
import { MANUAL_IMPORT_ENABLED_FOR_ALL } from '#/lib/repjour/constants.ts'
import { sendReportViaServer } from '#/lib/repjour/sendServer.ts'
import type { ServerSendResult } from '#/lib/repjour/sendServer.ts'
import {
  fetchAvailableDates,
  fetchBudget,
  fetchForecastMonthTotal,
  fetchLatestReportOfMonth,
  fetchMonthReports,
  fetchPreviousReportInMonth,
  fetchReportByDate,
  dismissSendReminder,
} from '#/lib/repjour/services/daily.ts'
import { deleteDayData } from '#/lib/repjour/services/data.ts'
import { reportToKPI } from '#/lib/repjour/calc/kpi.ts'
import { computeEcart } from '#/lib/repjour/calc/ecart.ts'
import { printRepjourReport } from '#/lib/repjour/pdf.ts'
import type { RepjourPdfData } from '#/lib/repjour/pdf.ts'
import { DAY_NAMES, MONTHS, TOTAL_ROOMS } from '#/lib/repjour/constants.ts'
import type { KPIBlock, MonthBudget } from '#/lib/repjour/types.ts'

/*
 * Board du dashboard journalier — porté de la source DashboardPage.
 *
 * Charge en LECTURE le rapport du jour (ou d'une date choisie) + le budget +
 * le forecast du mois, calcule les KPI et écarts (lib/repjour/calc), puis rend
 * SummaryCards + KPITable + AlertBanner + KPIDetailPanel.
 *
 * Actions email : l'ingestion des rapports est désormais AUTOMATIQUE (Edge
 * Function), et l'envoi serveur (Resend, PDF joint) + la gestion des
 * destinataires sont regroupés dans la barre d'actions du haut, réservés au
 * GRADE admin (filet de secours manuel — l'envoi normal est auto). Le reste du
 * board n'effectue que des `select` (+ un abonnement temps réel en lecture).
 */

const ZERO_KPI: KPIBlock = {
  nuitees: 0,
  to: 0,
  pm: 0,
  revpar: 0,
  roomRevenue: 0,
}

/** Date locale au format YYYY-MM-DD (sans décalage UTC). */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Veille CIVILE (bascule à minuit). Ne sert PLUS de jour affiché par défaut
 * (voir getImportDayStr) : uniquement de référence pour l'EXCEPTION admin de la
 * zone d'import — l'admin peut importer dès minuit, sans attendre 02h.
 */
function getYesterdayStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return localDateStr(d)
}

/**
 * J-1 du jour HÔTELIER (bascule à 02h via `businessNow`, pas à minuit). RepJour
 * est en J-1 : le rapport d'une nuit n'est tiré qu'à partir de 02h. Ce jour sert
 * à la fois de :
 *  - jour AFFICHÉ par défaut : le dernier jour réellement CLÔTURÉ dont le rapport
 *    est disponible. Avant 02h → J-2 (la veille civile n'a pas encore de données) ;
 *    après 02h → J-1 ; en journée les deux coïncident. Sans ça, entre minuit et
 *    02h on ouvrait sur un jour vide (samedi 01h52 → vendredi pas encore tiré) ;
 *  - jour dont on PROPOSE l'import.
 * Ainsi l'affichage ET l'import basculent à 02h, jamais à minuit.
 */
function getImportDayStr(): string {
  const d = businessNow()
  d.setDate(d.getDate() - 1)
  return localDateStr(d)
}

// Date + heure d'envoi du mail (ex. « 8 août 2026 à 14:32 ») — mention discrète.
const fmtSentAt = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function DashboardBoard() {
  const [detailMode, setDetailMode] = useState(false)
  // Ouverture sur le dernier jour CLÔTURÉ (J-1 du jour hôtelier, bascule à 02h) :
  // avant 02h → avant-veille (la veille civile n'a pas encore de rapport tiré),
  // après 02h → veille, en journée les deux coïncident. Puis on affiche le tableau
  // si son rapport existe, ou l'invite d'import sinon. (Cf. getImportDayStr.)
  const [selectedDate, setSelectedDate] = useState(getImportDayStr)
  // Envoi serveur (Resend) : état d'envoi transitoire (bouton de la barre du haut).
  const [serverSending, setServerSending] = useState(false)
  // Masquage du bandeau « pas encore envoyé » (RPC dismiss_send_reminder) : transitoire.
  const [ignoring, setIgnoring] = useState(false)
  const [showServerRecipients, setShowServerRecipients] = useState(false)
  const [showServerConfirm, setShowServerConfirm] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [printBlocked, setPrintBlocked] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Erreur d'une action du board (suppression, aperçu PDF) : affichée en bandeau
  // plutôt qu'un window.alert natif ou un échec muet.
  const [actionError, setActionError] = useState<string | null>(null)

  const { can, grade } = useAuth()
  // Grade ADMIN réel (« dieu »), distinct du niveau de page « gestion » qu'un
  // gestionnaire non-admin peut avoir. Le flux d'envoi serveur est réservé aux
  // vrais admins tant qu'il est en dev.
  const isGradeAdmin = grade === 'admin'
  const queryClient = useQueryClient()
  const isAdmin = can('repjour', 'gestion')
  const canImport = can('repjour', 'ecriture')

  const d = new Date(selectedDate + 'T00:00:00')
  const year = d.getFullYear()
  const month = d.getMonth() + 1

  /*
   * Quatre lectures INDÉPENDANTES, donc parallèles. L'ancien code enchaînait
   * le rapport PUIS le reste, alors que l'année et le mois se déduisent de la
   * date choisie : la cascade coûtait un aller-retour réseau pour rien.
   *
   * Passer par `useQuery` donne surtout le cache (60 s) : revenir sur RepJour
   * réaffiche instantanément, sans repayer le réseau. Voir lib/query.ts.
   */
  const {
    data: report,
    isPending: reportPending,
    isError: reportError,
    error: reportErrorObj,
  } = useQuery({
    queryKey: ['repjour', 'report', selectedDate],
    queryFn: () => fetchReportByDate(selectedDate),
  })
  const { data: budget, isPending: budgetPending } = useQuery({
    queryKey: ['repjour', 'budget', year, month],
    queryFn: () => fetchBudget(year, month),
  })
  const { data: forecastMonthTotal, isPending: forecastPending } = useQuery({
    queryKey: ['repjour', 'forecast-month', year, month],
    queryFn: () => fetchForecastMonthTotal(year, month),
  })
  const { data: latestOfMonth } = useQuery({
    queryKey: ['repjour', 'latest-of-month', year, month],
    queryFn: () => fetchLatestReportOfMonth(year, month),
  })
  const { data: prevReport } = useQuery({
    queryKey: ['repjour', 'prev-report', year, month, selectedDate],
    queryFn: () => fetchPreviousReportInMonth(selectedDate, year, month),
  })
  // Rapports du mois (jour par jour) → sparkline du CA projeté « pris depuis le
  // début du mois » sur la carte pickup. Une lecture, mise en cache par mois.
  const { data: monthReports } = useQuery({
    queryKey: ['repjour', 'month-reports', year, month],
    queryFn: () => fetchMonthReports(year, month),
  })
  // Toutes les dates ayant un rapport en base — sert à griser dans le sélecteur
  // les jours « qu'on ne possède pas » (sans donnée). Une seule lecture, mise en
  // cache : la liste bouge peu (un import par jour).
  const { data: availableDates } = useQuery({
    queryKey: ['repjour', 'available-dates'],
    queryFn: fetchAvailableDates,
  })

  // Repli MTD : n'a de sens que si le jour affiché n'a PAS de rapport.
  const latestMTD = report ? null : (latestOfMonth ?? null)
  // Une erreur réseau laisse `report` à `undefined` : `loading` exclut `reportError`
  // pour ne pas tourner en squelette, et le rendu affiche un message d'échec DÉDIÉ
  // (distinct de l'état vide) quand `reportError` est vrai.
  //
  // La porte attend le rapport MAIS AUSSI le budget et le forecast : le choix de
  // branche (vide / partielle / complète) en dépend. Les gater seulement sur le
  // rapport laissait passer un rendu intermédiaire — flash « Aucune donnée » sur
  // un jour partiel (budget/forecast arrivés après), ou trou blanc sur un jour
  // complet (l'écart, qui a besoin du budget, encore `null`). Requêtes parallèles
  // + cache 60 s : à la revisite d'un mois, aucune n'est `pending`, pas de flash.
  const loading =
    (reportPending || budgetPending || forecastPending) && !reportError

  // `useQuery` n'écrit rien dans la console : sans cela une panne réseau
  // deviendrait un écran vide muet, alors que l'ancien code la journalisait.
  useEffect(() => {
    if (reportError) {
      console.error('[repjour] chargement du rapport échoué', reportErrorObj)
    }
  }, [reportError, reportErrorObj])

  useEffect(() => {
    // Abonnement temps réel en LECTURE : un import fait ailleurs invalide le
    // cache, et TanStack Query refetche ce qui est monté. On ne recharge plus
    // à la main — sinon le cache serait court-circuité à chaque montage.
    const channel = supabase
      .channel('repjour-daily-reports')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_reports' },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['repjour'] })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient])

  const handleDateChange = (date: string) => {
    setSelectedDate(date)
    setDetailMode(false)
    setActionError(null)
  }

  // Suppression des données du jour AFFICHÉ uniquement : `deleteDayData` cible
  // `.eq('date', selectedDate)` sur daily_reports ET forecast_days → jamais un
  // autre jour ni le mois. Confirmation via modale (ConfirmDialog). Réservé
  // super/admin côté service (RLS + assertWriteRole), admin côté UI.
  const handleDeleteDay = async () => {
    if (!isAdmin || !report) return
    setActionError(null)
    try {
      await deleteDayData(selectedDate)
      setDetailMode(false)
      await queryClient.invalidateQueries({ queryKey: ['repjour'] })
    } catch (err) {
      console.error('Suppression du jour échouée :', err)
      setActionError('La suppression a échoué. Réessaie dans un instant.')
    }
  }

  const shiftDate = (days: number) => {
    const d = new Date(
      (selectedDate || new Date().toISOString().split('T')[0]) + 'T12:00:00',
    )
    d.setDate(d.getDate() + days)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    handleDateChange(`${y}-${m}-${day}`)
  }

  const displayDate = selectedDate
    ? (() => {
        const d = new Date(selectedDate + 'T00:00:00')
        return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth() + 1]} ${d.getFullYear()}`
      })()
    : 'Aucune date sélectionnée'

  const rj = report ? reportToKPI(report, 'rj') : null
  const rmtd = report ? reportToKPI(report, 'rmtd') : null
  const pm = report ? reportToKPI(report, 'pm') : null
  const ecart = pm && budget ? computeEcart(pm, budget) : null
  const hasPartialData = !report && (forecastMonthTotal || budget)

  // « Pris depuis la veille » : soustraction du Revenu hébergement projeté fin de
  // mois entre le jour affiché et le dernier rapport ANTÉRIEUR du même mois
  // (fetchPreviousReportInMonth). Positif = réservations nettes prises, négatif =
  // annulations nettes. `null` (carte masquée) quand il n'y a pas de rapport
  // antérieur dans le mois (1er du mois) ou pas de rapport pour le jour affiché.
  const prevPm = prevReport ? reportToKPI(prevReport, 'pm') : null
  const pickup = pm && prevPm ? pm.roomRevenue - prevPm.roomRevenue : null

  // Série du CA projeté fin de mois, jour par jour jusqu'au jour affiché : la
  // sparkline de la carte pickup montre le CA « pris depuis le début du mois ».
  const pickupSeries = useMemo(() => {
    if (!selectedDate) return []
    const selDay = Number(selectedDate.slice(8, 10))
    return (monthReports ?? [])
      .filter((r) => r.day_of_month <= selDay)
      .map((r) => r.pm_room_revenue)
  }, [monthReports, selectedDate])

  // Jour le plus récent ATTEIGNABLE = le jour d'import du rôle. C'est le dernier
  // jour utile : le J-1 hôtelier (getImportDayStr, bascule à 02h) pour tous, sauf
  // l'admin qui peut importer dès minuit → veille CIVILE (getYesterdayStr).
  // Au-delà, ce ne sont que des jours FUTURS sans données (RepJour est en J-1) :
  // la navigation est bornée à ce jour (bouton « suivant » + sélecteur de date).
  const maxDate = isAdmin ? getYesterdayStr() : getImportDayStr()

  // ← / → décalent d'un jour, Alt ramène au jour d'import (le « aujourd'hui »
  // atteignable de RepJour, en J-1). Bornée en haut par maxDate, comme la flèche.
  useStepNavKeys({
    onPrev: () => shiftDate(-1),
    onNext: () => shiftDate(1),
    onToday: () => handleDateChange(maxDate),
    nextDisabled: selectedDate >= maxDate,
  })

  // Jours sélectionnables dans le calendrier = ceux qu'on POSSÈDE (un rapport en
  // base). Tant que la liste n'est pas chargée, on laisse `undefined` (le picker
  // ne borne alors que par `max`, sans tout griser). Les rôles habilités gardent
  // le jour d'import atteignable même sans rapport encore présent (pour importer).
  const pickerDates = useMemo(() => {
    if (!availableDates) return undefined
    return canImport && !availableDates.includes(maxDate)
      ? [...availableDates, maxDate]
      : availableDates
  }, [availableDates, canImport, maxDate])

  // « Jour d'import » = ce jour max. Entre minuit et 02h, la veille civile n'est
  // pas encore tirée, donc la zone d'import reste masquée jusqu'à 02h (sauf admin).
  // Tout autre jour sans rapport (passé plus ancien, ou la veille avant 02h)
  // affiche le tableau vide / la projection.
  const isImportDay = selectedDate === maxDate

  // Rapport d'hier pas encore importé : on n'affiche QUE la zone d'import, pas le
  // tableau. (utilisateur : jamais d'import → vue inchangée ; tout jour ≠ hier :
  // on ne propose pas l'import.)
  //
  // Exception ADMIN : jamais ce mode « import seul ». Il garde la vue de journée
  // — le tableau (ou la projection / l'état vide) PLUS la carte d'import compacte
  // en bas — même quand le rapport n'est pas encore là.
  const importOnly = !report && isImportDay && canImport && !isAdmin

  const daysInMonthPartial = selectedDate
    ? (() => {
        const d = new Date(selectedDate + 'T00:00:00')
        return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      })()
    : 30
  const fcMoisKPI: KPIBlock | null = forecastMonthTotal
    ? {
        nuitees: forecastMonthTotal.occ,
        roomRevenue: forecastMonthTotal.revTTC,
        to: (forecastMonthTotal.occ / (TOTAL_ROOMS * daysInMonthPartial)) * 100,
        pm:
          forecastMonthTotal.occ > 0
            ? forecastMonthTotal.revTTC / forecastMonthTotal.occ
            : 0,
        revpar: forecastMonthTotal.revTTC / (TOTAL_ROOMS * daysInMonthPartial),
      }
    : null
  const fcEcart = fcMoisKPI && budget ? computeEcart(fcMoisKPI, budget) : null

  // Impression : possible dès qu'un tableau KPI est affiché — rapport complet du
  // jour, OU données partielles (projection + budget) — jamais sur un jour vide.
  const canPrint =
    !!budget && ((!!report && !!rj && !!rmtd && !!pm && !!ecart) || !!hasPartialData)

  // Le mode détaillé (aide expliquant tous les calculs) n'a de sens qu'avec un
  // rapport complet du jour ; son bouton bascule vit dans la barre d'actions.
  const hasFullReport = !!report && !!rj && !!rmtd && !!pm && !!budget && !!ecart

  // Bandeau « pas encore envoyé » : uniquement sur le rapport du CYCLE HÔTELIER
  // COURANT (le dernier jour clôturé attendu, getImportDayStr, bascule à 02h),
  // jamais sur l'historique. Rapport présent + marqueur d'envoi absent
  // (auto_sent_at NULL) = pas encore envoyé (auto ni manuel). Se retire au refetch
  // dès que le marqueur est posé (envoi manuel → invalidation ci-dessous ; envoi
  // auto → canal realtime daily_reports).
  const currentCycleDate = getImportDayStr()
  // `send_reminder_dismissed_at` non nul = un rôle habilité a cliqué « Ignorer »
  // (masquage partagé, en base) → on ne montre plus le bandeau, même non envoyé.
  const notSent =
    !!report &&
    report.auto_sent_at == null &&
    report.send_reminder_dismissed_at == null &&
    selectedDate === currentCycleDate

  // Mention discrète (bas droite du contenu) de l'état d'envoi du rapport affiché :
  //  - envoyé          → « Envoyé le <date> à <heure> » (heure réelle de l'envoi) ;
  //  - bandeau présent → rien (le bandeau ambre suffit) ;
  //  - sinon (bandeau ignoré, ou rapport ancien non envoyé) → « Rapport non envoyé ».
  const sendMention = !report
    ? null
    : report.auto_sent_at
      ? `Envoyé le ${fmtSentAt.format(new Date(report.auto_sent_at))}`
      : notSent
        ? null
        : 'Rapport non envoyé'

  // Données du document PDF — partagées par la fonction Imprimer ET l'envoi
  // serveur (le rapport joint est exactement le PDF imprimé). Variante complète
  // si le jour est réalisé, partielle (prévision seule) sinon.
  function buildPdfData(budgetSafe: MonthBudget): RepjourPdfData {
    return report && rj && rmtd && pm && ecart
      ? {
          titleDate: displayDate,
          realiseJour: rj,
          realiseMTD: rmtd,
          projeteMois: pm,
          budget: budgetSafe,
          ecart,
          pickup,
          dayOfMonth: report.day_of_month,
          daysInMonth: report.days_in_month,
          monthStartProjection: pickupSeries[0] ?? null,
          importedAt: report.imported_at,
        }
      : {
          titleDate: displayDate,
          realiseJour: null,
          realiseMTD: null,
          projeteMois: fcMoisKPI,
          budget: budgetSafe,
          ecart: fcEcart,
          dayOfMonth: latestMTD?.day_of_month ?? 0,
          daysInMonth: daysInMonthPartial,
          monthStartProjection: null,
        }
  }

  async function handleGeneratePdf() {
    if (!budget) return
    setPdfBusy(true)
    setActionError(null)
    try {
      const data = buildPdfData(budget)
      const [yr, mo, da] = selectedDate.split('-')
      await printRepjourReport(data, `Repjour_NACV_${da}-${mo}-${yr}`)
    } catch (err) {
      console.error('Aperçu du rapport indisponible :', err)
      setActionError("L'aperçu d'impression n'a pas pu s'ouvrir. Réessaie.")
    } finally {
      setPdfBusy(false)
    }
  }

  // --- Envoi serveur (dev, admin-only) : PDF joint + corps HTML via Resend ----
  async function handleSendServer(): Promise<ServerSendResult> {
    if (!budget || !report || !rj || !rmtd || !pm || !ecart)
      return { ok: false, message: 'Données du rapport indisponibles.' }
    setServerSending(true)
    try {
      const [yr, mo, da] = selectedDate.split('-')
      const result = await sendReportViaServer({
        emailData: {
          realiseJour: rj,
          realiseMTD: rmtd,
          projeteMois: pm,
          budget,
          ecart,
          dayOfMonth: report.day_of_month,
          month: report.month,
          year: report.year,
          pickup,
          daysInMonth: report.days_in_month,
          monthStartProjection: pickupSeries[0] ?? null,
        },
        pdfData: buildPdfData(budget),
        pdfTitle: `Repjour_NACV_${da}-${mo}-${yr}`,
      })
      // Envoi réussi : le serveur a posé `auto_sent_at`. On relit le rapport pour
      // que le bandeau « pas encore envoyé » disparaisse tout de suite, sans
      // attendre l'éventuel événement realtime.
      if (result.ok)
        void queryClient.invalidateQueries({ queryKey: ['repjour'] })
      return result
    } catch (err) {
      console.error('Envoi serveur échoué :', err)
      return { ok: false, message: "L'envoi a échoué. Réessaie dans un instant." }
    } finally {
      setServerSending(false)
    }
  }

  // « Ignorer » le bandeau : masquage PARTAGÉ (en base) via la RPC gardée par rôle
  // (écriture/gestion sur repjour, admins inclus). Ne touche PAS auto_sent_at → un
  // envoi manuel reste possible depuis la barre du haut. Le canal realtime
  // daily_reports le retire ensuite pour tous ; on invalide aussi tout de suite.
  async function handleIgnore(): Promise<void> {
    if (!report) return
    setActionError(null)
    setIgnoring(true)
    try {
      await dismissSendReminder(currentCycleDate)
      await queryClient.invalidateQueries({ queryKey: ['repjour'] })
    } catch (err) {
      console.error('[repjour] masquage du bandeau échoué', err)
      setActionError("Le rappel n'a pas pu être masqué. Réessaie dans un instant.")
    } finally {
      setIgnoring(false)
    }
  }

  // Ctrl+P emprunte la même porte que le bouton : le PDF jsPDF, jamais le rendu
  // brut du DOM. Sans données imprimables, le raccourci explique son refus.
  usePrintShortcut(() => {
    if (pdfBusy) return
    if (!canPrint) {
      setPrintBlocked(true)
      return
    }
    void handleGeneratePdf()
  })

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <PageHeader
          title={displayDate}
          actions={
            <>
              {/* Groupe « suppression » (ADMIN uniquement), isolé et à gauche :
                  supprime les données du seul jour affiché. Bouton outline, icône
                  rouge (pas de fond plein). Présent seulement s'il y a un rapport. */}
              {isAdmin && report && (
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
              {/* Groupe « actions de page » : aide + vue analytique + impression. */}
              <ButtonGroup>
                {/* Aide « détail des calculs » : bascule le mode détaillé.
                    Présente seulement avec un rapport complet (sinon rien à
                    détailler). Placée en tête du groupe (tout à gauche). */}
                {hasFullReport ? (
                  <Tip
                    label={
                      detailMode
                        ? 'Fermer le détail des calculs'
                        : 'Détail des calculs'
                    }
                  >
                    <Button
                      variant={detailMode ? 'default' : 'outline'}
                      size="icon-sm"
                      onClick={() => setDetailMode((v) => !v)}
                      aria-label="Détail des calculs"
                      aria-pressed={detailMode}
                    >
                      {/* « ? » nu, 20 px (vs 16 px pour les voisines lucide) pour
                          le mettre en avant. Source partagée avec l'en-tête. */}
                      <HelpGlyph />
                    </Button>
                  </Tip>
                ) : null}
                {/* Accès à la vue analytique — remplace le lien de l'ancienne
                    sous-nav repjour (supprimée). */}
                <Tip label="Vue analytique">
                  <Button asChild variant="outline" size="icon-sm">
                    <Link to="/repjour/analytique" aria-label="Vue analytique">
                      <LineChart />
                    </Link>
                  </Button>
                </Tip>
                {/* Impression : toujours présente, désactivée tant qu'il n'y a
                    rien à imprimer (jour vide) — l'infobulle porte la raison. */}
                <PrintButton
                  onClick={handleGeneratePdf}
                  iconOnly
                  disabled={!canPrint || pdfBusy}
                  tipLabel={
                    canPrint
                      ? 'Imprimer / PDF'
                      : 'Aucune donnée à imprimer pour ce jour'
                  }
                />
              </ButtonGroup>
              {/* Groupe « actions admin » (GRADE admin) : envoi serveur du rapport
                  (Resend, PDF joint + HTML) + gestion des destinataires serveur.
                  Relocalisé ici, à côté de « Imprimer ». L'envoi auto (Comparison +
                  Forecast présents) reste le canal normal ; ce bouton est le FILET
                  de secours manuel, non bridé par la garde d'idempotence auto, et
                  ouvre TOUJOURS le modal de vérification avant d'envoyer. */}
              {isGradeAdmin && (
                <ButtonGroup>
                  <Tip
                    label={
                      canPrint
                        ? 'Envoyer le rapport par e-mail'
                        : 'Aucune donnée à envoyer pour ce jour'
                    }
                  >
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Envoyer le rapport par e-mail"
                      disabled={!canPrint || serverSending}
                      onClick={() => setShowServerConfirm(true)}
                    >
                      <Send />
                    </Button>
                  </Tip>
                  <Tip label="Gérer les destinataires">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Gérer les destinataires"
                      onClick={() => setShowServerRecipients(true)}
                    >
                      <Settings />
                    </Button>
                  </Tip>
                </ButtonGroup>
              )}
              {/* Groupe « navigation temporelle », collé au bord droit. */}
              <StepNav
                onPrev={() => shiftDate(-1)}
                onNext={() => shiftDate(1)}
                prevLabel="Jour précédent"
                nextLabel="Jour suivant"
                nextDisabled={selectedDate >= maxDate}
              >
                <DatePickerButton
                  value={selectedDate}
                  onChange={handleDateChange}
                  max={maxDate}
                  enabledDates={pickerDates}
                  todayValue={maxDate}
                />
              </StepNav>
            </>
          }
        />

        {actionError && (
          <div className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {actionError}
          </div>
        )}

        {notSent && (
          <SendStatusBanner
            message={`Le rapport du ${displayDate} n'a pas encore été envoyé.`}
            onIgnore={canImport ? handleIgnore : undefined}
            ignoring={ignoring}
          />
        )}

        {loading ? (
          <BoardSkeleton />
        ) : reportError && !report ? (
          // `&& !report` : un échec de refetch (canal realtime) alors qu'un rapport
          // est déjà en cache NE DOIT PAS effacer l'affichage — on ne montre cet
          // écran que pour un vrai échec de chargement (aucune donnée en cache).
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="mb-3 text-4xl text-muted-foreground">—</p>
            <p className="text-lg font-medium text-foreground">
              Impossible de charger le rapport
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Vérifie ta connexion et réessaie.
            </p>
          </div>
        ) : importOnly ? (
          // Rapport du jour pas encore importé, pour un rôle habilité NON-admin.
          // L'ingestion étant désormais AUTOMATIQUE (Edge Function) et l'import
          // manuel réservé au grade admin, on n'invite plus vers un contrôle
          // absent : on informe que le rapport arrivera de lui-même.
          <p className="text-sm text-muted-foreground">
            Le rapport du {displayDate} sera importé automatiquement dès sa
            réception.
          </p>
        ) : !report && !hasPartialData ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="mb-3 text-4xl text-muted-foreground">—</p>
            <p className="text-lg font-medium text-foreground">
              Aucune donnée pour le {displayDate}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Aucun rapport ni prévision pour cette date.
            </p>
          </div>
        ) : hasPartialData && budget ? (
          <>
            <SummaryCards
              realiseMTD={latestMTD ? reportToKPI(latestMTD, 'rmtd') : ZERO_KPI}
              projeteMois={fcMoisKPI || ZERO_KPI}
              budget={budget}
              ecart={fcEcart || ZERO_KPI}
              dayOfMonth={latestMTD?.day_of_month ?? 0}
              daysInMonth={daysInMonthPartial}
              partial
            />

            <div className="rounded-xl border border-border bg-card p-2 sm:p-3">
              <KPITable
                realiseJour={null}
                realiseMTD={null}
                projeteMois={fcMoisKPI}
                budget={budget}
                ecart={fcEcart}
              />
            </div>
          </>
        ) : report && rj && rmtd && pm && budget && ecart ? (
          <>
            <SummaryCards
              realiseJour={rj}
              realiseMTD={rmtd}
              projeteMois={pm}
              budget={budget}
              ecart={ecart}
              pickup={pickup}
              pickupSeries={pickupSeries}
              dayOfMonth={report.day_of_month}
              daysInMonth={report.days_in_month}
            />

            {/* Détail des calculs : ouvert en MODALE depuis le bouton « ? » de
                la barre d'actions (`detailMode`). Le contenu de la page reste en
                place dessous. */}
            <Dialog open={detailMode} onOpenChange={setDetailMode}>
              <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
                <HelpDialogHeader
                  icon={<HelpGlyph />}
                  title={`Détail des calculs — ${displayDate}`}
                  description="Comment chaque indicateur du rapport est obtenu."
                />
                {/* Seul le corps défile : l'en-tête reste fixe en haut. */}
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <KPIDetailPanel
                    realiseJour={rj}
                    realiseMTD={rmtd}
                    projeteMois={pm}
                    budget={budget}
                    ecart={ecart}
                    dayOfMonth={report.day_of_month}
                    daysInMonth={report.days_in_month}
                  />
                </div>
              </DialogContent>
            </Dialog>

            <div className="rounded-xl border border-border bg-card p-2 sm:p-3">
              <KPITable
                realiseJour={rj}
                realiseMTD={rmtd}
                projeteMois={pm}
                budget={budget}
                ecart={ecart}
              />
            </div>

            <AlertBanner alerts={report.alerts || []} />

            <DayCrossSummary date={selectedDate} hotelRoomsSold={rj.nuitees} />

                {/* Envoi du rapport : relocalisé dans la barre d'actions du HAUT
                    (PageHeader, à côté de « Imprimer »). L'ancien groupe inline
                    « Copier l'image / Envoyer par email (mailto) / (dev) » a été
                    retiré : l'envoi passe désormais par le serveur (auto + filet
                    manuel admin). */}
          </>
        ) : null}

        {/* Import — carte placée en bas du dashboard, réservée aux rôles
            super_utilisateur / admin. Masquée sur tout jour
            AUTRE qu'hier (`isImportDay`) : l'import ne peut combler que le
            rapport de la veille (J-1), donc on ne le propose que ce jour-là ;
            partout ailleurs (jour courant, futur, passé plus ancien) on affiche
            le tableau vide / la projection.
            RÈGLE D'AFFICHAGE PAR RÔLE (le jour d'import) :
            - super_utilisateur : visible UNIQUEMENT tant que le rapport d'hier
              n'existe pas. Dès qu'il est présent, la carte disparaît et il ne
              voit plus que le tableau (`isAdmin || !report`) ;
            - admin : toujours visible ce jour-là (données présentes ou non) ;
            - utilisateur : jamais (exclu par `canImport`).
            SOMMEIL : l'ingestion étant désormais AUTOMATIQUE, l'import manuel est
            réservé au GRADE admin (filet de secours), sauf si le flag
            MANUAL_IMPORT_ENABLED_FOR_ALL le rouvre à tous les rôles habilités.
            Un import réussi recharge le rapport affiché. */}
        {!loading &&
          canImport &&
          isImportDay &&
          (isAdmin || !report) &&
          (MANUAL_IMPORT_ENABLED_FOR_ALL || isGradeAdmin) && (
            <ImportSection
              spacious={importOnly}
              onImported={() =>
                void queryClient.invalidateQueries({ queryKey: ['repjour'] })
              }
            />
          )}

        {sendMention && (
          <div className="mt-1 text-right text-xs text-muted-foreground opacity-15 print:hidden">
            {sendMention}
          </div>
        )}
      </div>

      {isGradeAdmin && (
        <RecipientsModal
          open={showServerRecipients}
          onClose={() => setShowServerRecipients(false)}
          service={serverReportRecipients}
          title="Destinataires du rapport"
        />
      )}

      {isGradeAdmin && (
        <ServerSendDialog
          open={showServerConfirm}
          onClose={() => setShowServerConfirm(false)}
          onConfirm={handleSendServer}
        />
      )}

      <PrintBlockedDialog
        open={printBlocked}
        onOpenChange={setPrintBlocked}
        reason="Aucune donnée pour ce jour. Choisissez une date avec un rapport ou une prévision."
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Supprimer les données de ce jour ?"
        description={`Toutes les données du ${displayDate} seront supprimées. Cette action est irréversible et ne touche que ce jour.`}
        confirmLabel="Supprimer"
        destructive
        onConfirm={handleDeleteDay}
      />
    </PageContainer>
  )
}
