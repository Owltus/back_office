/*
 * DISPOSITION d'une image (2026-10-01, demande utilisateur : « les images
 * ont plus de modes : à gauche, à droite, centré… repense pour faire plus
 * simple à utiliser ») — UNE question, « où va l'image ? », trois réponses :
 *
 *   centre   l'image seule sur sa ligne (figure centrée) ;
 *   gauche   l'image dans une colonne À GAUCHE, le texte à côté ;
 *   droite   l'image dans une colonne À DROITE, le texte à côté.
 *
 * Gauche et droite ne sont PAS un habillage (retiré le 2026-10-01 : il
 * laissait des trous) : ce sont deux colonnes propres, le bloc
 * `:::etape{photo=gauche}` / `:::etape`. L'utilisateur choisit une
 * disposition, ces fonctions PURES écrivent la structure dans le texte :
 *   - centrée → à côté : l'image et le bloc de texte qui la PRÉCÈDE (la
 *     consigne qu'elle illustre ; à défaut celui qui la suit) sont
 *     entourés d'un bloc `:::etape` ;
 *   - à côté → l'autre côté : seule la ligne d'ouverture change ;
 *   - à côté → centrée : le bloc est défait (son texte reste, l'image le
 *     suit) ; s'il contient d'autres photos, seule celle-ci en sort.
 */

export type Disposition = 'centre' | 'gauche' | 'droite'

const RE_OUVERTURE_ETAPE = /^\s*:::etape(\{[^}]*\})?\s*$/
const RE_FERMETURE = /^\s*:::\s*$/
const RE_OUVERTURE_BLOC = /^\s*:::[a-z]/i
const RE_IMAGE = /!\[[^\]]*\]\([^)]*\)/
const RE_TITRE = /^\s*#{1,6}\s/

export interface EtapeTrouvee {
  /** Index (0-based) de la ligne d'ouverture `:::etape…`. */
  ouverture: number
  /** Index de la ligne de fermeture `:::`. */
  fermeture: number
  cote: 'gauche' | 'droite'
  /** Nombre d'images dans le bloc. */
  photos: number
}

/** Ligne (0-based) qui contient la position `pos` du texte. */
function ligneDe(valeur: string, pos: number): number {
  return valeur.slice(0, Math.max(0, pos)).split('\n').length - 1
}

/** Le bloc `:::etape` qui contient la ligne `l`, ou `null`. */
export function etapeAutour(lignes: string[], l: number): EtapeTrouvee | null {
  let ouverture = -1
  let profondeur = 0
  for (let i = 0; i < lignes.length; i++) {
    const t = lignes[i]
    if (RE_OUVERTURE_ETAPE.test(t) && profondeur === 0) {
      ouverture = i
      profondeur = 1
      continue
    }
    if (profondeur > 0 && RE_OUVERTURE_BLOC.test(t)) {
      profondeur++
      continue
    }
    if (profondeur > 0 && RE_FERMETURE.test(t)) {
      profondeur--
      if (profondeur === 0) {
        if (l > ouverture && l < i) {
          const contenu = lignes.slice(ouverture + 1, i)
          return {
            ouverture,
            fermeture: i,
            cote: /photo\s*=\s*"?gauche/.test(lignes[ouverture])
              ? 'gauche'
              : 'droite',
            photos: contenu.filter((x) => RE_IMAGE.test(x)).length,
          }
        }
        ouverture = -1
      }
    }
  }
  return null
}

/** Disposition actuelle de l'image qui commence à la position `pos`. */
export function dispositionImage(valeur: string, pos: number): Disposition {
  const e = etapeAutour(valeur.split('\n'), ligneDe(valeur, pos))
  return e ? e.cote : 'centre'
}

function ouvertureEtape(cote: 'gauche' | 'droite'): string {
  return cote === 'gauche' ? ':::etape{photo=gauche}' : ':::etape'
}

/** Retire les lignes vides de tête et de queue. */
function rogner(lignes: string[]): string[] {
  const out = [...lignes]
  while (out.length > 0 && out[0].trim() === '') out.shift()
  while (out.length > 0 && out[out.length - 1].trim() === '') out.pop()
  return out
}

/** Une ligne qui borne le texte d'une étape : titre, bloc, image, saut de page. */
function estFrontiere(ligne: string): boolean {
  return (
    RE_TITRE.test(ligne) ||
    RE_OUVERTURE_BLOC.test(ligne) ||
    RE_FERMETURE.test(ligne) ||
    RE_IMAGE.test(ligne) ||
    /^\s*===\s*$/.test(ligne)
  )
}

/**
 * Le texte qui PRÉCÈDE l'image jusqu'au titre de l'étape (ou une autre
 * image, un bloc, un saut de page) — plusieurs paragraphes compris : c'est
 * la consigne que l'image illustre. `[debut, fin]` inclusifs, sans lignes
 * vides en bord, ou `null`. Une étape de liste suivie de sa capture sans
 * ligne vide en fait partie.
 */
