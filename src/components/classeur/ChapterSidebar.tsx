import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Home, Library, Pencil, Trash2 } from 'lucide-react'

import {
  chapterDropId,
  estItemDrag,
  parseChapterDropId,
  useDndRegistry,
} from '#/components/classeur/dnd/useDndRegistry.ts'
import {
  useChapters,
  useReorderChapters,
} from '#/components/classeur/hooks/useClasseur.ts'
import { useDroitsClasseur } from '#/components/classeur/hooks/useDroitsClasseur.ts'
import { ChapterDialog } from '#/components/classeur/dialogs/ChapterDialog.tsx'
import { SuppressionChapitreDialog } from '#/components/classeur/dialogs/SuppressionChapitreDialog.tsx'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '#/components/ui/context-menu.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { getIcon } from '#/lib/classeur/naming.ts'
import type { DbChapter } from '#/lib/classeur/types.ts'
import { cn } from '#/lib/utils.ts'

const LIEN =
  'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground'
const LIEN_ACTIF =
  'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm bg-accent font-medium text-accent-foreground transition-colors'

/**
 * Colonne « chapitres du classeur » — la partie liste de la `Sidebar` de
 * Registre (Paramètres, À propos et thème ne sont pas portés). Accueil du
 * classeur en tête, chapitres réordonnables au glisser-déposer (poignée
 * visible au survol, droit `ecriture`), retour à la liste des classeurs en
 * pied.
 *
 * Sans chrome propre : le layout `/classeur/$classeurId` la pose dans une
 * carte (`rounded-xl border bg-card`, collante) sur grand écran, et dans un
 * tiroir (`ui/sheet`) sous `lg` — `onNavigate` sert alors à le refermer.
 *
 * Le glisser-déposer passe par le `DndProvider` du layout : chaque chapitre
 * est aussi une CIBLE DE DÉPÔT pour un élément de la page chapitre
 * (`chapterDropId`), mise en évidence quand elle est survolée.
 *
 * Clic droit sur un chapitre (droit d'écriture sur le classeur, demande
 * utilisateur du 2026-09-28) : Modifier (le `ChapterDialog` de la barre de
 * la page chapitre) et Supprimer (`SuppressionChapitreDialog`, avec
 * sauvegarde avant suppression).
 */
