import { AlertTriangle, Loader2, TriangleAlert } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import type { Alerte, RelectureElement } from '#/lib/classeur/relecture.ts'

/*
 * Relecture AVANT l'import d'un fichier comme nouveau classeur (D7 du plan
 * `classeur-echange-ia-2026-10-19`, étape 7) : pas d'aperçu (rien n'existe
 * encore à comparer), seulement ce que la validation a corrigé et les points
 * à vérifier, élément par élément. Jamais bloquant (D9) : la personne crée le
 * classeur quand même, ou annule. Ne s'ouvre que s'il y a quelque chose à
 * dire : un fichier propre est importé sans étape de plus.
 */

const NATURES: Record<string, string> = {
  document: 'Document',
  tracking_sheet: 'Feuille de suivi',
  signature_sheet: 'Feuille de signature',
  intercalaire: 'Intercalaire',
  chapter: 'Chapitre',
}

function ou(a: Alerte): string {
  return a.champ === 'titre'
    ? 'Titre'
    : a.champ === 'description'
      ? 'Description'
      : `Ligne ${String(a.ligne)}`
}

export interface RelectureNouveauClasseur {
  nom: string
  avertissements: string[]
  elements: RelectureElement[]
}

export function RelectureImportDialog({
  relecture,
  onAnnuler,
  onImporter,
  enCours,
}: {
  /** `null` : dialogue fermé. */
  relecture: RelectureNouveauClasseur | null
  onAnnuler: () => void
  onImporter: () => void
  enCours: boolean
}) {
  const n = relecture?.elements.length ?? 0
  return (
    <Dialog
      open={relecture !== null}
      onOpenChange={(o) => {
        if (!o && !enCours) onAnnuler()
      }}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Avant d'importer</DialogTitle>
          <DialogDescription>
            {relecture === null
              ? ''
              : `Le classeur ${relecture.nom} sera créé. L'import reste possible.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {relecture !== null && relecture.avertissements.length > 0 && (
            <Alert>
              <AlertTriangle />
              <AlertTitle>
                {relecture.avertissements.length > 1
                  ? `${String(relecture.avertissements.length)} corrections`
                  : '1 correction'}
              </AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {relecture.avertissements.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {n > 0 && relecture !== null && (
            <div className="flex flex-col gap-2 text-sm">
              <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <TriangleAlert className="size-3.5 shrink-0" />
                {n > 1
                  ? `${String(n)} éléments ont des points à vérifier.`
                  : '1 élément a des points à vérifier.'}
              </p>
              <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
                {relecture.elements.map((e, i) => (
                  <li
                    key={`${e.chapitre}-${e.kind}-${e.titre}-${String(i)}`}
                    className="flex flex-col gap-1 px-3 py-2"
                  >
                    <span className="truncate">
                      {e.titre.trim() === '' ? 'Sans titre' : e.titre}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {NATURES[e.kind] ?? e.kind}
                      {e.kind !== 'chapter' && ` · ${e.chapitre}`}
                    </span>
                    <ul
                      aria-label={`Points à vérifier : ${e.titre}`}
                      className="flex flex-col gap-0.5 text-xs text-muted-foreground"
                    >
                      {e.alertes.map((a, k) => (
                        <li key={`${ou(a)}-${String(k)}`}>
                          <span className="tabular-nums text-foreground">
                            {ou(a)}
                          </span>{' '}
                          · {a.message}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onAnnuler}
            disabled={enCours}
          >
            Annuler
          </Button>
          <Button type="button" onClick={onImporter} disabled={enCours}>
            {enCours && <Loader2 className="animate-spin" />}
            Créer le classeur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
