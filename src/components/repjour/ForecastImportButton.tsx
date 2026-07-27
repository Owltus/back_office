import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Upload } from 'lucide-react'

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

/** État du dialogue de retour (une seule modale, contenu selon l'issue). */
type Feedback =
  | { kind: 'errors'; messages: string[] }
  | { kind: 'confirm'; messages: string[]; file: File }
  | { kind: 'success'; summary: string; warnings: string[] }
  | null

/**
 * Bouton (ADMIN) d'import STANDALONE d'un Forecast dans la page analytique, à
 * placer à côté de l'impression. Dépôt d'un CSV « Forecast By Date Range » couvrant
 * une plage libre (plusieurs mois, l'année) → pré-validation PAR MOIS (TTC/HT,
 * budget) → upsert de TOUTES les lignes dans `forecast_days`. Rien d'autre n'est
 * touché ; `onImported` rafraîchit la vue.
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

  async function runImport(file: File, warnings: string[]) {
    setBusy(true)
    try {
      const s = await importForecastDays(file)
      const monthLabel = s.months > 1 ? `${s.months} mois` : '1 mois'
      setFeedback({
        kind: 'success',
        summary: `${s.rows} jour(s) importé(s) sur ${monthLabel} (${s.years.join(', ')}).`,
        warnings,
      })
      onImported()
    } catch (err) {
      setFeedback({
        kind: 'errors',
        messages: [err instanceof Error ? err.message : 'Erreur inattendue'],
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleFile(file: File) {
    setBusy(true)
    try {
      // Pré-validation multi-mois (mêmes contrôles TTC/HT et budget que le
      // dashboard, préfixés par mois). Les erreurs bloquent, les avertissements
      // demandent confirmation.
      const { errors, warnings } = await preValidateForecast(file)
      const errMsgs = errors.map((e) => e.message)
      const warnMsgs = warnings.map((w) => w.message)
      if (errMsgs.length > 0) {
        setFeedback({ kind: 'errors', messages: errMsgs })
        return
      }
      if (warnMsgs.length > 0) {
        setFeedback({ kind: 'confirm', messages: warnMsgs, file })
        return
      }
      await runImport(file, [])
    } catch (err) {
      setFeedback({
        kind: 'errors',
        messages: [err instanceof Error ? err.message : 'Erreur inattendue'],
      })
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
      <Tip label="Importer un forecast (plusieurs mois ou l'année)">
        <Button
          variant="outline"
          size="icon-sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          aria-label="Importer un forecast"
        >
          <Upload />
        </Button>
      </Tip>

      <Dialog
        open={feedback !== null}
        onOpenChange={(open) => !open && setFeedback(null)}
      >
        <DialogContent className="sm:max-w-md">
          {feedback?.kind === 'errors' && (
            <>
              <DialogHeader>
                <DialogTitle>Import refusé</DialogTitle>
                <DialogDescription>
                  Aucune donnée n'a été écrite. Corrige le fichier puis réessaie.
                </DialogDescription>
              </DialogHeader>
              <ul className="max-h-64 space-y-1 overflow-y-auto text-sm text-destructive">
                {feedback.messages.map((m, i) => (
                  <li key={i}>• {m}</li>
                ))}
              </ul>
              <DialogFooter>
                <Button onClick={() => setFeedback(null)}>Fermer</Button>
              </DialogFooter>
            </>
          )}

          {feedback?.kind === 'confirm' && (
            <>
              <DialogHeader>
                <DialogTitle>Avertissements</DialogTitle>
                <DialogDescription>
                  Le fichier est importable, mais quelques points méritent un coup
                  d'œil. Importer quand même ?
                </DialogDescription>
              </DialogHeader>
              <ul className="max-h-64 space-y-1 overflow-y-auto text-sm text-muted-foreground">
                {feedback.messages.map((m, i) => (
                  <li key={i}>• {m}</li>
                ))}
              </ul>
              <DialogFooter>
                <Button variant="outline" onClick={() => setFeedback(null)}>
                  Annuler
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    const { file, messages } = feedback
                    setFeedback(null)
                    void runImport(file, messages)
                  }}
                >
                  Importer quand même
                </Button>
              </DialogFooter>
            </>
          )}

          {feedback?.kind === 'success' && (
            <>
              <DialogHeader>
                <DialogTitle>Forecast importé</DialogTitle>
                <DialogDescription>{feedback.summary}</DialogDescription>
              </DialogHeader>
              {feedback.warnings.length > 0 && (
                <ul className="max-h-64 space-y-1 overflow-y-auto text-sm text-muted-foreground">
                  {feedback.warnings.map((m, i) => (
                    <li key={i}>• {m}</li>
                  ))}
                </ul>
              )}
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
