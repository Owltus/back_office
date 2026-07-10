import {
  useCallback,
  useRef,
  useState,
  type DragEvent,
  type RefObject,
} from 'react'
import { Check, FileUp, X } from 'lucide-react'

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
import { businessNow } from '#/lib/businessDay.ts'
import { MONTHS } from '#/lib/repjour/constants.ts'
import type { Alert, ReportDate } from '#/lib/repjour/types.ts'

/*
 * Section d'import CSV — INTÉGRÉE au dashboard (carte compacte en bas de la page
 * Rapport), il n'y a plus de page Import dédiée. Zones drag/drop pour les deux
 * fichiers PMS (Comparison + Forecast), détection du type, extraction de la date
 * (ajustement J-1), pré-validation du forecast, bandeau d'alertes et
 * confirmation avant l'écriture.
 *
 * Écritures idempotentes (upsert `onConflict` sur `date`) + archivage dans le
 * bucket `csv-archive`. Après un import réussi, `onImported` recharge le rapport
 * affiché. Réservée aux rôles super_utilisateur / admin.
 */

interface FileSlot {
  file: File | null
  name: string
  status: 'empty' | 'ready' | 'error'
  errorMsg?: string
}

const EMPTY_SLOT: FileSlot = { file: null, name: '', status: 'empty' }

