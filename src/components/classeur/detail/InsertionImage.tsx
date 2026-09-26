import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ChangeEvent, ClipboardEvent, DragEvent, RefObject } from 'react'
import { ImagePlus, Images, Loader2 } from 'lucide-react'

import { ImagesDialog } from '#/components/classeur/dialogs/ImagesDialog.tsx'
import { Button } from '#/components/ui/button.tsx'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { classeurKeys } from '#/lib/classeur/keys.ts'
import {
  estImage,
  formaterOctets,
  televerserImage,
} from '#/lib/classeur/images.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Insertion d'une image dans l'éditeur Markdown d'un document — « un truc
 * de très simple » (demande utilisateur du 2026-09-26) : bouton Image,
 * ou une image COLLÉE ou DÉPOSÉE dans le `textarea`. Le fichier est
 * converti en WebP et compressé dans le navigateur, envoyé au Storage,
 * puis `![nom](url)` est inséré à la position du curseur
 * (`lib/classeur/images.ts`).
 *
 * La position d'insertion est relevée AU DÉPART (le curseur au moment du
 * geste) ; le texte tapé pendant l'envoi n'est pas perdu, l'image arrive à
 * la position relevée.
 */

export type EtatImage =
  | { type: 'repos' }
  | { type: 'envoi'; nom: string }
  | { type: 'ok'; message: string }
  | { type: 'erreur'; message: string }

export function useInsertionImage({
  classeurId,
  documentId,
  contenu,
  editeurRef,
  setContenu,
}: {
  classeurId: number | null
  /** Document en cours d'édition (vue « Ce document » de la médiathèque). */
  documentId?: number
  /** Markdown en cours de frappe (usage « ce document » calculé dessus). */
  contenu: string
  editeurRef: RefObject<HTMLTextAreaElement | null>
  setContenu: (mise: (prev: string) => string) => void
}) {
  const [etat, setEtat] = useState<EtatImage>({ type: 'repos' })
  const [mediathequeOuverte, setMediathequeOuverte] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const invaliderImages = useQueryClient()

  /** Insère une ligne Markdown à la position du curseur (relevée maintenant). */
  const insererMarkdown = useCallback(
    (
      markdown: string,
      position?: { debut: number | null; fin: number | null },
    ) => {
      const editeur = editeurRef.current
      const debut = position?.debut ?? editeur?.selectionStart ?? null
      const fin = position?.fin ?? editeur?.selectionEnd ?? debut
      setContenu((prev) => {
        const d = debut ?? prev.length
        const f = fin ?? d
        const avant = prev.slice(0, d)
        const apres = prev.slice(f)
        const sautAvant = avant === '' || avant.endsWith('\n') ? '' : '\n'
        const sautApres = apres.startsWith('\n') ? '' : '\n'
        return `${avant}${sautAvant}${markdown}${sautApres}${apres}`
      })
      editeur?.focus()
    },
    [editeurRef, setContenu],
  )

  const inserer = useCallback(
    async (file: File) => {
      if (classeurId === null) return
      const editeur = editeurRef.current
      const position = {
        debut: editeur?.selectionStart ?? null,
        fin: editeur?.selectionEnd ?? null,
      }
      setEtat({ type: 'envoi', nom: file.name })
      try {
        const res = await televerserImage(classeurId, file)
        insererMarkdown(res.markdown, position)
        void invaliderImages.invalidateQueries({
          queryKey: classeurKeys.images(classeurId),
        })
        setEtat({
          type: 'ok',
          message: `Image ajoutée à la médiathèque : ${formaterOctets(res.octetsSource)} → ${formaterOctets(res.image.taille)} en WebP (${String(res.image.largeur)} × ${String(res.image.hauteur)}).`,
        })
      } catch (err) {
        setEtat({
          type: 'erreur',
          message: messageErreur(err, 'Image impossible à ajouter'),
        })
      }
    },
    [classeurId, editeurRef, insererMarkdown, invaliderImages],
  )

  const premiereImage = (fichiers: FileList | null | undefined) =>
    fichiers ? Array.from(fichiers).find(estImage) : undefined

  const onPaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const file = premiereImage(e.clipboardData.files)
      if (!file) return
      e.preventDefault()
      void inserer(file)
    },
    [inserer],
  )

  const onDragOver = useCallback((e: DragEvent<HTMLTextAreaElement>) => {
    if (e.dataTransfer.types.includes('Files')) e.preventDefault()
  }, [])

  const onDrop = useCallback(
    (e: DragEvent<HTMLTextAreaElement>) => {
      const file = premiereImage(e.dataTransfer.files)
      if (!file) return
      e.preventDefault()
      void inserer(file)
    },
    [inserer],
  )

  const onInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.item(0)
      e.target.value = ''
      if (file) void inserer(file)
    },
    [inserer],
  )

  return {
    etat,
    inputRef,
    onInputChange,
    ouvrirSelecteur: () => inputRef.current?.click(),
    /** À poser sur le `textarea`. */
    editeurProps: { onPaste, onDragOver, onDrop },
    actif: classeurId !== null,
    classeurId,
    documentId,
    contenu,
    mediathequeOuverte,
    setMediathequeOuverte,
    insererMarkdown,
  }
}

/** Barre au-dessus de l'éditeur : Image (nouvelle), Médiathèque, état de l'envoi. */
export function BarreImage({
  image,
}: {
  image: ReturnType<typeof useInsertionImage>
}) {
  const { etat } = image
  const envoi = etat.type === 'envoi'
  return (
    <div className="flex items-center gap-3 pb-2">
      {image.classeurId !== null && (
        <ImagesDialog
          open={image.mediathequeOuverte}
          onOpenChange={image.setMediathequeOuverte}
          classeurId={image.classeurId}
          documentId={image.documentId}
          contenuCourant={image.contenu}
          onInserer={(markdown) => {
            image.insererMarkdown(markdown)
            image.setMediathequeOuverte(false)
          }}
        />
      )}
      <input
        ref={image.inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={image.onInputChange}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={image.ouvrirSelecteur}
        disabled={envoi || !image.actif}
        aria-busy={envoi || undefined}
      >
        {envoi ? <Loader2 className="animate-spin" /> : <ImagePlus />}
        Image
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => image.setMediathequeOuverte(true)}
        disabled={!image.actif}
      >
        <Images />
        Médiathèque
      </Button>
      <span
        role={etat.type === 'erreur' ? 'alert' : 'status'}
        className={cn(
          'min-w-0 truncate text-xs',
          etat.type === 'erreur' ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {etat.type === 'repos' &&
          'Glissez ou collez une image dans l’éditeur, ou reprenez-en une de la médiathèque du classeur.'}
        {etat.type === 'envoi' && `Conversion et envoi de ${etat.nom}…`}
        {(etat.type === 'ok' || etat.type === 'erreur') && etat.message}
      </span>
    </div>
  )
}
