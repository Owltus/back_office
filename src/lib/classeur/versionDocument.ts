/*
 * NUMÉRO DE VERSION d'un document, X.Y, calculé SANS IA (2026-10-03,
 * demande utilisateur : « automatique, décimal, en fonction du contenu
 * modifié, de manière logique »). Les mêmes deux textes donnent toujours le
 * même résultat : règles fixes, lues dans le Markdown.
 *
 *   - FORME seulement (espaces, ponctuation, majuscules, 3 mots au plus
 *     corrigés) ............................................ numéro inchangé
 *   - CONTENU (phrase réécrite, paragraphe, image, tableau, titre ou
 *     description du document) ................................... + 0.1
 *   - PROCÉDURE (étape ajoutée ou retirée, titre de partie ajouté, retiré ou
 *     renommé, encadré Attention / Important changé, plus de 30 % du texte
 *     changé) ..................................... version majeure, X+1.0
 *
 * Le pire changement l'emporte. Le numéro part TOUJOURS du numéro actuel
 * du document : reprendre une ancienne version donne un NOUVEAU numéro,
 * jamais l'ancien (la base refuse aussi qu'il recule,
 * `classeur_version_monotone`).
 */

export interface NumeroVersion {
  majeure: number
  mineure: number
}

export type Saut = 'aucun' | 'mineur' | 'majeur'

export interface EtatDocument {
  title: string
  description: string
  content: string
}

export interface Evolution {
  saut: Saut
  /** Pourquoi le numéro bouge (vide si inchangé). */
  raison: string
  suivante: NumeroVersion
}

/** Au-delà de cette part de mots changés : version majeure. */
const PART_MAJEURE = 0.3
/** Jusqu'à ce nombre de mots changés (de chaque côté) : simple correction. */
const MOTS_CORRECTION = 3

export function libelleVersion(v: NumeroVersion): string {
  return `${String(v.majeure)}.${String(v.mineure)}`
}

/** Numéro d'un document lu en base (1.0 si le cache est antérieur au versionnage). */
export function numeroDocument(doc: {
  version_majeure?: number
  version_mineure?: number
}): NumeroVersion {
  return {
    majeure: doc.version_majeure ?? 1,
    mineure: doc.version_mineure ?? 0,
  }
}

