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
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { useDroitsPageClasseur } from '#/components/classeur/hooks/useDroitsClasseur.ts'
import { createClasseur, updateClasseur } from '#/lib/classeur/service.ts'
import { cn } from '#/lib/utils.ts'
import type { ClasseurInput } from '#/lib/classeur/service.ts'
import type { DbClasseur } from '#/lib/classeur/types.ts'

const ICONE_PAR_DEFAUT = 'BookOpen'

/**
 * Dialogue de création OU d'édition d'un classeur (nom, icône, établissement,
 * complément) — fusion des deux dialogues de Registre (`ClasseurListPage`,
 * `DashboardPage`). Édition si `classeur` est fourni.
 *
 * Le dialogue porte sa mutation : écriture, puis invalidation de
 * `classeurKeys.all`, puis `onDone(id)`. L'erreur (dont le refus RLS 42501)
 * s'affiche dans le dialogue, sous le formulaire.
 */
export function ClasseurDialog({
  open,
  onOpenChange,
  classeur,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Classeur à modifier ; absent = création. */
  classeur?: DbClasseur | null
  /** Appelé après l'écriture avec l'identifiant du classeur. */
  onDone?: (classeurId: number) => void
}) {
  const edition = classeur != null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {edition ? 'Modifier le classeur' : 'Nouveau classeur'}
          </DialogTitle>
          <DialogDescription>
            {edition
              ? 'Nom, icône et établissement imprimés sur le classeur.'
              : 'Un classeur regroupe des chapitres prêts à imprimer.'}
          </DialogDescription>
        </DialogHeader>
        {/* Radix démonte le contenu à la fermeture : l'état du formulaire
            repart des props à chaque ouverture, sans effet de synchronisation. */}
        <ClasseurForm
          classeur={classeur ?? null}
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

function ClasseurForm({
  classeur,
  onCancel,
  onDone,
}: {
  classeur: DbClasseur | null
  onCancel: () => void
  onDone: (classeurId: number) => void
}) {
  const [name, setName] = useState(classeur?.name ?? '')
  const [icon, setIcon] = useState(classeur?.icon ?? ICONE_PAR_DEFAUT)
  const [etablissement, setEtablissement] = useState(
    classeur?.etablissement ?? '',
  )
  const [complement, setComplement] = useState(
    classeur?.etablissement_complement ?? '',
  )
  const invalider = useInvaliderClasseur()
  // « Privé » à la création : gestion seule (la base force `lecture` sinon).
  const { canCreatePrive } = useDroitsPageClasseur()
  const [prive, setPrive] = useState(false)

  const mutation = useMutation({
    mutationFn: async (input: ClasseurInput) => {
      if (classeur) {
        await updateClasseur(classeur.id, input)
        return classeur.id
      }
      return createClasseur(
        input,
        canCreatePrive && prive ? 'aucun' : 'lecture',
      )
    },
    onSuccess: async (id) => {
      await invalider()
      onDone(id)
    },
  })

  const valide = name.trim() !== ''

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!valide || mutation.isPending) return
        mutation.mutate({
          name: name.trim(),
          icon,
          etablissement: etablissement.trim(),
          etablissement_complement: complement.trim(),
        })
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="classeur-name">Nom</Label>
        <Input
          id="classeur-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Registre de sécurité"
          autoFocus
          maxLength={200}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Icône</Label>
        <IconPicker value={icon} onChange={setIcon} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="classeur-etablissement">Établissement</Label>
        <Input
          id="classeur-etablissement"
          value={etablissement}
          onChange={(e) => setEtablissement(e.target.value)}
          placeholder="Okko Hotels"
          maxLength={200}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="classeur-complement">Complément</Label>
        <Input
          id="classeur-complement"
          value={complement}
          onChange={(e) => setComplement(e.target.value)}
          placeholder="Nantes Centre-ville (facultatif)"
          maxLength={200}
        />
      </div>

      {!classeur && canCreatePrive && (
        <div className="flex flex-col gap-2">
          <Label>Visibilité</Label>
          <div
            role="radiogroup"
            aria-label="Visibilité du classeur"
            className="grid grid-cols-2 gap-2"
          >
            {(
              [
                [
                  false,
                  'Lecture pour tous',
                  'Tous ceux qui ont la page le lisent.',
                ],
                [
                  true,
                  'Privé',
                  'Personne, sauf la gestion et les accès donnés.',
                ],
              ] as const
            ).map(([valeur, titre, aide]) => (
              <button
                key={titre}
                type="button"
                role="radio"
                aria-checked={prive === valeur}
                onClick={() => setPrive(valeur)}
                className={cn(
                  'rounded-md border p-2.5 text-left text-sm transition-colors',
                  prive === valeur
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-accent',
                )}
              >
                <span className="block font-medium">{titre}</span>
                <span className="text-xs text-muted-foreground">{aide}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {mutation.isError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>
            {messageErreur(
              mutation.error,
              classeur ? 'Modification impossible' : 'Création impossible',
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
          {classeur ? 'Enregistrer' : 'Créer'}
        </Button>
      </DialogFooter>
    </form>
  )
}
