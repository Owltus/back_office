import {
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  mmToPx,
} from '#/lib/classeur/print/constants.ts'

/*
 * Zoom de l'aperçu A4 de l'éditeur d'un document (étape 8 du plan
 * `plan/classeur-fonctions-2026-10-04/`) — logique PURE, sans React.
 *
 * Pratique établie (Word, Google Docs, Acrobat, Figma) : deux modes
 * « ajustés » qui suivent la place disponible, des paliers fixes (jamais de
 * pas de 10 %), des bornes 25-400 %, et Ctrl + molette qui garde sous la
 * souris le point qu'elle désigne.
 *
 * Seule l'ÉCRAN change : rien de ce qui s'imprime (pages, pagination,
 * iframe) ne lit ce module.
 */

/** Largeur et hauteur d'une page A4 en px CSS (96 DPI). */
export const A4_LARGEUR_PX = mmToPx(PAGE_WIDTH_MM)
export const A4_HAUTEUR_PX = mmToPx(PAGE_HEIGHT_MM)

export const ECHELLE_MIN = 0.25
export const ECHELLE_MAX = 4

/** Pourcentages proposés dans le menu, comme Word. */
export const PALIERS_MENU = [0.5, 0.75, 1, 1.25, 1.5, 2] as const

/**
 * Paliers des boutons « − » / « + » : ceux du menu, prolongés jusqu'aux
 * bornes pour que « + » et « − » puissent les atteindre.
 */
export const PALIERS = [ECHELLE_MIN, ...PALIERS_MENU, 3, ECHELLE_MAX] as const

/**
 * `ajuster` : la page occupe la largeur de la colonne (sans jamais dépasser
 * 100 %, comportement de l'aperçu avant le zoom) ; `page` : une page entière
 * tient dans la colonne ; un nombre : échelle fixe (1 = 100 %).
 */
export type ModeZoom = 'ajuster' | 'page' | number

/** Place UTILE de la colonne d'aperçu, marges déduites, en px CSS. */
export type PlaceApercu = { largeur: number; hauteur: number }

/** Ramène une échelle dans les bornes ; une valeur non finie vaut 100 %. */
export function bornerEchelle(echelle: number): number {
  if (!Number.isFinite(echelle)) return 1
  return Math.min(ECHELLE_MAX, Math.max(ECHELLE_MIN, echelle))
}

/** « Ajuster à la largeur » : largeur ÷ largeur A4, jamais au-delà de 100 %. */
export function echelleAjustee(largeur: number): number {
  return bornerEchelle(Math.min(1, largeur / A4_LARGEUR_PX))
}

/** « Page entière » : la page tient en largeur ET en hauteur. */
export function echellePage(largeur: number, hauteur: number): number {
  return bornerEchelle(
    Math.min(largeur / A4_LARGEUR_PX, hauteur / A4_HAUTEUR_PX),
  )
}

/** L'échelle réellement appliquée : LA seule source pour l'aperçu. */
export function echelleEffective(mode: ModeZoom, place: PlaceApercu): number {
  if (mode === 'ajuster') return echelleAjustee(place.largeur)
  if (mode === 'page') return echellePage(place.largeur, place.hauteur)
  return bornerEchelle(mode)
}

/** Tolérance de comparaison : 0,7499999 est « au palier » 75 %. */
const EPS = 1e-6

/** Premier palier STRICTEMENT au-dessus de l'échelle (borne haute sinon). */
export function palierSuivant(echelle: number): number {
  return PALIERS.find((p) => p > echelle + EPS) ?? ECHELLE_MAX
}

/** Premier palier STRICTEMENT au-dessous de l'échelle (borne basse sinon). */
export function palierPrecedent(echelle: number): number {
  const dessous = PALIERS.filter((p) => p < echelle - EPS)
  return dessous.length > 0 ? dessous[dessous.length - 1] : ECHELLE_MIN
}