/** Une zone de dépôt (Comparison ou Forecast), compacte. */
function FileDropSlot({
  title,
  slot,
  isDragOver,
  inputRef,
  spacious = false,
  onOpen,
  onClear,
  onFile,
  onDrop,
  onDragOver,
  onDragLeave,
}: {
  title: string
  slot: FileSlot
  isDragOver: boolean
  inputRef: RefObject<HTMLInputElement | null>
  /** Variante agrandie : zone plus haute quand la carte occupe la page seule. */
  spacious?: boolean
  onOpen: () => void
  onClear: () => void
  onFile: (file: File) => void
  onDrop: (e: DragEvent) => void
  onDragOver: (e: DragEvent) => void
  onDragLeave: (e: DragEvent) => void
}) {
  const border = isDragOver
    ? 'border-primary bg-primary/5'
    : slot.status === 'ready'
      ? 'border-emerald-500/60 bg-emerald-500/5'
      : slot.status === 'error'
        ? 'border-destructive/60 bg-destructive/5'
        : 'border-dashed border-border hover:border-primary/50'

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={`rounded-lg border-2 transition-colors ${spacious ? 'p-5' : 'p-3'} ${border}`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="truncate text-xs font-semibold text-foreground">
          {title}
        </h3>
        {slot.status === 'ready' && (
          <Check className="size-4 shrink-0 text-emerald-500" />
        )}
        {slot.status === 'error' && (
          <X className="size-4 shrink-0 text-destructive" />
        )}
      </div>

      {slot.status === 'ready' ? (
        <div className="flex items-center gap-2">
          <span className="flex-1 truncate text-sm text-foreground">
            {slot.name}
          </span>
          <button
            onClick={onClear}
            className="shrink-0 text-xs font-medium text-muted-foreground hover:text-destructive"
          >
            Retirer
          </button>
        </div>
      ) : slot.status === 'error' ? (
        <div className="space-y-1">
          <p className="truncate text-sm text-foreground">{slot.name}</p>
          <p className="text-xs text-destructive">{slot.errorMsg}</p>
          <button
            onClick={onClear}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Effacer
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className={`flex w-full items-center justify-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary ${spacious ? 'py-8' : 'py-1.5'}`}
        >
          <FileUp className="size-4 shrink-0" />
          Déposer ou cliquer
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}

export function ImportSection({
  onImported,
  spacious = false,
}: {
  onImported: () => void
  /**
   * Variante agrandie, réservée à l'état « carte seule » (aucune donnée pour le
   * jour → la carte occupe toute la page). NE PAS activer quand le tableau est
   * présent : la carte accompagnant le tableau reste compacte (spacious=false).
   */
  spacious?: boolean
}) {
  const { user, role } = useAuth()
  const isAdmin = role === 'admin'
  const [comparison, setComparison] = useState<FileSlot>(EMPTY_SLOT)
  const [forecast, setForecast] = useState<FileSlot>(EMPTY_SLOT)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
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
    setDone('')
  }, [])

  const handleFile = useCallback(
    async (file: File, expectedType: 'comparison' | 'forecast') => {
      clearValidation()
      const dateMatch = file.name.match(/(\d{4})(\d{2})(\d{2})/)
      if (dateMatch) {
        // La journée hôtelière bascule à 02h, pas à minuit (`businessNow`) : le
        // fichier d'une nuit n'est tiré qu'à partir de 02h. On n'accepte donc que
        // le fichier du JOUR HÔTELIER courant. Voir #/lib/businessDay.ts.
        //
        // Exception ADMIN : il conserve l'ancien comportement (horloge civile) et
        // peut donc importer dès minuit, sans attendre 02h.
        const ref = isAdmin ? new Date() : businessNow()
        const fileYear = parseInt(dateMatch[1], 10)
        const fileMonth = parseInt(dateMatch[2], 10)
        const fileDay = parseInt(dateMatch[3], 10)
        const isRefToday =
          fileYear === ref.getFullYear() &&
          fileMonth === ref.getMonth() + 1 &&
          fileDay === ref.getDate()
        if (!isRefToday) {
          // Distinguer « trop tôt » (fichier daté d'aujourd'hui CIVIL déposé
          // avant 02h : le rapport de la nuit n'existe pas encore) du simple
          // mauvais jour, pour ne pas dire « extrayez le fichier du jour » alors
          // qu'il vient bien d'être extrait.
          const civil = new Date()
          const isCivilToday =
            fileYear === civil.getFullYear() &&
            fileMonth === civil.getMonth() + 1 &&
            fileDay === civil.getDate()
          const slot: FileSlot = {
            file: null,
            name: file.name,
            status: 'error',
            errorMsg: isCivilToday
              ? 'Le rapport de cette nuit n’est disponible qu’à partir de 02h00 (clôture de la journée). Réessayez après cette heure.'
              : `Ce fichier date du ${fileDay}/${String(fileMonth).padStart(2, '0')}/${fileYear}. Veuillez extraire les fichiers du jour depuis votre PMS avant de les importer.`,
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
    [clearValidation, isAdmin],
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
      // On reste sur le dashboard : réinitialisation des zones et rechargement du
      // rapport affiché (au lieu de naviguer vers une page Import).
      setComparison(EMPTY_SLOT)
      setForecast(EMPTY_SLOT)
      setDetectedDate(null)
      setDone('Import réussi. Le rapport a été mis à jour.')
      onImported()
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

  const bothReady = comparison.status === 'ready' && forecast.status === 'ready'
  const canImport = isAdmin ? comparison.status === 'ready' : bothReady

  return (
    <div
      className={`rounded-xl border border-border bg-card ${spacious ? 'space-y-5 p-6 sm:p-8' : 'space-y-3 p-4'}`}
    >
      <div className="flex items-center gap-2">
        <FileUp
          className={`shrink-0 text-primary ${spacious ? 'size-5' : 'size-4'}`}
        />
        <h2
          className={`font-semibold text-foreground ${spacious ? 'text-base' : 'text-sm'}`}
        >
          Importer un rapport
        </h2>
        <span className="hidden truncate text-xs text-muted-foreground sm:inline">
          — fichiers CSV du PMS (Comparison + Forecast)
        </span>
      </div>

      {done && (
        <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-500">
          {done}
        </div>
      )}

      <div
        className={`grid grid-cols-1 sm:grid-cols-2 ${spacious ? 'gap-4' : 'gap-3'}`}
      >
        <FileDropSlot
          title="Comparison By Date"
          slot={comparison}
          isDragOver={dragOverSlot === 'comparison'}
          inputRef={compRef}
          spacious={spacious}
          onOpen={() => compRef.current?.click()}
          onClear={() => {
            setComparison(EMPTY_SLOT)
            setDetectedDate(null)
          }}
          onFile={(f) => handleFile(f, 'comparison')}
          onDrop={(e) => onDrop(e, 'comparison')}
          onDragOver={(e) => onDragOver(e, 'comparison')}
          onDragLeave={onDragLeave}
        />
        <FileDropSlot
          title="Forecast By Date Range"
          slot={forecast}
          isDragOver={dragOverSlot === 'forecast'}
          inputRef={foreRef}
          spacious={spacious}
          onOpen={() => foreRef.current?.click()}
          onClear={() => setForecast(EMPTY_SLOT)}
          onFile={(f) => handleFile(f, 'forecast')}
          onDrop={(e) => onDrop(e, 'forecast')}
          onDragOver={(e) => onDragOver(e, 'forecast')}
          onDragLeave={onDragLeave}
        />
      </div>

      {detectedDate && (
        <p className="text-xs text-muted-foreground">
          Date du rapport : {detectedDate.dayOfMonth}{' '}
          {MONTHS[detectedDate.month]} {detectedDate.year} — jour{' '}
          {detectedDate.dayOfMonth}/{detectedDate.daysInMonth}
        </p>
      )}

      {validationErrors.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-destructive">
            Import refusé :
          </p>
          <AlertBanner alerts={validationErrors} />
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <Button
        onClick={handleImport}
        disabled={!canImport || importing}
        className="w-full"
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
                  <h3 className="text-lg font-bold text-destructive">
                    Anomalie dans le fichier
                  </h3>
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
  )
}
