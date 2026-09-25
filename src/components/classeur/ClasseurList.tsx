import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  AlertCircle,
  FileUp,
  GripVertical,
  NotebookTabs,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import { ClasseurDialog } from '#/components/classeur/dialogs/ClasseurDialog.tsx'
import {
  useClasseurs,
  useInvaliderClasseur,
  useReorderClasseurs,
} from '#/components/classeur/hooks/useClasseur.ts'
import { ConfirmDialog } from '#/components/shared/ConfirmDialog.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { getIcon } from '#/lib/classeur/naming.ts'
import { softDeleteClasseur } from '#/lib/classeur/service.ts'
import type { DbClasseur } from '#/lib/classeur/types.ts'
import { MAX_JSON_BYTES, fileTooLarge } from '#/lib/shared/files.ts'
import { cn } from '#/lib/utils.ts'

const CARTE =
  'flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 text-left transition-colors hover:bg-accent'

/**
 * Liste des classeurs — portée de Registre (`ClasseurListPage`). Grille de
 * cartes réordonnables (poignée, droit `ecriture`), création (dialogue),
 * suppression douce (droit `gestion`, confirmation), import et export JSON
 * confiés à l'étape 5/6 par deux points d'extension :
 *
 *   - `onImporterJson(file)` : reçoit le fichier `.json` choisi ou déposé,
 *     déjà borné par `MAX_JSON_BYTES`. Absent : la carte d'import est grisée
 *     avec l'infobulle « Bientôt disponible ».
 *   - `onExporterJson(classeur)` : bouton d'export sur chaque carte. Absent :
 *     bouton non rendu.
 */
export function ClasseurList({
  onImporterJson,
  onExporterJson,
}: {
  onImporterJson?: (file: File) => void | Promise<void>
  onExporterJson?: (classeur: DbClasseur) => void | Promise<void>
}) {
  const { can } = useAuth()
  const canWrite = can('classeur', 'ecriture')
  const canManage = can('classeur', 'gestion')
  const navigate = useNavigate()
  const classeurs = useClasseurs()
  const reorder = useReorderClasseurs()
  const invalider = useInvaliderClasseur()
  const liste = classeurs.data ?? []

  const [createOpen, setCreateOpen] = useState(false)
  const [aSupprimer, setASupprimer] = useState<DbClasseur | null>(null)
  const [erreurImport, setErreurImport] = useState<string | null>(null)

  const suppression = useMutation({
    mutationFn: (id: number) => softDeleteClasseur(id),
    onSuccess: () => invalider(),
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = liste.map((c) => c.id)
    const oldIndex = ids.indexOf(Number(active.id))
    const newIndex = ids.indexOf(Number(over.id))
    if (oldIndex === -1 || newIndex === -1) return
    const [moved] = ids.splice(oldIndex, 1)
    ids.splice(newIndex, 0, moved)
    reorder.mutate(ids)
  }

  function recevoirFichier(file: File | undefined) {
    if (!file || !onImporterJson) return
    const trop = fileTooLarge(file, MAX_JSON_BYTES)
    if (trop) {
      setErreurImport(trop)
      return
    }
    if (!file.name.toLowerCase().endsWith('.json')) {
      setErreurImport(`Fichier attendu : un export .json (${file.name}).`)
      return
    }
    setErreurImport(null)
    void onImporterJson(file)
  }

  const erreurEcriture = reorder.isError
    ? messageErreur(reorder.error, 'Ordre non enregistré')
    : suppression.isError
      ? messageErreur(suppression.error, 'Suppression impossible')
      : erreurImport

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4">
      <PageHeader
        title="Classeurs"
        actions={
          canWrite ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus />
              Nouveau classeur
            </Button>
          ) : undefined
        }
      />

      {classeurs.isError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>
            {messageErreur(classeurs.error, 'Classeurs indisponibles')}
          </AlertDescription>
        </Alert>
      )}

      {erreurEcriture && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{erreurEcriture}</AlertDescription>
        </Alert>
      )}

      {classeurs.isPending ? (
        <div
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          aria-hidden="true"
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4"
            >
              <Skeleton className="size-5 rounded-sm" />
              <div className="flex-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-2 h-3 w-28" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={liste.map((c) => c.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {liste.map((c) => (
                <ClasseurCard
                  key={c.id}
                  classeur={c}
                  canWrite={canWrite}
                  canManage={canManage}
                  onDelete={() => setASupprimer(c)}
                  onExport={
                    onExporterJson ? () => void onExporterJson(c) : undefined
                  }
                />
              ))}
              {canWrite && (
                <CarteImport
                  onFichier={onImporterJson ? recevoirFichier : undefined}
                />
              )}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {classeurs.isSuccess && liste.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-4 py-16 text-center">
          <NotebookTabs className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Aucun classeur pour le moment.
          </p>
          {canWrite && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreateOpen(true)}
            >
              <Plus />
              Créer un classeur
            </Button>
          )}
        </div>
      )}

      <ClasseurDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onDone={(id) =>
          navigate({
            to: '/classeur/$classeurId',
            params: { classeurId: String(id) },
          })
        }
      />

      <ConfirmDialog
        open={aSupprimer !== null}
        onOpenChange={(open) => {
          if (!open) setASupprimer(null)
        }}
        title="Supprimer le classeur"
        description={
          aSupprimer
            ? `Le classeur "${aSupprimer.name}" et tous ses chapitres ne seront plus accessibles.`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          if (aSupprimer) suppression.mutate(aSupprimer.id)
        }}
      />
    </div>
  )
}

