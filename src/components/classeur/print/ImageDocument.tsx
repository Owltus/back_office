import { useQuery } from '@tanstack/react-query'

import { classeurKeys } from '#/lib/classeur/keys.ts'
import {
  largeurDepuisTitre,
  positionDepuisTitre,
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
  /** Titre Markdown : porte `largeur=NN` (voir `markdownImage`). */
  title?: string
}) {
  const largeur = largeurDepuisTitre(title)
  // Gauche / droite : image FLOTTANTE, le texte l'entoure (styles dans
  // `classeur.css`, sur `data-position` ; la pagination compte sa hauteur
  // réelle, `paginate.ts`).
  const position = positionDepuisTitre(title)
  const image = useQuery({
    queryKey: classeurKeys.image(chemin),
    queryFn: () => telechargerImage(chemin),
    staleTime: Infinity,
    retry: 1,
  })

  if (image.isPending) {
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
      data-position={position === 'centre' ? undefined : position}
      // Lu au clic dans l'aperçu d'édition (retouche de l'image) ; suit les
      // pages A4, qui sont des copies HTML.
      data-chemin={chemin}
      style={largeur < 100 ? { width: `${String(largeur)}%` } : undefined}
    />
  )
}
