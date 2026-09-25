import { useState } from 'react'
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
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { updateItem } from '#/lib/classeur/service.ts'
import { SANS_TITRE } from '#/lib/classeur/sommaire.ts'
import type { ItemKind } from '#/lib/classeur/types.ts'

/** Élément dont on modifie titre et description (les trois natures qui en ont une). */
export interface EditableItem {
  kind: Exclude<ItemKind, 'tracking_sheet'>
  id: number
  title: string
  description: string
}

const TITRE: Record<EditableItem['kind'], string> = {
  document: 'Modifier le document',
  signature_sheet: 'Modifier la feuille de signature',
  intercalaire: "Modifier l'intercalaire",
}

/**
 * Édition du titre et de la description d'un document, d'une feuille de
 * signature ou d'un intercalaire — portée de Registre (`EditItemDialog`,
 * générique par champs). La feuille de suivi a son propre dialogue
 * (périodicité). Ouvert tant que `item` est fourni.
 */
export function EditItemDialog({
  item,
  onClose,
}: {
  item: EditableItem | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        {item && (
          <EditItemForm
            key={`${item.kind}:${item.id}`}
            item={item}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditItemForm({
  item,
  onClose,
}: {
  item: EditableItem
  onClose: () => void
}) {
  const [title, setTitle] = useState(item.title)
  const [description, setDescription] = useState(item.description)
  const invalider = useInvaliderClasseur()

  const mutation = useMutation({
    mutationFn: () =>
      updateItem(item.kind, item.id, {
        title: title.trim() || SANS_TITRE,
        description: description.trim(),
      }),
    onSuccess: async () => {
      await invalider()
      onClose()
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (mutation.isPending) return
        mutation.mutate()
      }}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>{TITRE[item.kind]}</DialogTitle>
        <DialogDescription className="sr-only">
          Titre et description de l'élément.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-item-title">Titre</Label>
        <Input
          id="edit-item-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          onFocus={(e) => e.target.select()}
          maxLength={200}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-item-description">Description</Label>
        <Input
          id="edit-item-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Facultatif"
          maxLength={1000}
        />
      </div>

      {mutation.isError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>
            {messageErreur(mutation.error, 'Modification impossible')}
          </AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Annuler
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="animate-spin" />}
          Enregistrer
        </Button>
      </DialogFooter>
    </form>
  )
}
