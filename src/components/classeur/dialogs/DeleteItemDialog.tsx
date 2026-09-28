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
import { softDeleteItem } from '#/lib/classeur/service.ts'
import { titreOuDefaut } from '#/lib/classeur/sommaire.ts'
import { ITEM_LABEL } from '#/lib/classeur/types.ts'
import type { ItemKind } from '#/lib/classeur/types.ts'

export interface ItemASupprimer {
  kind: ItemKind
  id: number
  title: string
}

const TITRE: Record<ItemKind, string> = {
  document: 'Supprimer le document',
  tracking_sheet: 'Supprimer la feuille de suivi',
  signature_sheet: 'Supprimer la feuille de signature',
  intercalaire: "Supprimer l'intercalaire",
}

/**
 * Confirmation de suppression (douce) d'un élément — portée de Registre
 * (`DeleteItemDialog`). Mutation interne : le dialogue reste ouvert avec
 * l'erreur si la base refuse, plutôt qu'un `ConfirmDialog` qui se ferme avant
 * d'agir. Ouvert tant que `item` est fourni.
 */
export function DeleteItemDialog({
  item,
  onClose,
}: {
  item: ItemASupprimer | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        {item && (
          <DeleteItemBody
            key={`${item.kind}:${item.id}`}
            item={item}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function DeleteItemBody({
  item,
  onClose,
}: {
  item: ItemASupprimer
  onClose: () => void
}) {
  const invalider = useInvaliderClasseur()
  const mutation = useMutation({
    mutationFn: () => softDeleteItem(item.kind, item.id),
    onSuccess: async () => {
      await invalider()
      onClose()
    },
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>{TITRE[item.kind]}</DialogTitle>
        <DialogDescription>
          {`« ${titreOuDefaut(item.title)} » (${ITEM_LABEL[item.kind]}) ne sera plus visible dans le chapitre.`}
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
          onClick={onClose}
          disabled={mutation.isPending}
        >
          Annuler
        </Button>
        <Button
          variant="destructive"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          {mutation.isPending && <Loader2 className="animate-spin" />}
          Supprimer
        </Button>
      </DialogFooter>
    </>
  )
}
