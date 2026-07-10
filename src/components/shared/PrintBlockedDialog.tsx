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
 * Refus d'impression, expliqué.
 *
 * Le bouton d'impression se contente d'être désactivé — son infobulle dit
 * pourquoi. Ctrl+P n'a pas d'infobulle : sans cette modale, le raccourci ne
 * ferait rien du tout, et l'hôtelier croirait à un bug.
 *
 * `reason` est une phrase complète : ce qui manque, et quoi faire.
 */
export function PrintBlockedDialog({
  open,
  onOpenChange,
  reason,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  reason: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Impression impossible</DialogTitle>
          <DialogDescription>{reason}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
