/*
 * Mise en page d'une image, calculée comme `classeur.css` (2026-10-01, plan
 * `classeur-images-blocs`) : la boîte qu'elle occupera sur la page, et les
 * CONSEILS que le dialogue de préparation affiche — c'est ainsi que l'app
 * guide l'utilisateur au lieu de lui laisser des réglages libres.
 */

import type { TailleImage } from '#/lib/classeur/images.ts'
import { CONTENT_WIDTH_MM } from '#/lib/classeur/print/constants.ts'

/*
 * PHOTO ou CAPTURE : une photo de téléphone peut être réduite sans perte
 * (9 cm de haut au plus en automatique), une capture d'écran non — son texte
 * deviendrait illisible (15 cm au plus, jamais agrandie). Reconnue au nom
 * d'origine gardé par la médiathèque (`PXL_…`, `IMG_…`) ; une image collée
 * depuis le presse-papiers est une capture.
 */
const NOM_PHOTO = /^(PXL|IMG|DSC|DSCN|MVIMG)[_-]?\d/i

export function estPhoto(nom: string | null | undefined): boolean {
  return NOM_PHOTO.test((nom ?? '').trim())
}

/* Repères de `classeur.css`, en mm (zone de contenu 190 mm). */
const PX_EN_MM = 25.4 / 96
const HAUTEUR_MAX_MM: Record<TailleImage, number> = {
  auto: 150,
  petite: 55,
  moyenne: 85,
  pleine: 170,
}
const HAUTEUR_MAX_PHOTO_AUTO_MM = 90
const LARGEUR_TAILLE: Record<Exclude<TailleImage, 'auto'>, number> = {
  petite: 0.33,
  moyenne: 0.5,
  pleine: 1,
}

/** Boîte de l'image sur la page (mm), d'après `classeur.css`. */
export function boiteSurPage(
  largeurPx: number,
  hauteurPx: number,
  taille: TailleImage,
  { photo = false }: { photo?: boolean } = {},
): { largeur: number; hauteur: number } {
  const ratio = largeurPx / Math.max(1, hauteurPx)
  const hMax =
    taille === 'auto' && photo
      ? HAUTEUR_MAX_PHOTO_AUTO_MM
      : HAUTEUR_MAX_MM[taille]
  let l =
    taille === 'auto'
      ? Math.min(CONTENT_WIDTH_MM, largeurPx * PX_EN_MM)
      : CONTENT_WIDTH_MM * LARGEUR_TAILLE[taille]
  let h = l / ratio
  if (h > hMax) {
    h = hMax
    l = h * ratio
  }
  return { largeur: l, hauteur: h }
}

/** Conseils non bloquants sur l'image cadrée (pixels après conversion). */
export function conseilsImage(
  largeurPx: number,
  hauteurPx: number,
  { photo }: { photo: boolean },
): string[] {
  const conseils: string[] = []
  const ratio = largeurPx / Math.max(1, hauteurPx)
  if (!photo && largeurPx > 1100) {
    conseils.push(
      "Capture très large : une fois imprimé, son texte sera trop petit pour être lu. Recadrez sur la partie utile de l'écran.",
    )
  }
  if (ratio > 6) {
    conseils.push(
      "Bandeau très fin : recadrez sur l'élément utile (un bouton, une case) pour qu'il soit lisible.",
    )
  }
  if (ratio < 0.77) {
    conseils.push(
      'Image en hauteur : sa hauteur sera limitée sur la page. Recadrez au format 4:3 pour qu’elle prenne moins de place.',
    )
  }
  return conseils
}
