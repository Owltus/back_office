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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { FileDown, FileUp, Lock, Plus, Trash2, Upload } from 'lucide-react'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import { ActionCard } from '#/components/classeur/ActionCard.tsx'
import { ClasseurDialog } from '#/components/classeur/dialogs/ClasseurDialog.tsx'
import {
  useClasseurs,
  useInvaliderClasseur,
  useReorderClasseurs,
} from '#/components/classeur/hooks/useClasseur.ts'
import { ConfirmDialog } from '#/components/shared/ConfirmDialog.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { FormeClasseurListe } from '#/components/shared/skeleton/PageShapes.tsx'
import {
  peutModifierClasseur,
  peutReordonnerClasseurs,
} from '#/lib/classeur/droits.ts'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { getIcon } from '#/lib/classeur/naming.ts'
import { softDeleteClasseur } from '#/lib/classeur/service.ts'
import type { DbClasseur } from '#/lib/classeur/types.ts'
import { MAX_JSON_BYTES, fileTooLarge } from '#/lib/shared/files.ts'
import { cn } from '#/lib/utils.ts'

/**
 * Liste des classeurs — ORGANISÉE COMME DANS REGISTRE (`ClasseurListPage`,
 * décision utilisateur du 2026-09-26 : « plus comme d'origine ») : une
 * colonne centrée de 28 rem, sans titre de page — deux cartes pointillées
 * côte à côte (« Nouveau classeur », « Importer classeur » qui accepte un
 * fichier déposé : « Déposez ici »), un séparateur, puis les classeurs en
 * liste verticale réordonnable (poignée = la carte entière, droit
 * `ecriture`), chaque carte révélant au survol Exporter en JSON et
 * Supprimer (douce, confirmation).
 *
 * DROITS PAR CLASSEUR (modèle Affichage, `lib/classeur/droits.ts`) : le
 * niveau écriture crée des classeurs et ne modifie/supprime que LES SIENS
 * (les autres portent un cadenas « lecture seule ») ; gestion tout.
 * L'ordre de la liste est partagé : réordonnable par gestion, ou par
 * écriture quand tous les classeurs sont à soi.
 *
 * Import et export JSON sont branchés par `ClasseurListActions` :
 *   - `onImporterJson(file)` : fichier choisi (carte Importer) ou déposé
 *     sur elle, déjà borné par `MAX_JSON_BYTES`. Absent : carte non rendue.
 *   - `onExporterJson(classeur)` : bouton d'export de chaque carte. Absent :
 *     bouton non rendu.
 */