/** Lignes hors blocs de code (un titre dans un exemple de code n'en est pas un). */
function lignesUtiles(md: string): string[] {
  const out: string[] = []
  let code = false
  for (const l of md.split('\n')) {
    if (/^\s*(```|~~~)/.test(l)) {
      code = !code
      continue
    }
    if (!code) out.push(l)
  }
  return out
}

/** Texte comparé « au fond » : sans casse, ponctuation ni espaces multiples. */
function mots(texte: string): string[] {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

function titres(md: string): string[] {
  return lignesUtiles(md)
    .map((l) => /^(#{1,6})\s+(.*)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => `${m[1]} ${mots(m[2]).join(' ')}`)
}

/** Étapes : titres numérotés « 1. … » et éléments d'une liste numérotée. */
function nombreEtapes(md: string): number {
  return lignesUtiles(md).filter(
    (l) => /^#{2,4}\s+\d{1,2}[.)]\s/.test(l) || /^\d{1,3}[.)]\s/.test(l),
  ).length
}

/** Texte des encadrés de SÉCURITÉ (Attention, Important), dans l'ordre. */
function encadresSecurite(md: string): string[] {
  const lignes = lignesUtiles(md)
  const blocs: string[] = []
  for (let i = 0; i < lignes.length; i++) {
    if (!/^>\s*\[!(WARNING|CAUTION|IMPORTANT)\]/i.test(lignes[i])) continue
    const corps: string[] = [lignes[i]]
    while (i + 1 < lignes.length && lignes[i + 1].startsWith('>')) {
      corps.push(lignes[++i])
    }
    blocs.push(mots(corps.join(' ')).join(' '))
  }
  return blocs
}

function images(md: string): string[] {
  return [...md.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)].map((m) => m[1])
}

/** Mots retirés et ajoutés (multiensembles) : la taille d'une correction. */
function motsChanges(a: string[], b: string[]): number {
  const compte = new Map<string, number>()
  for (const m of a) compte.set(m, (compte.get(m) ?? 0) + 1)
  let ajoutes = 0
  for (const m of b) {
    const n = compte.get(m) ?? 0
    if (n > 0) compte.set(m, n - 1)
    else ajoutes++
  }
  let retires = 0
  for (const n of compte.values()) retires += n
  return Math.max(ajoutes, retires)
}

function egaux(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i])
}

/** Ce qui fait passer à la version majeure, ou `null`. */
function raisonMajeure(avant: string, apres: string): string | null {
  const ea = nombreEtapes(avant)
  const eb = nombreEtapes(apres)
  if (eb > ea)
    return eb - ea > 1 ? `${String(eb - ea)} étapes ajoutées` : 'étape ajoutée'
  if (eb < ea)
    return ea - eb > 1 ? `${String(ea - eb)} étapes retirées` : 'étape retirée'

  const ta = titres(avant)
  const tb = titres(apres)
  if (!egaux(ta, tb)) {
    if (tb.length > ta.length) return 'partie ajoutée'
    if (tb.length < ta.length) return 'partie retirée'
    return 'partie renommée'
  }

  if (!egaux(encadresSecurite(avant), encadresSecurite(apres)))
    return 'consigne de sécurité modifiée'

  // Part du TEXTE changé, en mots (une ligne Markdown peut être un long
  // paragraphe : compter les lignes ferait d'un mot corrigé dans un
  // document de trois lignes une « réécriture »).
  const ma = mots(avant)
  const mb = mots(apres)
  if (motsChanges(ma, mb) / Math.max(ma.length, mb.length, 1) > PART_MAJEURE)
    return 'texte largement réécrit'
  return null
}

/** Ce qui fait passer à la version mineure, ou `null` (forme seulement). */
function raisonMineure(
  avant: EtatDocument,
  apres: EtatDocument,
): string | null {
  const ia = images(avant.content)
  const ib = images(apres.content)
  if (!egaux(ia, ib)) {
    if (ib.length > ia.length) return 'image ajoutée'
    if (ib.length < ia.length) return 'image retirée'
    return 'image remplacée'
  }
  const ca = mots(avant.content)
  const cb = mots(apres.content)
  // Un CHIFFRE changé n'est jamais une simple correction : un numéro de
  // téléphone, une température, un code tiennent en un « mot ».
  const nombres = (m: string[]) => m.filter((x) => /\d/.test(x))
  if (!egaux(nombres(ca), nombres(cb))) return 'valeur modifiée'
  if (!egaux(ca, cb) && motsChanges(ca, cb) > MOTS_CORRECTION)
    return 'texte modifié'
  if (!egaux(mots(avant.title), mots(apres.title))) return 'titre modifié'
  if (!egaux(mots(avant.description), mots(apres.description)))
    return 'description modifiée'
  return null
}

/** L'évolution du numéro entre deux états d'un document. */
export function evolutionVersion(
  avant: EtatDocument,
  apres: EtatDocument,
  actuelle: NumeroVersion,
): Evolution {
  const majeure = raisonMajeure(avant.content, apres.content)
  if (majeure)
    return {
      saut: 'majeur',
      raison: majeure,
      suivante: { majeure: actuelle.majeure + 1, mineure: 0 },
    }
  const mineure = raisonMineure(avant, apres)
  if (mineure)
    return {
      saut: 'mineur',
      raison: mineure,
      suivante: { majeure: actuelle.majeure, mineure: actuelle.mineure + 1 },
    }
  return { saut: 'aucun', raison: '', suivante: actuelle }
}
