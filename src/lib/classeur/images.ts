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
 *     `supabase/classeur_images_2026-09-26.sql`)
 *   → le Markdown reçoit le CHEMIN, pas une URL : `![nom](2/uuid.webp)`.
 *
 * LECTURE — bucket PRIVÉ, aucune URL publique (décision utilisateur du
 * 2026-09-26) : `telechargerImage(chemin)` passe par l'API authentifiée
 * (`storage.download`, RLS de lecture à chaque requête) et
 * `urlObjetImage` fournit une URL `blob:` locale au navigateur pour le
 * `<img>` (`components/classeur/print/ImageDocument.tsx`). Un chemin connu
 * ne donne rien sans session ni droit de lecture sur la page.
 *
 * Tout ce qui ne touche pas au DOM est pur et testé (`images.test.ts`).
 */

import {
  insertImage,
  softDeleteImage,
  updateItem,
} from '#/lib/classeur/service.ts'
import type {
  ChapterContent,
  DbChapter,
  DbImage,
} from '#/lib/classeur/types.ts'
import { nettoyerLegende } from '#/lib/classeur/legende.ts'
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

/** Largeurs possibles d'une image dans la page (pourcentage de la zone de contenu). */
export const LARGEURS_IMAGE = [100, 75, 50, 33] as const
export type LargeurImage = (typeof LARGEURS_IMAGE)[number]

export function libelleLargeur(largeur: number): string {
  switch (largeur) {
    case 100:
      return 'Pleine largeur'
    case 75:
      return 'Trois quarts'
    case 50:
      return 'Moitié'
    case 33:
      return 'Tiers'
    default:
      return `${String(largeur)} %`
  }
}

/** Rectangle de recadrage, en pixels de l'image (après rotation). */
export interface Recadrage {
  x: number
  y: number
  largeur: number
  hauteur: number
}

/**
 * Ce que le dialogue de préparation rend : un recadrage, une taille et une
 * légende, tous facultatifs.
 */
export interface PreparationImage {
  recadrage?: Recadrage
  /** Absente = automatique. */
  taille?: TailleImage
  /** Texte imprimé sous l'image (`![légende](…)`). */
  legende?: string
}

/*
 * TAILLE d'une image (2026-10-01, plan `classeur-images-blocs`) : l'app
 * décide, l'utilisateur ne choisit qu'entre quatre options — plus de curseur
 * libre ni de position gauche / droite (l'habillage laissait de grands vides
 * à côté des phrases courtes d'une procédure ; aucun référentiel de modes
 * opératoires ne le pratique).
 *
 *   auto     largeur naturelle, bornée à la page ET à 90 mm de haut
 *   petite   un tiers de la largeur      moyenne   la moitié
 *   pleine   toute la largeur (captures d'écran à lire)
 *
 * Écrite dans le TITRE de l'image, seul canal que le Markdown standard laisse
 * à une image : `![légende](chemin "petite")`. Lecture TOLÉRANTE des anciens
 * contenus (2026-09-30) : `largeur=NN` donne la taille la plus proche,
 * `position=…` est ignoré.
 */
export type TailleImage = 'auto' | 'petite' | 'moyenne' | 'pleine'

export const TAILLES_IMAGE: readonly TailleImage[] = [
  'auto',
  'petite',
  'moyenne',
  'pleine',
]

/** Titre Markdown d'une taille (avec son espace), vide en automatique. */
export function titreImage(taille: TailleImage = 'auto'): string {
  return taille === 'auto' ? '' : ` "${taille}"`
}

/** Taille portée par le titre d'une image Markdown. */
export function tailleDepuisTitre(
  title: string | null | undefined,
): TailleImage {
  const t = (title ?? '').trim().toLowerCase()
  const mot = /(?:^|\s)(petite|moyenne|pleine)(?:\s|$)/.exec(t)
  if (mot) return mot[1] as TailleImage
  // Ancienne syntaxe (2026-09-30).
  const m = /(?:^|\s)largeur=(\d{1,3})(?:\s|$)/.exec(t)
  if (!m) return 'auto'
  const n = Number(m[1])
  if (n < 10 || n >= 100) return 'auto'
  return n <= 40 ? 'petite' : n <= 62 ? 'moyenne' : 'pleine'
}

/**
 * Borne un rectangle de recadrage à l'image (jamais vide, jamais hors
 * champ). `null` si le rectangle couvre toute l'image (rien à recadrer).
 */