export function ClasseurList({
  onImporterJson,
  onExporterJson,
}: {
  onImporterJson?: (file: File) => void | Promise<void>
  onExporterJson?: (classeur: DbClasseur) => void | Promise<void>
}) {
  const { can, user } = useAuth()
  const canWrite = can('classeur', 'ecriture')
  const canManage = can('classeur', 'gestion')
  const niveaux = { ecriture: canWrite, gestion: canManage }
  const navigate = useNavigate()
  const classeurs = useClasseurs()
  const reorder = useReorderClasseurs()
  const invalider = useInvaliderClasseur()
  const liste = classeurs.data ?? []
  const peutReordonner = peutReordonnerClasseurs(niveaux, liste, user?.id)

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

  // Import JSON : sélecteur de fichier (clic sur la carte) ou dépôt sur la
  // carte Importer, comme dans Registre. On ne réagit qu'aux fichiers, pas
  // aux glissers internes (dnd-kit).
  const importActif = canWrite && onImporterJson !== undefined
  const inputRef = useRef<HTMLInputElement>(null)
  const [survolDepot, setSurvolDepot] = useState(false)

  function recevoirFichier(file: File | null | undefined) {
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

  const surDragOver = (e: DragEvent<HTMLButtonElement>) => {
    if (!importActif || !e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    if (!survolDepot) setSurvolDepot(true)
  }
  const surDragLeave = () => setSurvolDepot(false)
  const surDrop = (e: DragEvent<HTMLButtonElement>) => {
    if (!importActif) return
    e.preventDefault()
    setSurvolDepot(false)
    recevoirFichier(e.dataTransfer.files.item(0))
  }

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    recevoirFichier(e.target.files?.item(0))
    e.target.value = ''
  }

  const erreurEcriture = reorder.isError
    ? messageErreur(reorder.error, 'Ordre non enregistré')
    : suppression.isError
      ? messageErreur(suppression.error, 'Suppression impossible')
      : erreurImport

  return (
    <div className="flex flex-1 items-center justify-center py-6">
      <div className="flex w-full max-w-md flex-col gap-4">
        {importActif && (
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={onInputChange}
          />
        )}

        {/* Nouveau classeur + Importer, côte à côte (droit écriture) */}
        {canWrite && (
          <div className="grid grid-cols-2 gap-3">
            <ActionCard
              icon={Plus}
              title="Nouveau classeur"
              subtitle="Créer un classeur vierge"
              onClick={() => setCreateOpen(true)}
              dashed
            />
            {importActif && (
              <ActionCard
                icon={survolDepot ? Upload : FileDown}
                title={survolDepot ? 'Déposez ici' : 'Importer classeur'}
                subtitle={survolDepot ? undefined : 'Depuis un fichier .json'}
                onClick={() => inputRef.current?.click()}
                dashed
                className={
                  survolDepot ? 'border-primary bg-primary/5' : undefined
                }
                onDragEnter={surDragOver}
                onDragOver={surDragOver}
                onDragLeave={surDragLeave}
                onDrop={surDrop}
              />
            )}
          </div>
        )}

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
          <FormeClasseurListe actions={false} />
        ) : classeurs.isSuccess && liste.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            Aucun classeur.
            {canWrite ? ' Créez-en un pour commencer.' : ''}
          </p>
        ) : (
          <>
            {canWrite && <div className="border-b border-border" />}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={liste.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                {liste.map((c) => (
                  <ClasseurCard
                    key={c.id}
                    classeur={c}
                    canDrag={peutReordonner}
                    canModify={peutModifierClasseur(niveaux, c, user?.id)}
                    lectureSeule={
                      canWrite && !peutModifierClasseur(niveaux, c, user?.id)
                    }
                    onDelete={() => setASupprimer(c)}
                    onExport={
                      onExporterJson ? () => void onExporterJson(c) : undefined
                    }
                  />
                ))}
              </SortableContext>
            </DndContext>
          </>
        )}
      </div>

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
            ? `Supprimer le classeur « ${aSupprimer.name} » et tout son contenu (chapitres, documents, fiches de suivi et de signature) ?`
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

/**
 * Carte d'un classeur (Registre : `SortableClasseurCard`). La carte entière
 * est la poignée de glisser (activation à 5 px, le clic navigue). Les
 * actions vivent HORS du lien (jamais de bouton dans un `<a>`), révélées
 * au survol ou au focus.
 */
function ClasseurCard({
  classeur,
  canDrag,
  canModify,
  lectureSeule,
  onDelete,
  onExport,
}: {
  classeur: DbClasseur
  /** Peut réordonner la liste (la carte entière est la poignée). */
  canDrag: boolean
  /** Peut modifier CE classeur (suppression douce). */
  canModify: boolean
  /** A le niveau écriture mais pas sur ce classeur : cadenas. */
  lectureSeule: boolean
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
    disabled: !canDrag,
    data: {
      type: 'classeur',
      classeurId: classeur.id,
      title: classeur.name,
      icon: classeur.icon,
    },
  })
  const actions = (onExport !== undefined ? 1 : 0) + (canModify ? 1 : 0)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...(canDrag ? listeners : {})}
      className={cn(
        'group relative',
        canDrag && 'touch-none',
        isDragging && 'z-50 opacity-30',
      )}
    >
      <Link
        to="/classeur/$classeurId"
        params={{ classeurId: String(classeur.id) }}
        className={cn(
          'flex w-full items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 text-left transition-colors hover:bg-accent',
          actions === 2 && 'pr-20',
          actions === 1 && 'pr-12',
        )}
      >
        <Icon className="size-5 shrink-0 text-muted-foreground" />
        <div className="flex min-h-10 min-w-0 flex-1 flex-col justify-center gap-0.5">
          <span className="truncate text-sm font-medium">{classeur.name}</span>
          {sousTitre !== '' && (
            <span className="truncate text-xs text-muted-foreground">
              {sousTitre}
            </span>
          )}
        </div>
        {lectureSeule && (
          <Tip label="Lecture seule : classeur d’un autre compte">
            <Lock
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-label="Lecture seule"
            />
          </Tip>
        )}
      </Link>

      {actions > 0 && (
        <div className="absolute inset-y-0 right-3 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {onExport && (
            <Tip label="Exporter en JSON">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Exporter le classeur ${classeur.name} en JSON`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onExport}
              >
                <FileUp />
              </Button>
            </Tip>
          )}
          {canModify && (
            <Tip label="Supprimer">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Supprimer le classeur ${classeur.name}`}
                className="hover:bg-destructive/10 hover:text-destructive"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onDelete}
              >
                <Trash2 />
              </Button>
            </Tip>
          )}
        </div>
      )}
    </div>
  )
}
