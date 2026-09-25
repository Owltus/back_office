import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  AlertCircle,
  ArrowLeft,
  FileDown,
  Loader2,
  Pencil,
  Save,
  X,
} from 'lucide-react'

import { Tip } from '#/components/shared/Tip.tsx'
import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { usePageScale } from '#/lib/classeur/print/usePageScale.ts'

/*
 * Cadre commun des quatre pages de détail (document, feuille de suivi,
 * feuille de signature, intercalaire) — factorise ce que les quatre pages de
 * Registre répétaient : barre Retour / titre / actions, état « introuvable »,
 * squelette, viewport d'une page A4 à l'échelle, alerte d'erreur.
 */

/** Cible du bouton Retour : la page du chapitre. */
export interface RetourVers {
  classeurId: string
  chapterId: string
}

/** Barre supérieure : Retour, titre (ou champs d'édition), actions à droite. */
export function DetailHeader({
  retour,
  title,
  actions,
}: {
  retour: RetourVers
  title: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-2">
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
        <div className="min-w-0 flex-1">{title}</div>
      </div>
      {actions != null && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {actions}
        </div>
      )}
    </div>
  )
}

/**
 * Les boutons d'action standard : en lecture, Modifier (droit `ecriture`) et
 * Imprimer / PDF ; en édition, Annuler et Sauvegarder. `extra` s'insère
 * après Imprimer (export Markdown du document).
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
}: {
  editing: boolean
  canWrite: boolean
  saving: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: () => void
  onPrint: () => void
  extra?: ReactNode
}) {
  if (editing) {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={saving}
        >
          <X />
          Annuler
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          Sauvegarder
        </Button>
      </>
    )
  }
  return (
    <>
      {canWrite && (
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil />
          Modifier
        </Button>
      )}
      <Tip label="Imprimer ou enregistrer en PDF">
        <Button
          variant="outline"
          size="sm"
          onClick={onPrint}
          aria-label="Imprimer ou enregistrer en PDF"
        >
          <FileDown />
          PDF
        </Button>
      </Tip>
      {extra}
    </>
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
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-4 py-16 text-center">
      <p className="text-sm text-muted-foreground">{label}</p>
      <Button asChild size="sm" variant="outline">
        <Link to="/classeur/$classeurId/$chapterId" params={retour}>
          <ArrowLeft />
          Retour au chapitre
        </Link>
      </Button>
    </div>
  )
}

/** Silhouette d'une page de détail : barre + une page A4 grisée. */
export function DetailSkeleton({ retour }: { retour: RetourVers }) {
  return (
    <div className="flex flex-1 flex-col gap-4" aria-busy="true">
      <DetailHeader retour={retour} title={<Skeleton className="h-6 w-64" />} />
      <div className="flex flex-1 items-start justify-center rounded-xl bg-muted/30 p-6">
        <Skeleton
          className="w-full max-w-[420px] rounded-sm"
          style={{ aspectRatio: '210 / 297' }}
        />
      </div>
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
    <Alert variant="destructive">
      <AlertCircle />
      <AlertDescription>{messageErreur(err, action)}</AlertDescription>
    </Alert>
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
    <div
      ref={containerRef}
      className="relative min-h-[70vh] flex-1 overflow-hidden rounded-xl bg-muted/30"
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
    </div>
  )
}
