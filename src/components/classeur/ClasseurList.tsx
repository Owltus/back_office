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
import { FileUp, GripVertical, Plus, Trash2, Upload } from 'lucide-react'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import { ClasseurDialog } from '#/components/classeur/dialogs/ClasseurDialog.tsx'
import { DropOverlay } from '#/components/classeur/DropZone.tsx'
import {
  useClasseurs,
  useInvaliderClasseur,
  useReorderClasseurs,
} from '#/components/classeur/hooks/useClasseur.ts'
import { ButtonGroup } from '#/components/shared/ButtonGroup.tsx'
import { ConfirmDialog } from '#/components/shared/ConfirmDialog.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { FormeClasseurListe } from '#/components/shared/skeleton/PageShapes.tsx'
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
 * branchés par `ClasseurListActions` via deux points d'extension :
 *
 *   - `onImporterJson(file)` : reçoit le fichier `.json` choisi (bouton
 *     Importer de l'en-tête) ou déposé n'importe où sur la page (voile
 *     `DropOverlay` pendant le geste), déjà borné par `MAX_JSON_BYTES`.
 *     Absent : ni bouton ni zone de dépôt.
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

  // Import JSON : sélecteur de fichier (bouton de l'en-tête) ou dépôt sur la
  // page entière. Le compteur d'entrées/sorties évite le clignotement du
  // voile quand le curseur passe d'un enfant à l'autre.
  const importActif = canWrite && onImporterJson !== undefined
  const inputRef = useRef<HTMLInputElement>(null)
  const [survol, setSurvol] = useState(false)
  const compteur = useRef(0)

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

  const dragProps = importActif
    ? {
        onDragEnter: (e: DragEvent) => {
          e.preventDefault()
          compteur.current += 1
          setSurvol(true)
        },
        onDragOver: (e: DragEvent) => e.preventDefault(),
        onDragLeave: (e: DragEvent) => {
          e.preventDefault()
          compteur.current -= 1
          if (compteur.current === 0) setSurvol(false)
        },
        onDrop: (e: DragEvent) => {
          e.preventDefault()
          compteur.current = 0
          setSurvol(false)
          recevoirFichier(
            Array.from(e.dataTransfer.files).find((f) =>
              f.name.toLowerCase().endsWith('.json'),
            ),
          )
        },
      }
    : {}

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    recevoirFichier(e.target.files?.[0])
    e.target.value = ''
  }

  const erreurEcriture = reorder.isError
    ? messageErreur(reorder.error, 'Ordre non enregistré')
    : suppression.isError
      ? messageErreur(suppression.error, 'Suppression impossible')
      : erreurImport

  return (
    <div
      className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4"
      {...dragProps}
    >
      {survol && <DropOverlay label="Déposez un export .json ici" />}

      {importActif && (
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={onInputChange}
        />
      )}

      <PageHeader
        title="Classeurs"
        actions={
          canWrite ? (
            <>
              <Tip label="Créer un classeur">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus />
                  Nouveau classeur
                </Button>
              </Tip>
              {importActif && (
                <ButtonGroup>
                  <Tip label="Importer un classeur depuis un export .json">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Importer un classeur depuis un export .json"
                      onClick={() => inputRef.current?.click()}
                    >
                      <Upload />
                    </Button>
                  </Tip>
                </ButtonGroup>
              )}
            </>
          ) : undefined
        }
      />

      {classeurs.isError && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {messageErreur(classeurs.error, 'Classeurs indisponibles')}
        </div>
      )}

      {erreurEcriture && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {erreurEcriture}
        </div>
      )}

      {classeurs.isPending ? (
        /* DÉLÈGUE à `FormeClasseurListe` : une seule silhouette par page. */
        <FormeClasseurListe />
      ) : classeurs.isSuccess && liste.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
          <p className="text-sm">
            Aucun classeur pour le moment.
            {importActif && ' Déposez un export .json pour en importer un.'}
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
            </div>
          </SortableContext>
        </DndContext>
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
