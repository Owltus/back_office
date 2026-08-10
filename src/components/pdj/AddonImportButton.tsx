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
  breakfastServiceDate,
  parseAddonProductionRange,
} from '#/lib/pdj/addon.ts'
import { importAddonProduction } from '#/lib/pdj/service.ts'
import type { AddonProductionDbRow } from '#/lib/pdj/service.ts'

/**
 * Bouton (ADMIN) d'import STANDALONE d'un « Addon Production » dans la page
 * analytique PDJ, à côté de l'impression. Dépôt d'un CSV « plage » couvrant
 * plusieurs jours (format LARGE : une paire count/revenue par jour) →
 * `parseAddonProductionRange` → alignement +1 jour → upsert `pdj_addon_production`.
 * `onImported` rafraîchit la vue.
 *
 * Réservé aux admins (`gestion`) : l'écriture de jours anciens (hors fenêtre J-3)
 * n'est permise qu'à ce niveau par la RLS. Rendu NUL sinon. Le fichier n'est jamais
 * stocké — seulement parsé puis écrit ligne à ligne.
 */
type Feedback =
  | { kind: 'errors'; message: string }
  | { kind: 'success'; summary: string }
  | null

export function AddonImportButton({ onImported }: { onImported: () => void }) {
  const { can } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  if (!can('pdj', 'gestion')) return null

  async function handleFile(file: File) {
    setBusy(true)
    try {
      const parsed = parseAddonProductionRange(await file.text())
      if (parsed.length === 0) {
        setFeedback({
          kind: 'errors',
          message:
            'Aucune donnée Addon exploitable dans ce fichier (export « Addon Production » attendu).',
        })
        return
      }
      // Alignement +1 jour : la date de colonne est la date « clôture », le PDJ est
      // servi le lendemain (jour sous lequel le board / l'analytique rangent la donnée).
      const rows: AddonProductionDbRow[] = parsed.map((r) => ({
        service_date: breakfastServiceDate(r.businessDate),
        code: r.code,
        total_count: r.count,
        revenue_ttc: r.revenue,
        source_file: file.name,
      }))
      const days = new Set(rows.map((r) => r.service_date)).size
      const years = [...new Set(rows.map((r) => r.service_date.slice(0, 4)))].sort()
      await importAddonProduction(rows)
      setFeedback({
        kind: 'success',
        summary: `${rows.length} lignes enregistrées (${days} jour${days > 1 ? 's' : ''}, ${years.join(', ')}).`,
      })
      onImported()
    } catch (err) {
      setFeedback({
        kind: 'errors',
        message:
          err instanceof Error
            ? err.message
            : "Une erreur inattendue s'est produite. Réessaie.",
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
      <Tip label="Importer un Addon Production (plusieurs jours)">
        <Button
          variant="outline"
          size="icon-sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          aria-label="Importer un Addon Production"
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
                <DialogTitle>Import Addon Production</DialogTitle>
                <DialogDescription>Voici le résultat.</DialogDescription>
              </DialogHeader>
              <div className="flex gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-500">
                <Check className="mt-0.5 size-4 shrink-0" />
                <div className="space-y-0.5">
                  <div className="font-medium">
                    C'est bon, les données sont en place
                  </div>
                  <p className="text-emerald-500/80">{feedback.summary}</p>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => setFeedback(null)}>Fermer</Button>
              </DialogFooter>
            </>
          )}

          {feedback?.kind === 'errors' && (
            <>
              <DialogHeader>
                <DialogTitle>Import refusé</DialogTitle>
                <DialogDescription>Rien n'a été écrit.</DialogDescription>
              </DialogHeader>
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {feedback.message}
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
