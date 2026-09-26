import { useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  AlertCircle,
  Check,
  ImagePlus,
  Images,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'

import { ImagePreparationDialog } from '#/components/classeur/dialogs/ImagePreparationDialog.tsx'
import { ImageDocument } from '#/components/classeur/print/ImageDocument.tsx'
import { useClasseurContent } from '#/components/classeur/hooks/useClasseur.ts'
import { useDroitsClasseur } from '#/components/classeur/hooks/useDroitsClasseur.ts'
import {
  useImages,
  useRenommerImage,
  useSupprimerImage,
  useTeleverserImage,
} from '#/components/classeur/hooks/useImages.ts'
import { ConfirmDialog } from '#/components/shared/ConfirmDialog.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import {
  formaterOctets,
  imagesReferencees,
  markdownImage,
  refusImageSource,
  usagesImages,
} from '#/lib/classeur/images.ts'
import type { UsageImage } from '#/lib/classeur/images.ts'
import type { DbImage } from '#/lib/classeur/types.ts'
import { cn } from '#/lib/utils.ts'

/*
 * MÉDIATHÈQUE d'un classeur (demande utilisateur du 2026-09-26 : « si elles
 * sont dans le bucket, je ne les vois pas… une image dans un classeur,
 * utilisable dans plusieurs chapitres ; dans un document, voir les images
 * du document ou du classeur »).
 *
 * Une image appartient au classeur. Son USAGE (quels documents la
 * référencent) est calculé ici depuis les contenus déjà chargés
 * (`useClasseurContent`) : jamais stocké, jamais faux. Trois vues :
 * toutes, celles de CE document (quand ouvert depuis un éditeur), et les
 * NON UTILISÉES — c'est là que vivent les fichiers morts, avec un bouton
 * pour les supprimer.
 *
 * Ouvert depuis un éditeur (`onInserer`), chaque carte propose « Insérer »
 * ; sinon (accueil du classeur) elle sert à ranger : renommer, supprimer.
 */

type Vue = 'toutes' | 'document' | 'orphelines'

