import { useState, useRef, useCallback, type DragEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'

import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { Button } from '#/components/ui/button.tsx'
import { AlertBanner } from '#/components/repjour/AlertBanner.tsx'
import { useAuth } from '#/components/auth/AuthContext.tsx'
import {
  processImport,
  processComparisonOnly,
  preValidateForecast,
} from '#/lib/repjour/import/orchestrator.ts'
import { detectFileType } from '#/lib/repjour/parse/detect.ts'
import { extractReportDate } from '#/lib/repjour/parse/date.ts'
import { MONTHS } from '#/lib/repjour/constants.ts'
import type { Alert, ReportDate } from '#/lib/repjour/types.ts'

/*
 * Board d'import CSV — porté de la source ImportPage.
 *
 * Zone drag/drop pour les deux fichiers PMS (Comparison + Forecast), détection
 * du type de fichier, extraction de la date (avec ajustement J-1), pré-validation
 * du forecast, bandeau d'alertes et confirmation avant l'écriture. C'est la
 * PREMIÈRE brique qui écrit dans Supabase : les upserts sont idempotents
 * (`onConflict` sur `date`) et l'archivage passe par le bucket `csv-archive`.
 *
 * Restylé du thème CLAIR source vers le thème DARK du Back Office (tokens shadcn) :
 *   bg-white → bg-card, text-text → text-foreground, text-secondary →
 *   text-muted-foreground, accent → primary, success → emerald, error →
 *   destructive, gray-* → border/muted (cf. mapping en tête de styles/repjour.css).
 */

interface FileSlot {
  file: File | null
  name: string
  status: 'empty' | 'ready' | 'error'
  errorMsg?: string
}

const EMPTY_SLOT: FileSlot = { file: null, name: '', status: 'empty' }

export function ImportBoard() {
  const { user, role } = useAuth()
  const navigate = useNavigate()
  const isAdmin = role === 'admin'
  const [comparison, setComparison] = useState<FileSlot>(EMPTY_SLOT)
  const [forecast, setForecast] = useState<FileSlot>(EMPTY_SLOT)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [dragOverSlot, setDragOverSlot] = useState<
    'comparison' | 'forecast' | null
  >(null)
  const [detectedDate, setDetectedDate] = useState<ReportDate | null>(null)
  const [validationErrors, setValidationErrors] = useState<Alert[]>([])
  const [validationWarnings, setValidationWarnings] = useState<Alert[]>([])
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  const compRef = useRef<HTMLInputElement>(null)
  const foreRef = useRef<HTMLInputElement>(null)

  const clearValidation = useCallback(() => {
    setValidationErrors([])
    setValidationWarnings([])
    setShowConfirmModal(false)
    setError('')
  }, [])

  const handleFile = useCallback(
    async (file: File, expectedType: 'comparison' | 'forecast') => {
      clearValidation()
      const dateMatch = file.name.match(/(\d{4})(\d{2})(\d{2})/)
      if (dateMatch) {
        const now = new Date()
        const fileYear = parseInt(dateMatch[1], 10)
        const fileMonth = parseInt(dateMatch[2], 10)
        const fileDay = parseInt(dateMatch[3], 10)
        if (
          fileYear !== now.getFullYear() ||
          fileMonth !== now.getMonth() + 1 ||
          fileDay !== now.getDate()
        ) {
          const slot: FileSlot = {
            file: null,
            name: file.name,
            status: 'error',
            errorMsg: `Ce fichier date du ${fileDay}/${String(fileMonth).padStart(2, '0')}/${fileYear}. Veuillez extraire les fichiers du jour depuis votre PMS avant de les importer.`,
          }
          if (expectedType === 'comparison') setComparison(slot)
          else setForecast(slot)
          return
        }
      }

      const text = await file.text()
      const detected = detectFileType(file.name, text)

      if (detected === 'comparison') {
        setComparison({ file, name: file.name, status: 'ready' })
        setDetectedDate(extractReportDate(file.name))
      } else if (detected === 'forecast') {
        setForecast({ file, name: file.name, status: 'ready' })
      } else {
        const slot: FileSlot = {
          file: null,
          name: file.name,
          status: 'error',
          errorMsg: 'Type de fichier non reconnu',
        }
        if (expectedType === 'comparison') setComparison(slot)
        else setForecast(slot)
      }
    },
    [clearValidation],
  )

  const onDrop = useCallback(
    (e: DragEvent, slot: 'comparison' | 'forecast') => {
      e.preventDefault()
      e.stopPropagation()
      setDragOverSlot(null)
      const csvFiles = Array.from(e.dataTransfer.files).filter(
        (f) => f.name.endsWith('.csv') || f.type === 'text/csv',
      )
      for (const file of csvFiles) {
        handleFile(file, slot)
      }
    },
    [handleFile],
  )

  const onDragOver = useCallback(
    (e: DragEvent, slot: 'comparison' | 'forecast') => {
      e.preventDefault()
      e.stopPropagation()
      setDragOverSlot(slot)
    },
    [],
  )

  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverSlot(null)
  }, [])

  const executeImport = async () => {
    setImporting(true)
    setShowConfirmModal(false)
    setValidationWarnings([])
    try {
      if (forecast.file) {
        await processImport(comparison.file!, forecast.file, user!.id)
      } else {
        await processComparisonOnly(comparison.file!, user!.id)
      }
      navigate({ to: '/repjour' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue')
    } finally {
      setImporting(false)
    }
  }

  const handleImport = async () => {
    if (!comparison.file) return
    clearValidation()
    setImporting(true)

    try {
      // Phase 1 : pré-validation du forecast (si présent)
      if (forecast.file) {
        const { errors, warnings } = await preValidateForecast(forecast.file)

        if (errors.length > 0) {
          setValidationErrors(errors)
          setImporting(false)
          return
        }

        if (warnings.length > 0) {
          setValidationWarnings(warnings)
          setShowConfirmModal(true)
          setImporting(false)
          return
        }
      }

      // Phase 2 : import direct (clean ou comparison-only)
      await executeImport()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue')
      setImporting(false)
    }
  }

  const bothReady =
    comparison.status === 'ready' && forecast.status === 'ready'
  const canImport = isAdmin ? comparison.status === 'ready' : bothReady

  const slotClasses = (
    slot: 'comparison' | 'forecast',
    status: FileSlot['status'],
  ) => {
    const isDragOver = dragOverSlot === slot
    if (isDragOver) return 'border-primary bg-primary/5 scale-[1.02]'
    if (status === 'ready') return 'border-emerald-500 bg-emerald-500/5'
    if (status === 'error') return 'border-destructive bg-destructive/5'
    return 'border-border hover:border-muted-foreground/40'
  }

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-foreground">
            Import des données
          </h1>
          <p className="text-sm text-muted-foreground">
            Sélectionnez ou déposez vos fichiers CSV un par un.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Slot Comparison */}
          <div
            onDrop={(e) => onDrop(e, 'comparison')}
            onDragOver={(e) => onDragOver(e, 'comparison')}
            onDragLeave={onDragLeave}
            className={`rounded-xl border-2 bg-card p-5 shadow-sm transition-all duration-200 ${slotClasses('comparison', comparison.status)}`}
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">
                Comparison By Date
              </h2>
              {comparison.status === 'ready' && (
                <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">
                  OK
                </span>
              )}
              {comparison.status === 'error' && (
                <span className="rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-white">
                  ERR
                </span>
              )}
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              Données réalisées (nuitées, revenus, MTD)
            </p>

            {comparison.name && comparison.status === 'ready' ? (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2.5">
                <span className="text-base text-emerald-500">&#10003;</span>
                <span className="flex-1 truncate text-sm text-foreground">
                  {comparison.name}
                </span>
                <button
                  onClick={() => {
                    setComparison(EMPTY_SLOT)
                    setDetectedDate(null)
                  }}
                  className="shrink-0 text-xs font-medium text-muted-foreground hover:text-destructive"
                >
                  Retirer
                </button>
              </div>
            ) : comparison.name && comparison.status === 'error' ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2.5">
                  <span className="text-base text-destructive">&#10007;</span>
                  <span className="flex-1 truncate text-sm text-foreground">
                    {comparison.name}
                  </span>
                </div>
                <p className="text-xs text-destructive">
                  {comparison.errorMsg}
                </p>
                <button
                  onClick={() => {
                    setComparison(EMPTY_SLOT)
                    setDetectedDate(null)
                  }}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Effacer
                </button>
              </div>
            ) : (
              <div
                onClick={() => compRef.current?.click()}
                className="group flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border py-6 transition-colors hover:border-primary hover:bg-primary/5"
              >
                <span className="mb-1 text-2xl text-muted-foreground group-hover:text-primary">
                  +
                </span>
                <span className="text-sm text-muted-foreground group-hover:text-primary">
                  Déposer ou cliquer
                </span>
              </div>
            )}

            <input
              ref={compRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f, 'comparison')
                e.target.value = ''
              }}
            />
          </div>

          {/* Slot Forecast */}
          <div
            onDrop={(e) => onDrop(e, 'forecast')}
            onDragOver={(e) => onDragOver(e, 'forecast')}
            onDragLeave={onDragLeave}
            className={`rounded-xl border-2 bg-card p-5 shadow-sm transition-all duration-200 ${slotClasses('forecast', forecast.status)}`}
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">
                Forecast By Date Range
              </h2>
              {forecast.status === 'ready' && (
                <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">
                  OK
                </span>
              )}
              {forecast.status === 'error' && (
                <span className="rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-white">
                  ERR
                </span>
              )}
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              Prévisions jour par jour du mois
            </p>

            {forecast.name && forecast.status === 'ready' ? (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2.5">
                <span className="text-base text-emerald-500">&#10003;</span>
                <span className="flex-1 truncate text-sm text-foreground">
                  {forecast.name}
                </span>
                <button
                  onClick={() => setForecast(EMPTY_SLOT)}
                  className="shrink-0 text-xs font-medium text-muted-foreground hover:text-destructive"
                >
                  Retirer
                </button>
              </div>
            ) : forecast.name && forecast.status === 'error' ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2.5">
                  <span className="text-base text-destructive">&#10007;</span>
                  <span className="flex-1 truncate text-sm text-foreground">
                    {forecast.name}
                  </span>
                </div>
                <p className="text-xs text-destructive">{forecast.errorMsg}</p>
                <button
                  onClick={() => setForecast(EMPTY_SLOT)}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Effacer
                </button>
              </div>
            ) : (
              <div
                onClick={() => foreRef.current?.click()}
                className="group flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border py-6 transition-colors hover:border-primary hover:bg-primary/5"
              >
                <span className="mb-1 text-2xl text-muted-foreground group-hover:text-primary">
                  +
                </span>
                <span className="text-sm text-muted-foreground group-hover:text-primary">
                  Déposer ou cliquer
                </span>
              </div>
            )}

            <input
              ref={foreRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f, 'forecast')
                e.target.value = ''
              }}
            />
          </div>
        </div>

        {detectedDate && (
          <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
            <span className="text-lg text-primary">&#128197;</span>
            <div>
              <p className="text-sm font-medium text-foreground">
                Date du rapport : {detectedDate.dayOfMonth}{' '}
                {MONTHS[detectedDate.month]} {detectedDate.year}
              </p>
              <p className="text-xs text-muted-foreground">
                Jour {detectedDate.dayOfMonth}/{detectedDate.daysInMonth} du
                mois — date extraite du nom du fichier
              </p>
            </div>
          </div>
        )}

        {validationErrors.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-destructive">
              Import refusé :
            </p>
            <AlertBanner alerts={validationErrors} />
            <p className="text-xs text-muted-foreground">
              Corrigez le fichier dans le PMS et ré-exportez.
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Button
          onClick={handleImport}
          disabled={!canImport || importing}
          className="h-auto w-full py-3.5 text-base"
        >
          {importing
            ? 'Import en cours...'
            : bothReady
              ? 'Importer et calculer'
              : isAdmin && canImport
                ? 'Importer le Comparison seul'
                : 'Sélectionnez les 2 fichiers'}
        </Button>

        {showConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={() => setShowConfirmModal(false)}
            />
            <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border-2 border-destructive/30 bg-card shadow-xl">
              <div className="border-b border-destructive/20 bg-destructive/10 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/20">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-destructive"
                    >
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-destructive">
                      Anomalie dans le fichier
                    </h2>
                    <p className="text-xs text-destructive/70">
                      Les données ne correspondent pas aux imports précédents
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-4 px-6 py-4">
                <AlertBanner alerts={validationWarnings} />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Si vous avez bien vérifié vos paramètres d'export et que le
                  fichier est correct, vous pouvez forcer l'import. Dans le cas
                  contraire, annulez et ré-exportez depuis le PMS.
                </p>
              </div>
              <div className="flex justify-end gap-3 border-t border-border bg-muted/40 px-6 py-4">
                <Button onClick={() => setShowConfirmModal(false)}>
                  Annuler et corriger
                </Button>
                <button
                  onClick={executeImport}
                  disabled={importing}
                  className="px-4 py-2.5 text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-destructive disabled:opacity-50"
                >
                  {importing ? 'Import...' : 'Importer quand même'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  )
}
