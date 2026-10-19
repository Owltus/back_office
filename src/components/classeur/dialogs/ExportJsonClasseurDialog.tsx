import { useEffect } from 'react'
import { Check, Copy, Download } from 'lucide-react'

import { usePeriodicites } from '#/components/classeur/hooks/useClasseur.ts'
import {
  MESSAGE_COPIE_REFUSEE,
  useCopieExport,
} from '#/components/classeur/hooks/useCopieExport.ts'
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
import {
  MIME_JSON,
  nomFichierJson,
  texteExportClasseur,
} from '#/lib/classeur/exportJson.ts'
import type {
  ChapterContent,
  DbChapter,
  DbClasseur,
} from '#/lib/classeur/types.ts'

/*
 * Export JSON du classeur COMPLET (ligne « Exporter en JSON » de l'accueil).
 * Deux gestes, aucun choix (étape 3 du plan `classeur-echange-ia-2026-10-19`) :
 * Copier (à coller dans une IA, qui lit son mode d'emploi dans le fichier et
 * guide la personne) et Télécharger. Les deux rendent EXACTEMENT le même
 * texte (`texteExportClasseur`). Les demandes à cocher du 2026-10-04 sont
 * retirées (« exporter simplement »). Rien n'est mémorisé.
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
  const copie = useCopieExport()
  const { oublier } = copie

  useEffect(() => {
    if (!open) oublier()
  }, [open, oublier])

  // Les périodicités nomment les feuilles de suivi dans le fichier.
  const pret = sujet !== null && periodicitesQ.data !== undefined

  function construire(): { texte: string; nomFichier: string } | null {
    if (sujet === null || periodicitesQ.data === undefined) return null
    return {
      texte: texteExportClasseur(
        sujet.classeur,
        sujet.chapters,
        sujet.content,
        periodicitesQ.data,
      ),
      nomFichier: nomFichierJson(sujet.classeur.name),
    }
  }

  function telecharger() {
    const x = construire()
    if (x !== null) telechargerTexte(x.nomFichier, x.texte, MIME_JSON)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Exporter en JSON</DialogTitle>
          <DialogDescription>
            {sujet === null
              ? 'Classeur en cours de lecture.'
              : `Le classeur ${sujet.classeur.name} au complet. Collez-le dans une IA : elle vous guide.`}
          </DialogDescription>
        </DialogHeader>

        {copie.refusee && (
          <p className="text-sm text-destructive">{MESSAGE_COPIE_REFUSEE}</p>
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
            Télécharger
          </Button>
          <Button
            onClick={() => void copie.copier(construire)}
            disabled={!pret || copie.enCours}
          >
            {copie.copie ? <Check /> : <Copy />}
            {copie.copie ? 'Copié' : 'Copier'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
