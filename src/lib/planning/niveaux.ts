/*
 * Les NIVEAUX de l'établissement (2026-11-06, lot 2, A7) : le niveau d'une
 * personne sur un poste (`planning_niveaux`). Le calcul ne lit jamais un nom
 * ni une clé de niveau : seulement ses cases.
 *
 * - `ordre` : le premier niveau autonome est préféré ; chaque niveau autonome
 *   suivant coûte une part du prix du dépannage (`part`), la dernière le prix
 *   entier. À l'hôtel : Titulaire (0), Dépannage (le prix entier).
 * - `autonome` : tient une place seul, compte dans le tableau, les trous, la
 *   relève, les passations. Non autonome : une place de soutien seulement.
 * - `jamais_seul` : toujours avec une personne autonome qui n'est pas elle-même
 *   « jamais seule », sur le même poste, aux mêmes heures (D9 : le soutien).
 *
 * Seul fichier qui écrit les niveaux de l'hôtel (mêmes lignes que la
 * migration 20261106140000).
 */

import type { NiveauEtab } from '#/lib/planning/types.ts'

/** Les niveaux de l'hôtel, quand la base n'en porte aucun (données de test). */
export const NIVEAUX_PAR_DEFAUT: readonly NiveauEtab[] = [
  {
    id: 'titulaire',
    nom: 'Titulaire',
    ordre: 0,
    autonome: true,
    jamais_seul: false,
  },
  {
    id: 'occasionnel',
    nom: 'Dépannage',
    ordre: 1,
    autonome: true,
    jamais_seul: false,
  },
  {
    id: 'soutien',
    nom: 'Soutien',
    ordre: 2,
    autonome: false,
    jamais_seul: true,
  },
]

/** Un niveau tel que le calcul le lit. */
export interface NiveauSolveur {
  id: string
  nom: string
  autonome: boolean
  jamaisSeul: boolean
  /** Rang parmi les niveaux autonomes (0 : le préféré) ; -1 pour un niveau
   * non autonome. */
  rang: number
  /** Part du prix du dépannage : 0 pour le premier niveau autonome, 1 pour
   * le dernier, entre les deux à parts égales ; 0 hors autonomes. */
  part: number
  /** Rang dans la liste complète (tri des affichages). */
  position: number
}

/** Les niveaux de l'établissement, rangés, et leur lecture par id. */
export interface Niveaux {
  liste: readonly NiveauEtab[]
  parId: ReadonlyMap<string, NiveauSolveur>
  /** Les niveaux autonomes, du préféré au dernier. */
  autonomes: readonly NiveauSolveur[]
}

/** Les niveaux d'une liste de la base (ordre, puis id) ; vide : ceux de
 * l'hôtel. */
export function lireNiveaux(
  lignes: readonly NiveauEtab[] | null | undefined,
): Niveaux {
  const liste = [...(lignes?.length ? lignes : NIVEAUX_PAR_DEFAUT)].sort(
    (a, b) => a.ordre - b.ordre || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  const nA = liste.filter((n) => n.autonome).length
  const parId = new Map<string, NiveauSolveur>()
  const autonomes: NiveauSolveur[] = []
  let rang = 0
  liste.forEach((n, position) => {
    const r = n.autonome ? rang++ : -1
    const s: NiveauSolveur = {
      id: n.id,
      nom: n.nom,
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

/** Les niveaux de l'hôtel, lus. */
export const NIVEAUX_HOTEL: Niveaux = lireNiveaux(NIVEAUX_PAR_DEFAUT)

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
