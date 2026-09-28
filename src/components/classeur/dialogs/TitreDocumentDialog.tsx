import { useState } from 'react'

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

/**
 * Titre et description d'un document EN COURS D'ÉDITION (crayon de
 * l'en-tête, décision utilisateur du 2026-09-27 : plus d'encart au-dessus
 * de l'éditeur). Rien n'est écrit en base ici : « Appliquer » reporte les
 * valeurs dans le brouillon, que « Sauvegarder » enregistre avec le texte.
 */
export function TitreDocumentDialog({
  open,
  onOpenChange,
  titre,
  description,
  onAppliquer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  titre: string
  description: string
  onAppliquer: (titre: string, description: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        {open && (
          <Formulaire
            titre={titre}
            description={description}
            onAnnuler={() => onOpenChange(false)}
            onAppliquer={(t, d) => {
              onAppliquer(t, d)
              onOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Formulaire({
  titre: titreInitial,
  description: descriptionInitiale,
  onAnnuler,
  onAppliquer,
}: {
  titre: string
  description: string
  onAnnuler: () => void
  onAppliquer: (titre: string, description: string) => void
}) {
  const [titre, setTitre] = useState(titreInitial)
  const [description, setDescription] = useState(descriptionInitiale)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onAppliquer(titre, description)
      }}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>Titre et description</DialogTitle>
        <DialogDescription>
          Enregistrés avec le document quand vous cliquez sur Sauvegarder.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        <Label htmlFor="titre-document">Titre</Label>
        <Input
          id="titre-document"
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          placeholder="Titre du document"
          autoFocus
          onFocus={(e) => e.target.select()}
          maxLength={200}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description-document">Description</Label>
        <Input
          id="description-document"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Facultatif, affichée sous le titre de chaque page"
          maxLength={1000}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onAnnuler}>
          Annuler
        </Button>
        <Button type="submit">Appliquer</Button>
      </DialogFooter>
    </form>
  )
}
