/*
 * IMAGES des documents du Classeur — « un truc de très simple » (demande
 * utilisateur du 2026-09-26) : on donne une image, elle est convertie en
 * WebP dans le navigateur, compressée, envoyée au Storage Supabase, et le
 * Markdown reçoit `![nom](url)`.
 *
 * Chaîne :
 *   fichier (jpg, png, heic si le navigateur le décode, …)
 *   → `createImageBitmap` (orientation EXIF appliquée)
 *   → redimension au plus long côté `MAX_COTE_PX` (1600 px : une page A4
 *     imprimée fait ~190 mm de large, 1600 px c'est ~210 dpi, au-delà
 *     l'œil ne voit rien de plus et le poids explose)
 *   → `canvas.toBlob('image/webp', QUALITE_WEBP)` (0,8 : compression
 *     forte, artefacts invisibles sur photos et schémas)
 *   → si encore > `MAX_WEBP_BYTES`, seconde passe plus serrée
 *   → upload dans le bucket `classeur-images` sous `<classeurId>/<uuid>.webp`
 *     (le bucket n'accepte que `image/webp` ≤ 2 Mo, la RLS n'accepte que
 *     les classeurs modifiables par l'appelant :
 *     `supabase/classeur_images_2026-09-26.sql`).
 *
 * Tout ce qui ne touche pas au DOM est pur et testé (`images.test.ts`).
 */

import { supabase } from '#/lib/supabase.ts'

export const BUCKET_IMAGES = 'classeur-images'
/** Taille maximale du fichier SOURCE accepté (avant conversion). */
export const MAX_IMAGE_SOURCE_BYTES = 25 * 1024 * 1024
/** Plus long côté après redimension. */
export const MAX_COTE_PX = 1600
/** Qualité WebP de la première passe (0..1). */
export const QUALITE_WEBP = 0.8
/** Seconde passe si la première dépasse la borne du bucket. */
export const QUALITE_WEBP_SERREE = 0.65
export const MAX_COTE_PX_SERRE = 1280
/** Borne du bucket (file_size_limit). */
export const MAX_WEBP_BYTES = 2 * 1024 * 1024

export interface Dimensions {
  largeur: number
  hauteur: number
}

/** Réduit pour que le plus long côté ne dépasse pas `maxCote`, sans jamais agrandir. */
export function dimensionsReduites(
  largeur: number,
  hauteur: number,
  maxCote: number = MAX_COTE_PX,
): Dimensions {
  if (largeur <= 0 || hauteur <= 0) return { largeur: 1, hauteur: 1 }
  const plusLong = Math.max(largeur, hauteur)
  if (plusLong <= maxCote) return { largeur, hauteur }
  const facteur = maxCote / plusLong
  return {
    largeur: Math.max(1, Math.round(largeur * facteur)),
    hauteur: Math.max(1, Math.round(hauteur * facteur)),
  }
}

/** Chemin dans le bucket : `<classeurId>/<uuid>.webp` (le dossier porte la RLS). */
export function cheminImage(
  classeurId: number,
  uuid: string = crypto.randomUUID(),
): string {
  if (!Number.isInteger(classeurId) || classeurId <= 0) {
    throw new Error('Classeur invalide pour ranger une image.')
  }
  return `${String(classeurId)}/${uuid}.webp`
}

