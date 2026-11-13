import { useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Download,
  FileText,
  FolderTree,
  Image,
  ImageOff,
  Loader2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

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
import {
  exporterMarkdown,
  fichierExport,
  nombreImages,
} from '#/lib/classeur/exportMarkdown.ts'
import type {
  ChoixExport,
  PorteeExport,
} from '#/lib/classeur/exportMarkdown.ts'
import type { DbPeriodicite } from '#/lib/classeur/types.ts'
import { cn } from '#/lib/utils.ts'

/** Une option sous forme de carte : un clic la choisit. */
function Option({
  choisie,
  onChoisir,
  icone: Icone,
  titre,
  children,
  disabled,
}: {
  choisie: boolean
  onChoisir: () => void
  icone: LucideIcon
  titre: string
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={choisie}
      disabled={disabled}
      onClick={onChoisir}
      className={cn(
        'flex items-start gap-3 rounded-xl border p-4 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        choisie
          ? 'border-primary bg-primary/10'
          : 'border-border bg-muted/30 hover:bg-muted/50',
      )}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg bg-background',
          choisie ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        <Icone className="size-5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium">{titre}</span>
        <span className="text-sm text-muted-foreground">{children}</span>
      </span>
    </button>
  )
}

/** Phrase qui dit ce que l'on va recevoir. */
export function phraseResultat(
  portee: PorteeExport,
  choix: ChoixExport,
): string {
  const { nom, archive } = fichierExport(portee, choix)
  const n = nombreImages(portee)
  const images =
    choix.avecImages && n > 0
      ? ` avec ${n > 1 ? `ses ${String(n)} images` : 'son image'} dans un dossier images`
      : ''
  if (!archive) return `Vous recevez ${nom}, un seul fichier Markdown.`
  if (choix.forme === 'unique')
    return `Vous recevez ${nom} : le fichier Markdown${images}.`
  return `Vous recevez ${nom} : un dossier par chapitre, un fichier par document${images}.`
}

/**
 * Export Markdown, UNE entrée pour toutes les formes (demande utilisateur
 * du 2026-11-13) : un seul fichier ou un fichier par document, avec ou
 * sans les images. Un seul fichier sans image à joindre part en `.md`
 * nu, tout le reste en ZIP (`exporterMarkdown`).
 */
export function ExportMarkdownDialog({
  open,
  onOpenChange,
  portee,
  lirePeriodicites,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Le classeur ou le chapitre à exporter ; `null` tant qu'il se lit. */
  portee: PorteeExport | null
  lirePeriodicites: () => Promise<DbPeriodicite[]>
}) {
  const [choix, setChoix] = useState<ChoixExport>({
    forme: 'unique',
    avecImages: true,
  })
  const exporter = useMutation({
    mutationFn: async (c: ChoixExport) => {
      if (!portee) return
      await exporterMarkdown(portee, c, await lirePeriodicites())
    },
    onSuccess: () => onOpenChange(false),
  })
  const sansImage = portee !== null && nombreImages(portee) === 0

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && exporter.isPending) return
        if (!o) exporter.reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col gap-6 overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Exporter en Markdown</DialogTitle>
          <DialogDescription>
            {portee?.chapitre
              ? `Le chapitre ${portee.chapitre.label}.`
              : 'Tout le classeur.'}
          </DialogDescription>
        </DialogHeader>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">Fichiers</h3>
          <div
            role="radiogroup"
            aria-label="Fichiers"
            className="grid gap-3 sm:grid-cols-2"
          >
            <Option
              choisie={choix.forme === 'unique'}
              onChoisir={() => setChoix({ ...choix, forme: 'unique' })}
              icone={FileText}
              titre="Un seul fichier"
            >
              Tout se lit d'un bout à l'autre, chapitre après chapitre.
            </Option>
            <Option
              choisie={choix.forme === 'dossiers'}
              onChoisir={() => setChoix({ ...choix, forme: 'dossiers' })}
              icone={FolderTree}
              titre="Un fichier par document"
            >
              Rangés dans un dossier par chapitre, dans l'ordre.
            </Option>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">Images</h3>
          <div
            role="radiogroup"
            aria-label="Images"
            className="grid gap-3 sm:grid-cols-2"
          >
            <Option
              choisie={choix.avecImages && !sansImage}
              onChoisir={() => setChoix({ ...choix, avecImages: true })}
              icone={Image}
              titre="Avec les images"
              disabled={sansImage}
            >
              {sansImage
                ? 'Aucune image dans ces documents.'
                : 'Jointes dans un dossier images, à côté du texte.'}
            </Option>
            <Option
              choisie={!choix.avecImages || sansImage}
              onChoisir={() => setChoix({ ...choix, avecImages: false })}
              icone={ImageOff}
              titre="Sans les images"
            >
              Chaque image est remplacée par sa légende.
            </Option>
          </div>
        </section>

        {portee !== null && (
          <p className="rounded-lg bg-muted/40 px-4 py-3 text-sm" role="status">
            {phraseResultat(portee, {
              ...choix,
              avecImages: choix.avecImages && !sansImage,
            })}
          </p>
        )}
        {exporter.isError && (
          <p className="text-sm text-destructive" role="alert">
            {messageErreur(exporter.error, 'Export impossible')}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={exporter.isPending}
          >
            Annuler
          </Button>
          <Button
            onClick={() =>
              exporter.mutate({
                ...choix,
                avecImages: choix.avecImages && !sansImage,
              })
            }
            disabled={portee === null || exporter.isPending}
          >
            {exporter.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Download />
            )}
            {exporter.isPending ? 'Export en cours...' : 'Télécharger'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
