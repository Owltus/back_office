/*
 * Lignes du tableau des besoins d'un poste (prototype `BesoinsPage.tsx`,
 * `lignesDuPoste`, `trouver`, `correspond`). Pur.
 */

import type { Besoin, Horaire } from '#/lib/planning/types.ts'

/** Une ligne : un horaire du référentiel, ou un horaire spécifique. */
export interface LigneBesoin {
  cle: string
  horaire_id: number | null
  debut: string
  fin: string
}

/** Minimum obligatoire, places de soutien, places en plus facultatives. */
export interface Reglage {
  effectif: number
  soutien: number
  renfort: number
}

/** Une personne autonome peut être placée là (nécessaire ou en plus) : un
 * apprenti ou un stagiaire n'est jamais seul, il lui en faut une
 * (`generateur.ts` : soutiens <= autonomes, autonomes <= effectif + en plus). */
export const aUneBase = (r: Reglage) => r.effectif + r.renfort > 0

/** Des apprentis ou stagiaires demandés sans personne autonome possible à
 * côté : le planning automatique ne les place jamais. La case le montre, avec
 * de quoi le retirer, et le total ne le compte pas. */
export const soutienSansBase = (r: Reglage) => r.soutien > 0 && !aUneBase(r)

export const RIEN: Reglage = { effectif: 0, soutien: 0, renfort: 0 }

/** La case demande quelque chose (0 / 0 / 0 : rien). */
export const existe = (r: Reglage) =>
  r.effectif > 0 || r.soutien > 0 || r.renfort > 0

/**
 * Nouveau réglage d'une case quand un de ses trois compteurs change :
 * - une case qui ne demandait rien n'ouvre PLUS de place d'apprenti
 *   (2026-11-01 : cette règle de l'hôtel fictif du prototype a semé, en
 *   production, des places d'apprenti sur la Direction, l'Adjoint, la
 *   Supervision, la Veille et la Technique, où personne n'est apprenti ;
 *   les apprentis sont désormais comptés à l'accueil) ;
 * - plus personne nécessaire ni en plus : plus de place d'apprenti (il ne
 *   serait jamais placé, `soutienSansBase`).
 */
export function reglerChamp(
  r: Reglage,
  champ: keyof Reglage,
  valeur: number,
): Reglage {
  const v = Math.max(0, valeur)
  if (champ === 'effectif') {
    const soutien = v + r.renfort === 0 ? 0 : r.soutien
    return { effectif: v, soutien, renfort: r.renfort }
  }
  if (champ === 'renfort') {
    return v + r.effectif === 0
      ? { effectif: r.effectif, soutien: 0, renfort: 0 }
      : { ...r, renfort: v }
  }
  return { ...r, soutien: aUneBase(r) ? v : 0 }
}

export function correspond(b: Besoin, ligne: LigneBesoin): boolean {
  return ligne.horaire_id !== null
    ? b.horaire_id === ligne.horaire_id
    : b.horaire_id === null && b.debut === ligne.debut && b.fin === ligne.fin
}

export function trouverBesoin(
  besoins: Besoin[],
  posteId: number,
  ligne: LigneBesoin,
  jour: number,
): Besoin | undefined {
  return besoins.find(
    (b) => b.poste_id === posteId && b.jour === jour && correspond(b, ligne),
  )
}

/** Un besoin qui demande au moins une personne (0 / 0 / 0 ne compte pas). */
const demande = (b: Besoin) => b.effectif + b.soutien + b.renfort > 0

/**
 * Les horaires où le poste a VRAIMENT besoin de monde (un besoin non nul),
 * plus ceux que l'utilisateur vient d'ajouter ou de régler dans la séance
 * (`gardees`, clés de ligne : une ligne remise à 0 ne disparaît pas sous ses
 * doigts). Depuis le 2026-10-28, une ligne à 0 partout n'est plus montrée, et
 * les autres horaires permis s'ajoutent un par un (`horairesAAjouter`) au lieu
 * d'être tous dépliés. Un horaire non permis qui porte encore un besoin reste
 * montré, signalé. Horaires spécifiques regroupés par début et fin. Tri par
 * heure de début.
 */
export function lignesDuPoste(
  siens: Besoin[],
  horaires: Horaire[],
  gardees: ReadonlySet<string>,
): LigneBesoin[] {
  const lignes: LigneBesoin[] = horaires
    .filter(
      (h) =>
        gardees.has(`t${h.id}`) ||
        siens.some((b) => b.horaire_id === h.id && demande(b)),
    )
    .map((h) => ({
      cle: `t${h.id}`,
      horaire_id: h.id,
      debut: h.debut,
      fin: h.fin,
    }))
  const specifiques = new Map<string, LigneBesoin>()
  for (const b of siens) {
    if (b.horaire_id !== null) continue
    const cle = `h${b.debut}-${b.fin}`
    if (demande(b) || gardees.has(cle)) {
      specifiques.set(cle, {
        cle,
        horaire_id: null,
        debut: b.debut,
        fin: b.fin,
      })
    }
  }
  return [...lignes, ...specifiques.values()].sort(
    (a, b) => a.debut.localeCompare(b.debut) || a.cle.localeCompare(b.cle),
  )
}

/** Les horaires permis pour le poste qui n'ont pas encore de ligne, par
 * heure de début, puis de fin. */
export function horairesAAjouter(
  possibles: Horaire[],
  lignes: LigneBesoin[],
): Horaire[] {
  return possibles
    .filter((h) => !lignes.some((l) => l.horaire_id === h.id))
    .sort(
      (a, b) =>
        a.debut.localeCompare(b.debut) ||
        a.fin.localeCompare(b.fin) ||
        a.id - b.id,
    )
}
