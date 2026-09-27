import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ChangeEvent, ClipboardEvent, DragEvent, RefObject } from 'react'
import { ImagePlus, Images, Loader2 } from 'lucide-react'

import { ImagePreparationDialog } from '#/components/classeur/dialogs/ImagePreparationDialog.tsx'
import { ImagesDialog } from '#/components/classeur/dialogs/ImagesDialog.tsx'
import { IconAction } from '#/components/classeur/IconAction.tsx'
import { ButtonGroup } from '#/components/shared/ButtonGroup.tsx'
import { appliquerQuandLibre } from '#/components/classeur/detail/editionTextarea.ts'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import {
  appliquerEdition,
  insererLigne,
} from '#/lib/classeur/markdownEdition.ts'
import { classeurKeys } from '#/lib/classeur/keys.ts'
import {
  estImage,
  formaterOctets,
  refusImageSource,
  retirerImageDuMarkdown,
  televerserImage,
} from '#/lib/classeur/images.ts'
import type { PreparationImage } from '#/lib/classeur/images.ts'
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
  /** Fichier en attente dans le dialogue de préparation (cadre, rotation, largeur). */
  const [enPreparation, setEnPreparation] = useState<File | null>(null)
  const positionPreparation = useRef<{
    debut: number | null
    fin: number | null
  }>({
    debut: null,
    fin: null,
  })
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
      // Par l'historique du navigateur : Ctrl + Z retire l'image insérée
      // (amélioration n° 4). Attend la fermeture du dialogue d'où elle vient.
      appliquerQuandLibre(
        () => editeurRef.current,
        (valeur) => insererLigne(valeur, debut, fin, markdown),
        () => {
          setContenu((prev) =>
            appliquerEdition(prev, insererLigne(prev, debut, fin, markdown)),
          )
        },
      )
    },
    [editeurRef, setContenu],
  )

  /** Étape 1 : relève le curseur, refuse ce qui n'est pas une image, ouvre la préparation. */
  const inserer = useCallback(
    (file: File) => {
      if (classeurId === null) return
      const refus = refusImageSource(file)
      if (refus) {
        setEtat({ type: 'erreur', message: refus })
        return
      }
      const editeur = editeurRef.current
      positionPreparation.current = {
        debut: editeur?.selectionStart ?? null,
        fin: editeur?.selectionEnd ?? null,
      }
      setEtat({ type: 'repos' })
      setEnPreparation(file)
    },
    [classeurId, editeurRef],
  )

  /** Étape 2 : conversion (cadre, rotation), envoi, insertion au curseur relevé. */
  const envoyer = useCallback(
    async (file: File, preparation: PreparationImage) => {
      if (classeurId === null) return
      const position = positionPreparation.current
      setEtat({ type: 'envoi', nom: file.name })
      try {
        const res = await televerserImage(classeurId, file, preparation)
        setEnPreparation(null)
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
    [classeurId, insererMarkdown, invaliderImages],
  )

  const premiereImage = (fichiers: FileList | null | undefined) =>
    fichiers ? Array.from(fichiers).find(estImage) : undefined

  const onPaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const file = premiereImage(e.clipboardData.files)
      if (!file) return
      e.preventDefault()
      inserer(file)
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
      inserer(file)
    },
    [inserer],
  )

  const onInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.item(0)
      e.target.value = ''
      if (file) inserer(file)
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
    enPreparation,
    annulerPreparation: () => setEnPreparation(null),
    envoyer,
    /** Une image supprimée de la médiathèque disparaît aussi du texte en cours. */
    // Volontairement HORS de l'historique d'annulation : le fichier est
    // supprimé du stockage, Ctrl + Z ramènerait une image introuvable.
    retirerDuTexte: (chemin: string) =>
      setContenu((prev) => retirerImageDuMarkdown(prev, chemin)),
  }
}

type ImageInsertion = ReturnType<typeof useInsertionImage>

/** Dialogues (préparation, médiathèque) et sélecteur de fichier caché. */
export function DialoguesImage({ image }: { image: ImageInsertion }) {
  return (
    <>
      <ImagePreparationDialog
        file={image.enPreparation}
        envoi={image.etat.type === 'envoi'}
        onAnnuler={image.annulerPreparation}
        onValider={(preparation) => {
          if (image.enPreparation)
            void image.envoyer(image.enPreparation, preparation)
        }}
      />
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
          onImageSupprimee={image.retirerDuTexte}
        />
      )}
      <input
        ref={image.inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={image.onInputChange}
      />
    </>
  )
}

/** Boutons Image (nouvelle) et Médiathèque, pour la barre de l'éditeur. */
export function BoutonsImage({ image }: { image: ImageInsertion }) {
  const envoi = image.etat.type === 'envoi'
  return (
    <ButtonGroup>
      <IconAction
        label="Ajouter une image (ou collez-la, ou glissez-la dans le texte)"
        icon={<ImagePlus />}
        busy={envoi}
        disabled={!image.actif}
        onMouseDown={(e) => e.preventDefault()}
        onClick={image.ouvrirSelecteur}
      />
      <IconAction
        label="Médiathèque : reprendre une image du classeur"
        icon={<Images />}
        disabled={!image.actif}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => image.setMediathequeOuverte(true)}
      />
    </ButtonGroup>
  )
}

/** Ligne d'état de l'envoi d'une image (rien au repos). */
export function EtatImageLigne({ image }: { image: ImageInsertion }) {
  const { etat } = image
  if (etat.type === 'repos') return null
  return (
    <p
      role={etat.type === 'erreur' ? 'alert' : 'status'}
      className={cn(
        'flex min-w-0 items-center gap-1.5 truncate text-xs',
        etat.type === 'erreur' ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      {etat.type === 'envoi' && (
        <>
          <Loader2 className="size-3 animate-spin" />
          Conversion et envoi de {etat.nom}…
        </>
      )}
      {(etat.type === 'ok' || etat.type === 'erreur') && etat.message}
    </p>
  )
}
