import { useEffect, useState } from 'react'

import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Field } from '#/components/form/fields.tsx'

/*
 * Modale minimale de création d'un modèle d'affiche : elle ne demande QUE le nom.
 *
 * Tout le reste (textes, icône, couleur, dates/heures, tailles) est déjà l'état
 * courant de l'affiche, capturé au moment de « Créer » par le board. Remplace
 * l'ancienne grosse modale d'édition (TemplateDialog) : on édite l'affiche
 * directement dans le panneau, la modale ne sert plus qu'à la nommer.
 */
export function TemplateNameDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (name: string) => void
}) {
  const [name, setName] = useState('')

  // Repart d'un champ vide à chaque ouverture.
  useEffect(() => {
    if (open) setName('')
  }, [open])

  const trimmed = name.trim()
  const canSave = trimmed !== ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Nouveau modèle</DialogTitle>
        </DialogHeader>

        <Field label="Nom du modèle">
          <Input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSave) onSubmit(trimmed)
            }}
            placeholder="Nom affiché dans la liste"
          />
        </Field>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button disabled={!canSave} onClick={() => onSubmit(trimmed)}>
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
