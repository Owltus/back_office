import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import type { UsageImage } from '#/lib/classeur/images.ts'
import type { DbImage } from '#/lib/classeur/types.ts'

/*
 * Confirmation de la suppression d'une image de la médiathèque (demande
 * utilisateur du 2026-09-26 : « supprimable, ça les retire proprement des
 * documents où elles sont utilisées, avec une modale pour dire attention et
 * pourquoi »).
 *
 * La modale dit ce qui va se passer, dans l'ordre où ça se passe
 * (`supprimerImage`) : les documents qui l'utilisent sont réécrits sans
 * elle (la ligne `![…]` disparaît, le reste du texte est conservé, un point
 * de restauration automatique est pris avant si le dernier date de plus
 * d'un quart d'heure), puis le fichier est retiré du classeur — c'est la
 * seule étape irréversible — et la fiche est marquée supprimée.
 */
export function SuppressionImageDialog({
  image,
  usages,
  occupe = false,
  onAnnuler,
  onConfirmer,
}: {
  image: DbImage | null
  /** Documents qui référencent l'image (calculés par la médiathèque). */
  usages: UsageImage[]
  occupe?: boolean
  onAnnuler: () => void
  onConfirmer: () => void
}) {
  const n = usages.length
  return (
    <Dialog
      open={image !== null}
      onOpenChange={(o) => {
        if (!o && !occupe) onAnnuler()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-500" aria-hidden />
            Supprimer l'image
          </DialogTitle>
          <DialogDescription>
            {image
              ? n === 0
                ? `« ${image.nom} » n'est utilisée par aucun document. Le fichier sera retiré du classeur.`
                : `« ${image.nom} » est utilisée dans ${String(n)} document${n > 1 ? 's' : ''}. Elle en sera retirée proprement avant que le fichier ne soit supprimé.`
              : ''}
          </DialogDescription>
        </DialogHeader>

        {n > 0 && (
          <div className="flex flex-col gap-3 text-sm">
            <ul className="max-h-40 overflow-y-auto rounded-md border border-border bg-card px-3 py-2">
              {usages.map((u) => (
                <li
                  key={`${String(u.documentId)}`}
                  className="truncate py-0.5"
                  title={`${u.chapterLabel} › ${u.documentTitle}`}
                >
                  <span className="text-muted-foreground">
                    {u.chapterLabel} ›{' '}
                  </span>
                  {u.documentTitle}
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground">
              Ce qui va se passer, dans l'ordre : la ligne de l'image est
              retirée de ces documents (le reste du texte est conservé), puis le
              fichier est supprimé du classeur. Un point de restauration
              automatique est pris avant les modifications.
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          La suppression du fichier est définitive : aucun document ne pourra
          plus l'afficher.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={onAnnuler} disabled={occupe}>
            Annuler
          </Button>
          <Button variant="destructive" onClick={onConfirmer} disabled={occupe}>
            {occupe ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {n === 0
              ? 'Supprimer'
              : `Retirer de ${String(n)} document${n > 1 ? 's' : ''} et supprimer`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
