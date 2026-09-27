import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'

/**
 * Confirmation avant de perdre des modifications non enregistrées
 * (amélioration n° 1) : bouton Annuler de l'éditeur, ou navigation vers une
 * autre page pendant l'édition. Le choix par défaut (focus, Échap, clic
 * extérieur) est de CONTINUER l'édition : rien ne se perd par inadvertance.
 */
export function AbandonModificationsDialog({
  raison,
  onContinuer,
  onAbandonner,
}: {
  /** `null` : fermé. */
  raison: 'annuler' | 'quitter' | null
  onContinuer: () => void
  onAbandonner: () => void
}) {
  return (
    <Dialog
      open={raison !== null}
      onOpenChange={(open) => {
        if (!open) onContinuer()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {raison === 'quitter'
              ? 'Quitter sans enregistrer ?'
              : 'Abandonner les modifications ?'}
          </DialogTitle>
          <DialogDescription>
            Vos modifications de ce document ne sont pas enregistrées. Si vous
            continuez, elles seront perdues.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onAbandonner}>
            {raison === 'quitter' ? 'Quitter sans enregistrer' : 'Abandonner'}
          </Button>
          <Button autoFocus onClick={onContinuer}>
            Continuer l'édition
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
