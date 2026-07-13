import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  HelpCircle,
  Image as ImageIcon,
  LineChart,
  Send,
  Settings,
} from 'lucide-react'

import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { PrintBlockedDialog } from '#/components/shared/PrintBlockedDialog.tsx'
import { PrintButton } from '#/components/shared/PrintButton.tsx'
import { ButtonGroup } from '#/components/shared/ButtonGroup.tsx'
import { StepNav } from '#/components/shared/StepNav.tsx'
import { useStepNavKeys } from '#/components/shared/useStepNavKeys.ts'
import { usePrintShortcut } from '#/components/shared/usePrintShortcut.ts'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { DatePickerButton } from '#/components/form/fields.tsx'
import { BoardSkeleton } from '#/components/repjour/BoardSkeleton.tsx'
import { AlertBanner } from '#/components/repjour/AlertBanner.tsx'
import { KPIDetailPanel } from '#/components/repjour/KPIDetailPanel.tsx'
import { KPITable } from '#/components/repjour/KPITable.tsx'
import { ImportSection } from '#/components/repjour/ImportSection.tsx'
import { RecipientsModal } from '#/components/repjour/RecipientsModal.tsx'
import { SummaryCards } from '#/components/repjour/SummaryCards.tsx'
import { useAuth } from '#/components/auth/AuthContext.tsx'
import { supabase } from '#/lib/supabase.ts'
import { businessNow } from '#/lib/businessDay.ts'
import { captureTableImage, sendReport } from '#/lib/repjour/email.ts'
import { sendReportViaServer } from '#/lib/repjour/sendServer.ts'
import {
  fetchAvailableDates,
  fetchBudget,
  fetchForecastMonthTotal,
  fetchLatestReportOfMonth,
  fetchPreviousReportInMonth,
  fetchReportByDate,
} from '#/lib/repjour/services/daily.ts'
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
 * Actions email : « Copier l'image » (captureTableImage) et « Envoyer par email »
 * (sendReport) sont ouvertes à TOUS les rôles — elles n'écrivent PAS en base
 * (image via html2canvas sur l'îlot HEX autonome de email.ts, copie
 * presse-papier, mailto). Seule « Gérer les destinataires » (RecipientsModal)
 * écrit (`email_recipients`) et reste réservée à l'admin. Le reste du board
 * n'effectue que des `select` (+ un abonnement temps réel en lecture).
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

