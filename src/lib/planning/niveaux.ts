/*
 * Les TROIS NIVEAUX d'une personne sur un poste, FIXES (décision de
 * l'utilisateur du 2026-11-06, qui renverse les niveaux réglables du lot 2,
 * A7 : « tu peux le mettre en dur dans le moteur et non paramétrable, car
 * c'est un truc qui couvre tous les cas »). Ne pas les rendre réglables.
 *
 * - Titulaire : placé en priorité, autonome (tient une place seul ; peut
 *   avoir un dépannage ou un soutien avec lui, sans obligation).
 * - Dépannage (clé `occasionnel`) : placé à défaut de titulaire, autonome ;
 *   coûte la part fixe du dépannage (`coutDepannage`). Les heures du contrat
 *   passent avant : un dépannage qui manque d'heures passe devant un
 *   titulaire qui a les siennes.
 * - Soutien : jamais seul, toujours avec un titulaire ou un dépannage, sur le
 *   même poste, aux mêmes heures (D9).
 *
 * SEUL fichier du code qui écrit les clés de niveau. La table
 * `planning_niveaux` porte les mêmes lignes, figées par la migration
 * 20261106160000 ; le calcul ne la lit pas.
 */

/** Un des trois niveaux fixes. */
export interface NiveauFixe {
  id: string
  nom: string
  /** La phrase de la fiche, sous le niveau choisi. */
  phrase: string
  autonome: boolean
  jamais_seul: boolean
}

export const NIVEAU_TITULAIRE = 'titulaire'
export const NIVEAU_DEPANNAGE = 'occasionnel'
export const NIVEAU_SOUTIEN = 'soutien'

/** Les trois niveaux, du préféré au dernier. */
export const LISTE_NIVEAUX: readonly NiveauFixe[] = [
  {
    id: NIVEAU_TITULAIRE,
    nom: 'Titulaire',
    phrase: 'Placé en priorité sur ce poste. Peut être seul.',
    autonome: true,
    jamais_seul: false,
  },
  {
    id: NIVEAU_DEPANNAGE,
    nom: 'Dépannage',
    phrase: 'Placé si aucun titulaire n’est disponible. Peut être seul.',
    autonome: true,
    jamais_seul: false,
  },
  {
    id: NIVEAU_SOUTIEN,
    nom: 'Soutien',
    phrase: 'Jamais seul : toujours avec un titulaire ou un dépannage.',
    autonome: false,
    jamais_seul: true,
  },
]

/** Un niveau tel que le calcul le lit. */
export interface NiveauSolveur {
  id: string
  nom: string
  phrase: string
  autonome: boolean
  jamaisSeul: boolean
  /** Rang parmi les niveaux autonomes (0 : titulaire, 1 : dépannage) ; -1
   * pour le soutien. */
  rang: number
  /** Part du prix du dépannage : 0 pour le titulaire, 1 pour le dépannage,
   * 0 pour le soutien. */
  part: number
  /** Rang dans la liste (tri des affichages). */
  position: number
}

/** Les trois niveaux, rangés, et leur lecture par id. */
export interface Niveaux {
  liste: readonly NiveauFixe[]
  parId: ReadonlyMap<string, NiveauSolveur>
  /** Les niveaux autonomes : titulaire, puis dépannage. */
  autonomes: readonly NiveauSolveur[]
}

function construire(liste: readonly NiveauFixe[]): Niveaux {
  const nA = liste.filter((n) => n.autonome).length
  const parId = new Map<string, NiveauSolveur>()
  const autonomes: NiveauSolveur[] = []
  let rang = 0
  liste.forEach((n, position) => {
    const r = n.autonome ? rang++ : -1
    const s: NiveauSolveur = {
      id: n.id,
      nom: n.nom,
      phrase: n.phrase,
      autonome: n.autonome,
      jamaisSeul: n.jamais_seul,
      rang: r,
      part: n.autonome && nA > 1 ? r / (nA - 1) : 0,
      position,
    }
    parId.set(n.id, s)
    if (n.autonome) autonomes.push(s)
  })
  return { liste, parId, autonomes }
}

/** Les trois niveaux, lus. */
export const NIVEAUX: Niveaux = construire(LISTE_NIVEAUX)

