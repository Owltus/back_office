import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'

/** « le 27/09 à 14:05 » (heure locale du poste). */
function quand(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'récemment'
  const date = d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
  })
  const heure = d.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `le ${date} à ${heure}`
}

/**
 * Conflit à la sauvegarde (amélioration n° 2) : quelqu'un d'autre a
 * enregistré ce document pendant l'édition. Rien n'a été écrit ; trois
 * issues explicites, aucune par défaut destructive :
 *   - revenir à l'édition (Échap, clic extérieur) ;
 *   - garder MA version (écrase la sienne) ;
 *   - prendre SA version (abandonne la mienne — « Copier mon texte »
 *     permet de la garder de côté avant).
 */
export function ConflitDocumentDialog({
  conflit,
  contenu,
  saving,
  onFermer,
  onEcraser,
  onPrendreLaSienne,
}: {
  conflit: { updatedAt: string } | null
  /** Mon texte, pour le copier avant de l'abandonner. */
  contenu: string
  saving: boolean
  onFermer: () => void
  onEcraser: () => void
  onPrendreLaSienne: () => void
}) {
  const [copie, setCopie] = useState<'ok' | 'echec' | null>(null)
  return (
    <Dialog
      open={conflit !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCopie(null)
          onFermer()
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Document modifié entre-temps</DialogTitle>
          <DialogDescription>
            Quelqu'un a enregistré ce document{' '}
            {conflit ? quand(conflit.updatedAt) : ''}, pendant que vous le
            modifiiez. Votre version n'a pas encore été enregistrée.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">
              Garder ma version
            </span>{' '}
            : la vôtre remplace la sienne, et ses changements sont perdus.
          </li>
          <li>
            <span className="font-medium text-foreground">Voir sa version</span>{' '}
            : vos modifications sont abandonnées. Copiez d'abord votre texte si
            vous voulez en reprendre une partie.
          </li>
        </ul>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(contenu).then(
                () => setCopie('ok'),
                () => setCopie('echec'),
              )
            }}
          >
            {copie === 'ok' ? <Check /> : <Copy />}
            Copier mon texte
          </Button>
          <span role="status" className="text-xs text-muted-foreground">
            {copie === 'ok' && 'Copié : collez-le où vous voulez.'}
            {copie === 'echec' && 'Copie impossible sur ce poste.'}
          </span>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={onFermer} disabled={saving}>
            Revenir à l'édition
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={onPrendreLaSienne}
              disabled={saving}
            >
              Voir sa version
            </Button>
            <Button onClick={onEcraser} disabled={saving}>
              Garder ma version
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
