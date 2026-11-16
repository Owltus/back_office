import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Field } from '#/components/form/fields.tsx'

/*
 * Modale « Modifier le modèle » (demande utilisateur du 2026-11-16) : renommer
 * le modèle sélectionné, ou le supprimer. Le contenu de l'affiche (textes,
 * icône, couleur, dates, tailles) s'édite toujours dans le panneau puis se
 * sauvegarde par le bouton du bas.
 *
 * La suppression se confirme DANS la modale (deuxième étape), pas par une
 * seconde modale empilée. Les droits sont décidés par l'appelant (gestion :
 * tous les modèles ; écriture : les siens), et la RLS les impose en base.
 */
export function TemplateEditDialog({
  open,
  onOpenChange,
  name,
  onRename,
  onDelete,
  pending = false,
  error = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Nom actuel du modèle. */
  name: string
  onRename: (name: string) => void
  onDelete: () => void
  pending?: boolean
  /** Échec de la dernière action, affiché dans la modale restée ouverte. */
  error?: string | null
}) {
  const [value, setValue] = useState(name)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Repart du nom actuel, sans confirmation en cours, à chaque ouverture.
  useEffect(() => {
    if (open) {
      setValue(name)
      setConfirmDelete(false)
    }
  }, [open, name])

  const trimmed = value.trim()
  const canSave = trimmed !== '' && trimmed !== name && !pending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {confirmDelete ? (
          <>
            <DialogHeader>
              <DialogTitle>Supprimer le modèle ?</DialogTitle>
              <DialogDescription>
                Le modèle {name} sera supprimé. Cette action est définitive.
              </DialogDescription>
            </DialogHeader>
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmDelete(false)}
                disabled={pending}
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                onClick={onDelete}
                disabled={pending}
              >
                <Trash2 />
                Supprimer
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Modifier le modèle</DialogTitle>
            </DialogHeader>

            <Field label="Nom du modèle">
              <Input
                value={value}
                autoFocus
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canSave) onRename(trimmed)
                }}
                placeholder="Nom affiché dans la liste"
              />
            </Field>

            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}

            <DialogFooter className="sm:justify-between">
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
                disabled={pending}
              >
                <Trash2 />
                Supprimer
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Annuler
                </Button>
                <Button disabled={!canSave} onClick={() => onRename(trimmed)}>
                  Enregistrer
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