function ClasseurCard({
  classeur,
  canWrite,
  canManage,
  onDelete,
  onExport,
}: {
  classeur: DbClasseur
  canWrite: boolean
  canManage: boolean
  onDelete: () => void
  onExport?: () => void
}) {
  const Icon = getIcon(classeur.icon)
  const sousTitre = [classeur.etablissement, classeur.etablissement_complement]
    .filter((s) => s.trim() !== '')
    .join(' · ')
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: classeur.id,
    disabled: !canWrite,
    data: {
      type: 'classeur',
      classeurId: classeur.id,
      title: classeur.name,
      icon: classeur.icon,
    },
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('group relative', isDragging && 'z-50 opacity-40')}
    >
      <Link
        to="/classeur/$classeurId"
        params={{ classeurId: String(classeur.id) }}
        className={cn(CARTE, 'min-h-[4.5rem] w-full pr-24')}
      >
        <Icon className="size-5 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{classeur.name}</span>
          {sousTitre !== '' && (
            <span className="truncate text-xs text-muted-foreground">
              {sousTitre}
            </span>
          )}
        </div>
      </Link>

      {/* Actions hors du lien : jamais de bouton dans un <a>. */}
      <div className="absolute inset-y-0 right-3 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {onExport && (
          <Tip label="Exporter en JSON">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Exporter le classeur ${classeur.name} en JSON`}
              onClick={onExport}
            >
              <FileUp />
            </Button>
          </Tip>
        )}
        {canManage && (
          <Tip label="Supprimer">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Supprimer le classeur ${classeur.name}`}
              className="hover:bg-destructive/10 hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 />
            </Button>
          </Tip>
        )}
        {canWrite && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Déplacer le classeur ${classeur.name}`}
            className="cursor-grab touch-none rounded-md p-1.5 text-muted-foreground hover:bg-accent active:cursor-grabbing"
          >
            <GripVertical className="size-4" />
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Carte « Importer un classeur » : clic = sélecteur de fichier, dépôt = même
 * chemin. Sans `onFichier`, grisée avec l'infobulle « Bientôt disponible ».
 */
function CarteImport({
  onFichier,
}: {
  onFichier?: (file: File | undefined) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [survol, setSurvol] = useState(false)
  const compteur = useRef(0)

  if (!onFichier) {
    return (
      <Tip label="Bientôt disponible">
        <span tabIndex={0} className="block">
          <div
            aria-disabled="true"
            className={cn(
              CARTE,
              'min-h-[4.5rem] cursor-not-allowed border-dashed opacity-50 hover:bg-card',
            )}
          >
            <Upload className="size-5 shrink-0 text-muted-foreground" />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Importer un classeur</span>
              <span className="text-xs text-muted-foreground">
                Depuis un export .json
              </span>
            </div>
          </div>
        </span>
      </Tip>
    )
  }

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault()
    compteur.current += 1
    setSurvol(true)
  }
  const onDragLeave = (e: DragEvent) => {
    e.preventDefault()
    compteur.current -= 1
    if (compteur.current === 0) setSurvol(false)
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    compteur.current = 0
    setSurvol(false)
    onFichier(
      Array.from(e.dataTransfer.files).find((f) => f.name.endsWith('.json')),
    )
  }
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    onFichier(e.target.files?.[0])
    e.target.value = ''
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={onChange}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragEnter={onDragEnter}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          CARTE,
          'min-h-[4.5rem] border-dashed',
          survol && 'border-primary bg-primary/5',
        )}
      >
        <Upload className="size-5 shrink-0 text-muted-foreground" />
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">
            {survol ? 'Déposer ici' : 'Importer un classeur'}
          </span>
          {!survol && (
            <span className="text-xs text-muted-foreground">
              Depuis un export .json
            </span>
          )}
        </div>
      </button>
    </>
  )
}
