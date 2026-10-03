/*
 * MISE EN PAGE DES SCHÉMAS Mermaid (2026-10-03, demande utilisateur : « voir
 * comment l'app encaisse des schémas longs et complexes, sans déborder ni
 * effet étrange »). Mesuré sur le classeur d'essai : un schéma horizontal
 * chargé tombait à 190 × 23 mm (texte illisible), un schéma vertical chargé
 * à 164 × 941 mm (il débordait de trois pages, rogné par la page).
 *
 * Trois règles, toutes automatiques :
 *   1. Un schéma tient dans la colonne ET dans une page : réduit au besoin,
 *      jamais agrandi (`classeur.css`, `.classeur-mermaid`).
 *   2. Un organigramme (`flowchart` / `graph`) trop réduit dans son sens est
 *      essayé dans L'AUTRE sens (LR ↔ TD) ; le plus lisible est gardé.
 *   3. Un schéma qui ne tiendrait sur une page qu'en devenant minuscule mais
 *      qui reste lisible à la largeur de la colonne est DÉCOUPÉ entre les
 *      pages (`paginate`, coupe entre deux cases, jamais au milieu).
 */

/** Zone utile d'une page en px CSS (96 dpi) : 190 mm × ~205 mm. */
export const LARGEUR_UTILE_PX = 718
export const HAUTEUR_SCHEMA_PX = 775

/**
 * Texte dessiné à 12 px (≈ 9 pt, `mermaid.ts`). En dessous de cette
 * échelle, il passerait sous ≈ 6 pt : la page n'est plus lisible, le schéma
 * est retourné ou découpé.
 */
export const ECHELLE_LISIBLE = 0.67
/**
 * Échelle d'un schéma DÉCOUPÉ : 75 % (texte ≈ 7 pt, lisible), moins si la
 * colonne l'impose. MIROIR de `classeur.css`
 * (`.classeur-mermaid[data-affichage='decoupe']`).
 */
export const ECHELLE_DECOUPE = 0.75

/** Hauteur (px) d'une mention « Suite… » au raccord de deux tranches. */
export const HAUTEUR_SUITE_PX = 16

export interface TailleSchema {
  largeur: number
  hauteur: number
}

/** Taille naturelle (px) d'un SVG Mermaid, lue dans son `viewBox`. */
export function tailleNaturelle(svg: string): TailleSchema | null {
  const m =
    /viewBox="\s*[-\d.e]+[\s,]+[-\d.e]+[\s,]+([\d.e]+)[\s,]+([\d.e]+)\s*"/.exec(
      svg,
    )
  if (!m) return null
  const largeur = Number(m[1])
  const hauteur = Number(m[2])
  return largeur > 0 && hauteur > 0 ? { largeur, hauteur } : null
}

/** Échelle d'affichage pour tenir dans la colonne et dans une page. */
export function echelleSurPage(t: TailleSchema): number {
  return Math.min(
    1,
    LARGEUR_UTILE_PX / t.largeur,
    HAUTEUR_SCHEMA_PX / t.hauteur,
  )
}

/** Échelle d'un schéma découpé en hauteur : 70 %, ou la colonne si moins. */
export function echelleEnLargeur(t: TailleSchema): number {
  return Math.min(ECHELLE_DECOUPE, LARGEUR_UTILE_PX / t.largeur)
}

/**
 * Le même organigramme dans l'autre sens (LR/RL ↔ TD/TB), ou `null` si ce
 * n'est pas un organigramme orienté.
 */
export function orientationAlternative(code: string): string | null {
  const m = /^(\s*(?:flowchart|graph)\s+)(LR|RL|TD|TB|BT)\b/m.exec(code)
  if (!m) return null
  const autre = m[2] === 'LR' || m[2] === 'RL' ? 'TD' : 'LR'
  return (
    code.slice(0, m.index) + m[1] + autre + code.slice(m.index + m[0].length)
  )
}

export type AffichageSchema = 'page' | 'decoupe'

/**
 * Comment afficher un schéma : tenu sur une page, ou découpé en hauteur
 * quand la page l'écraserait mais que la largeur de la colonne le garde
 * lisible.
 */
export function affichageSchema(t: TailleSchema): AffichageSchema {
  const surPage = echelleSurPage(t)
  const enLargeur = echelleEnLargeur(t)
  return surPage < ECHELLE_LISIBLE && enLargeur >= ECHELLE_LISIBLE
    ? 'decoupe'
    : 'page'
}

/** Lisibilité finale d'un schéma (échelle à laquelle il sera imprimé). */
export function echelleAffichee(t: TailleSchema): number {
  return affichageSchema(t) === 'decoupe'
    ? echelleEnLargeur(t)
    : echelleSurPage(t)
}

/**
 * Points de COUPE d'un schéma découpé, en px affichés depuis son haut :
 * le premier morceau tient dans `premier`, les suivants dans `plein`, et
 * aucune coupe ne traverse une case (`bandes` : [haut, bas] de chaque case
 * ou étiquette). La coupe tombe au MILIEU du plus grand espace vide situé
 * dans le dernier quart de la place : le raccord passe là où le
 * schéma « respire ». Une case plus haute que la place est coupée sous elle.
 */
export function coupesSchema(
  hauteur: number,
  bandes: ReadonlyArray<readonly [number, number]>,
  premier: number,
  plein: number,
): number[] {
  const tri = [...bandes].sort((a, b) => a[0] - b[0])
  const coupee = (v: number) => tri.find(([h, b]) => h < v && b > v)
  const coupes: number[] = []
  let depart = 0
  let place = premier
  while (hauteur - depart > place) {
    // Dernier morceau minuscule (moins d'un quart de page) : la coupe
    // remonte juste assez pour qu'il garde un quart de page — la page
    // courante reste presque pleine, et jamais une « queue » de schéma
    // seule en haut d'une page (un partage à parts égales laissait la
    // moitié de la page vide, vu au contrôle).
    if (hauteur - (depart + place) < plein * 0.25)
      place = Math.max(place / 2, hauteur - depart - plein * 0.25)
    const limite = depart + place
    const plancher = depart + place * 0.75
    // Espaces libres entre les cases, depuis le départ du morceau.
    const vides: Array<[number, number]> = []
    let curseur = depart
    for (const [h, b] of tri) {
      if (b <= curseur) continue
      if (h > curseur) vides.push([curseur, h])
      curseur = Math.max(curseur, b)
    }
    vides.push([curseur, hauteur])
    // Le plus grand, rogné au bas de la place.
    let meilleurY = -1
    let meilleureTaille = 1
    for (const [g0, g1] of vides) {
      const a = Math.max(g0, plancher)
      const b = Math.min(g1, limite)
      if (b - a > meilleureTaille) {
        meilleureTaille = b - a
        meilleurY = (a + b) / 2
      }
    }
    let y: number
    if (meilleurY >= 0) {
      y = meilleurY
    } else {
      // Aucun espace dans le bas : au-dessus de la case coupée…
      y = limite
      let c = coupee(y)
      while (c && c[0] > depart) {
        y = c[0]
        c = coupee(y)
      }
      // … sauf une case qui commence avec le morceau et ne tient pas.
      // Jamais plus haut que la place : une case plus haute qu'une page
      // est coupée à la limite (audit du 2026-10-04).
      if (c) y = Math.min(c[1], limite)
    }
    coupes.push(y)
    depart = y
    place = plein
  }
  return coupes
}
