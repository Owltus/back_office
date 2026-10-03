/*
 * NUMÉRO DE VERSION d'un document, X.Y, calculé SANS IA (2026-10-03,
 * demande utilisateur : « automatique, décimal, en fonction du contenu
 * modifié, de manière logique »). Les mêmes deux textes donnent toujours le
 * même résultat : règles fixes, lues dans le Markdown.
 *
 *   - FORME seulement (espaces, ponctuation, majuscules, 3 mots au plus
 *     corrigés, case cochée, puces passées en numéros) ... numéro inchangé
 *   - CONTENU (phrase réécrite, paragraphe, image, tableau, chiffre,
 *     négation, titre ou description du document) ............... + 0.1
 *   - PROCÉDURE (étape ajoutée, retirée, modifiée ou déplacée, partie
 *     ajoutée, retirée ou renommée, encadré Attention / Important changé,
 *     plus de 30 % ET plus de 10 mots du texte changés) ......... X+1.0
 *
 * La première rédaction d'un document VIDE ne change pas le numéro : il
 * naît en 1.0. Le pire changement l'emporte. Le numéro part TOUJOURS du
 * numéro actuel du document : reprendre une ancienne version donne un
 * NOUVEAU numéro, jamais l'ancien (la base refuse aussi qu'il recule,
 * `classeur_version_monotone`).
 *
 * Audit du 2026-10-04 (relecture adverse) : un document neuf passait en 2.0
 * dès sa première rédaction, deux étapes inversées ou une négation ajoutée
 * ne changeaient rien, cocher une case ou remplir un emplacement d'image
 * faisaient une version majeure (marqueurs et morceaux d'uuid comptés comme
 * des mots). Corrigé ci-dessous, chaque cas figé par un test.
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

/** Au-delà de cette part de mots changés (et de MOTS_MAJEURS) : majeure. */
const PART_MAJEURE = 0.3
const MOTS_MAJEURS = 10
/** Jusqu'à ce nombre de mots changés (de chaque côté) : simple correction. */
const MOTS_CORRECTION = 3
/** Mots qui renversent le sens d'une consigne : jamais une « correction ». */
const NEGATIONS = new Set([
  'ne',
  'n',
  'pas',
  'jamais',
  'aucun',
  'aucune',
  'interdit',
  'interdite',
  'obligatoire',
  'sans',
])

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

/**
 * Le TEXTE seul, sans ce qui n'est que forme : chemins d'images (un uuid
 * n'est pas des mots), marqueurs de liste et de case à cocher.
 */
function texteSeul(md: string): string {
  return md
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, ' $1 ')
    .replace(/^\s*(?:\d{1,3}[.)]|[-*+])\s+(?:\[[ xX]\]\s+)?/gm, '')
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

/** Étapes en TITRE (« ### 1. … »), dans l'ordre, réduites à leur texte. */
function etapesTitres(md: string): string[] {
  return (
    lignesUtiles(md)
      // Même reconnaissance que les pastilles (`rehypePastilles`) : « 1. »,
      // « 1) », « 1.2 » — pas « 3 vannes » (nombre sans point).
      .map((l) =>
        /^#{1,6}\s+(?:\d{1,6}(?:\.\d{1,6})+[.)]?|\d{1,6}[.)])\s+(.*)$/.exec(l),
      )
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => mots(m[1]).join(' '))
  )
}

/** Étapes d'une LISTE numérotée, dans l'ordre, réduites à leur texte. */
function etapesListe(md: string): string[] {
  return lignesUtiles(md)
    .map((l) => /^\d{1,3}[.)]\s+(.*)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => mots(m[1]).join(' '))
}

/** Compare deux suites d'étapes ; la raison d'une version majeure, ou null. */
function changementEtapes(
  ea: readonly string[],
  eb: readonly string[],
): string | null {
  if (egaux(ea, eb)) return null
  if (eb.length > ea.length)
    return eb.length - ea.length > 1
      ? `${String(eb.length - ea.length)} étapes ajoutées`
      : 'étape ajoutée'
  if (eb.length < ea.length)
    return ea.length - eb.length > 1
      ? `${String(ea.length - eb.length)} étapes retirées`
      : 'étape retirée'
  if (memesElements(ea, eb)) return 'ordre des étapes modifié'
  // Une étape reformulée de quelques mots reste une modification de
  // contenu ; une étape changée en profondeur change la procédure.
  const changees = ea.filter(
    (e, i) => motsChanges(mots(e), mots(eb[i])) > MOTS_CORRECTION,
  ).length
  if (changees === 0) return null
  return changees > 1 ? 'étapes modifiées' : 'étape modifiée'
}

/** Texte de tous les éléments de liste (puces comprises), pour reconnaître
 * une liste à puces simplement passée en liste numérotée. */
function elementsDeListe(md: string): string[] {
  return lignesUtiles(md)
    .map((l) => /^\s*(?:\d{1,3}[.)]|[-*+])\s+(?:\[[ xX]\]\s+)?(.*)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => mots(m[1]).join(' '))
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

function memesElements(a: readonly string[], b: readonly string[]): boolean {
  return egaux([...a].sort(), [...b].sort())
}

/** Ce qui fait passer à la version majeure, ou `null`. */
function raisonMajeure(avant: string, apres: string): string | null {
  const parTitre = changementEtapes(etapesTitres(avant), etapesTitres(apres))
  if (parTitre) return parTitre
  // Liste numérotée : des puces simplement passées en numéros (mêmes
  // éléments de liste) ne sont qu'une mise en forme.
  const la = etapesListe(avant)
  const lb = etapesListe(apres)
  const miseEnForme =
    la.length !== lb.length &&
    memesElements(elementsDeListe(avant), elementsDeListe(apres))
  if (!miseEnForme) {
    const parListe = changementEtapes(la, lb)
    if (parListe) return parListe
  }

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
  // document de trois lignes une « réécriture »). Plancher de 10 mots : un
  // document très court ne bascule pas pour deux mots.
  const ma = mots(texteSeul(avant))
  const mb = mots(texteSeul(apres))
  const n = motsChanges(ma, mb)
  if (n > MOTS_MAJEURS && n / Math.max(ma.length, mb.length, 1) > PART_MAJEURE)
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
  const ca = mots(texteSeul(avant.content))
  const cb = mots(texteSeul(apres.content))
  // Un CHIFFRE changé n'est jamais une simple correction : un numéro de
  // téléphone, une température, un code tiennent en un « mot ».
  const nombres = (m: string[]) => m.filter((x) => /\d/.test(x))
  if (!egaux(nombres(ca), nombres(cb))) return 'valeur modifiée'
  // Une NÉGATION ajoutée ou retirée renverse une consigne.
  const negations = (m: string[]) => m.filter((x) => NEGATIONS.has(x))
  if (!egaux(negations(ca), negations(cb))) return 'sens d’une consigne modifié'
  // Plus de 3 mots, ou plus d'un cinquième d'un texte très court.
  const n = motsChanges(ca, cb)
  if (n > MOTS_CORRECTION || n / Math.max(ca.length, cb.length, 1) > 0.2)
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
  // Première rédaction d'un document vide : il naît en 1.0, sans saut.
  if (mots(texteSeul(avant.content)).length === 0)
    return { saut: 'aucun', raison: 'première rédaction', suivante: actuelle }
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
