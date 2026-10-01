import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ChangeEvent, ClipboardEvent, DragEvent, RefObject } from 'react'
import { ImagePlus, Images, LayoutGrid, Loader2 } from 'lucide-react'

import { ImagePreparationDialog } from '#/components/classeur/dialogs/ImagePreparationDialog.tsx'
import { ImagesDialog } from '#/components/classeur/dialogs/ImagesDialog.tsx'
import { IconAction } from '#/components/classeur/IconAction.tsx'
import { ButtonGroup } from '#/components/shared/ButtonGroup.tsx'
import {
  appliquerDansEditeur,
  appliquerQuandLibre,
} from '#/components/classeur/detail/editionTextarea.ts'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import {
  appliquerEdition,
  insererLigne,
  insererTexteEnBloc,
} from '#/lib/classeur/markdownEdition.ts'
import { classeurKeys } from '#/lib/classeur/keys.ts'
import {
  changerDisposition,
  dispositionImage,
  editionEntre,
} from '#/lib/classeur/disposition.ts'
import type { Disposition } from '#/lib/classeur/disposition.ts'
import {
  IMAGE_A_INSERER,
  estImage,
  formaterOctets,
  jetonImage,
  refusImageSource,
  retirerImageDuMarkdown,
  televerserImage,
  trouverImage,
} from '#/lib/classeur/images.ts'
import type { Edition } from '#/lib/classeur/markdownEdition.ts'
import type {
  AjustementImage,
  CadreImage,
  PreparationImage,
  TailleImage,
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
 *
 * 2026-10-01 (plan `classeur-images-blocs`) : deux blocs prêts à l'emploi
 * s'ajoutent à l'image simple — la PLANCHE de photos (plusieurs fichiers
 * d'un coup, écrite en `:::photos`) et l'ÉTAPE ILLUSTRÉE (la ligne ou la
 * sélection entourée de `:::etape`, puis le choix de la photo). Personne n'a
 * à taper une directive.
 */

const LIBELLE_TAILLE: Record<TailleImage, string> = {
  auto: 'taille automatique',
  petite: 'petite',
  moyenne: 'moyenne',
  grande: 'grande',
  pleine: 'pleine largeur',
}

const LIBELLE_DISPOSITION: Record<Disposition, string> = {
  centre: 'au centre',
  gauche: 'à gauche du texte',
  droite: 'à droite du texte',
}

/**
 * L'édition qui donne à l'image (jeton `[debut, fin)` de `valeur`, remplacé
 * par `jeton`) la disposition voulue : une seule plage remplacée, donc un
 * seul Ctrl + Z (`editionEntre`).
 */
function editionDisposee(
  valeur: string,
  debut: number,
  fin: number,
  jeton: string,
  disposition: Disposition,
): Edition {
  return editionEntre(
    valeur,
    changerDisposition(valeur, debut, fin, jeton, disposition),
  )
}

export type EtatImage =
  | { type: 'repos' }
  | { type: 'envoi'; nom: string; rang?: { n: number; sur: number } }
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
  /** Sélecteur MULTIPLE de la planche de photos. */
  const plancheRef = useRef<HTMLInputElement>(null)
  const invaliderImages = useQueryClient()
  /** Image placée en cours de retouche (cliquée dans l'aperçu). */
  const [enRetouche, setEnRetouche] = useState<{
    chemin: string
    ligne?: number
    url: string
    nom: string
    taille: TailleImage
    cadre: CadreImage | null
    ajustement: AjustementImage
    disposition: Disposition
    recadrer: boolean
    contexte: 'page' | 'planche'
    photo: boolean
  } | null>(null)

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

  /**
   * EMPLACEMENT à remplir (`![…](a-inserer)`, 2026-10-01) : cliqué dans
   * l'aperçu, il attend une vraie image ; l'image choisie le REMPLACE (sa
   * légende et sa taille sont reprises dans le dialogue). Toute autre voie
   * d'ajout (bouton, collage, dépôt) l'oublie.
   */
  const [emplacement, setEmplacement] = useState<{
    ligne?: number
    alt: string
    taille: TailleImage
    contexte: 'page' | 'planche'
  } | null>(null)

  const remplirEmplacement = useCallback(
    (ligne: number | undefined, contexte: 'page' | 'planche') => {
      const valeur = editeurRef.current?.value ?? contenu
      const t = trouverImage(valeur, IMAGE_A_INSERER, ligne)
      if (!t) {
        setEtat({
          type: 'erreur',
          message: "Cet emplacement n'est plus dans le texte.",
        })
        return
      }
      setEtat({ type: 'repos' })
      setEmplacement({ ligne, alt: t.alt, taille: t.taille, contexte })
      inputRef.current?.click()
    },
    [contenu, editeurRef],
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
    async (
      file: File,
      preparation: PreparationImage & { disposition?: Disposition },
    ) => {
      if (classeurId === null) return
      const position = positionPreparation.current
      setEtat({ type: 'envoi', nom: file.name })
      try {
        const res = await televerserImage(classeurId, file, preparation)
        setEnPreparation(null)
        const cible = emplacement
        setEmplacement(null)
        if (cible) {
          // L'image prend la place de l'emplacement gris (Ctrl + Z le ramène).
          const remplacer = (valeur: string): Edition => {
            const t = trouverImage(valeur, IMAGE_A_INSERER, cible.ligne)
            if (!t)
              return insererLigne(
                valeur,
                valeur.length,
                valeur.length,
                res.markdown,
              )
            return editionDisposee(
              valeur,
              t.debut,
              t.fin,
              res.markdown,
              preparation.disposition ?? 'centre',
            )
          }
          appliquerQuandLibre(
            () => editeurRef.current,
            remplacer,
            () => setContenu((prev) => appliquerEdition(prev, remplacer(prev))),
          )
        } else if ((preparation.disposition ?? 'centre') !== 'centre') {
          // Insérée au curseur, puis mise en colonnes avec son texte.
          const disposer = (valeur: string): Edition => {
            const ins = insererLigne(
              valeur,
              position.debut,
              position.fin,
              res.markdown,
            )
            const v2 = appliquerEdition(valeur, ins)
            const p = v2.indexOf(res.markdown, ins.debut)
            return editionEntre(
              valeur,
              changerDisposition(
                v2,
                p,
                p + res.markdown.length,
                res.markdown,
                preparation.disposition ?? 'centre',
              ),
            )
          }
          appliquerQuandLibre(
            () => editeurRef.current,
            disposer,
            () => setContenu((prev) => appliquerEdition(prev, disposer(prev))),
          )
        } else {
          insererMarkdown(res.markdown, position)
        }
        void invaliderImages.invalidateQueries({
          queryKey: classeurKeys.images(classeurId),
        })
        setEtat({
          type: 'ok',
          message: `Image ajoutée : ${formaterOctets(res.octetsSource)} → ${formaterOctets(res.image.taille)} pour l'affichage, original conservé entier (${String(res.image.original_largeur ?? res.image.largeur)} × ${String(res.image.original_hauteur ?? res.image.hauteur)}, ${formaterOctets(res.image.original_taille ?? 0)}).`,
        })
      } catch (err) {
        setEtat({
          type: 'erreur',
          message: messageErreur(err, 'Image impossible à ajouter'),
        })
      }
    },
    [
      classeurId,
      editeurRef,
      emplacement,
      insererMarkdown,
      invaliderImages,
      setContenu,
    ],
  )

  /**
   * Planche de photos : chaque fichier est converti et envoyé tel quel
   * (taille et cadre décidés par la planche), puis le bloc `:::photos`
   * complet est inséré au curseur relevé au départ. Les légendes se posent
   * ensuite d'un clic sur chaque photo dans l'aperçu.
   */
  const envoyerPlanche = useCallback(
    async (fichiers: File[]) => {
      if (classeurId === null || fichiers.length === 0) return
      const refus = fichiers.map(refusImageSource).find((r) => r !== null)
      if (refus) {
        setEtat({ type: 'erreur', message: refus })
        return
      }
      const editeur = editeurRef.current
      const debut = editeur?.selectionStart ?? null
      const fin = editeur?.selectionEnd ?? debut
      const lignes: string[] = []
      try {
        for (const [n, f] of fichiers.entries()) {
          setEtat({
            type: 'envoi',
            nom: f.name,
            rang: { n: n + 1, sur: fichiers.length },
          })
          const res = await televerserImage(classeurId, f, {})
          lignes.push(res.markdown)
        }
      } catch (err) {
        setEtat({
          type: 'erreur',
          message: `${messageErreur(err, 'Planche impossible à créer')}${
            lignes.length > 0
              ? ` (${String(lignes.length)} photo(s) déjà envoyée(s), dans la médiathèque).`
              : ''
          }`,
        })
        return
      } finally {
        void invaliderImages.invalidateQueries({
          queryKey: classeurKeys.images(classeurId),
        })
      }
      const bloc = [':::photos', ...lignes, ':::'].join('\n')
      appliquerQuandLibre(
        () => editeurRef.current,
        (valeur) =>
          insererTexteEnBloc(
            valeur,
            Math.min(debut ?? valeur.length, valeur.length),
            Math.min(fin ?? debut ?? valeur.length, valeur.length),
            bloc,
          ),
        () =>
          setContenu((prev) =>
            appliquerEdition(
              prev,
              insererTexteEnBloc(prev, prev.length, prev.length, bloc),
            ),
          ),
      )
      setEtat({
        type: 'ok',
        message: `Planche de ${String(lignes.length)} photo(s) ajoutée. Cliquez sur une photo dans l'aperçu pour lui donner une légende ou la recadrer.`,
      })
    },
    [classeurId, editeurRef, invaliderImages, setContenu],
  )

  /**
   * Retouche d'une image DÉJÀ placée : ouvre le dialogue sur l'image cliquée
   * dans l'aperçu, avec sa légende et sa taille actuelles.
   */
  const retoucher = useCallback(
    (
      chemin: string,
      url: string,
      ligne?: number,
      contexte: 'page' | 'planche' = 'page',
      photo = false,
      recadrer = false,
    ) => {
      const valeur = editeurRef.current?.value ?? contenu
      const t = trouverImage(valeur, chemin, ligne)
      if (!t) {
        setEtat({
          type: 'erreur',
          message: "Cette image n'est plus dans le texte.",
        })
        return
      }
      setEtat({ type: 'repos' })
      setEnRetouche({
        chemin,
        ligne,
        url,
        nom: t.alt,
        taille: t.taille,
        cadre: t.cadre,
        ajustement: t.ajustement,
        disposition: dispositionImage(valeur, t.debut),
        recadrer,
        contexte,
        photo,
      })
    },
    [contenu, editeurRef],
  )

  /**
   * Réglage RAPIDE depuis la barre flottante (2026-10-01) : disposition,
   * taille ou ajustement changés d'un clic, sans dialogue — la ligne (et au
   * besoin le bloc de colonnes) est réécrite ; Ctrl + Z l'annule.
   */
  const ajusterImage = useCallback(
    (
      chemin: string,
      ligne: number | undefined,
      changement: {
        disposition?: Disposition
        taille?: TailleImage
        ajustement?: AjustementImage
      },
    ) => {
      const ed = editeurRef.current
      if (!ed) return
      const t = trouverImage(ed.value, chemin, ligne)
      if (!t) return
      const disposition =
        changement.disposition ?? dispositionImage(ed.value, t.debut)
      let taille = changement.taille ?? t.taille
      // Pleine largeur : pas de place pour du texte à côté.
      if (disposition !== 'centre' && taille === 'pleine') taille = 'grande'
      const jeton = jetonImage(
        t.alt,
        chemin,
        taille,
        t.cadre,
        changement.ajustement ?? t.ajustement,
      )
      appliquerDansEditeur(
        ed,
        editionDisposee(ed.value, t.debut, t.fin, jeton, disposition),
      )
    },
    [editeurRef],
  )

  /**
   * Applique la retouche (2026-10-01, recadrage NON destructif) : rien
   * n'est envoyé ni coupé — la ligne de l'image est réécrite avec sa légende,
   * sa taille et son cadre (réglages du document ; l'image reste entière en
   * base). Par l'historique du navigateur : Ctrl + Z la ramène.
   */
  const appliquerRetouche = useCallback(
    (preparation: PreparationImage & { disposition?: Disposition }) => {
      const cible = enRetouche
      if (cible === null) return
      const taille =
        cible.contexte === 'planche'
          ? 'auto'
          : (preparation.taille ?? cible.taille)
      const legende = preparation.legende ?? cible.nom
      const cadre =
        preparation.cadre === undefined ? cible.cadre : preparation.cadre
      const ajustement = preparation.ajustement ?? cible.ajustement
      const disposition = preparation.disposition ?? cible.disposition
      const calculer = (valeur: string): Edition => {
        const t = trouverImage(valeur, cible.chemin, cible.ligne)
        if (!t) return { debut: 0, fin: 0, texte: '', selection: [0, 0] }
        const jeton = jetonImage(
          legende,
          cible.chemin,
          taille,
          cadre,
          ajustement,
        )
        return editionDisposee(valeur, t.debut, t.fin, jeton, disposition)
      }
      setEnRetouche(null)
      appliquerQuandLibre(
        () => editeurRef.current,
        calculer,
        () => setContenu((prev) => appliquerEdition(prev, calculer(prev))),
      )
      setEtat({
        type: 'ok',
        message: `Image ${LIBELLE_DISPOSITION[disposition]}, ${LIBELLE_TAILLE[taille]}${cadre ? ", recadrée (l'image entière reste conservée)" : ''}.`,
      })
    },
    [editeurRef, enRetouche, setContenu],
  )

  const premiereImage = (fichiers: FileList | null | undefined) =>
    fichiers ? Array.from(fichiers).find(estImage) : undefined

  const onPaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const file = premiereImage(e.clipboardData.files)
      if (!file) return
      e.preventDefault()
      setEmplacement(null)
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
      setEmplacement(null)
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

  const onPlancheChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const fichiers = Array.from(e.target.files ?? []).filter(estImage)
      e.target.value = ''
      void envoyerPlanche(fichiers)
    },
    [envoyerPlanche],
  )

  return {
    etat,
    inputRef,
    plancheRef,
    onInputChange,
    onPlancheChange,
    ouvrirSelecteur: () => {
      setEmplacement(null)
      inputRef.current?.click()
    },
    emplacement,
    remplirEmplacement,
    ouvrirPlanche: () => plancheRef.current?.click(),
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
    annulerPreparation: () => {
      setEnPreparation(null)
      setEmplacement(null)
    },
    envoyer,
    enRetouche,
    retoucher,
    ajusterImage,
    annulerRetouche: () => setEnRetouche(null),
    appliquerRetouche,
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
        legendeInitiale={image.emplacement?.alt ?? ''}
        tailleInitiale={image.emplacement?.taille ?? 'auto'}
        contexte={image.emplacement?.contexte ?? 'page'}
        envoi={image.etat.type === 'envoi'}
        onAnnuler={image.annulerPreparation}
        onValider={(preparation) => {
          if (image.enPreparation)
            void image.envoyer(image.enPreparation, preparation)
        }}
      />
      <ImagePreparationDialog
        existante={
          image.enRetouche
            ? { url: image.enRetouche.url, nom: image.enRetouche.nom }
            : null
        }
        tailleInitiale={image.enRetouche?.taille ?? 'auto'}
        legendeInitiale={image.enRetouche?.nom ?? ''}
        cadreInitial={image.enRetouche?.cadre ?? null}
        dispositionInitiale={image.enRetouche?.disposition ?? 'centre'}
        recadrerDOffice={image.enRetouche?.recadrer ?? false}
        ajustementInitial={image.enRetouche?.ajustement ?? 'remplir'}
        estPhotoExistante={image.enRetouche?.photo ?? false}
        contexte={image.enRetouche?.contexte ?? 'page'}
        envoi={image.etat.type === 'envoi'}
        onAnnuler={image.annulerRetouche}
        onValider={image.appliquerRetouche}
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
      <input
        ref={image.plancheRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={image.onPlancheChange}
      />
    </>
  )
}

/**
 * Boutons d'image de la barre : image seule, planche de photos, étape
 * illustrée, médiathèque.
 */
export function BoutonsImage({ image }: { image: ImageInsertion }) {
  const envoi = image.etat.type === 'envoi'
  return (
    <ButtonGroup>
      <IconAction
        label="Ajouter une image (ou collez-la, ou glissez-la dans le texte)"
        icon={<ImagePlus />}
        busy={envoi}
        disabled={!image.actif}
        onPointerDown={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={image.ouvrirSelecteur}
      />
      <IconAction
        label="Planche de photos : plusieurs photos rangées en grille, légendées"
        icon={<LayoutGrid />}
        disabled={!image.actif || envoi}
        onPointerDown={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={image.ouvrirPlanche}
      />
      <IconAction
        label="Médiathèque : reprendre une image du classeur"
        icon={<Images />}
        disabled={!image.actif}
        onPointerDown={(e) => e.preventDefault()}
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
          {etat.rang
            ? `Envoi de la photo ${String(etat.rang.n)} sur ${String(etat.rang.sur)}…`
            : `Conversion et envoi de ${etat.nom}…`}
        </>
      )}
      {(etat.type === 'ok' || etat.type === 'erreur') && etat.message}
    </p>
  )
}