/**
 * Libellé du bouton central : « 125 % » pour une échelle fixe ; pour un
 * mode ajusté, le mode ET le pourcentage réel (« Ajusté · 35 % », audit
 * C7 : le pourcentage seul dans l'aria-label ne se voyait pas). Sans
 * `echelle` (pas encore mesurée), le mode seul.
 */
export function libelleZoom(mode: ModeZoom, echelle?: number): string {
  if (typeof mode === 'number') return pourcentage(mode)
  const nom = mode === 'ajuster' ? 'Ajusté' : 'Page entière'
  return echelle === undefined ? nom : nom + ' · ' + pourcentage(echelle)
}

const ESPACE_INSECABLE = ' '

/** « 125 % » (espace insécable), arrondi au pour cent. */
export function pourcentage(echelle: number): string {
  return (
    String(Math.round(bornerEchelle(echelle) * 100)) + ESPACE_INSECABLE + '%'
  )
}

/**
 * Point fixe d'un zoom : nouvelle position de défilement (sur un axe) telle
 * que le point du document sous le pointeur reste sous le pointeur.
 * `pointeur` est la position dans la zone visible (depuis son bord).
 * Coordonnée document = (défilement + pointeur) ÷ échelle, avant comme après.
 * Le résultat peut être négatif : le navigateur le ramène à 0 tout seul.
 */
export function defilementPointFixe(
  defilement: number,
  pointeur: number,
  ancienne: number,
  nouvelle: number,
): number {
  return ((defilement + pointeur) / ancienne) * nouvelle - pointeur
}

/** Hauteur d'une « ligne » et d'une « page » de molette (`deltaMode` 1 et 2). */
const PX_PAR_LIGNE = 16
const PX_PAR_PAGE = 800
/** Sensibilité : un cran de souris (100 px) ≈ ×1,22 / ÷1,22. */
const SENSIBILITE = 0.002
/** Un seul évènement ne multiplie jamais par plus de 2 (ni ne divise). */
export const FACTEUR_MOLETTE_MAX = 2

/**
 * Facteur MULTIPLICATIF d'un évènement molette (Ctrl + molette, ou pincement
 * du pavé tactile que le navigateur traduit ainsi) : vers le bas, on
 * réduit ; vers le haut, on agrandit. Multiplicatif pour que la même
 * molette fasse le même effet à 50 % et à 200 %.
 */
export function facteurMolette(deltaY: number, deltaMode = 0): number {
  if (!Number.isFinite(deltaY)) return 1
  const px =
    deltaMode === 1
      ? deltaY * PX_PAR_LIGNE
      : deltaMode === 2
        ? deltaY * PX_PAR_PAGE
        : deltaY
  const f = Math.exp(-px * SENSIBILITE)
  return Math.min(FACTEUR_MOLETTE_MAX, Math.max(1 / FACTEUR_MOLETTE_MAX, f))
}

/** Échelle après un évènement molette, dans les bornes. */
export function echelleApresMolette(
  echelle: number,
  deltaY: number,
  deltaMode = 0,
): number {
  return bornerEchelle(echelle * facteurMolette(deltaY, deltaMode))
}

/** Valeur stockée (localStorage) → mode ; toute valeur inconnue = ajuster. */
export function lireModeZoom(brut: string | null): ModeZoom {
  if (brut === 'page') return brut
  // `null`, '' et les blancs valent 0 ; « ajuster » et le texte, NaN : tous
  // retombent sur `ajuster` ci-dessous.
  const n = Number(brut)
  if (!Number.isFinite(n) || n < ECHELLE_MIN || n > ECHELLE_MAX) {
    return 'ajuster'
  }
  return n
}

/** Mode → valeur stockée (aller-retour exact avec `lireModeZoom`). */
export function ecrireModeZoom(mode: ModeZoom): string {
  return typeof mode === 'number' ? String(bornerEchelle(mode)) : mode
}
