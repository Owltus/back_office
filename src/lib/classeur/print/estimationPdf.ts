/*
 * Estimation d'un PDF téléchargé (« Télécharger le PDF », pages capturées
 * en image) — PURE, sans DOM, pour que l'aperçu prévienne AVANT de lancer
 * un long document sans charger `pdfDirect` (chargé seulement au clic).
 *
 * Repères MESURÉS au navigateur le 2026-10-04 (classeur d'essai n° 24,
 * 64 pages — fonction d'impression depuis retirée —, Chrome, écran
 * de densité 1, capture à l'échelle 2) après l'allègement du clone
 * (`filtreClone`) : 64 pages en 14,3 à 21,2 s (0,22 à 0,33 s par page, ~1 s
 * pour une page à schéma Mermaid), fichier de 14,0 Mo (219 ko par page,
 * pages sans photos réelles). Valeurs retenues un peu au-dessus.
 */

/** Au-delà, l'aperçu affiche une phrase d'avertissement (sans bloquer). */
export const SEUIL_AVERTISSEMENT_PAGES = 40

/** Durée moyenne de capture d'une page (mesurée, arrondie au-dessus). */
export const SECONDES_PAR_PAGE = 0.5

/** Poids moyen d'une page JPEG dans le PDF (mesuré, arrondi au-dessus). */
export const KO_PAR_PAGE = 300

export interface EstimationPdf {
  /** Durée estimée, en secondes. */
  secondes: number
  /** Poids estimé, en Mo. */
  mo: number
}

export function estimerPdf(pages: number): EstimationPdf {
  const n = Number.isFinite(pages) && pages > 0 ? Math.floor(pages) : 0
  return {
    secondes: n * SECONDES_PAR_PAGE,
    mo: (n * KO_PAR_PAGE) / 1024,
  }
}

/** « moins d'une minute », « environ 2 min ». */
export function dureeLisible(secondes: number): string {
  if (secondes < 60) return "moins d'une minute"
  return `environ ${Math.round(secondes / 60)} min`
}

/**
 * Phrase d'avertissement pour un long document, ou `null` sous le seuil.
 * Ni guillemets français ni tiret cadratin (règle des messages).
 */
export function avertissementLongPdf(pages: number): string | null {
  if (!(pages > SEUIL_AVERTISSEMENT_PAGES)) return null
  const { secondes, mo } = estimerPdf(pages)
  return `${pages} pages : la création du PDF prend ${dureeLisible(secondes)}, pour un fichier d'environ ${Math.max(1, Math.round(mo))} Mo.`
}
