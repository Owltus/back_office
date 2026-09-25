import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, Loader2 } from 'lucide-react'

import { IconPicker } from '#/components/classeur/IconPicker.tsx'
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
import { Textarea } from '#/components/ui/textarea.tsx'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { createChapter, updateChapter } from '#/lib/classeur/service.ts'
import type { ChapterInput } from '#/lib/classeur/service.ts'
import type { DbChapter } from '#/lib/classeur/types.ts'

const ICONE_PAR_DEFAUT = 'FileText'

/**
 * Dialogue de création OU d'édition d'un chapitre (libellé, icône,
 * description) — porté de Registre (`DashboardPage` création,
 * `EditChapterDialog` édition). Édition si `chapter` est fourni.
 *
 * Même contrat que `ClasseurDialog` : mutation interne, invalidation de
 * `classeurKeys.all`, `onDone(chapterId)`, erreur inline.
 */
export function ChapterDialog({
  open,
  onOpenChange,
  classeurId,
  chapter,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  classeurId: number
  /** Chapitre à modifier ; absent = création dans `classeurId`. */
  chapter?: DbChapter | null
  onDone?: (chapterId: number) => void
}) {
  const edition = chapter != null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {edition ? 'Modifier le chapitre' : 'Nouveau chapitre'}
          </DialogTitle>
          <DialogDescription>
            {edition
              ? 'Libellé, icône et description de la page de garde.'
              : 'Un chapitre regroupe documents, feuilles de suivi et de signature.'}
          </DialogDescription>
        </DialogHeader>
        <ChapterForm
          classeurId={classeurId}
          chapter={chapter ?? null}
          onCancel={() => onOpenChange(false)}
          onDone={(id) => {
            onOpenChange(false)
            onDone?.(id)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function ChapterForm({
  classeurId,
  chapter,
  onCancel,
  onDone,
}: {
  classeurId: number
  chapter: DbChapter | null
  onCancel: () => void
  onDone: (chapterId: number) => void
}) {
  const [label, setLabel] = useState(chapter?.label ?? '')
  const [icon, setIcon] = useState(chapter?.icon ?? ICONE_PAR_DEFAUT)
  const [description, setDescription] = useState(chapter?.description ?? '')
  const invalider = useInvaliderClasseur()

  const mutation = useMutation({
    mutationFn: async (input: ChapterInput) => {
      if (chapter) {
        await updateChapter(chapter.id, input)
        return chapter.id
      }
      return createChapter(classeurId, input)
    },
    onSuccess: async (id) => {
      await invalider()
      onDone(id)
    },
  })

  const valide = label.trim() !== ''

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!valide || mutation.isPending) return
        mutation.mutate({
          label: label.trim(),
          icon,
          description: description.trim(),
        })
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="chapter-label">Nom</Label>
        <Input
          id="chapter-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Sécurité incendie"
          autoFocus
          maxLength={200}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Icône</Label>
        <IconPicker value={icon} onChange={setIcon} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="chapter-description">Description</Label>
        <Textarea
          id="chapter-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Imprimée sous le titre de la page de garde (facultatif)"
          rows={2}
          maxLength={1000}
        />
      </div>

      {mutation.isError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>
            {messageErreur(
              mutation.error,
              chapter ? 'Modification impossible' : 'Création impossible',
            )}
          </AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" disabled={!valide || mutation.isPending}>
          {mutation.isPending && <Loader2 className="animate-spin" />}
          {chapter ? 'Enregistrer' : 'Créer'}
        </Button>
      </DialogFooter>
    </form>
  )
}
