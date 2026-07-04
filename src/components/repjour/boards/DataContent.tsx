import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

import {
  fetchUnifiedDays,
  updateReport,
  updateForecast,
  deleteDayData,
  deleteMonthData,
  type UnifiedDayRow,
} from '#/lib/repjour/services/data.ts'
import { fmt } from '#/lib/repjour/format.ts'
import { MONTHS_LABELS } from '#/lib/repjour/constants.ts'
import type { DailyReport } from '#/lib/repjour/types.ts'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Button } from '#/components/ui/button.tsx'

/*
 * Onglet « Données » de la gestion — porté de la source DataPage (DataContent).
 *
 * Édition jour par jour du mois : le tableau liste tous les jours (rapport
 * réalisé + prévision), et un clic ouvre une modale d'édition (shadcn Dialog)
 * qui met à jour `daily_reports` / `forecast_days`. Les suppressions
 * (deleteDayData pour un jour, deleteMonthData pour le mois entier) et l'édition
 * sont gardées par la prop `readOnly` — seul l'admin les voit, les autres rôles
 * consultent en lecture seule (cf. GestionBoard : readOnly = role !== 'admin').
 *
 * Restylé du thème CLAIR source vers le thème DARK du Back Office (tokens shadcn) :
 *   bg-white → bg-card, text-text → text-foreground, text-secondary →
 *   text-muted-foreground, primary (Réalisé) → text-primary, accent (Forecast) →
 *   text-cyan-400 (~--chart-2), success → emerald, error → destructive
 *   (cf. mapping en tête de styles/repjour.css).
 */

type ForecastUpdates = {
  occ: number
  rev_ht: number
  rev_ttc: number
  adr_ttc: number
  occ_percent: number
}

