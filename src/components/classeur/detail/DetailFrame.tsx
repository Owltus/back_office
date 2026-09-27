import type { ComponentProps, ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  FileDown,
  Loader2,
  Pencil,
  Printer,
  Save,
  X,
} from 'lucide-react'

import { ChapterDrawerButton } from '#/components/classeur/ChapterDrawer.tsx'
import { IconAction } from '#/components/classeur/IconAction.tsx'
import { ButtonGroup } from '#/components/shared/ButtonGroup.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { FormeDetail } from '#/components/shared/skeleton/PageShapes.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { usePageScale } from '#/lib/classeur/print/usePageScale.ts'
import { ITEM_LABEL } from '#/lib/classeur/types.ts'
import type { ItemKind } from '#/lib/classeur/types.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Cadre commun des quatre pages de détail (document, feuille de suivi,
 * feuille de signature, intercalaire) — factorise ce que les quatre pages de
 * Registre répétaient : en-tête (Retour / titre / actions), champs
 * d'édition, état « introuvable », squelette, viewport d'une page A4 à
 * l'échelle, erreur en ligne. L'en-tête est le `PageHeader` de l'app : le
 * bouton Retour occupe son `leading` (l'usage prévu de cette prop), le titre
 * son `title`, nature + chapitre son `meta`.
 */

/** Cible du bouton Retour : la page du chapitre. */
export interface RetourVers {
  classeurId: string
  chapterId: string
}

/** Première lettre en capitale (« Feuille de suivi · Sécurité incendie »). */
function capitaliser(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * En-tête d'une page de détail. `title` reste un texte (tronqué par le
 * `PageHeader`) même en édition : le titre saisi s'y reflète en direct, les
 * champs eux-mêmes vivent dans `DetailFields`, sous l'en-tête.
 */
export function DetailHeader({
  retour,
  title,
  kind,
  chapterName,
  actions,
}: {
  retour: RetourVers
  title: ReactNode
  /** Nature de l'élément, affichée dans la ligne secondaire. */
  kind?: ItemKind
  chapterName?: string
  actions?: ReactNode
}) {
  const meta = [kind ? capitaliser(ITEM_LABEL[kind]) : '', chapterName ?? '']
    .filter((s) => s !== '')
    .join(' · ')
  return (
    <PageHeader
      leading={
        <div className="flex shrink-0 items-center gap-1">
          <ChapterDrawerButton />
          <Tip label="Retour au chapitre">
            <Button
              variant="ghost"
              size="icon-sm"
              asChild
              aria-label="Retour au chapitre"
            >
              <Link to="/classeur/$classeurId/$chapterId" params={retour}>
                <ArrowLeft />
              </Link>
            </Button>
          </Tip>
        </div>
      }
      title={title}
      meta={meta !== '' ? meta : undefined}
      actions={actions}
    />
  )
}

/**
 * Les boutons d'action standard : en lecture, un groupe Modifier (droit
 * `ecriture`) / Imprimer-PDF / `extra` (export Markdown du document) ; en
 * édition, Annuler (outline, icône) puis Sauvegarder — l'action principale
 * d'un formulaire reste pleine, comme dans les dialogues.
 */
export function DetailActions({
  editing,
  canWrite,
  saving,
  onEdit,
  onCancel,
  onSave,
  onPrint,
  extra,
  aide,
  statut,
}: {
  editing: boolean
  canWrite: boolean
  saving: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: () => void
  onPrint: () => void
  extra?: ReactNode
  /** Bouton d'aide « ? », en tête des actions (lecture comme édition). */
  aide?: ReactNode
  /** État d'enregistrement, à gauche d'Annuler (édition seulement). */
  statut?: ReactNode
}) {
  if (editing) {
    return (
      <>
        {statut}
        {aide}
        <IconAction
          label="Annuler les modifications"
          icon={<X />}
          onClick={onCancel}
          disabled={saving}
        />
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          Sauvegarder
        </Button>
      </>
    )
  }
  return (
    <ButtonGroup>
      {canWrite && (
        <IconAction label="Modifier" icon={<Pencil />} onClick={onEdit} />
      )}
      <IconAction
        label="Imprimer ou enregistrer en PDF"
        icon={<Printer />}
        onClick={onPrint}
      />
      {extra}
    </ButtonGroup>
  )
}

/** Bouton d'export Markdown d'un document (`extra` de `DetailActions`). */
export function DetailMarkdownAction({ onClick }: { onClick: () => void }) {
  return (
    <IconAction
      label="Exporter en Markdown"
      icon={<FileDown />}
      onClick={onClick}
    />
  )
}

/**
 * Carte des champs d'édition (titre, description, périodicité…), sous
 * l'en-tête : une rangée à partir de `sm`, empilée en dessous.
 */
export function DetailFields({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
      {children}
    </div>
  )
}

/** Élément introuvable (supprimé ou identifiant invalide). */
export function DetailIntrouvable({
  label,
  retour,
}: {
  label: string
  retour: RetourVers
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
      <p className="text-sm">{label}</p>
      <Button asChild size="sm" variant="outline">
        <Link to="/classeur/$classeurId/$chapterId" params={retour}>
          <ArrowLeft />
          Retour au chapitre
        </Link>
      </Button>
    </div>
  )
}

/** Silhouette d'une page de détail : en-tête + une page A4 grisée. */
export function DetailSkeleton({ retour }: { retour: RetourVers }) {
  return (
    <div className="flex flex-1 flex-col gap-4" aria-busy="true">
      <DetailHeader retour={retour} title={<Skeleton className="h-6 w-64" />} />
      {/* DÉLÈGUE à `FormeDetail` : même cadre que `DetailPaper`, une page A4. */}
      <FormeDetail />
    </div>
  )
}

/** Erreur de lecture ou d'écriture, en ligne. */
export function DetailErreur({
  err,
  action,
}: {
  err: unknown
  action: string
}) {
  return (
    <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {messageErreur(err, action)}
    </div>
  )
}

/**
 * Cadre de l'aperçu : la carte de l'app autour des pages A4, qui restent
 * blanches (fond `bg-card`, jamais nu). `className` pour le défilement ou
 * la hauteur propre à chaque usage.
 */
export function DetailPaper({
  className,
  children,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-xl border border-border bg-card', className)}
      {...props}
    >
      {children}
    </div>
  )
}

/**
 * Une page A4 unique, mise à l'échelle pour tenir dans le viewport
 * (`usePageScale('fit')`) — feuilles de suivi, de signature, intercalaires.
 * La hauteur minimale borne le calcul : sans elle, un conteneur en flux
 * libre n'aurait pas de hauteur à offrir.
 */
export function PageFitViewport({ children }: { children: ReactNode }) {
  const { containerRef, scale } = usePageScale('fit')
  return (
    <DetailPaper
      ref={containerRef}
      className="relative min-h-[70vh] flex-1 overflow-hidden"
    >
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        {children}
      </div>
    </DetailPaper>
  )
}
