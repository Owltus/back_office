import { useQuery } from '@tanstack/react-query'
import type { CSSProperties } from 'react'

import { useImages } from '#/components/classeur/hooks/useImages.ts'
import { classeurKeys } from '#/lib/classeur/keys.ts'
import { estPhoto } from '#/lib/classeur/miseEnPageImage.ts'
import {
  ajustementApplique,
  ajustementDepuisTitre,
  cadreDepuisTitre,
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
  const genre = fiche ? (estPhoto(fiche.nom) ? 'photo' : 'capture') : undefined
  const img = (
    <img
      src={urlObjetImage(chemin, image.data)}
      alt={alt ?? ''}
      data-image-status="rendered"
      data-taille={taille}
      data-genre={genre}
      // Lu au clic dans l'aperçu d'édition (retouche de l'image) ; suit les
      // pages A4, qui sont des copies HTML.
      data-chemin={chemin}
    />
  )
  // Sans fiche (image hors médiathèque) : l'image seule, règles historiques.
  if (!fiche || fiche.largeur <= 0 || fiche.hauteur <= 0) return img

  /*
   * RECADRAGE NON DESTRUCTIF (2026-10-01) : l'image ENTIÈRE est chargée, et
   * seule la zone du cadre est montrée — une fenêtre (`classeur-image-cadre`,
   * proportions du cadre, `overflow: hidden`) dans laquelle l'image est
   * agrandie et décalée. Toutes les dimensions sont du CSS (`classeur.css`,
   * requêtes de conteneur) : elles valent à l'identique dans la mesure, les
   * pages A4 copiées et l'iframe d'impression.
   */
  const cadre = cadreDepuisTitre(title) ?? {
    x: 0,
    y: 0,
    largeur: 100,
    hauteur: 100,
  }
  const largeurPx = (fiche.largeur * cadre.largeur) / 100
  const hauteurPx = (fiche.hauteur * cadre.hauteur) / 100
  const style = {
    '--r': String(largeurPx / hauteurPx),
    // Taille naturelle de la zone (jamais agrandie en automatique).
    '--nat': `${String(largeurPx * PX_EN_MM)}mm`,
    '--cx': String(cadre.x),
    '--cy': String(cadre.y),
    '--cl': String(cadre.largeur),
    '--ch': String(cadre.hauteur),
  } as CSSProperties
  return (
    <span
      className="classeur-image"
      data-taille={taille}
      data-genre={genre}
      data-ajustement={ajustementApplique(
        ajustementDepuisTitre(title),
        largeurPx / hauteurPx,
      )}
      style={style}
    >
      <span className="classeur-image-cadre">{img}</span>
    </span>
  )
}

/** Un pixel CSS en millimètres (96 px par pouce). */
const PX_EN_MM = 25.4 / 96

/**
 * EMPLACEMENT d'image à remplir (`![légende](a-inserer)`, 2026-10-01) : un
 * cadre gris clair au format 4:3, « Image à insérer », qui occupe la place
 * qu'aura la photo — un pré-rendu de la page sans les images. Même
 * structure que l'image (`classeur-image` > `classeur-image-cadre`) : tailles,
 * planche et étape s'y appliquent sans règle de plus. `data-a-inserer` :
 * un clic dessus, dans l'éditeur, ouvre l'ajout d'une vraie image.
 */
export function ImageAInserer({
  alt,
  title,
}: {
  alt?: string
  title?: string
}) {
  const style = {
    '--r': String(4 / 3),
    '--nat': '120mm',
    '--cx': '0',
    '--cy': '0',
    '--cl': '100',
    '--ch': '100',
  } as CSSProperties
  return (
    <span
      className="classeur-image classeur-a-inserer"
      data-taille={tailleDepuisTitre(title)}
      data-a-inserer="true"
      role="img"
      aria-label={alt ? `Image à insérer : ${alt}` : 'Image à insérer'}
      style={style}
    >
      <span className="classeur-image-cadre">
        {/* Silhouette d'image vide (soleil + montagnes), comme un squelette. */}
        <svg
          className="classeur-a-inserer-ombre"
          viewBox="0 0 48 36"
          aria-hidden="true"
        >
          <circle cx="34" cy="10" r="4.5" />
          <path d="M2 34 L17 15 L27 27 L32 21 L46 34 Z" />
        </svg>
        <span className="classeur-a-inserer-texte">Image à insérer</span>
      </span>
    </span>
  )
}
