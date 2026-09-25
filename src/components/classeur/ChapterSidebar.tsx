import { useCallback, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertCircle, GripVertical, Home, Library } from 'lucide-react'

import { useAuth } from '#/components/auth/AuthContext.tsx'
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
import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { getIcon } from '#/lib/classeur/naming.ts'
import type { DbChapter } from '#/lib/classeur/types.ts'
import { cn } from '#/lib/utils.ts'

const LIEN =
  'flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground'
const LIEN_ACTIF =
  'flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm bg-primary/10 font-medium text-primary transition-colors'

/**
 * Colonne « chapitres du classeur » — la partie liste de la `Sidebar` de
 * Registre (Paramètres, À propos et thème ne sont pas portés). Accueil du
 * classeur en tête, chapitres réordonnables au glisser-déposer (poignée
 * visible avec le droit `ecriture`), retour à la liste des classeurs en pied.
 *
 * Rendue sur grand écran dans le layout `/classeur/$classeurId`, et dans un
 * tiroir (`ui/sheet`) sous `lg` : `onNavigate` sert alors à refermer le tiroir.
 *
 * Le glisser-déposer passe par le `DndProvider` du layout : chaque chapitre
 * est aussi une CIBLE DE DÉPÔT pour un élément de la page chapitre
 * (`chapterDropId`), mise en évidence quand elle est survolée.
 */
export function ChapterSidebar({
  classeurId,
  onNavigate,
}: {
  classeurId: number
  onNavigate?: () => void
}) {
  const { can } = useAuth()
  const canWrite = can('classeur', 'ecriture')
  const chapitres = useChapters(classeurId)
  const reorder = useReorderChapters(classeurId)
  const { registerHandler, unregisterHandler } = useDndRegistry()
  const liste = chapitres.data ?? []

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
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-1 border-b border-border p-2">
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
        className="flex flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto p-2"
      >
        {chapitres.isPending ? (
          <div className="flex flex-col gap-1" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2">
                <Skeleton className="size-4 rounded-sm" />
                <Skeleton className="h-3.5 w-32" />
              </div>
            ))}
          </div>
        ) : chapitres.isError ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>
              {messageErreur(chapitres.error, 'Chapitres indisponibles')}
            </AlertDescription>
          </Alert>
        ) : liste.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
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
              />
            ))}
          </SortableContext>
        )}

        {reorder.isError && (
          <Alert variant="destructive" className="mt-2">
            <AlertCircle />
            <AlertDescription>
              {messageErreur(reorder.error, 'Ordre non enregistré')}
            </AlertDescription>
          </Alert>
        )}
      </nav>

      <div className="mt-auto border-t border-border p-2">
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
}: {
  chapter: DbChapter
  classeurId: number
  canWrite: boolean
  onNavigate?: () => void
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

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'group flex items-center rounded-lg',
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
          className="mr-1 shrink-0 cursor-grab touch-none rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent focus-visible:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
      )}
    </div>
  )
}