function blocAvant(lignes: string[], l: number): [number, number] | null {
  let debut = l - 1
  while (debut >= 0 && !estFrontiere(lignes[debut])) debut--
  debut++
  let fin = l - 1
  while (fin >= debut && lignes[fin].trim() === '') fin--
  while (debut <= fin && lignes[debut].trim() === '') debut++
  return debut <= fin ? [debut, fin] : null
}

/** Le texte qui SUIT l'image jusqu'à la prochaine frontière, ou `null`. */
function blocApres(lignes: string[], l: number): [number, number] | null {
  let fin = l + 1
  while (fin < lignes.length && !estFrontiere(lignes[fin])) fin++
  fin--
  let debut = l + 1
  while (debut <= fin && lignes[debut].trim() === '') debut++
  while (fin >= debut && lignes[fin].trim() === '') fin--
  return debut <= fin ? [debut, fin] : null
}

/** Insère `bloc` à la place de `lignes[debut..fin]`, isolé par des lignes vides. */
function remplacerIsole(
  lignes: string[],
  debut: number,
  fin: number,
  bloc: string[],
): string[] {
  const avant = lignes.slice(0, debut)
  const apres = lignes.slice(fin + 1)
  while (avant.length > 0 && avant[avant.length - 1].trim() === '') avant.pop()
  while (apres.length > 0 && apres[0].trim() === '') apres.shift()
  return [
    ...avant,
    ...(avant.length > 0 ? [''] : []),
    ...bloc,
    ...(apres.length > 0 ? ['', ...apres] : ['']),
  ]
}

/**
 * Le texte complet après avoir donné à l'image (jeton `[debut, fin)`,
 * remplacé par `jeton`) la disposition `cible`.
 */
export function changerDisposition(
  valeur: string,
  debut: number,
  fin: number,
  jeton: string,
  cible: Disposition,
): string {
  const remplace = valeur.slice(0, debut) + jeton + valeur.slice(fin)
  const lignes = remplace.split('\n')
  const l = ligneDe(remplace, debut)
  const etape = etapeAutour(lignes, l)

  if (etape) {
    if (cible !== 'centre') {
      lignes[etape.ouverture] = ouvertureEtape(cible)
      return lignes.join('\n')
    }
    // Vers « centrée » : défaire le bloc (seule photo) ou en sortir l'image.
    if (etape.photos <= 1) {
      const contenu = lignes.slice(etape.ouverture + 1, etape.fermeture)
      const sansImage = rogner(
        contenu.filter((_, k) => k !== l - etape.ouverture - 1),
      )
      const image = lignes[l].trim()
      const bloc = sansImage.length > 0 ? [...sansImage, '', image] : [image]
      return remplacerIsole(
        lignes,
        etape.ouverture,
        etape.fermeture,
        bloc,
      ).join('\n')
    }
    const image = lignes[l].trim()
    const sans = [...lignes.slice(0, l), ...lignes.slice(l + 1)]
    const fermeture = etape.fermeture - 1
    return [
      ...sans.slice(0, fermeture + 1),
      '',
      image,
      ...(sans.length > fermeture + 1
        ? ['', ...rogner(sans.slice(fermeture + 1))]
        : ['']),
    ].join('\n')
  }

  if (cible === 'centre') return remplace

  // Vers « à gauche / à droite » : l'image et son texte en colonnes.
  const image = lignes[l].trim()
  const avant = blocAvant(lignes, l)
  if (avant) {
    const texte = lignes.slice(avant[0], avant[1] + 1)
    return remplacerIsole(lignes, avant[0], l, [
      ouvertureEtape(cible),
      ...texte,
      '',
      image,
      ':::',
    ]).join('\n')
  }
  const apres = blocApres(lignes, l)
  if (apres) {
    const texte = lignes.slice(apres[0], apres[1] + 1)
    return remplacerIsole(lignes, l, apres[1], [
      ouvertureEtape(cible),
      ...texte,
      '',
      image,
      ':::',
    ]).join('\n')
  }
  // Aucun texte autour : un bloc avec l'image seule, prêt à recevoir le texte.
  return remplacerIsole(lignes, l, l, [
    ouvertureEtape(cible),
    image,
    ':::',
  ]).join('\n')
}

/**
 * Plus petite édition qui transforme `ancien` en `nouveau` (préfixe et
 * suffixe communs retirés) : appliquée par `execCommand`, Ctrl + Z l'annule
 * d'un coup. Curseur placé à la fin de la partie remplacée.
 */
export function editionEntre(
  ancien: string,
  nouveau: string,
): { debut: number; fin: number; texte: string; selection: [number, number] } {
  let p = 0
  const max = Math.min(ancien.length, nouveau.length)
  while (p < max && ancien[p] === nouveau[p]) p++
  let s = 0
  while (
    s < max - p &&
    ancien[ancien.length - 1 - s] === nouveau[nouveau.length - 1 - s]
  )
    s++
  const texte = nouveau.slice(p, nouveau.length - s)
  return {
    debut: p,
    fin: ancien.length - s,
    texte,
    selection: [p + texte.length, p + texte.length],
  }
}