export function recadrageBorne(
  largeur: number,
  hauteur: number,
  r: Recadrage | undefined,
): Recadrage | null {
  if (!r) return null
  const x = Math.min(Math.max(0, Math.round(r.x)), Math.max(0, largeur - 1))
  const y = Math.min(Math.max(0, Math.round(r.y)), Math.max(0, hauteur - 1))
  const w = Math.max(1, Math.min(Math.round(r.largeur), largeur - x))
  const h = Math.max(1, Math.min(Math.round(r.hauteur), hauteur - y))
  if (x === 0 && y === 0 && w === largeur && h === hauteur) return null
  return { x, y, largeur: w, hauteur: h }
}

/** Dimensions de la boîte englobante d'une image tournée de `rotation` degrés. */
export function boiteTournee(
  largeur: number,
  hauteur: number,
  rotation: number,
): Dimensions {
  const rad = (rotation * Math.PI) / 180
  const c = Math.abs(Math.cos(rad))
  const s = Math.abs(Math.sin(rad))
  return {
    largeur: Math.round(largeur * c + hauteur * s),
    hauteur: Math.round(largeur * s + hauteur * c),
  }
}

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

/** Vrai si `src` est un chemin du bucket (`<classeurId>/<uuid>.webp`), donc à lire par l'API. */
export function estCheminImage(src: string | null | undefined): src is string {
  return (
    typeof src === 'string' &&
    /^[0-9]{1,12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i.test(
      src,
    )
  )
}

/**
 * La ligne Markdown à insérer : `![légende](chemin)` (jamais une URL), avec
 * la taille en titre hors automatique (`ImageDocument` la lit,
 * `tailleDepuisTitre`). Légende vide par défaut : un nom de fichier n'en est
 * pas une (`legende.ts`).
 */
export function markdownImage(
  legende: string,
  url: string,
  taille: TailleImage = 'auto',
): string {
  // Espaces et parenthèses casseraient la syntaxe `![](…)` ;
  // `encodeURIComponent` laisse les parenthèses, on les encode à la main.
  const urlSure = url.replace(/[\s()]/g, (c) =>
    c === '(' ? '%28' : c === ')' ? '%29' : encodeURIComponent(c),
  )
  return `![${nettoyerLegende(legende)}](${urlSure}${titreImage(taille)})`
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
export interface OptionsConversion {
  maxCote?: number
  qualite?: number
  /** Rotation appliquée AVANT le recadrage (degrés, sens horaire). */
  rotation?: number
  /** Recadrage en pixels de l'image TOURNÉE (repère de `react-easy-crop`). */
  recadrage?: Recadrage
}

export async function convertirEnWebp(
  file: Blob,
  options: OptionsConversion = {},
): Promise<ImageWebp> {
  const maxCote = options.maxCote ?? MAX_COTE_PX
  const qualite = options.qualite ?? QUALITE_WEBP
  const rotation = (((options.rotation ?? 0) % 360) + 360) % 360
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error(
      'Image illisible par ce navigateur (format non pris en charge ou fichier corrompu).',
    )
  }
  try {
    // 1) Source tournée (canvas de la boîte englobante) ou bitmap tel quel.
    let source: CanvasImageSource = bitmap
    let sw = bitmap.width
    let sh = bitmap.height
    if (rotation !== 0) {
      const boite = boiteTournee(bitmap.width, bitmap.height, rotation)
      const tourne = document.createElement('canvas')
      tourne.width = boite.largeur
      tourne.height = boite.hauteur
      const tctx = tourne.getContext('2d')
      if (!tctx) throw new Error('Conversion impossible (canvas indisponible).')
      tctx.translate(boite.largeur / 2, boite.hauteur / 2)
      tctx.rotate((rotation * Math.PI) / 180)
      tctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2)
      source = tourne
      sw = boite.largeur
      sh = boite.hauteur
    }
    // 2) Recadrage borné, puis réduction au plus long côté.
    const zone = recadrageBorne(sw, sh, options.recadrage) ?? {
      x: 0,
      y: 0,
      largeur: sw,
      hauteur: sh,
    }
    const dims = dimensionsReduites(zone.largeur, zone.hauteur, maxCote)
    const canvas = document.createElement('canvas')
    canvas.width = dims.largeur
    canvas.height = dims.hauteur
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Conversion impossible (canvas indisponible).')
    ctx.drawImage(
      source,
      zone.x,
      zone.y,
      zone.largeur,
      zone.hauteur,
      0,
      0,
      dims.largeur,
      dims.hauteur,
    )
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

export interface ImageTeleversee {
  /** La fiche créée dans `classeur_images` (médiathèque du classeur). */
  image: DbImage
  octetsSource: number
  /** La ligne Markdown prête à insérer. */
  markdown: string
}

/**
 * Convertit puis envoie ; rend le chemin et la ligne Markdown.
 * Erreurs : fichier refusé, conversion impossible, image encore trop lourde
 * après la passe serrée, refus du Storage (RLS : classeur d'un autre).
 */
export async function televerserImage(
  classeurId: number,
  file: File,
  preparation: PreparationImage = {},
): Promise<ImageTeleversee> {
  const refus = refusImageSource(file)
  if (refus) throw new Error(refus)

  const base = { recadrage: preparation.recadrage }
  let image = await convertirEnWebp(file, base)
  if (image.blob.size > MAX_WEBP_BYTES) {
    image = await convertirEnWebp(file, {
      ...base,
      maxCote: MAX_COTE_PX_SERRE,
      qualite: QUALITE_WEBP_SERREE,
    })
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

  // Fiche dans la médiathèque. Si elle échoue, le fichier ne doit pas
  // rester orphelin dans le bucket : on le retire avant de remonter.
  let fiche: DbImage
  try {
    fiche = await insertImage(classeurId, {
      chemin,
      nom: texteAlternatif(file.name),
      taille: image.blob.size,
      largeur: image.largeur,
      hauteur: image.hauteur,
    })
  } catch (err) {
    await supabase.storage.from(BUCKET_IMAGES).remove([chemin])
    throw err
  }

  return {
    image: fiche,
    octetsSource: file.size,
    markdown: markdownImage(
      preparation.legende ?? '',
      chemin,
      preparation.taille ?? 'auto',
    ),
  }
}

/**
 * Supprime une image PROPREMENT (demande utilisateur du 2026-09-26) :
 *   1. les documents qui la référencent sont réécrits sans elle
 *      (`retirerImageDuMarkdown`, via `updateItem` : la garde des points
 *      de restauration s'applique) — AVANT toute étape irréversible ;
 *   2. le fichier est retiré du bucket (RLS : classeur modifiable) ;
 *   3. la fiche est marquée supprimée.
 * Un échec à l'étape 1 laisse l'image intacte (les documents déjà
 * réécrits le restent : ils sont simplement sans l'image).
 * Rend le nombre de documents modifiés.
 */
export async function supprimerImage(
  image: DbImage,
  documents: ReadonlyArray<{ id: number; content: string }> = [],
): Promise<{ documentsModifies: number }> {
  let documentsModifies = 0
  for (const doc of documents) {
    const nouveau = retirerImageDuMarkdown(doc.content, image.chemin)
    if (nouveau === doc.content) continue
    await updateItem('document', doc.id, { content: nouveau })
    documentsModifies += 1
  }
  const { error } = await supabase.storage
    .from(BUCKET_IMAGES)
    .remove([image.chemin])
  if (error) throw error
  await softDeleteImage(image.id)
  return { documentsModifies }
}

// ---------------------------------------------------------------------------
// Usages : quels documents référencent quelle image (calcul pur)
// ---------------------------------------------------------------------------

const REF_IMAGE =
  /!\[[^\]]*\]\(\s*<?([0-9]{1,12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp)>?(?:\s+"[^"]*")?\s*\)/gi

/**
 * Retire toute référence à `chemin` d'un Markdown : une ligne qui ne
 * portait que l'image disparaît (avec la ligne vide qu'elle laisserait en
 * double), une référence au milieu d'une ligne est ôtée seule, le reste du
 * texte est conservé à l'octet près. Idempotent.
 */
export function retirerImageDuMarkdown(
  markdown: string,
  chemin: string,
): string {
  const cible = chemin.toLowerCase()
  const sortie: string[] = []
  let derniereRetiree = false
  for (const ligne of markdown.split('\n')) {
    const modifiee = ligne.replace(REF_IMAGE, (tout: string, ch: string) =>
      ch.toLowerCase() === cible ? '' : tout,
    )
    if (modifiee !== ligne && modifiee.trim() === '') {
      derniereRetiree = true
      continue
    }
    if (
      derniereRetiree &&
      modifiee.trim() === '' &&
      sortie.length > 0 &&
      sortie[sortie.length - 1].trim() === ''
    ) {
      continue
    }
    derniereRetiree = false
    sortie.push(modifiee)
  }
  return sortie.join('\n')
}

/** Les chemins d'images référencés par un Markdown (dédoublonnés, ordre d'apparition). */
export function imagesReferencees(markdown: string): string[] {
  const vus = new Set<string>()
  for (const m of markdown.matchAll(REF_IMAGE)) {
    vus.add(m[1].toLowerCase())
  }
  return Array.from(vus)
}

export interface UsageImage {
  chapterId: number
  chapterLabel: string
  documentId: number
  documentTitle: string
}

/**
 * Pour chaque chemin d'image, les documents (non supprimés) qui le
 * référencent, dans l'ordre des chapitres puis des documents.
 */
export function usagesImages(
  chapters: ReadonlyArray<Pick<DbChapter, 'id' | 'label' | 'sort_order'>>,
  content: Pick<ChapterContent, 'documents'>,
): Map<string, UsageImage[]> {
  const usages = new Map<string, UsageImage[]>()
  const chapitres = new Map(chapters.map((c) => [c.id, c]))
  const documents = [...content.documents]
    .filter((d) => d.deleted_at === null)
    .sort((a, b) => {
      const ca = chapitres.get(a.chapter_id)?.sort_order ?? 0
      const cb = chapitres.get(b.chapter_id)?.sort_order ?? 0
      return ca - cb || a.sort_order - b.sort_order || a.id - b.id
    })
  for (const doc of documents) {
    for (const chemin of imagesReferencees(doc.content)) {
      const liste = usages.get(chemin) ?? []
      liste.push({
        chapterId: doc.chapter_id,
        chapterLabel: chapitres.get(doc.chapter_id)?.label ?? '',
        documentId: doc.id,
        documentTitle: doc.title,
      })
      usages.set(chemin, liste)
    }
  }
  return usages
}

/** Télécharge une image par l'API authentifiée (RLS de lecture). */
export async function telechargerImage(chemin: string): Promise<Blob> {
  if (!estCheminImage(chemin)) throw new Error('Chemin d’image invalide.')
  const { data, error } = await supabase.storage
    .from(BUCKET_IMAGES)
    .download(chemin)
  if (error) throw error
  return data
}

/** URL `blob:` par chemin, créée une fois et gardée pour la session (voir `ImageDocument`). */
const urlsObjets = new Map<string, string>()

export function urlObjetImage(chemin: string, blob: Blob): string {
  const connue = urlsObjets.get(chemin)
  if (connue !== undefined) return connue
  const url = URL.createObjectURL(blob)
  urlsObjets.set(chemin, url)
  return url
}

export function formaterOctets(octets: number): string {
  if (octets < 1024) return `${String(octets)} o`
  if (octets < 1024 * 1024) return `${String(Math.round(octets / 1024))} ko`
  return `${(octets / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`
}

/* ------------------------------------------------------------------------ *
 * Retoucher une image DÉJÀ placée (2026-09-30) : sa ligne est réécrite.
 * ------------------------------------------------------------------------ */

/** Une image Markdown du texte : `![alt](chemin "titre")`. */
const JETON_IMAGE = /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"([^"]*)")?\s*\)/g

export interface ImageDansTexte {
  /** Position du jeton dans le texte. */
  debut: number
  fin: number
  alt: string
  chemin: string
  taille: TailleImage
}

/**
 * Trouve l'image `chemin` : d'abord sur la ligne `ligne` (1-based, celle
 * cliquée dans l'aperçu), sinon sa première occurrence dans le texte (une
 * même image peut figurer deux fois : la ligne fait foi quand elle est
 * connue). `null` si l'image n'est plus dans le texte.
 */
export function trouverImage(
  valeur: string,
  chemin: string,
  ligne?: number,
): ImageDansTexte | null {
  const occurrences: ImageDansTexte[] = []
  for (const m of valeur.matchAll(JETON_IMAGE)) {
    if (m[2] !== chemin) continue
    occurrences.push({
      debut: m.index,
      fin: m.index + m[0].length,
      alt: m[1],
      chemin: m[2],
      taille: tailleDepuisTitre(m[3]),
    })
  }
  if (occurrences.length === 0) return null
  if (ligne !== undefined) {
    const numero = (pos: number) => valeur.slice(0, pos).split('\n').length
    const surLaLigne = occurrences.find((o) => numero(o.debut) === ligne)
    if (surLaLigne) return surLaLigne
  }
  return occurrences[0]
}

/** Le jeton réécrit : légende, chemin et taille donnés. */
export function jetonImage(
  legende: string,
  chemin: string,
  taille: TailleImage = 'auto',
): string {
  return `![${nettoyerLegende(legende)}](${chemin}${titreImage(taille)})`
}
