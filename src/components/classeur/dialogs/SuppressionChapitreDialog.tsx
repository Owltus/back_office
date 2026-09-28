import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, Download, Loader2, ShieldCheck } from 'lucide-react'

import {
  useChapterContent,
  useClasseur,
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
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { exporterChapitreZip } from '#/lib/classeur/exportMarkdown.ts'
import { DEFAULT_REGISTRY_NAME } from '#/lib/classeur/naming.ts'
import { creerPoint } from '#/lib/classeur/restauration.ts'
import { softDeleteChapter } from '#/lib/classeur/service.ts'
import type { DbChapter } from '#/lib/classeur/types.ts'
import { flattenItems } from '#/lib/classeur/types.ts'

/*
 * Suppression d'un chapitre, AVEC SAUVEGARDE (demande utilisateur du
 * 2026-09-28 : « sur le côté suppression, ajouter les notions de sauvegarde
 * avant suppression »). Même dialogue pour le clic droit de la colonne des
 * chapitres et pour le bouton de la barre de la page chapitre.
 *
 * Deux sauvegardes, indépendantes :
 *   - un POINT DE RESTAURATION majeur (coché par défaut), nommé « Avant
 *     suppression du chapitre « … » », pris AVANT la suppression : s'il
 *     échoue, rien n'est supprimé ;
 *   - une COPIE téléchargée du chapitre (ZIP Markdown), à la demande.
 * La suppression reste douce (`deleted_at`) : le chapitre revient en
 * restaurant le point.
 */
export function SuppressionChapitreDialog({
  chapter,
  onClose,
  onSupprime,
}: {
  /** `null` : fermé. */
  chapter: DbChapter | null
  onClose: () => void
  /** Après suppression (ex. quitter la page du chapitre supprimé). */
  onSupprime?: (chapter: DbChapter) => void
}) {
  return (
    <Dialog
      open={chapter !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {chapter && (
          <Contenu
            key={chapter.id}
            chapter={chapter}
            onClose={onClose}
            onSupprime={onSupprime}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Contenu({
  chapter,
  onClose,
  onSupprime,
}: {
  chapter: DbChapter
  onClose: () => void
  onSupprime?: (chapter: DbChapter) => void
}) {
  const [sauvegarder, setSauvegarder] = useState(true)
  const contenu = useChapterContent(chapter.id)
  const classeur = useClasseur(chapter.classeur_id)
  const periodicites = usePeriodicites()
  const invalider = useInvaliderClasseur()
  const nbElements = contenu.data ? flattenItems(contenu.data).length : null

  const copie = useMutation({
    mutationFn: async () => {
      if (!contenu.data) throw new Error('Contenu du chapitre indisponible.')
      await exporterChapitreZip(
        classeur.data?.name ?? DEFAULT_REGISTRY_NAME,
        chapter,
        contenu.data,
        periodicites.data ?? [],
      )
    },
  })

  const suppression = useMutation({
    mutationFn: async () => {
      if (sauvegarder) {
        // Jalon voulu : jamais dédoublonné, et s'il échoue, on s'arrête.
        await creerPoint(chapter.classeur_id, {
          kind: 'manuel',
          label: `Avant suppression du chapitre « ${chapter.label} »`,
        })
      }
      await softDeleteChapter(chapter.id)
    },
    onSuccess: async () => {
      await invalider()
      onClose()
      onSupprime?.(chapter)
    },
  })

  const occupe = suppression.isPending

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Supprimer le chapitre</DialogTitle>
        <DialogDescription>
          Le chapitre « {chapter.label} »
          {nbElements !== null &&
            (nbElements === 0
              ? ', vide,'
              : ` et ses ${String(nbElements)} ${nbElements > 1 ? 'éléments' : 'élément'}`)}{' '}
          ne seront plus accessibles.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3 rounded-lg border border-border p-3">
        <p className="text-sm font-medium">Sauvegarde avant suppression</p>
        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={sauvegarder}
            onChange={(e) => setSauvegarder(e.target.checked)}
            disabled={occupe}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            <span className="flex items-center gap-1.5 font-medium">
              <ShieldCheck className="size-4 text-muted-foreground" />
              Créer un point de restauration
            </span>
            <span className="text-muted-foreground">
              Le classeur entier est sauvegardé juste avant. Pour annuler la
              suppression : accueil du classeur, « Points de restauration ».
            </span>
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => copie.mutate()}
            disabled={!contenu.data || copie.isPending || occupe}
          >
            {copie.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Download />
            )}
            Télécharger une copie du chapitre
          </Button>
          <span role="status" className="text-xs text-muted-foreground">
            {copie.isSuccess && 'Copie téléchargée (ZIP Markdown).'}
            {copie.isError && messageErreur(copie.error, 'Copie impossible')}
          </span>
        </div>
      </div>

      {!sauvegarder && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Sans point de restauration, le chapitre ne pourra pas être retrouvé
          depuis l'application.
        </p>
      )}

      {suppression.isError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>
            {messageErreur(
              suppression.error,
              sauvegarder
                ? 'Sauvegarde ou suppression impossible'
                : 'Suppression impossible',
            )}
          </AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={occupe}>
          Annuler
        </Button>
        <Button
          variant="destructive"
          onClick={() => suppression.mutate()}
          disabled={occupe}
        >
          {occupe && <Loader2 className="animate-spin" />}
          {sauvegarder ? 'Sauvegarder et supprimer' : 'Supprimer'}
        </Button>
      </DialogFooter>
    </div>
  )
}
