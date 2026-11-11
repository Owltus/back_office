/*
 * Annuler et Rétablir de la page Besoins (demande utilisateur du
 * 2026-10-31 : « ça a activé le samedi et le dimanche, je ne sais pas
 * comment revenir »). Pur.
 *
 * Une entrée = une action de l'utilisateur (un clic de compteur, une copie
 * sur plusieurs jours, une ligne vidée, une présence minimum réglée), avec
 * les valeurs AVANT et APRÈS de chaque case touchée. Annuler réécrit les
 * valeurs avant, Rétablir les valeurs après, par la même écriture que
 * l'action. La pile ne vit que le temps de la page (pas de stockage).
 */

import { optionsDe } from '#/components/planning/parametres/reglages/besoins.ts'
import type {
  LigneBesoin,
  Reglage,
} from '#/components/planning/parametres/reglages/besoins.ts'
import type { Consigne } from '#/lib/planning/types.ts'

/** Au moins et au plus d'une présence minimum (`maximum` null : sans limite). */
export interface Bornes {
  minimum: number
  maximum: number | null
}

export type Changement =
  | {
      type: 'besoin'
      posteId: number
      ligne: LigneBesoin
      jour: number
      avant: Reglage
      apres: Reglage
    }
  | {
      type: 'consigne'
      /** Zone du chiffre (2026-11-06). */
      zone: number
      /** Poste du chiffre (2026-11-11) ; null : toute la zone. */
      poste: number | null
      jour: number
      periode: Consigne['periode']
      avant: Bornes
      apres: Bornes
    }

export interface Entree {
  /** Ce qui a été fait, dit à l'annulation (« copie sur 2 jours »). */
  libelle: string
  changements: Changement[]
}

export interface Historique {
  passe: Entree[]
  futur: Entree[]
}

export const HISTORIQUE_VIDE: Historique = { passe: [], futur: [] }

/** Au-delà, les plus anciennes entrées sont oubliées. */
export const LIMITE_HISTORIQUE = 100

const memeReglage = (a: Reglage, b: Reglage) =>
  a.effectif === b.effectif &&
  a.soutien === b.soutien &&
  a.renfort === b.renfort &&
  optionsDe(a).obligatoire === optionsDe(b).obligatoire &&
  optionsDe(a).niveau_min === optionsDe(b).niveau_min &&
  JSON.stringify(optionsDe(a).niveaux) === JSON.stringify(optionsDe(b).niveaux)
const memesBornes = (a: Bornes, b: Bornes) =>
  a.minimum === b.minimum && a.maximum === b.maximum

/** Le changement ne change rien (avant = après). */
export function sansEffet(c: Changement): boolean {
  return c.type === 'besoin'
    ? memeReglage(c.avant, c.apres)
    : memesBornes(c.avant, c.apres)
}

/** Ajoute une action ; les changements sans effet sont retirés, une action
 * qui ne change rien n'est pas gardée. Toute nouvelle action efface ce qui
 * pouvait être rétabli. */
export function ajouter(
  h: Historique,
  e: Entree,
  limite = LIMITE_HISTORIQUE,
): Historique {
  const changements = e.changements.filter((c) => !sansEffet(c))
  if (!changements.length) return h
  const passe = [...h.passe, { ...e, changements }]
  return { passe: passe.slice(Math.max(0, passe.length - limite)), futur: [] }
}

/** Les mêmes cases, sens inverse (ce qu'écrit Annuler). */
export function inverser(c: Changement): Changement {
  return { ...c, avant: c.apres, apres: c.avant } as Changement
}

/** Annuler : l'entrée à défaire (ses changements déjà inversés, prêts à
 * écrire) et la pile suivante. Rien à annuler : `entree` absente. */
export function annuler(h: Historique): {
  historique: Historique
  entree?: Entree
} {
  const derniere = h.passe.at(-1)
  if (!derniere) return { historique: h }
  return {
    historique: { passe: h.passe.slice(0, -1), futur: [...h.futur, derniere] },
    entree: { ...derniere, changements: derniere.changements.map(inverser) },
  }
}

/** Rétablir : l'entrée à refaire, telle qu'elle avait été faite. */
export function retablir(h: Historique): {
  historique: Historique
  entree?: Entree
} {
  const prochaine = h.futur.at(-1)
  if (!prochaine) return { historique: h }
  return {
    historique: {
      passe: [...h.passe, prochaine],
      futur: h.futur.slice(0, -1),
    },
    entree: prochaine,
  }
}

/** Les jours d'une copie « Appliquer ces réglages à ». */
export type CibleCopie = 'semaine' | 'ouvres' | 'weekend'

export const JOURS_COPIE: Readonly<Record<CibleCopie, readonly number[]>> = {
  semaine: [0, 1, 2, 3, 4, 5, 6],
  ouvres: [0, 1, 2, 3, 4],
  weekend: [5, 6],
}
