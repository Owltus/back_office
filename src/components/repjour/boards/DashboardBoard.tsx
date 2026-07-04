import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Image as ImageIcon,
  Loader2,
  Settings,
} from 'lucide-react'

import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { Button } from '#/components/ui/button.tsx'
import { AlertBanner } from '#/components/repjour/AlertBanner.tsx'
import { KPIDetailPanel } from '#/components/repjour/KPIDetailPanel.tsx'
import { KPITable } from '#/components/repjour/KPITable.tsx'
import { RecipientsModal } from '#/components/repjour/RecipientsModal.tsx'
import { SummaryCards } from '#/components/repjour/SummaryCards.tsx'
import { useAuth } from '#/components/auth/AuthContext.tsx'
import { supabase } from '#/lib/supabase.ts'
import { captureTableImage, sendReport } from '#/lib/repjour/email.ts'
import {
  fetchBudget,
  fetchLatestReport,
  fetchReportByDate,
} from '#/lib/repjour/services/daily.ts'
import { reportToKPI } from '#/lib/repjour/calc/kpi.ts'
import { computeEcart } from '#/lib/repjour/calc/ecart.ts'
import { DAY_NAMES, MONTHS, TOTAL_ROOMS } from '#/lib/repjour/constants.ts'
import type { DailyReport, KPIBlock, MonthBudget } from '#/lib/repjour/types.ts'

/*
 * Board du dashboard journalier — porté de la source DashboardPage.
 *
 * Charge en LECTURE le rapport du jour (ou d'une date choisie) + le budget +
 * le forecast du mois, calcule les KPI et écarts (lib/repjour/calc), puis rend
 * SummaryCards + KPITable + AlertBanner + KPIDetailPanel.
 *
 * Étape 9 : câblage des actions email réservées à l'admin — « Copier l'image »
 * (captureTableImage), « Envoyer par email » (sendReport) et « Gérer les
 * destinataires » (RecipientsModal). captureTableImage/sendReport n'écrivent
 * PAS en base (image via html2canvas sur l'îlot HEX autonome de email.ts, copie
 * presse-papier, mailto) ; seules les écritures de la modale destinataires
 * (email_recipients) touchent la base. Le reste du board n'effectue que des
 * `select` (+ un abonnement temps réel en lecture).
 */

const ZERO_KPI: KPIBlock = {
  nuitees: 0,
  to: 0,
  pm: 0,
  revpar: 0,
  roomRevenue: 0,
}

