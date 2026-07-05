import { useEffect, useState } from 'react'

import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Field } from '#/components/form/fields.tsx'
import { IconPicker, ColorPicker } from '#/components/affiche/pickers.tsx'
import type {
  AfficheTemplate,
  AfficheTemplateInput,
} from '#/lib/affiche/model.ts'

/*
 * Formulaire de création / édition d'un modèle d'affiche.
 *
 * Ne manipule QUE les 7 champs du modèle (name, icon, color, titres/messages) —
 * jamais l'état de session de l'affiche (dates, horaires, tailles). Rendu et
 * monté uniquement pour les rôles autorisés (le board masque tout accès sinon ;
 * la RLS reste le vrai rempart).
 */

const BLANK: AfficheTemplateInput = {
  name: '',
  icon: 'alert',
  color: 'okko',
  titleFr: '',
  messageFr: '',
  titleEn: '',
  messageEn: '',
}

export function TemplateDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: AfficheTemplate | null
  onSubmit: (input: AfficheTemplateInput) => void
}) {
  const [form, setForm] = useState<AfficheTemplateInput>(BLANK)

  // (Ré)initialise le formulaire à chaque ouverture selon le mode (create/edit).
  useEffect(() => {
    if (!open) return
    setForm(
      initial
        ? {
            name: initial.name,
            icon: initial.icon,
            color: initial.color,
            titleFr: initial.titleFr,
            messageFr: initial.messageFr,
            titleEn: initial.titleEn,
            messageEn: initial.messageEn,
          }
        : BLANK,
    )
  }, [open, initial])

  const set = (patch: Partial<AfficheTemplateInput>) =>
    setForm((f) => ({ ...f, ...patch }))

  const canSave = form.name.trim() !== ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {initial ? 'Modifier le modèle' : 'Nouveau modèle'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field label="Nom du modèle">
            <Input
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Nom affiché dans la liste"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Icône">
              <IconPicker
                value={form.icon}
                onChange={(icon) => set({ icon })}
              />
            </Field>
            <Field label="Thème de couleur">
              <ColorPicker
                value={form.color}
                onChange={(color) => set({ color })}
              />
            </Field>
          </div>

          <Field label="Titre (français)">
            <Input
              value={form.titleFr}
              onChange={(e) => set({ titleFr: e.target.value })}
              placeholder="Titre en français"
            />
          </Field>
          <Field label="Message (français)">
            <Textarea
              value={form.messageFr}
              onChange={(e) => set({ messageFr: e.target.value })}
              placeholder="Message en français"
              rows={4}
            />
          </Field>
          <Field label="Titre (anglais)">
            <Input
              value={form.titleEn}
              onChange={(e) => set({ titleEn: e.target.value })}
              placeholder="Titre en anglais"
            />
          </Field>
          <Field label="Message (anglais)">
            <Textarea
              value={form.messageEn}
              onChange={(e) => set({ messageEn: e.target.value })}
              placeholder="Message en anglais"
              rows={4}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button disabled={!canSave} onClick={() => onSubmit(form)}>
            {initial ? 'Enregistrer' : 'Créer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
