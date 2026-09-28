import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowLeft,
  Bookmark,
  FileText,
  Loader2,
  PenLine,
  Table2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

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
import { createItem } from '#/lib/classeur/service.ts'
import type { ItemInput } from '#/lib/classeur/service.ts'
import { SANS_TITRE } from '#/lib/classeur/sommaire.ts'
import { ITEM_KINDS } from '#/lib/classeur/types.ts'
import type { ItemKind } from '#/lib/classeur/types.ts'

/** Lignes de signature d'une nouvelle feuille (comme Registre). */
const LIGNES_SIGNATURE_DEFAUT = 14

const NATURES: Record<
  ItemKind,
  {
    icon: LucideIcon
    label: string
    aide: string
    titre: string
    placeholder: string
  }
> = {
  document: {
    icon: FileText,
    label: 'Document',
    aide: 'Texte libre en Markdown',
    titre: 'Nouveau document',
    placeholder: 'Titre du document',
  },
  tracking_sheet: {
    icon: Table2,
    label: 'Feuille de suivi',
    aide: 'Tableau de vérifications périodiques',
    titre: 'Nouvelle feuille de suivi',
    placeholder: 'Titre de la feuille de suivi',
  },
  signature_sheet: {
    icon: PenLine,
    label: 'Feuille de signature',
    aide: 'Émargement daté',
    titre: 'Nouvelle feuille de signature',
    placeholder: 'Titre de la feuille de signature',
  },
  intercalaire: {
    icon: Bookmark,
    label: 'Intercalaire',
    aide: 'Page de séparation devant des documents externes',
    titre: 'Nouvel intercalaire',
    placeholder: "Titre de l'intercalaire",
  },
}

/**
 * Création d'un élément de chapitre en deux temps — portée de Registre
 * (`CreateItemDialog`) : choix de la nature, puis titre (+ description ou
 * périodicité). Mutation interne (`createItem`), invalidation de
 * `classeurKeys.all`, erreur inline. `onDone(kind, id)` après création.
 *
 * Le formulaire est remonté à chaque ouverture (`key`) : pas de `useEffect`
 * de remise à zéro.
 */
export function CreateItemDialog({
  open,
  onOpenChange,
  chapterId,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  chapterId: number
  onDone?: (kind: ItemKind, id: number) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        {open && (
          <CreateItemForm
            chapterId={chapterId}
            onCancel={() => onOpenChange(false)}
            onDone={(kind, id) => {
              onOpenChange(false)
              onDone?.(kind, id)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function CreateItemForm({
  chapterId,
  onCancel,
  onDone,
}: {
  chapterId: number
  onCancel: () => void
  onDone: (kind: ItemKind, id: number) => void
}) {
  const [kind, setKind] = useState<ItemKind | null>(null)
  // Champ VIDE au départ (le placeholder guide) : prérempli « Sans titre »,
  // une frappe donnait « Sans titreConsignes… ». Le repli `SANS_TITRE` ne
  // s'applique qu'à la soumission d'un titre vide (`construire`).
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [periodiciteId, setPeriodiciteId] = useState('')
  const periodicites = usePeriodicites()
  const invalider = useInvaliderClasseur()

  const mutation = useMutation({
    mutationFn: (item: ItemInput) => createItem(chapterId, item),
    onSuccess: async (id, item) => {
      await invalider()
      onDone(item.kind, id)
    },
  })

  const construire = (): ItemInput | null => {
    const t = title.trim() || SANS_TITRE
    const d = description.trim()
    switch (kind) {
      case 'document':
        return { kind, input: { title: t, description: d, content: '' } }
      case 'tracking_sheet': {
        const p = Number(periodiciteId)
        if (!p) return null
        return { kind, input: { title: t, periodicite_id: p } }
      }
      case 'signature_sheet':
        return {
          kind,
          input: { title: t, description: d, nombre: LIGNES_SIGNATURE_DEFAUT },
        }
      case 'intercalaire':
        return { kind, input: { title: t, description: d } }
      default:
        return null
    }
  }

  const valide = construire() !== null

  if (kind === null) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Nouvel élément</DialogTitle>
          <DialogDescription>
            Choisissez la nature de l'élément.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {ITEM_KINDS.map((k) => {
            const n = NATURES[k]
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <n.icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{n.label}</p>
                  <p className="text-xs text-muted-foreground">{n.aide}</p>
                </div>
              </button>
            )
          })}
        </div>
      </>
    )
  }

  const nature = NATURES[kind]
  const avecDescription = kind !== 'tracking_sheet'

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const item = construire()
        if (!item || mutation.isPending) return
        mutation.mutate(item)
      }}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setKind(null)}
            aria-label="Choisir une autre nature"
          >
            <ArrowLeft />
          </Button>
          <DialogTitle>{nature.titre}</DialogTitle>
        </div>
        <DialogDescription className="sr-only">
          Titre et réglages du nouvel élément.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        <Label htmlFor="create-item-title">Titre</Label>
        <Input
          id="create-item-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={nature.placeholder}
          autoFocus
          maxLength={200}
        />
      </div>

      {avecDescription && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="create-item-description">Description</Label>
          <Input
            id="create-item-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Facultatif"
            maxLength={1000}
          />
        </div>
      )}

      {kind === 'tracking_sheet' && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="create-item-periodicite">Périodicité</Label>
          {periodicites.isPending ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Select value={periodiciteId} onValueChange={setPeriodiciteId}>
              <SelectTrigger id="create-item-periodicite" className="w-full">
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
      )}

      {mutation.isError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>
            {messageErreur(mutation.error, 'Création impossible')}
          </AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" disabled={!valide || mutation.isPending}>
          {mutation.isPending && <Loader2 className="animate-spin" />}
          Créer
        </Button>
      </DialogFooter>
    </form>
  )
}
