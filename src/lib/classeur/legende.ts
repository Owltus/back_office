/*
 * Légende d'une image (2026-10-01) : le texte entre crochets
 * `![légende](chemin)` s'imprime sous l'image — convention Pandoc
 * (`implicit_figures`).
 *
 * Décision utilisateur : les textes GÉNÉRIQUES déjà en base ne sont PAS
 * réécrits, ils sont simplement masqués — 93 « <titre du document> –
 * capture N » (import des procédures Word) et 9 noms de fichiers de
 * téléphone « PXL_20260930_… ». Une légende qui répète un nom de fichier
 * n'apprend rien au lecteur ; la relecture signale « image sans légende ».
 */

/** Nom de fichier d'appareil photo, de capture d'écran ou de messagerie. */
const NOM_DE_FICHIER =
  /^(?:PXL|IMG|DSC|DSCN|DCIM|MVIMG|VID|Screenshot|Screen Shot|Capture d[’']écran|Capture|WhatsApp Image|Photo|image|img)?[\s_.-]*\d[\d\s_.:-]*(?:(?:à|at)\s[\d\s_.:-]+)?(?:[\s_.-]*\(\d+\))?(?:\.[a-z0-9]{2,5})?$/i

/** « <titre> – capture 3 », « … - capture 12 ». */
const CAPTURE_NUMEROTEE = /\s[–—-]\s*capture\s*\d+\s*$/i

/** Vrai si le texte de l'image n'est pas une vraie légende. */
export function estLegendeGenerique(alt: string | null | undefined): boolean {
  const texte = (alt ?? '').trim()
  if (texte === '') return true
  if (/^(image|photo|capture)$/i.test(texte)) return true
  if (/\.(png|jpe?g|gif|webp|bmp|avif|heic|heif|tiff?)$/i.test(texte))
    return true
  return NOM_DE_FICHIER.test(texte) || CAPTURE_NUMEROTEE.test(texte)
}

/** La légende à imprimer sous l'image, ou `null` s'il n'y en a pas de vraie. */
export function legendeAffichable(
  alt: string | null | undefined,
): string | null {
  return estLegendeGenerique(alt) ? null : (alt ?? '').trim()
}

/** Une légende sûre dans `![…]` : ni crochets ni retours à la ligne. */
export function nettoyerLegende(texte: string): string {
  return texte
    .replace(/[[\]\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