export function ChapterSidebar({
  classeurId,
  onNavigate,
}: {
  classeurId: number
  onNavigate?: () => void
}) {
  const { canWrite } = useDroitsClasseur(classeurId)
  const chapitres = useChapters(classeurId)
  const reorder = useReorderChapters(classeurId)
  const { registerHandler, unregisterHandler } = useDndRegistry()
  const liste = chapitres.data ?? []
  const [aModifier, setAModifier] = useState<DbChapter | null>(null)
  const [aSupprimer, setASupprimer] = useState<DbChapter | null>(null)
  const navigate = useNavigate()
  const routeParams: Record<string, string | undefined> = useParams({
    strict: false,
  })

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const de = parseChapterDropId(active.id)
      const vers = parseChapterDropId(over.id)
      if (de === null || vers === null) return
      const ids = liste.map((c) => c.id)
      const oldIndex = ids.indexOf(de)
      const newIndex = ids.indexOf(vers)
      if (oldIndex === -1 || newIndex === -1) return
      const [moved] = ids.splice(oldIndex, 1)
      ids.splice(newIndex, 0, moved)
      reorder.mutate(ids)
    },
    [liste, reorder],
  )

  // Abonnement au registre partagé (pas une lecture de données).
  useEffect(() => {
    registerHandler('chapter', handleDragEnd)
    return () => unregisterHandler('chapter')
  }, [registerHandler, unregisterHandler, handleDragEnd])

  const params = { classeurId: String(classeurId) }

  return (
    <div className="flex min-h-0 flex-1 flex-col p-2">
      <div className="flex flex-col gap-0.5 border-b border-border pb-2">
        <Link
          to="/classeur/$classeurId"
          params={params}
          activeOptions={{ exact: true }}
          onClick={onNavigate}
          className={LIEN}
          activeProps={{ className: LIEN_ACTIF }}
        >
          <Home className="size-4 shrink-0" />
          <span className="truncate">Accueil du classeur</span>
        </Link>
      </div>

      <nav
        aria-label="Chapitres du classeur"
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto py-2"
      >
        {chapitres.isPending ? (
          <div className="flex flex-col gap-0.5" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                <Skeleton className="size-4 rounded-sm" />
                <Skeleton className="h-3.5 w-32" />
              </div>
            ))}
          </div>
        ) : chapitres.isError ? (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {messageErreur(chapitres.error, 'Chapitres indisponibles')}
          </p>
        ) : liste.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            Aucun chapitre pour le moment.
          </p>
        ) : (
          <SortableContext
            items={liste.map((c) => chapterDropId(c.id))}
            strategy={verticalListSortingStrategy}
          >
            {liste.map((c) => (
              <ChapterNavItem
                key={c.id}
                chapter={c}
                classeurId={classeurId}
                canWrite={canWrite}
                onNavigate={onNavigate}
                onModifier={setAModifier}
                onSupprimer={setASupprimer}
              />
            ))}
          </SortableContext>
        )}

        {reorder.isError && (
          <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {messageErreur(reorder.error, 'Ordre non enregistré')}
          </p>
        )}
      </nav>

      <ChapterDialog
        open={aModifier !== null}
        onOpenChange={(open) => {
          if (!open) setAModifier(null)
        }}
        classeurId={classeurId}
        chapter={aModifier}
      />
      <SuppressionChapitreDialog
        chapter={aSupprimer}
        onClose={() => setASupprimer(null)}
        onSupprime={(c) => {
          // On était sur la page (ou un élément) du chapitre supprimé.
          if (routeParams.chapterId === String(c.id)) {
            void navigate({ to: '/classeur/$classeurId', params })
          }
        }}
      />

      <div className="mt-auto border-t border-border pt-2">
        <Link to="/classeur" onClick={onNavigate} className={LIEN}>
          <Library className="size-4 shrink-0" />
          <span className="truncate">Tous les classeurs</span>
        </Link>
      </div>
    </div>
  )
}

function ChapterNavItem({
  chapter,
  classeurId,
  canWrite,
  onNavigate,
  onModifier,
  onSupprimer,
}: {
  chapter: DbChapter
  classeurId: number
  canWrite: boolean
  onNavigate?: () => void
  onModifier: (chapter: DbChapter) => void
  onSupprimer: (chapter: DbChapter) => void
}) {
  const Icon = getIcon(chapter.icon)
  const dropId = chapterDropId(chapter.id)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: dropId,
    disabled: !canWrite,
    data: {
      type: 'chapter',
      chapterId: chapter.id,
      label: chapter.label,
      icon: chapter.icon,
    },
  })

  // Cible de dépôt d'un élément de chapitre en cours de glisser.
  const { activeDragType, activeOverId } = useDndRegistry()
  const cible = estItemDrag(activeDragType) && activeOverId === dropId

  const ligne = (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'group flex items-center rounded-md',
        isDragging && 'z-50 opacity-40',
        cible && 'classeur-drop-over',
      )}
    >
      <Link
        to="/classeur/$classeurId/$chapterId"
        params={{
          classeurId: String(classeurId),
          chapterId: String(chapter.id),
        }}
        onClick={onNavigate}
        className={LIEN}
        activeProps={{ className: LIEN_ACTIF }}
      >
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{chapter.label}</span>
      </Link>
      {canWrite && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Déplacer le chapitre ${chapter.label}`}
          className="mr-0.5 shrink-0 cursor-grab touch-none rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent focus-visible:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
      )}
    </div>
  )

  // Lecture seule : pas de menu (le clic droit du navigateur reste).
  if (!canWrite) return ligne
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{ligne}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={() => onModifier(chapter)}>
          <Pencil />
          Modifier le chapitre
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onSelect={() => onSupprimer(chapter)}
        >
          <Trash2 />
          Supprimer le chapitre…
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