export function DashboardBoard() {
  const [report, setReport] = useState<DailyReport | null>(null)
  const [budget, setBudget] = useState<MonthBudget | null>(null)
  const [forecastMonthTotal, setForecastMonthTotal] = useState<{
    occ: number
    revTTC: number
  } | null>(null)
  const [latestMTD, setLatestMTD] = useState<DailyReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailMode, setDetailMode] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  const [sending, setSending] = useState(false)
  const [showRecipients, setShowRecipients] = useState(false)

  const { role } = useAuth()
  const isAdmin = role === 'admin'

  // Date courante mémorisée pour le rafraîchissement temps réel (évite une
  // fermeture obsolète dans le handler de l'abonnement).
  const selectedDateRef = useRef('')
  useEffect(() => {
    selectedDateRef.current = selectedDate
  }, [selectedDate])

  const loadReport = useCallback(async (date?: string) => {
    setLoading(true)
    try {
      const r = date ? await fetchReportByDate(date) : await fetchLatestReport()
      setReport(r)

      const targetDate = r?.date || date
      if (targetDate) setSelectedDate(targetDate)

      if (targetDate) {
        const d = new Date(targetDate + 'T00:00:00')
        const year = d.getFullYear()
        const month = d.getMonth() + 1
        const [b, fcMonth, latestReport] = await Promise.all([
          fetchBudget(year, month),
          supabase
            .from('forecast_days')
            .select('occ, rev_ttc')
            .eq('year', year)
            .eq('month', month),
          supabase
            .from('daily_reports')
            .select('*')
            .eq('year', year)
            .eq('month', month)
            .order('day_of_month', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ])
        if (fcMonth.error) throw fcMonth.error
        if (latestReport.error) throw latestReport.error
        setBudget(b)
        setLatestMTD(
          !r && latestReport.data ? (latestReport.data as DailyReport) : null,
        )
        if (fcMonth.data && fcMonth.data.length > 0) {
          const occ = fcMonth.data.reduce(
            (s: number, f: { occ: number }) => s + f.occ,
            0,
          )
          const revTTC = fcMonth.data.reduce(
            (s: number, f: { rev_ttc: number }) => s + f.rev_ttc,
            0,
          )
          setForecastMonthTotal({ occ, revTTC })
        } else {
          setForecastMonthTotal(null)
        }
      } else {
        setBudget(null)
        setForecastMonthTotal(null)
        setLatestMTD(null)
      }
    } catch (err) {
      // La source avalait les erreurs ; ici on les journalise et on retombe sur
      // un état vide plutôt que de laisser le spinner tourner indéfiniment.
      console.error('[repjour] chargement du rapport échoué', err)
      setReport(null)
      setBudget(null)
      setForecastMonthTotal(null)
      setLatestMTD(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadReport()

    // Abonnement temps réel en LECTURE : recharge la vue lorsque la table
    // daily_reports change (import réalisé ailleurs). N'écrit rien.
    const channel = supabase
      .channel('repjour-daily-reports')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_reports' },
        () => {
          loadReport(selectedDateRef.current || undefined)
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadReport])

  const handleDateChange = (date: string) => {
    setSelectedDate(date)
    loadReport(date)
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
        to:
          (forecastMonthTotal.occ / (TOTAL_ROOMS * daysInMonthPartial)) * 100,
        pm:
          forecastMonthTotal.occ > 0
            ? forecastMonthTotal.revTTC / forecastMonthTotal.occ
            : 0,
        revpar: forecastMonthTotal.revTTC / (TOTAL_ROOMS * daysInMonthPartial),
      }
    : null
  const fcEcart = fcMoisKPI && budget ? computeEcart(fcMoisKPI, budget) : null

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-foreground">{displayDate}</h1>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => shiftDate(-1)}
              aria-label="Jour précédent"
            >
              <ChevronLeft />
            </Button>
            <div className="relative">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                onClick={(e) => (e.target as HTMLInputElement).showPicker()}
                aria-label="Choisir une date"
                className="absolute inset-0 z-10 cursor-pointer opacity-0"
              />
              <Button
                variant="outline"
                size="icon-sm"
                tabIndex={-1}
                aria-hidden
                className="pointer-events-none"
              >
                <Calendar />
              </Button>
            </div>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => shiftDate(1)}
              aria-label="Jour suivant"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        ) : !report && !hasPartialData ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
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

            <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
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
                <div className="relative rounded-xl border border-border bg-card p-4 sm:p-6">
                  <button
                    type="button"
                    onClick={() => setDetailMode(true)}
                    title="Mode détaillé"
                    aria-label="Ouvrir le mode détaillé"
                    className="absolute top-3 left-3 flex size-6 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    <HelpCircle className="size-3.5" />
                  </button>
                  <KPITable
                    realiseJour={rj}
                    realiseMTD={rmtd}
                    projeteMois={pm}
                    budget={budget}
                    ecart={ecart}
                  />
                </div>

                <AlertBanner alerts={report.alerts || []} />

                {/* Actions email — VISIBLES uniquement pour l'admin. Les
                    données du rapport courant (rj/rmtd/pm/budget/ecart, tous
                    non-nuls dans cette branche) sont passées telles quelles à
                    captureTableImage/sendReport, qui bâtissent l'îlot HEX
                    autonome de email.ts (jamais le DOM shadcn). */}
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      title="Copier le tableau en image"
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
                    <Button
                      variant="outline"
                      size="icon-sm"
                      title="Gérer les destinataires"
                      aria-label="Gérer les destinataires"
                      onClick={() => setShowRecipients(true)}
                    >
                      <Settings />
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        ) : null}
      </div>

      {isAdmin && (
        <RecipientsModal
          open={showRecipients}
          onClose={() => setShowRecipients(false)}
        />
      )}
    </PageContainer>
  )
}
