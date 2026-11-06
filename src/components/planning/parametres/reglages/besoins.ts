/*
 * Lignes du tableau des besoins d'un poste (prototype `BesoinsPage.tsx`,
 * `lignesDuPoste`, `trouver`, `correspond`). Pur.
 */

import { NIVEAUX, niveauLu } from '#/lib/planning/niveaux.ts'
import type { Niveaux } from '#/lib/planning/niveaux.ts'
import type {
  Besoin,
  BesoinNiveau,
  Horaire,
  NiveauDemande,
} from '#/lib/planning/types.ts'

/** Une ligne : un horaire du référentiel, ou un horaire spécifique. */
export interface LigneBesoin {
  cle: string
  horaire_id: number | null
  debut: string
  fin: string
}

/** Minimum obligatoire, places de soutien, places en plus facultatives ;
 * et, depuis le 2026-11-05 (étape 7, D4), obligatoire ou souhaité et le
 * niveau demandé. Absents : obligatoire, dépannage accepté (comme avant). */
export interface Reglage {
  effectif: number
  soutien: number
  renfort: number
  obligatoire?: boolean
  niveau_min?: NiveauDemande
  /** Nombre par niveau (2026-11-06) ; vide : les personnes nécessaires, au
   * niveau demandé. Rempli : `effectif` en est la somme. */
  niveaux?: BesoinNiveau[]
}

/** Les personnes nécessaires sont souhaitées, pas obligatoires. */
export const estSouhaite = (r: Reglage) => r.obligatoire === false

/** La case demande un nombre par niveau. */
export const parNiveau = (r: Reglage) => (r.niveaux?.length ?? 0) > 0

/** Le niveau demandé par la case, s'il restreint la place (un niveau
 * autonome qui n'est pas le dernier) ; null sinon. */
export function niveauRestreint(
  r: Reglage,
  niveaux: Niveaux = NIVEAUX,
): string | null {
  if (parNiveau(r)) return null
  const n = niveauLu(niveaux, r.niveau_min)
  return n && n.autonome && n.rang < niveaux.autonomes.length - 1 ? n.nom : null
}

/** Le nombre par niveau d'une case : celui qu'elle porte, sinon ses
 * personnes nécessaires au niveau demandé (le dernier autonome sans
 * niveau demandé). */
export function lignesNiveaux(
  r: Reglage,
  niveaux: Niveaux = NIVEAUX,
): BesoinNiveau[] {
  if (parNiveau(r)) return r.niveaux ?? []
  if (r.effectif <= 0) return []
  const n = niveauLu(niveaux, r.niveau_min)
  const id = n && n.autonome ? n.id : (niveaux.autonomes.at(-1)?.id ?? null)
  return id ? [{ niveau: id, nombre: r.effectif }] : []
}

/** Règle le nombre d'un niveau : la case passe au nombre par niveau ;
 * `effectif` suit. Plus aucun nombre : la case revient aux personnes
 * nécessaires (0). */
export function reglerNiveauCase(
  r: Reglage,
  niveau: string,
  nombre: number,
  niveaux: Niveaux = NIVEAUX,
): Reglage {
  const lignes = lignesNiveaux(r, niveaux).filter((l) => l.niveau !== niveau)
  if (nombre > 0) lignes.push({ niveau, nombre })
  const ordre = (id: string) => niveaux.parId.get(id)?.position ?? 99
  lignes.sort((a, b) => ordre(a.niveau) - ordre(b.niveau))
  const effectif = lignes.reduce((t, l) => t + l.nombre, 0)
  if (!effectif) return reglerChamp({ ...r, niveaux: [] }, 'effectif', 0)
  return { ...r, effectif, niveaux: lignes, niveau_min: null }
}

/** Revient à un seul chiffre : la somme, au moins préféré des niveaux
 * demandés. */
export function sansDetailNiveaux(
  r: Reglage,
  niveaux: Niveaux = NIVEAUX,
): Reglage {
  const lignes = lignesNiveaux(r, niveaux)
  const pire = lignes
    .map((l) => niveaux.parId.get(l.niveau))
    .filter((n) => n?.autonome)
    .sort((a, b) => (b?.rang ?? 0) - (a?.rang ?? 0))[0]
  return {
    ...r,
    niveaux: [],
    niveau_min:
      pire && pire.rang < niveaux.autonomes.length - 1 ? pire.id : null,
  }
}

/** Les deux options d'une case, avec leurs défauts. */
export function optionsDe(r: Reglage): {
  obligatoire: boolean
  niveau_min: NiveauDemande
  niveaux: BesoinNiveau[]
} {
  return {
    obligatoire: r.obligatoire !== false,
    niveau_min: r.niveau_min ?? null,
    niveaux: r.niveaux ?? [],
  }
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
    // Un chiffre réglé à la main remplace le nombre par niveau.
    const sans = parNiveau(r) ? { niveaux: [] } : {}
    return { ...r, ...sans, effectif: v, soutien, renfort: r.renfort }
  }
  if (champ === 'renfort') {
    return v + r.effectif === 0
      ? { ...r, effectif: r.effectif, soutien: 0, renfort: 0 }
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