/** Le niveau d'un id ; inconnu : null (la compétence ne compte pas). */
export function niveauLu(
  niveaux: Niveaux,
  id: string | null | undefined,
): NiveauSolveur | null {
  return id === null || id === undefined
    ? null
    : (niveaux.parId.get(id) ?? null)
}

/** Le premier niveau autonome (le préféré, « titulaire » à l'hôtel). */
export function estPrefere(niveaux: Niveaux, id: string | null | undefined) {
  return niveauLu(niveaux, id)?.rang === 0
}

/** Le niveau tient-il une place seul ? */
export function estAutonome(niveaux: Niveaux, id: string | null | undefined) {
  return niveauLu(niveaux, id)?.autonome === true
}

/** Niveau non autonome (une place de soutien). */
export function estSoutien(niveaux: Niveaux, id: string | null | undefined) {
  return niveauLu(niveaux, id)?.autonome === false
}

/** Niveau autonome mais pas le préféré (« dépannage » à l'hôtel). */
export function estSecours(niveaux: Niveaux, id: string | null | undefined) {
  const n = niveauLu(niveaux, id)
  return n !== null && n.autonome && n.rang > 0
}

/** Rang de tri (liste complète) ; inconnu ou absent : après tous. */
export function positionNiveau(
  niveaux: Niveaux,
  id: string | null | undefined,
): number {
  return niveauLu(niveaux, id)?.position ?? niveaux.liste.length
}

/** Nom d'un niveau ; inconnu : sa clé. */
export function nomNiveau(niveaux: Niveaux, id: string): string {
  return niveaux.parId.get(id)?.nom ?? id
}

/** Le niveau proposé à l'ajout d'un poste : le premier non autonome pour un
 * contrat en alternance (D9), sinon le préféré. */
export function niveauPropose(niveaux: Niveaux, alternance: boolean): string {
  const soutien = niveaux.liste.find((n) => !n.autonome)
  return alternance && soutien ? soutien.id : (niveaux.autonomes[0]?.id ?? '')
}

/** Ce qu'un besoin demande, par niveau, tel que le calcul le lit.
 * `niveauMax` : rang du moins préféré des niveaux autonomes acceptés (null :
 * tous). `paliers` : nombre cumulé demandé jusqu'à chaque rang (seulement
 * quand plusieurs rangs sont demandés), le dernier = `effectif`. */
export interface DemandeNiveaux {
  effectif: number
  soutien: number
  niveauMax: { rang: number; nom: string } | null
  paliers: ReadonlyArray<{ rang: number; cumul: number; nom: string }> | null
}

/** La demande d'un besoin : son nombre par niveau s'il en a un, sinon
 * effectif, soutien et niveau demandé (le repli, l'hôtel aujourd'hui). */
export function demandeDe(
  niveaux: Niveaux,
  b: {
    effectif: number
    soutien: number
    niveau_min?: string | null
    niveaux?: ReadonlyArray<{ niveau: string; nombre: number }> | null
  },
): DemandeNiveaux {
  const lignes = (b.niveaux ?? [])
    .map((l) => ({ n: niveauLu(niveaux, l.niveau), nombre: l.nombre }))
    .filter(
      (l): l is { n: NiveauSolveur; nombre: number } =>
        l.n !== null && l.nombre > 0,
    )
  if (!lignes.length) {
    const min = niveauLu(niveaux, b.niveau_min)
    return {
      effectif: b.effectif,
      soutien: b.soutien,
      niveauMax:
        min && min.autonome && min.rang < niveaux.autonomes.length - 1
          ? { rang: min.rang, nom: min.nom }
          : null,
      paliers: null,
    }
  }
  const aut = lignes
    .filter((l) => l.n.autonome)
    .sort((a, b) => a.n.rang - b.n.rang)
  const effectif = aut.reduce((t, l) => t + l.nombre, 0)
  const soutien = lignes
    .filter((l) => !l.n.autonome)
    .reduce((t, l) => t + l.nombre, 0)
  const dernier = aut.at(-1)?.n
  let cumul = 0
  const paliers = aut.map((l) => ({
    rang: l.n.rang,
    cumul: (cumul += l.nombre),
    nom: l.n.nom,
  }))
  return {
    effectif,
    soutien,
    niveauMax:
      dernier && dernier.rang < niveaux.autonomes.length - 1
        ? { rang: dernier.rang, nom: dernier.nom }
        : null,
    paliers: paliers.length > 1 ? paliers : null,
  }
}
