/*
 * Parcours d'une personne (demande utilisateur du 2026-11-03 : « éviter des
 * duplications dans tous les sens, faire ça de manière plus professionnelle,
 * pense RH ») : ses contrats successifs, liés par `suite_de` (CDD puis CDI,
 * départ puis retour, promotion), montrés comme UNE personne. Chaque contrat
 * reste une fiche à ses dates ; l'écran Équipe en montre une ligne, sur le
 * contrat du moment, et la fiche liste les autres.
 */

import { personnes } from '#/lib/planning/semaine.ts'
import type { Salarie } from '#/lib/planning/types.ts'

type Contrat = Pick<
  Salarie,
  'id' | 'actif' | 'date_entree' | 'date_sortie' | 'suite_de'
>

export interface Parcours<T extends Contrat = Salarie> {
  /** Ses contrats, du plus ancien au plus récent. */
  contrats: T[]
  /** Celui du moment : en cours, sinon le prochain, sinon le dernier. */
  courant: T
  /** Le contrat qui suit le courant et n'a pas encore commencé, ou null. */
  suivant: T | null
}

/** Le contrat couvre-t-il ce jour (actif, entre son entrée et sa sortie) ? */
export const couvre = (s: Contrat, jour: string) =>
  s.actif &&
  (!s.date_entree || s.date_entree <= jour) &&
  (!s.date_sortie || s.date_sortie >= jour)

const debut = (s: Contrat) => s.date_entree ?? ''

/** Les parcours de l'équipe : une entrée par personne, ses contrats liés
 * ensemble (`personnes`), dans l'ordre de leurs dates. */
export function parcours<T extends Contrat>(
  salaries: T[],
  aujourdhui: string,
): Parcours<T>[] {
  const cles = personnes(salaries as unknown as Salarie[])
  const groupes = new Map<string, T[]>()
  for (const s of salaries) {
    const cle = cles.get(s.id) ?? `s${s.id}`
    groupes.set(cle, [...(groupes.get(cle) ?? []), s])
  }
  return [...groupes.values()].map((liste) => {
    const contrats = [...liste].sort(
      (a, b) => debut(a).localeCompare(debut(b)) || a.id - b.id,
    )
    const futurs = contrats.filter(
      (s) => s.actif && !!s.date_entree && s.date_entree > aujourdhui,
    )
    const courant =
      contrats.find((s) => couvre(s, aujourdhui)) ??
      futurs.at(0) ??
      (contrats.at(-1) as T)
    const i = contrats.indexOf(courant)
    const suivant =
      contrats
        .slice(i + 1)
        .find((s) => !!s.date_entree && s.date_entree > aujourdhui) ?? null
    return { contrats, courant, suivant }
  })
}

/** La personne est-elle dans l'équipe : un contrat en cours ou à venir ? */
export const dansLEquipe = (p: Parcours<Contrat>, aujourdhui: string) =>
  p.contrats.some(
    (s) => s.actif && (!s.date_sortie || s.date_sortie >= aujourdhui),
  )

/** Le contrat de la personne qui chevauche ces dates (null : aucun). Deux
 * contrats d'une même personne ne se recouvrent jamais : elle serait deux
 * fois dans l'équipe le même jour. Une date absente est ouverte (depuis
 * toujours, ou sans fin). `id` : le contrat lui-même, ignoré. Un contrat
 * désactivé (un extra qu'on n'appelle plus, sans fin possible) ne recouvre
 * rien : il ne compte plus nulle part (`couvre`). */
export function chevauche<T extends Contrat>(
  contrats: T[],
  c: {
    id: number | null
    date_entree: string | null
    date_sortie: string | null
  },
): T | null {
  const debutC = c.date_entree ?? ''
  const finC = c.date_sortie ?? '9999-12-31'
  return (
    contrats.find(
      (s) =>
        s.id !== c.id &&
        s.actif &&
        (s.date_entree ?? '') <= finC &&
        debutC <= (s.date_sortie ?? '9999-12-31'),
    ) ?? null
  )
}
