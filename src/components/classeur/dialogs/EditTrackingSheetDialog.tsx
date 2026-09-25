import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, Loader2 } from 'lucide-react'

import {
  useInvaliderClasseur,
  usePeriodicites,
} from '#/components/classeur/hooks/useClasseur.ts'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { updateItem } from '#/lib/classeur/service.ts'
import { SANS_TITRE } from '#/lib/classeur/sommaire.ts'
import type { DbTrackingSheet } from '#/lib/classeur/types.ts'

/**
 * Édition d'une feuille de suivi : titre et périodicité — portée de
 * Registre (`EditTrackingSheetDialog`). Ouvert tant que `sheet` est fourni.
 */
export function EditTrackingSheetDialog({
  sheet,
  onClose,
}: {
  sheet: DbTrackingSheet | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={sheet !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        {sheet && (
          <EditTrackingSheetForm
            key={sheet.id}
            sheet={sheet}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditTrackingSheetForm({
  sheet,
  onClose,
}: {
  sheet: DbTrackingSheet
  onClose: () => void
}) {
  const [title, setTitle] = useState(sheet.title)
  const [periodiciteId, setPeriodiciteId] = useState(
    String(sheet.periodicite_id),
  )
  const periodicites = usePeriodicites()
  const invalider = useInvaliderClasseur()

  const mutation = useMutation({
    mutationFn: () =>
      updateItem('tracking_sheet', sheet.id, {
        title: title.trim() || SANS_TITRE,
        periodicite_id: Number(periodiciteId),
      }),
    onSuccess: async () => {
      await invalider()
      onClose()
    },
  })

  const valide = Number(periodiciteId) > 0

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!valide || mutation.isPending) return
        mutation.mutate()
      }}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>Modifier la feuille de suivi</DialogTitle>
        <DialogDescription className="sr-only">
          Titre et périodicité de la feuille de suivi.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-ts-title">Titre</Label>
        <Input
          id="edit-ts-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          onFocus={(e) => e.target.select()}
          maxLength={200}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-ts-periodicite">Périodicité</Label>
        {periodicites.isPending ? (
          <Skeleton className="h-9 w-full" />
        ) : (
          <Select value={periodiciteId} onValueChange={setPeriodiciteId}>
            <SelectTrigger id="edit-ts-periodicite" className="w-full">
              <SelectValue placeholder="Choisir une périodicité" />
            </SelectTrigger>
            <SelectContent>
              {(periodicites.data ?? []).map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {periodicites.isError && (
          <p className="text-xs text-destructive">
            {messageErreur(periodicites.error, 'Périodicités indisponibles')}
          </p>
        )}
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
        <Button type="submit" disabled={!valide || mutation.isPending}>
          {mutation.isPending && <Loader2 className="animate-spin" />}
          Enregistrer
        </Button>
      </DialogFooter>
    </form>
  )
}