export function DashboardBoard() {
  const [detailMode, setDetailMode] = useState(false)
  // Ouverture sur le dernier jour CLÔTURÉ (J-1 du jour hôtelier, bascule à 02h) :
  // avant 02h → avant-veille (la veille civile n'a pas encore de rapport tiré),
  // après 02h → veille, en journée les deux coïncident. Puis on affiche le tableau
  // si son rapport existe, ou l'invite d'import sinon. (Cf. getImportDayStr.)
  const [selectedDate, setSelectedDate] = useState(getImportDayStr)
  const [sending, setSending] = useState(false)
  // Flux dev (envoi serveur Resend) : état d'envoi + message de retour transitoire.
  const [serverSending, setServerSending] = useState(false)
  const [serverNote, setServerNote] = useState<string | null>(null)
  const [showRecipients, setShowRecipients] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [printBlocked, setPrintBlocked] = useState(false)

  useEffect(() => {
    if (!serverNote) return
    const t = setTimeout(() => setServerNote(null), 15000)
    return () => clearTimeout(t)
  }, [serverNote])

  const { role } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = role === 'admin'
  const canImport = role === 'super_utilisateur' || role === 'admin'

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
  const { data: budget } = useQuery({
    queryKey: ['repjour', 'budget', year, month],
    queryFn: () => fetchBudget(year, month),
  })
  const { data: forecastMonthTotal } = useQuery({
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
  // Toutes les dates ayant un rapport en base — sert à griser dans le sélecteur
  // les jours « qu'on ne possède pas » (sans donnée). Une seule lecture, mise en
  // cache : la liste bouge peu (un import par jour).
  const { data: availableDates } = useQuery({
    queryKey: ['repjour', 'available-dates'],
    queryFn: fetchAvailableDates,
  })

  // Repli MTD : n'a de sens que si le jour affiché n'a PAS de rapport.
  const latestMTD = report ? null : (latestOfMonth ?? null)
  // Une erreur réseau laisse `report` à `undefined` : on rend l'état vide
  // plutôt que de faire tourner le squelette indéfiniment.
  const loading = reportPending && !reportError

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
          alerts: report.alerts || [],
          importedAt: report.imported_at,
        }
      : {
          titleDate: displayDate,
          realiseJour: null,
          realiseMTD: null,
          projeteMois: fcMoisKPI,
          budget: budgetSafe,
          ecart: fcEcart,
        }
  }

  async function handleGeneratePdf() {
    if (!budget) return
    setPdfBusy(true)
    try {
      const data = buildPdfData(budget)
      const [yr, mo, da] = selectedDate.split('-')
      await printRepjourReport(data, `Rapport_${da}-${mo}-${yr}`)
    } catch {
      // Silencieux : l'impression est un confort, pas un flux critique.
    } finally {
      setPdfBusy(false)
    }
  }

  // --- Envoi serveur (dev, admin-only) : PDF joint + corps HTML via Resend ----
  async function handleSendServer() {
    if (!budget || !report || !rj || !rmtd || !pm || !ecart) return
    setServerSending(true)
    setServerNote(null)
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
        },
        pdfData: buildPdfData(budget),
        pdfTitle: `Rapport_${da}-${mo}-${yr}`,
      })
      setServerNote(result.message)
    } catch (err) {
      setServerNote(
        `Erreur inattendue : ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setServerSending(false)
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
              {/* Groupe « actions de page » : vue analytique + impression. */}
              <ButtonGroup>
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

        {loading ? (
          <BoardSkeleton />
        ) : importOnly ? (
          // Rapport du jour pas encore importé (rôle habilité) : on n'affiche
          // rien ici — la carte d'import ci-dessous devient l'unique contenu.
          <p className="text-sm text-muted-foreground">
            Aucun rapport importé pour le {displayDate}. Importez-le ci-dessous.
          </p>
        ) : !report && !hasPartialData ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="mb-3 text-4xl text-muted-foreground">—</p>
            <p className="text-lg font-medium text-foreground">
              Aucune donnée pour le {displayDate}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Aucun rapport ni prévision n'a été importé pour cette date.
            </p>
          </div>
        ) : hasPartialData && budget ? (
          <>
            <SummaryCards
              realiseMTD={latestMTD ? reportToKPI(latestMTD, 'rmtd') : ZERO_KPI}
              projeteMois={fcMoisKPI || ZERO_KPI}
              budget={budget}
              ecart={fcEcart || ZERO_KPI}
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
            />

            {detailMode ? (
              <div className="space-y-4">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setDetailMode(false)}
                >
                  Fermer le mode détaillé
                </Button>
                <KPIDetailPanel
                  realiseJour={rj}
                  realiseMTD={rmtd}
                  projeteMois={pm}
                  budget={budget}
                  ecart={ecart}
                  dayOfMonth={report.day_of_month}
                  daysInMonth={report.days_in_month}
                />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setDetailMode(false)}
                >
                  Fermer le mode détaillé
                </Button>
              </div>
            ) : (
              <>
                <div className="relative rounded-xl border border-border bg-card p-2 sm:p-3">
                  <Tip label="Mode détaillé" side="right">
                    <button
                      type="button"
                      onClick={() => setDetailMode(true)}
                      aria-label="Ouvrir le mode détaillé"
                      className="absolute top-3 left-3 flex size-6 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      <HelpCircle className="size-3.5" />
                    </button>
                  </Tip>
                  <KPITable
                    realiseJour={rj}
                    realiseMTD={rmtd}
                    projeteMois={pm}
                    budget={budget}
                    ecart={ecart}
                  />
                </div>

                <AlertBanner alerts={report.alerts || []} />

                {/* Actions email, directement SOUS le tableau, au-dessus de la
                    carte d'import. Visibles par TOUS les rôles : captureTableImage
                    et sendReport n'écrivent rien en base (îlot HEX autonome de
                    email.ts, presse-papier, mailto). Seule « Gérer les
                    destinataires » écrit (email_recipients) et reste admin. */}
                {/* Groupe segmenté (cf. ButtonGroup) : copier l'image / envoyer
                    / (admin) gérer les destinataires. 2 ou 3 boutons selon le
                    rôle. `flex w-full` pour que « Envoyer » (flex-1) occupe la
                    largeur restante entre les icônes. */}
                <ButtonGroup className="flex w-full">
                  <Tip label="Copier le tableau en image">
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Copier le tableau en image"
                      onClick={() =>
                        captureTableImage({
                          realiseJour: rj,
                          realiseMTD: rmtd,
                          projeteMois: pm,
                          budget,
                          ecart,
                          dayOfMonth: report.day_of_month,
                          month: report.month,
                          year: report.year,
                        })
                      }
                    >
                      <ImageIcon />
                    </Button>
                  </Tip>
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={sending}
                    onClick={async () => {
                      setSending(true)
                      try {
                        await sendReport({
                          realiseJour: rj,
                          realiseMTD: rmtd,
                          projeteMois: pm,
                          budget,
                          ecart,
                          dayOfMonth: report.day_of_month,
                          month: report.month,
                          year: report.year,
                        })
                      } finally {
                        setSending(false)
                      }
                    }}
                  >
                    {sending ? 'Préparation...' : 'Envoyer par email'}
                  </Button>
                  {isAdmin && (
                    <Tip label="Gérer les destinataires">
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label="Gérer les destinataires"
                        onClick={() => setShowRecipients(true)}
                      >
                        <Settings />
                      </Button>
                    </Tip>
                  )}
                </ButtonGroup>

                {/* Flux DEV (admin-only) : envoi serveur via Resend — PDF en
                    pièce jointe + corps HTML, en un clic. Séparé et en pointillés
                    tant qu'il n'est pas stabilisé (Edge Function à déployer,
                    domaine d'expéditeur à vérifier). N'altère pas l'envoi
                    existant au-dessus. */}
                {isAdmin && (
                  <div className="flex flex-col gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-dashed"
                      disabled={serverSending}
                      onClick={handleSendServer}
                    >
                      <Send />
                      {serverSending
                        ? 'Envoi en cours…'
                        : 'Envoyer via serveur (dev)'}
                    </Button>
                    {serverNote && (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {serverNote}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        ) : null}

        {/* Import — carte placée en bas du dashboard, réservée aux rôles
            super_utilisateur / admin. Masquée en mode détaillé et sur tout jour
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
            Un import réussi recharge le rapport affiché. */}
        {!loading &&
          !detailMode &&
          canImport &&
          isImportDay &&
          (isAdmin || !report) && (
            <ImportSection
              spacious={importOnly}
              onImported={() =>
                void queryClient.invalidateQueries({ queryKey: ['repjour'] })
              }
            />
          )}
      </div>

      {isAdmin && (
        <RecipientsModal
          open={showRecipients}
          onClose={() => setShowRecipients(false)}
        />
      )}

      <PrintBlockedDialog
        open={printBlocked}
        onOpenChange={setPrintBlocked}
        reason="Aucune donnée pour ce jour. Choisissez une date avec un rapport ou une prévision."
      />
    </PageContainer>
  )
}