/** Texte alternatif tiré du nom de fichier : sans extension, sans crochets ni retours. */
export function texteAlternatif(nomFichier: string): string {
  const sansExtension = nomFichier.replace(/\.[a-z0-9]{2,5}$/i, '')
  const propre = sansExtension
    .replace(/[[\]\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return propre === '' ? 'image' : propre
}

/** La ligne Markdown à insérer. */
export function markdownImage(nomFichier: string, url: string): string {
  // Espaces et parenthèses casseraient la syntaxe `![](…)` ;
  // `encodeURIComponent` laisse les parenthèses, on les encode à la main.
  const urlSure = url.replace(/[\s()]/g, (c) =>
    c === '(' ? '%28' : c === ')' ? '%29' : encodeURIComponent(c),
  )
  return `![${texteAlternatif(nomFichier)}](${urlSure})`
}

/** Vrai pour un fichier que le navigateur a des chances de décoder comme image. */
export function estImage(file: { type: string; name: string }): boolean {
  if (file.type.startsWith('image/')) return true
  return /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif)$/i.test(file.name)
}

/** Message d'erreur si le fichier source ne convient pas, `null` sinon. */
export function refusImageSource(file: {
  type: string
  name: string
  size: number
}): string | null {
  if (!estImage(file)) return `Ce fichier n'est pas une image : ${file.name}`
  if (file.size > MAX_IMAGE_SOURCE_BYTES) {
    return `Image trop volumineuse (${String(Math.round(MAX_IMAGE_SOURCE_BYTES / (1024 * 1024)))} Mo maximum) : ${file.name}`
  }
  return null
}

export interface ImageWebp extends Dimensions {
  blob: Blob
}

/**
 * Convertit dans le navigateur. Rejette si le navigateur ne sait pas
 * encoder en WebP (Safari < 14) ou ne décode pas le format source.
 */
export async function convertirEnWebp(
  file: Blob,
  maxCote: number = MAX_COTE_PX,
  qualite: number = QUALITE_WEBP,
): Promise<ImageWebp> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error(
      'Image illisible par ce navigateur (format non pris en charge ou fichier corrompu).',
    )
  }
  try {
    const dims = dimensionsReduites(bitmap.width, bitmap.height, maxCote)
    const canvas = document.createElement('canvas')
    canvas.width = dims.largeur
    canvas.height = dims.hauteur
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Conversion impossible (canvas indisponible).')
    ctx.drawImage(bitmap, 0, 0, dims.largeur, dims.hauteur)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', qualite)
    })
    if (!blob || blob.type !== 'image/webp') {
      throw new Error('Ce navigateur ne sait pas encoder en WebP.')
    }
    return { blob, ...dims }
  } finally {
    bitmap.close()
  }
}

export interface ImageTeleversee extends Dimensions {
  url: string
  chemin: string
  octetsSource: number
  octetsWebp: number
  /** La ligne Markdown prête à insérer. */
  markdown: string
}

/**
 * Convertit puis envoie ; rend l'URL publique et la ligne Markdown.
 * Erreurs : fichier refusé, conversion impossible, image encore trop lourde
 * après la passe serrée, refus du Storage (RLS : classeur d'un autre).
 */
export async function televerserImage(
  classeurId: number,
  file: File,
): Promise<ImageTeleversee> {
  const refus = refusImageSource(file)
  if (refus) throw new Error(refus)

  let image = await convertirEnWebp(file)
  if (image.blob.size > MAX_WEBP_BYTES) {
    image = await convertirEnWebp(file, MAX_COTE_PX_SERRE, QUALITE_WEBP_SERREE)
  }
  if (image.blob.size > MAX_WEBP_BYTES) {
    throw new Error(
      `Image encore trop lourde après compression (${formaterOctets(image.blob.size)}, 2 Mo maximum).`,
    )
  }

  const chemin = cheminImage(classeurId)
  const { error } = await supabase.storage
    .from(BUCKET_IMAGES)
    .upload(chemin, image.blob, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: false,
    })
  if (error) throw error

  const { data } = supabase.storage.from(BUCKET_IMAGES).getPublicUrl(chemin)
  return {
    url: data.publicUrl,
    chemin,
    octetsSource: file.size,
    octetsWebp: image.blob.size,
    largeur: image.largeur,
    hauteur: image.hauteur,
    markdown: markdownImage(file.name, data.publicUrl),
  }
}

export function formaterOctets(octets: number): string {
  if (octets < 1024) return `${String(octets)} o`
  if (octets < 1024 * 1024) return `${String(Math.round(octets / 1024))} ko`
  return `${(octets / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`
}
