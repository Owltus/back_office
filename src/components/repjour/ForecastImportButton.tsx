import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Check, Upload } from 'lucide-react'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import {
  importForecastDays,
  preValidateForecast,
} from '#/lib/repjour/import/orchestrator.ts'
import type { Alert } from '#/lib/repjour/types.ts'

/**
 * Verdict de l'import (une seule modale, contenu selon l'issue) — même esprit que
 * la clôture caisse/rapprochement (CloseSheetDialog) : un retour CLAIR, jamais
 * aveugle. Vert = c'est bon ; ambre = à vérifier, tu choisis ; rouge = refusé,
 * données intactes.
 */
type Feedback =
  | { kind: 'errors'; alerts: Alert[] }
  | { kind: 'confirm'; alerts: Alert[]; file: File }
  | { kind: 'success'; summary: string }
  | null

/**
 * Bouton (ADMIN) d'import STANDALONE d'un Forecast dans la page analytique, à
 * placer à côté de l'impression. Dépôt d'un CSV « Forecast By Date Range » couvrant
 * une plage libre (plusieurs mois, l'année) → pré-validation → upsert de toutes les
 * lignes dans `forecast_days`. `onImported` rafraîchit la vue.
 *
 * Rendu NUL pour les non-admins (garde ergonomique ; la RLS reste la sécurité
 * réelle). Le fichier n'est jamais stocké — seulement parsé puis écrit ligne à ligne.
 */
export function ForecastImportButton({
  onImported,
}: {
  onImported: () => void
}) {
  const { can } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  if (!can('repjour', 'gestion')) return null

  function fail(err: unknown) {
    setFeedback({
      kind: 'errors',
      alerts: [
        {
          type: 'error',
          message:
            err instanceof Error
              ? err.message
              : "Une erreur inattendue s'est produite. Réessaie.",
        },
      ],
    })
  }

  async function runImport(file: File) {
    setBusy(true)
    try {
      const s = await importForecastDays(file)
      const monthLabel = s.months > 1 ? `${s.months} mois` : '1 mois'
      setFeedback({
        kind: 'success',
        summary: `${s.rows} prévisions enregistrées (${monthLabel}, ${s.years.join(', ')}).`,
      })
      onImported()
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  async function handleFile(file: File) {
    setBusy(true)
    try {
      // Pré-validation. Les erreurs bloquent (rien n'est écrit), les avertissements
      // (informatifs) laissent le choix : recommencer, ou forcer.
      const { errors, warnings } = await preValidateForecast(file)
      if (errors.length > 0) {
        setFeedback({ kind: 'errors', alerts: errors })
        return
      }
      if (warnings.length > 0) {
        setFeedback({ kind: 'confirm', alerts: warnings, file })
        return
      }
      await runImport(file)
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Réinitialise pour pouvoir re-sélectionner le même fichier ensuite.
    e.target.value = ''
    if (file) void handleFile(file)
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={onInputChange}
      />
      <Tip label="Importer des prévisions (plusieurs mois ou l'année)">
        <Button
          variant="outline"
          size="icon-sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          aria-label="Importer des prévisions"
        >
          <Upload />
        </Button>
      </Tip>

      <Dialog
        open={feedback !== null}
        onOpenChange={(open) => !open && setFeedback(null)}
      >
        <DialogContent className="sm:max-w-md">
          {feedback?.kind === 'success' && (
            <>
              <DialogHeader>
                <DialogTitle>Import des prévisions</DialogTitle>
                <DialogDescription>Voici le résultat.</DialogDescription>
              </DialogHeader>
              <div className="flex gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-500">
                <Check className="mt-0.5 size-4 shrink-0" />
                <div className="space-y-0.5">
                  <div className="font-medium">
                    C'est bon, tes données sont en place
                  </div>
                  <p className="text-emerald-500/80">{feedback.summary}</p>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => setFeedback(null)}>Fermer</Button>
              </DialogFooter>
            </>
          )}

          {feedback?.kind === 'confirm' && (
            <>
              <DialogHeader>
                <DialogTitle>À vérifier avant d'importer</DialogTitle>
                <DialogDescription>
                  Un contrôle a repéré quelque chose. À toi de voir.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
                <ul className="space-y-1">
                  {feedback.alerts.map((a, i) => (
                    <li key={i} className="text-amber-500/90">
                      {a.message}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-amber-500/70">
                  Forcer un mauvais fichier fausse tes calculs. En cas de doute,
                  recommence l'export.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setFeedback(null)}>
                  Je recommence
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    const { file } = feedback
                    setFeedback(null)
                    void runImport(file)
                  }}
                >
                  Forcer l'import
                </Button>
              </DialogFooter>
            </>
          )}

          {feedback?.kind === 'errors' && (
            <>
              <DialogHeader>
                <DialogTitle>Import refusé</DialogTitle>
                <DialogDescription>Rien n'a été écrit.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <ul className="space-y-1">
                  {feedback.alerts.map((a, i) => (
                    <li key={i}>{a.message}</li>
                  ))}
                </ul>
                <p className="text-xs text-destructive/80">
                  Tes données sont intactes. Corrige le fichier et recommence.
                </p>
              </div>
              <DialogFooter>
                <Button onClick={() => setFeedback(null)}>Fermer</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
