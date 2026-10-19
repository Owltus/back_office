import { useEffect, useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'

import { usePeriodicites } from '#/components/classeur/hooks/useClasseur.ts'
import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { telechargerTexte } from '#/lib/classeur/download.ts'
import { nomFichierJson, serialiserExport } from '#/lib/classeur/exportJson.ts'
import { construireExport } from '#/lib/classeur/merge/schema.ts'
import type {
  ChapterContent,
  DbChapter,
  DbClasseur,
} from '#/lib/classeur/types.ts'

/*
 * Export JSON du classeur COMPLET (carte « Exporter en JSON » de l'accueil).
 * Copier ou Télécharger, comme `EchangeJsonDialog`. Les demandes à cocher
 * du 2026-10-04 sont retirées (retour utilisateur du 2026-10-19 : « exporter
 * simplement ») ; le mode d'emploi pour l'IA est dans le fichier.
 * Rien n'est mémorisé : tout repart de zéro à la fermeture.
 */

export interface SujetExportClasseur {
  classeur: DbClasseur
  chapters: DbChapter[]
  content: ChapterContent
}

export function ExportJsonClasseurDialog({
  open,
  onOpenChange,
  sujet,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Classeur chargé au moment du clic ; `null` tant qu'il n'y en a pas. */
  sujet: SujetExportClasseur | null
}) {
  const periodicitesQ = usePeriodicites()
  const [copie, setCopie] = useState<'ok' | 'erreur' | null>(null)

  useEffect(() => {
    if (open) return
    setCopie(null)
  }, [open])

  // Les périodicités nomment les feuilles de suivi dans le fichier.
  const pret = sujet !== null && periodicitesQ.data !== undefined

  function construire(): string | null {
    if (sujet === null || periodicitesQ.data === undefined) return null
    return serialiserExport(
      construireExport(
        sujet.classeur,
        sujet.chapters,
        sujet.content,
        periodicitesQ.data,
      ),
    )
  }

  async function copier() {
    const json = construire()
    if (json === null) return
    try {
      await navigator.clipboard.writeText(json)
      setCopie('ok')
      window.setTimeout(() => setCopie(null), 2500)
    } catch {
      setCopie('erreur')
    }
  }

  function telecharger() {
    const json = construire()
    if (json === null || sujet === null) return
    telechargerTexte(
      nomFichierJson(sujet.classeur.name),
      json,
      'application/json;charset=utf-8',
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Exporter en JSON</DialogTitle>
          <DialogDescription>
            {sujet === null
              ? 'Classeur en cours de lecture.'
              : `Le classeur ${sujet.classeur.name} au complet, avec les consignes pour un LLM. Réimportez la réponse par la carte Importer un JSON.`}
          </DialogDescription>
        </DialogHeader>

        {copie === 'erreur' && (
          <p className="text-sm text-destructive">
            Copie refusée par le navigateur : utilisez Télécharger.
          </p>
        )}
        {periodicitesQ.isError && (
          <p className="text-sm text-destructive">
            Lecture impossible. Fermez puis réessayez.
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
          <Button variant="outline" onClick={telecharger} disabled={!pret}>
            <Download />
            Télécharger (.json)
          </Button>
          <Button onClick={() => void copier()} disabled={!pret}>
            {copie === 'ok' ? <Check /> : <Copy />}
            {copie === 'ok' ? 'Copié' : 'Copier le JSON'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
