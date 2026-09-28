import { useMemo } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, FileDown, Pencil, Printer, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { A4Miniature } from '#/components/classeur/cards/A4Miniature.tsx'
import {
  CLASSES_CARTE_GLISSABLE,
  neDemarrePasDeGlisser,
} from '#/components/classeur/dnd/useCapteursClasseur.ts'
import type { ItemDragData } from '#/components/classeur/dnd/useDndRegistry.ts'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { cleRef } from '#/lib/classeur/ordre.ts'
import { titreOuDefaut } from '#/lib/classeur/sommaire.ts'
import type { ItemKind } from '#/lib/classeur/types.ts'
import { cn } from '#/lib/utils.ts'

/** Route de la page de détail de chaque nature (littéraux : typage du routeur). */
const ROUTE_DETAIL = {
  document: '/classeur/$classeurId/$chapterId/document/$id',
  tracking_sheet: '/classeur/$classeurId/$chapterId/suivi/$id',
  signature_sheet: '/classeur/$classeurId/$chapterId/signature/$id',
  intercalaire: '/classeur/$classeurId/$chapterId/intercalaire/$id',
} as const satisfies Record<ItemKind, string>

/** Props communes aux quatre cartes (posées par `ChapterBoard`). */
export interface ItemCardCommonProps {
  classeurId: number
  chapterId: number
  chapterName?: string
  classeurName?: string
  establishment?: string
  /** Droit `ecriture` : glisser, modifier, supprimer. */
  canWrite: boolean
  /** Glisser désactivé (recherche en cours, sélection). */
  sortableDisabled?: boolean
  selectionMode?: boolean
  /** Un glisser est en cours en mode sélection : les sélectionnés s'estompent. */
  selectionDragging?: boolean
  isSelected?: boolean
  onToggleSelect?: () => void
  onPrint?: () => void
  onEdit?: () => void
  onDelete?: () => void
}

interface ItemCardShellProps extends ItemCardCommonProps {
  kind: ItemKind
  id: number
  title: string
  icon: LucideIcon
  /** Export Markdown (documents seulement). */
  onExportMarkdown?: () => void
  /** La page A4 réelle, rendue en miniature. */
  children: ReactNode
}

/**
 * Enveloppe commune des cartes d'élément d'un chapitre — factorise les
 * quatre cartes de Registre (`DocumentCard`, `TrackingSheetCard`,
 * `SignatureSheetCard`, `IntercalaireCard`), qui ne différaient que par
 * l'icône, la miniature et le bouton « Exporter Markdown ».
 *
 * La carte est un `useSortable` (identifiant `cleRef`, données
 * `ItemDragData`) : elle se réordonne dans la grille et se dépose sur un
 * chapitre de la colonne. Clic = page de détail ; Ctrl/Cmd + clic ou clic en
 * mode sélection = (dé)sélection.
 */
export function ItemCardShell({
  kind,
  id,
  title,
  icon: Icon,
  classeurId,
  chapterId,
  canWrite,
  sortableDisabled = false,
  selectionMode = false,
  selectionDragging = false,
  isSelected = false,
  onToggleSelect,
  onPrint,
  onEdit,
  onDelete,
  onExportMarkdown,
  children,
}: ItemCardShellProps) {
  const navigate = useNavigate()
  const titre = titreOuDefaut(title)

  const dragData = useMemo<ItemDragData>(
    () => ({ type: kind, itemId: id, title, sourceChapterId: chapterId }),
    [kind, id, title, chapterId],
  )

  const glisserDesactive = !canWrite || sortableDisabled
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: cleRef(kind, id),
    data: dragData,
    disabled: glisserDesactive,
  })

  // En mode sélection, la grille ne se réordonne pas : pas de translation.
  const style = selectionMode
    ? undefined
    : { transform: CSS.Transform.toString(transform), transition }

  const handleClick = (e: MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      onToggleSelect?.()
      return
    }
    if (selectionMode) {
      onToggleSelect?.()
      return
    }
    void navigate({
      to: ROUTE_DETAIL[kind],
      params: {
        classeurId: String(classeurId),
        chapterId: String(chapterId),
        id: String(id),
      },
    })
  }

  const stop = (fn?: () => void) => (e: MouseEvent) => {
    e.stopPropagation()
    fn?.()
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      onKeyDown={(e) => {
        // Glisser actif : Entrée/Espace appartiennent au capteur clavier de
        // dnd-kit. Sinon, Entrée ouvre la page de détail.
        if (!glisserDesactive) {
          listeners?.onKeyDown(e)
          return
        }
        if (e.key === 'Enter') handleClick(e as unknown as MouseEvent)
      }}
      aria-label={titre}
      aria-pressed={selectionMode ? isSelected : undefined}
      className={cn(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        !glisserDesactive && CLASSES_CARTE_GLISSABLE,
        !selectionMode && isDragging && 'z-50 opacity-30',
        selectionDragging && isSelected && 'opacity-30',
        isSelected && 'border-primary bg-primary/5 ring-1 ring-primary/20',
      )}
    >
      {/* En-tête : icône, titre, case de sélection */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span
          className="min-w-0 flex-1 truncate text-sm font-medium"
          title={titre}
        >
          {titre}
        </span>
        <button
          type="button"
          className={cn(
            'flex size-4 shrink-0 items-center justify-center rounded border transition-all',
            isSelected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-muted-foreground/30 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100',
            selectionMode && 'opacity-100',
            // Au doigt : visible (pas de survol) et assez grande à toucher.
            'pointer-coarse:size-6',
          )}
          {...neDemarrePasDeGlisser}
          onClick={stop(onToggleSelect)}
          aria-label={isSelected ? 'Désélectionner' : 'Sélectionner'}
          aria-pressed={isSelected}
        >
          {isSelected && <Check className="size-3" />}
        </button>
      </div>

      {/* Miniature + actions en surimpression */}
      <div className="relative">
        <A4Miniature>{children}</A4Miniature>

        {!selectionMode && (
          <div
            {...neDemarrePasDeGlisser}
            className="absolute right-0 bottom-2 left-0 flex justify-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100"
          >
            <div className="flex items-center gap-0.5 rounded-md border border-border bg-background/90 px-1 py-0.5 shadow-sm">
              {onPrint && (
                <Tip label="Imprimer / PDF">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={stop(onPrint)}
                    aria-label="Imprimer ou enregistrer en PDF"
                  >
                    <Printer />
                  </Button>
                </Tip>
              )}
              {onExportMarkdown && (
                <Tip label="Exporter en Markdown">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={stop(onExportMarkdown)}
                    aria-label="Exporter en Markdown"
                  >
                    <FileDown />
                  </Button>
                </Tip>
              )}
              {canWrite && onEdit && (
                <Tip label="Modifier">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={stop(onEdit)}
                    aria-label="Modifier"
                  >
                    <Pencil />
                  </Button>
                </Tip>
              )}
              {canWrite && onDelete && (
                <Tip label="Supprimer">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="hover:bg-destructive/10 hover:text-destructive"
                    onClick={stop(onDelete)}
                    aria-label="Supprimer"
                  >
                    <Trash2 />
                  </Button>
                </Tip>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
