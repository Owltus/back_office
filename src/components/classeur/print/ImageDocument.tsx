import { useQuery } from '@tanstack/react-query'

import { useImages } from '#/components/classeur/hooks/useImages.ts'
import { classeurKeys } from '#/lib/classeur/keys.ts'
import { estPhoto } from '#/lib/classeur/miseEnPageImage.ts'
import {
  tailleDepuisTitre,
  telechargerImage,
  urlObjetImage,
} from '#/lib/classeur/images.ts'

/*
 * Image d'un document, lue par l'API AUTHENTIFIÉE du Storage (bucket privé,
 * RLS appliquée à chaque lecture) et affichée par une URL `blob:` propre au
 * navigateur — aucune URL publique n'existe (décision utilisateur du
 * 2026-09-26 : « exposées sur le web sans RLS, ce n'est pas possible »).
 *
 * Le `Blob` est mis en cache par TanStack Query (immuable : le chemin porte
 * un UUID, `staleTime: Infinity`) et n'est JAMAIS persisté sur disque
 * (`survitAuJson` refuse une instance). L'URL `blob:` est créée une fois par
 * chemin et gardée pour la session (`urlObjetImage`) : les pages A4 sont
 * des COPIES HTML du conteneur de mesure, elles doivent pointer vers une
 * URL encore vivante après le démontage du composant qui l'a créée.
 *
 * `data-image-status="pending"` pendant le chargement : la pagination
 * l'attend (`usePagination.waitForImages`), comme pour Mermaid.
 */
export function ImageDocument({
  chemin,
  alt,
  title,
}: {
  chemin: string
  alt?: string
  /** Titre Markdown : porte la taille (voir `markdownImage`). */
  title?: string
}) {
  // Taille : `data-taille`, mise en page par `classeur.css` (jamais de style
  // en ligne : une planche ou une étape imposent leur propre cadre).
  const taille = tailleDepuisTitre(title)
  // Photo ou capture (`data-genre`) : une photo se réduit sans perte, une
  // capture non (son texte deviendrait illisible). Lu dans la fiche de la
  // médiathèque, une seule lecture par classeur (cache partagé).
  const classeurId = Number(chemin.split('/')[0])
  const fiches = useImages(classeurId)
  const fiche = fiches.data?.find(
    (f) => f.chemin.toLowerCase() === chemin.toLowerCase(),
  )
  const image = useQuery({
    queryKey: classeurKeys.image(chemin),
    queryFn: () => telechargerImage(chemin),
    staleTime: Infinity,
    retry: 1,
  })

  // La médiathèque est attendue aussi : sa réponse change la hauteur de
  // l'image, et la pagination ne mesure qu'une fois tout chargé.
  if (image.isPending || fiches.isPending) {
    return (
      <span
        data-image-status="pending"
        aria-busy="true"
        aria-label={alt ?? 'Image en cours de chargement'}
        style={{ display: 'inline-block', width: '100%', height: '2mm' }}
      />
    )
  }
  if (image.isError) {
    return (
      <span
        data-image-status="error"
        role="img"
        aria-label={alt ?? 'Image indisponible'}
        style={{
          display: 'inline-block',
          border: '0.5pt dashed #666',
          padding: '2mm 4mm',
          color: '#666',
          fontSize: '8pt',
        }}
      >
        Image indisponible{alt ? ` : ${alt}` : ''}
      </span>
    )
  }
  return (
    <img
      src={urlObjetImage(chemin, image.data)}
      alt={alt ?? ''}
      data-image-status="rendered"
      data-taille={taille}
      data-genre={
        fiche ? (estPhoto(fiche.nom) ? 'photo' : 'capture') : undefined
      }
      // Lu au clic dans l'aperçu d'édition (retouche de l'image) ; suit les
      // pages A4, qui sont des copies HTML.
      data-chemin={chemin}
    />
  )
}
