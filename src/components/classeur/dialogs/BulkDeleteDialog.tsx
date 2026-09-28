import { useMutation } from '@tanstack/react-query'
import { AlertCircle, Loader2 } from 'lucide-react'

import { useInvaliderClasseur } from '#/components/classeur/hooks/useClasseur.ts'
import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import type { ItemRef } from '#/lib/classeur/ordre.ts'
import { softDeleteItems } from '#/lib/classeur/service.ts'

/**
 * Suppression (douce) groupée de la sélection — portée de Registre
 * (`BulkDeleteDialog`). `onDone` vide la sélection après réussite.
 */
export function BulkDeleteDialog({
  open,
  onOpenChange,
  refs,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  refs: ReadonlyArray<ItemRef>
  onDone: () => void
}) {
  const invalider = useInvaliderClasseur()
  const mutation = useMutation({
    mutationFn: () => softDeleteItems(refs),
    onSuccess: async () => {
      await invalider()
      onOpenChange(false)
      onDone()
    },
  })
  const n = refs.length
  const pluriel = n > 1 ? 's' : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Supprimer {n} élément{pluriel}
          </DialogTitle>
          <DialogDescription>
            {n} élément{pluriel} ne ser{n > 1 ? 'ont' : 'a'} plus visible
            {pluriel} dans le chapitre.
          </DialogDescription>
        </DialogHeader>

        {mutation.isError && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>
              {messageErreur(mutation.error, 'Suppression impossible')}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={n === 0 || mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="animate-spin" />}
            Supprimer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