// ── Modale d'édition d'un jour ──
function DayModal({
  row,
  onClose,
  onSave,
  onDelete,
}: {
  row: UnifiedDayRow
  onClose: () => void
  onSave: (
    reportUpdates: Partial<DailyReport> | null,
    forecastUpdates: ForecastUpdates | null,
  ) => void
  onDelete: () => void
}) {
  const r = row.report
  const f = row.forecast

  const [reportForm, setReportForm] = useState({
    rj_nuitees: r?.rj_nuitees ?? 0,
    rj_to: r?.rj_to ?? 0,
    rj_pm: r?.rj_pm ?? 0,
    rj_revpar: r?.rj_revpar ?? 0,
    rj_room_revenue: r?.rj_room_revenue ?? 0,
    rmtd_nuitees: r?.rmtd_nuitees ?? 0,
    rmtd_to: r?.rmtd_to ?? 0,
    rmtd_pm: r?.rmtd_pm ?? 0,
    rmtd_revpar: r?.rmtd_revpar ?? 0,
    rmtd_room_revenue: r?.rmtd_room_revenue ?? 0,
    pm_nuitees: r?.pm_nuitees ?? 0,
    pm_to: r?.pm_to ?? 0,
    pm_pm: r?.pm_pm ?? 0,
    pm_revpar: r?.pm_revpar ?? 0,
    pm_room_revenue: r?.pm_room_revenue ?? 0,
  })

  const [forecastForm, setForecastForm] = useState<ForecastUpdates>({
    occ: f?.occ ?? 0,
    rev_ht: f?.rev_ht ?? 0,
    rev_ttc: f?.rev_ttc ?? 0,
    adr_ttc: f?.adr_ttc ?? 0,
    occ_percent: f?.occ_percent ?? 0,
  })

  const reportSections = [
    {
      label: 'Réalisé Jour',
      fields: [
        { key: 'rj_nuitees', label: 'Nuitées' },
        { key: 'rj_to', label: 'TO %', step: '0.01' },
        { key: 'rj_pm', label: 'Prix moyen', step: '0.01' },
        { key: 'rj_revpar', label: 'RevPAR', step: '0.01' },
        { key: 'rj_room_revenue', label: 'CA', step: '0.01' },
      ],
    },
    {
      label: 'Réalisé Cumul Mois',
      fields: [
        { key: 'rmtd_nuitees', label: 'Nuitées' },
        { key: 'rmtd_to', label: 'TO %', step: '0.01' },
        { key: 'rmtd_pm', label: 'Prix moyen', step: '0.01' },
        { key: 'rmtd_revpar', label: 'RevPAR', step: '0.01' },
        { key: 'rmtd_room_revenue', label: 'CA', step: '0.01' },
      ],
    },
    {
      label: 'Projeté Mois',
      fields: [
        { key: 'pm_nuitees', label: 'Nuitées' },
        { key: 'pm_to', label: 'TO %', step: '0.01' },
        { key: 'pm_pm', label: 'Prix moyen', step: '0.01' },
        { key: 'pm_revpar', label: 'RevPAR', step: '0.01' },
        { key: 'pm_room_revenue', label: 'CA', step: '0.01' },
      ],
    },
  ]

  const forecastFields = [
    { key: 'occ', label: 'Nuitées' },
    { key: 'rev_ht', label: 'Rev HT', step: '0.01' },
    { key: 'rev_ttc', label: 'Rev TTC', step: '0.01' },
    { key: 'adr_ttc', label: 'ADR TTC', step: '0.01' },
    { key: 'occ_percent', label: 'Occ %', step: '0.01' },
  ]

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent className="max-h-[90vh] gap-5 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Modifier — {fmt.dateFr(row.date)}</DialogTitle>
        </DialogHeader>

        {/* RAPPORT */}
        <div className="space-y-3">
          <h3 className="border-b border-primary/20 pb-1 text-sm font-semibold text-primary">
            Rapport (Comparison By Date)
          </h3>
          {reportSections.map((s) => (
            <div key={s.label}>
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                {s.label}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {s.fields.map(({ key, label, step }) => (
                  <div key={key}>
                    <label className="mb-0.5 block text-xs text-muted-foreground">
                      {label}
                    </label>
                    <Input
                      type="number"
                      step={step || '1'}
                      value={(reportForm as Record<string, number>)[key] || ''}
                      placeholder="0"
                      onChange={(e) =>
                        setReportForm({
                          ...reportForm,
                          [key]: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="h-8 text-right text-sm tabular-nums"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* FORECAST */}
        <div className="space-y-3">
          <h3 className="border-b border-cyan-400/20 pb-1 text-sm font-semibold text-cyan-400">
            Prévision (Forecast By Date Range)
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {forecastFields.map(({ key, label, step }) => (
              <div key={key}>
                <label className="mb-0.5 block text-xs text-muted-foreground">
                  {label}
                </label>
                <Input
                  type="number"
                  step={step || '1'}
                  value={(forecastForm as Record<string, number>)[key] || ''}
                  placeholder="0"
                  onChange={(e) =>
                    setForecastForm({
                      ...forecastForm,
                      [key]: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="h-8 text-right text-sm tabular-nums"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <DialogFooter className="items-center justify-between border-t border-border pt-4 sm:justify-between">
          <button
            onClick={onDelete}
            className="text-sm font-medium text-destructive/70 transition-colors hover:text-destructive"
          >
            Supprimer cette date
          </button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button onClick={() => onSave(reportForm, forecastForm)}>
              Enregistrer
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Contenu de l'onglet Données ──
export function DataContent({ readOnly = false }: { readOnly?: boolean }) {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [allRows, setAllRows] = useState<UnifiedDayRow[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [selectedRow, setSelectedRow] = useState<UnifiedDayRow | null>(null)

  async function load() {
    setLoading(true)
    try {
      const rows = await fetchUnifiedDays({ year, month })
      setAllRows(rows)
    } catch (err) {
      setMessage(
        'Erreur : ' + (err instanceof Error ? err.message : 'inconnue'),
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // Rechargement à chaque changement de mois/année sélectionné.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month])

  const daysWithData = allRows.filter((r) => r.report || r.forecast).length

  const handleSave = async (
    reportUpdates: Partial<DailyReport> | null,
    forecastUpdates: ForecastUpdates | null,
  ) => {
    try {
      if (reportUpdates && selectedRow?.report) {
        await updateReport(selectedRow.report.id, reportUpdates)
      }
      if (forecastUpdates && selectedRow?.forecast) {
        await updateForecast(selectedRow.forecast.id, forecastUpdates)
      }
      setSelectedRow(null)
      setMessage('Données mises à jour')
      load()
    } catch (err) {
      setMessage(
        'Erreur : ' + (err instanceof Error ? err.message : 'inconnue'),
      )
    }
  }

  const handleDeleteDay = async () => {
    if (!selectedRow) return
    if (!confirm(`Supprimer toutes les données du ${fmt.dateFr(selectedRow.date)} ?`))
      return
    try {
      await deleteDayData(selectedRow.date)
      const label = fmt.dateFr(selectedRow.date)
      setSelectedRow(null)
      setMessage(`Données du ${label} supprimées`)
      load()
    } catch (err) {
      setMessage(
        'Erreur : ' + (err instanceof Error ? err.message : 'inconnue'),
      )
    }
  }

  const cell = (
    v: number | undefined | null,
    fn: (n: number) => string,
  ) =>
    v != null ? (
      <span className="tabular-nums">{fn(v)}</span>
    ) : (
      <span className="text-muted-foreground/40">—</span>
    )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-foreground">Données importées</h2>
        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            aria-label="Choisir un mois"
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          >
            {MONTHS_LABELS.map((m, i) => (
              <option key={i + 1} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="Choisir une année"
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          >
            {[2025, 2026, 2027, 2028].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            message.includes('Erreur')
              ? 'bg-destructive/10 text-destructive'
              : 'bg-emerald-500/10 text-emerald-500'
          }`}
        >
          {message}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className={`border-b border-border ${readOnly ? 'hidden sm:table-row' : ''}`}
                >
                  <th colSpan={2} className="bg-muted/50 px-3 py-2"></th>
                  <th
                    colSpan={4}
                    className="border-l border-r border-border bg-primary/5 px-2 py-2 text-center text-xs font-semibold text-primary"
                  >
                    Rapport (Réalisé)
                  </th>
                  <th
                    colSpan={3}
                    className="border-r border-border bg-cyan-400/5 px-2 py-2 text-center text-xs font-semibold text-cyan-400"
                  >
                    Prévision (Forecast)
                  </th>
                </tr>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">
                    Date
                  </th>
                  <th
                    className={`w-10 px-2 py-1.5 text-left text-xs font-medium text-muted-foreground ${readOnly ? 'hidden sm:table-cell' : ''}`}
                  >
                    Jour
                  </th>
                  <th className="border-l border-border px-2 py-1.5 text-right text-xs font-medium text-muted-foreground">
                    <span className={readOnly ? 'hidden sm:inline' : ''}>
                      Nuitées
                    </span>
                    {readOnly && <span className="sm:hidden">Nuit.</span>}
                  </th>
                  <th className="px-2 py-1.5 text-right text-xs font-medium text-muted-foreground">
                    TO
                  </th>
                  <th
                    className={`px-2 py-1.5 text-right text-xs font-medium text-muted-foreground ${readOnly ? 'hidden sm:table-cell' : ''}`}
                  >
                    PM
                  </th>
                  <th className="border-r border-border px-2 py-1.5 text-right text-xs font-medium text-muted-foreground">
                    CA
                  </th>
                  <th className="px-2 py-1.5 text-right text-xs font-medium text-muted-foreground">
                    <span className={readOnly ? 'hidden sm:inline' : ''}>
                      Nuitées
                    </span>
                    {readOnly && <span className="sm:hidden">Nuit.</span>}
                  </th>
                  <th className="px-2 py-1.5 text-right text-xs font-medium text-muted-foreground">
                    <span className={readOnly ? 'hidden sm:inline' : ''}>
                      Rev TTC
                    </span>
                    {readOnly && <span className="sm:hidden">Rev</span>}
                  </th>
                  <th
                    className={`border-r border-border px-2 py-1.5 text-right text-xs font-medium text-muted-foreground ${readOnly ? 'hidden sm:table-cell' : ''}`}
                  >
                    ADR
                  </th>
                </tr>
              </thead>
              <tbody>
                {allRows.map((row) => {
                  const r = row.report
                  const f = row.forecast
                  const hasData = !!r || !!f
                  return (
                    <tr
                      key={row.date}
                      onClick={() => !readOnly && hasData && setSelectedRow(row)}
                      className={`border-b border-border/50 transition-colors ${
                        hasData && !readOnly
                          ? 'cursor-pointer hover:bg-accent/40'
                          : hasData
                            ? ''
                            : 'bg-muted/20'
                      }`}
                    >
                      <td
                        className={`px-3 py-1.5 text-xs ${hasData ? 'font-medium text-foreground' : 'text-muted-foreground/60'}`}
                      >
                        {fmt.dateFr(row.date)}
                      </td>
                      <td
                        className={`px-2 py-1.5 text-xs capitalize ${hasData ? 'text-muted-foreground' : 'text-muted-foreground/60'} ${readOnly ? 'hidden sm:table-cell' : ''}`}
                      >
                        {fmt.dayName(row.date)}
                      </td>
                      <td className="border-l border-border/50 px-2 py-1.5 text-right text-xs">
                        {cell(r?.rj_nuitees, fmt.nuitees)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-xs">
                        {cell(r?.rj_to, fmt.pct)}
                      </td>
                      <td
                        className={`px-2 py-1.5 text-right text-xs ${readOnly ? 'hidden sm:table-cell' : ''}`}
                      >
                        {cell(r?.rj_pm, fmt.eur)}
                      </td>
                      <td className="border-r border-border/50 px-2 py-1.5 text-right text-xs">
                        {cell(r?.rj_room_revenue, fmt.eurInt)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-xs">
                        {cell(f?.occ, fmt.nuitees)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-xs">
                        {cell(f?.rev_ttc, fmt.eurInt)}
                      </td>
                      <td
                        className={`border-r border-border/50 px-2 py-1.5 text-right text-xs ${readOnly ? 'hidden sm:table-cell' : ''}`}
                      >
                        {cell(f?.adr_ttc, fmt.eur)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!readOnly && daysWithData > 0 && (
        <button
          onClick={async () => {
            const monthName = MONTHS_LABELS[month - 1]
            if (
              !confirm(
                `Supprimer toutes les données de ${monthName} ${year} (rapports + forecasts) ? Cette action est irréversible.`,
              )
            )
              return
            try {
              await deleteMonthData(year, month)
              setMessage(`Données de ${monthName} ${year} supprimées`)
              load()
            } catch (err) {
              setMessage(
                'Erreur : ' + (err instanceof Error ? err.message : 'inconnue'),
              )
            }
          }}
          className="text-sm font-medium text-destructive/70 transition-colors hover:text-destructive"
        >
          Tout supprimer — {MONTHS_LABELS[month - 1]} {year}
        </button>
      )}

      {selectedRow && (
        <DayModal
          key={selectedRow.date}
          row={selectedRow}
          onClose={() => setSelectedRow(null)}
          onSave={handleSave}
          onDelete={handleDeleteDay}
        />
      )}
    </div>
  )
}