export function ImagesDialog({
  open,
  onOpenChange,
  classeurId,
  documentId,
  contenuCourant,
  onInserer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  classeurId: number
  /** Document en cours d'édition : active la vue « Ce document ». */
  documentId?: number
  /** Markdown en cours de frappe (non sauvegardé) : l'usage « ce document » le lit. */
  contenuCourant?: string
  /** Mode insertion : rend le bouton « Insérer » de chaque carte. */
  onInserer?: (markdown: string) => void
}) {
  const { canWrite } = useDroitsClasseur(classeurId)
  const images = useImages(classeurId, open)
  const contenu = useClasseurContent(classeurId)
  const envoi = useTeleverserImage(classeurId)
  const renommage = useRenommerImage(classeurId)
  const suppression = useSupprimerImage(classeurId)

  const [vue, setVue] = useState<Vue>(
    documentId !== undefined ? 'document' : 'toutes',
  )
  const [aSupprimer, setASupprimer] = useState<DbImage | null>(null)
  const [enRenommage, setEnRenommage] = useState<{
    id: number
    nom: string
  } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [enPreparation, setEnPreparation] = useState<File | null>(null)
  const [refusFichier, setRefusFichier] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Usages calculés depuis les documents sauvegardés ; pour le document en
  // cours d'édition, le Markdown non sauvegardé fait foi.
  const usages = useMemo(() => {
    const data = contenu.data
    if (!data) return new Map<string, UsageImage[]>()
    if (documentId === undefined || contenuCourant === undefined) {
      return usagesImages(data.chapters, data.content)
    }
    const documents = data.content.documents.map((d) =>
      d.id === documentId ? { ...d, content: contenuCourant } : d,
    )
    return usagesImages(data.chapters, { documents })
  }, [contenu.data, documentId, contenuCourant])

  const cheminsDuDocument = useMemo(
    () =>
      new Set(
        contenuCourant !== undefined ? imagesReferencees(contenuCourant) : [],
      ),
    [contenuCourant],
  )

  const liste = images.data ?? []
  const visibles = liste.filter((img) => {
    const u = usages.get(img.chemin.toLowerCase()) ?? []
    if (vue === 'document')
      return cheminsDuDocument.has(img.chemin.toLowerCase())
    if (vue === 'orphelines') return u.length === 0
    return true
  })
  const nbOrphelines = liste.filter(
    (img) => (usages.get(img.chemin.toLowerCase()) ?? []).length === 0,
  ).length
  const poidsTotal = liste.reduce((s, i) => s + i.taille, 0)

  const occupe = envoi.isPending || renommage.isPending || suppression.isPending
  const erreur = refusFichier
    ? refusFichier
    : envoi.isError
      ? messageErreur(envoi.error, 'Image impossible à ajouter')
      : renommage.isError
        ? messageErreur(renommage.error, 'Renommage impossible')
        : suppression.isError
          ? messageErreur(suppression.error, 'Suppression impossible')
          : images.isError
            ? messageErreur(images.error, 'Images indisponibles')
            : null

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.item(0)
    e.target.value = ''
    if (!file) return
    setMessage(null)
    const refus = refusImageSource(file)
    setRefusFichier(refus)
    if (refus) return
    setEnPreparation(file)
  }

  function envoyerPrepare(
    preparation: Parameters<typeof envoi.mutate>[0]['preparation'],
  ) {
    if (!enPreparation) return
    envoi.mutate(
      { file: enPreparation, preparation },
      {
        onSuccess: (res) => {
          setEnPreparation(null)
          setMessage(
            `« ${res.image.nom} » ajoutée : ${formaterOctets(res.octetsSource)} → ${formaterOctets(res.image.taille)} en WebP (${String(res.image.largeur)} × ${String(res.image.hauteur)}).`,
          )
          setVue('toutes')
        },
      },
    )
  }

  function validerRenommage() {
    if (!enRenommage) return
    const nom = enRenommage.nom.trim()
    if (nom === '') return
    renommage.mutate(
      { id: enRenommage.id, nom },
      { onSuccess: () => setEnRenommage(null) },
    )
  }

  const vues: { key: Vue; label: string; count: number }[] = [
    { key: 'toutes', label: 'Tout le classeur', count: liste.length },
    ...(documentId !== undefined
      ? [
          {
            key: 'document' as const,
            label: 'Ce document',
            count: liste.filter((i) =>
              cheminsDuDocument.has(i.chemin.toLowerCase()),
            ).length,
          },
        ]
      : []),
    { key: 'orphelines', label: 'Non utilisées', count: nbOrphelines },
  ]

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o && occupe) return
          if (!o) {
            setMessage(null)
            setEnRenommage(null)
          }
          onOpenChange(o)
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Images du classeur</DialogTitle>
            <DialogDescription>
              Une image appartient au classeur et peut servir dans plusieurs
              documents. « Non utilisées » liste celles qu'aucun document ne
              référence : c'est là que se cachent les fichiers morts.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-md border border-border p-0.5">
              {vues.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setVue(v.key)}
                  className={cn(
                    'rounded px-2.5 py-1 text-xs transition-colors',
                    vue === v.key
                      ? 'bg-accent text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  aria-pressed={vue === v.key}
                >
                  {v.label}
                  <span className="ml-1 tabular-nums opacity-70">
                    {v.count}
                  </span>
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {formaterOctets(poidsTotal)} en base
            </span>
            {canWrite && (
              <>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onInputChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={() => inputRef.current?.click()}
                  disabled={occupe}
                >
                  {envoi.isPending ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <ImagePlus />
                  )}
                  Ajouter une image
                </Button>
              </>
            )}
          </div>

          {erreur && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{erreur}</AlertDescription>
            </Alert>
          )}
          {message && !erreur && (
            <Alert>
              <Check />
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {images.isPending ? (
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className="aspect-[4/3] w-full rounded-lg"
                  />
                ))}
              </div>
            ) : visibles.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                <Images className="size-5" />
                {vue === 'document'
                  ? 'Ce document ne contient aucune image du classeur.'
                  : vue === 'orphelines'
                    ? 'Toutes les images sont utilisées.'
                    : 'Aucune image dans ce classeur.'}
                {canWrite && vue !== 'document' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => inputRef.current?.click()}
                    disabled={occupe}
                  >
                    <Plus />
                    Ajouter une image
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {visibles.map((img) => {
                  const u = usages.get(img.chemin.toLowerCase()) ?? []
                  const renomme = enRenommage?.id === img.id
                  return (
                    <div
                      key={img.id}
                      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-2"
                    >
                      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded bg-white [&_img]:max-h-full [&_img]:max-w-full [&_img]:object-contain">
                        <ImageDocument chemin={img.chemin} alt={img.nom} />
                      </div>
                      {renomme ? (
                        <form
                          className="flex items-center gap-1"
                          onSubmit={(e) => {
                            e.preventDefault()
                            validerRenommage()
                          }}
                        >
                          <Input
                            value={enRenommage.nom}
                            onChange={(e) =>
                              setEnRenommage({
                                id: img.id,
                                nom: e.target.value,
                              })
                            }
                            aria-label="Nouveau nom"
                            maxLength={120}
                            autoFocus
                            className="h-7 text-xs"
                          />
                          <Button
                            type="submit"
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Valider"
                            disabled={occupe}
                          >
                            <Check />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Annuler"
                            onClick={() => setEnRenommage(null)}
                          >
                            <X />
                          </Button>
                        </form>
                      ) : (
                        <div className="min-w-0">
                          <div
                            className="truncate text-sm font-medium"
                            title={img.nom}
                          >
                            {img.nom}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {img.largeur} × {img.hauteur} ·{' '}
                            {formaterOctets(img.taille)}
                          </div>
                          <div
                            className={cn(
                              'truncate text-xs',
                              u.length === 0
                                ? 'text-amber-500'
                                : 'text-muted-foreground',
                            )}
                            title={u
                              .map(
                                (x) => `${x.chapterLabel} › ${x.documentTitle}`,
                              )
                              .join('\n')}
                          >
                            {u.length === 0
                              ? 'Non utilisée'
                              : u.length === 1
                                ? `${u[0].chapterLabel} › ${u[0].documentTitle}`
                                : `Utilisée dans ${u.length} documents`}
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        {onInserer && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() =>
                              onInserer(markdownImage(img.nom, img.chemin))
                            }
                          >
                            <Plus />
                            Insérer
                          </Button>
                        )}
                        {canWrite && !renomme && (
                          <>
                            <Tip label="Renommer">
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                aria-label={`Renommer ${img.nom}`}
                                onClick={() =>
                                  setEnRenommage({ id: img.id, nom: img.nom })
                                }
                                disabled={occupe}
                              >
                                <Pencil />
                              </Button>
                            </Tip>
                            <Tip label="Supprimer">
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                className="hover:bg-destructive/10 hover:text-destructive"
                                aria-label={`Supprimer ${img.nom}`}
                                onClick={() => setASupprimer(img)}
                                disabled={occupe}
                              >
                                <Trash2 />
                              </Button>
                            </Tip>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ImagePreparationDialog
        file={enPreparation}
        envoi={envoi.isPending}
        onAnnuler={() => setEnPreparation(null)}
        onValider={envoyerPrepare}
      />

      <ConfirmDialog
        open={aSupprimer !== null}
        onOpenChange={(o) => {
          if (!o) setASupprimer(null)
        }}
        title="Supprimer l’image"
        description={
          aSupprimer
            ? (() => {
                const u = usages.get(aSupprimer.chemin.toLowerCase()) ?? []
                return u.length === 0
                  ? `« ${aSupprimer.nom} » n'est utilisée par aucun document. Le fichier sera retiré du classeur.`
                  : `« ${aSupprimer.nom} » est utilisée dans ${u.length} document(s) : ${u.map((x) => x.documentTitle).join(', ')}. Ils afficheront « Image indisponible ».`
              })()
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          if (aSupprimer) {
            suppression.mutate(aSupprimer, {
              onSuccess: () => setMessage(`« ${aSupprimer.nom} » supprimée.`),
            })
          }
        }}
      />
    </>
  )
}
