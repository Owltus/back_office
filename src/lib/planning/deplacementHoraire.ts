import { nomHoraire } from '#/lib/planning/affichage.ts'
import { couleurHoraire } from '#/lib/planning/cycles.ts'
import {
  MOMENTS_HOTEL,
  momentDeLHoraire,
  momentPropose,
} from '#/lib/planning/moment.ts'
import type { Moments } from '#/lib/planning/moment.ts'
import { minutes } from '#/lib/planning/temps.ts'
import type { Horaire, Periode } from '#/lib/planning/types.ts'

/*
 * Ranger un horaire dans un tableau de la page Horaires (2026-11-12, demande
 * utilisateur : glisser-déposer entre matin, middle, soir et nuit, puis un
 * tableau « Extra » pour les horaires de moins de 6 h de travail).
 *
 * Le moment calculé d'après les heures reste la règle. Poser l'horaire dans
 * un autre moment le marque `moment_force` ; le remettre dans le moment de
 * ses heures retire la marque. Un horaire de moins de 6 h va de lui-même dans
 * Extra ; le poser dans un moment l'en sort (marqué), le reposer dans Extra
 * l'y ramène. Extra est un rangement de la page : le calcul compte toujours
 * l'horaire dans son moment. Le nom et la couleur suivent le moment.
 */

/** Le tableau Extra (pas un moment du calcul). */
export const EXTRA = 'extra'
/** Moins que ce travail, en minutes : l'horaire va dans Extra. */
export const EXTRA_TRAVAIL_MAX = 6 * 60

export type Groupe = Periode | typeof EXTRA

type HoraireRange = Pick<
  Horaire,
  'debut' | 'fin' | 'pause' | 'periode' | 'moment_force'
>

export type ChangementMoment = Pick<
  Horaire,
  'periode' | 'moment_force' | 'nom' | 'couleur'
>

/** Moins de 6 h de travail. */
export function estExtra(h: Pick<Horaire, 'debut' | 'fin' | 'pause'>): boolean {
  let duree = minutes(h.fin) - minutes(h.debut)
  if (duree <= 0) duree += 24 * 60
  return duree - h.pause < EXTRA_TRAVAIL_MAX
}

/** Le tableau où l'horaire s'affiche. */
export function groupeHoraire(
  h: HoraireRange,
  l: Moments = MOMENTS_HOTEL,
): Groupe {
  if (estExtra(h) && !h.moment_force) return EXTRA
  return momentDeLHoraire(h, l)
}

/** Ce qu'il faut écrire pour poser `h` dans le tableau `vers`, ou null s'il
 * y est déjà ou n'y a pas sa place (Extra : moins de 6 h seulement). */
export function deplacementHoraire(
  h: HoraireRange,
  vers: Groupe,
  l: Moments = MOMENTS_HOTEL,
): ChangementMoment | null {
  if (groupeHoraire(h, l) === vers) return null
  const calcule = momentPropose(h, l)
  if (vers === EXTRA) {
    if (!estExtra(h)) return null
    return changement(h, calcule, false, l)
  }
  return changement(h, vers, estExtra(h) || vers !== calcule, l)
}

function changement(
  h: HoraireRange,
  periode: Periode,
  moment_force: boolean,
  l: Moments,
): ChangementMoment {
  const suite = { ...h, periode }
  return {
    periode,
    moment_force,
    nom: nomHoraire(suite, l),
    couleur: couleurHoraire(suite),
  }
}
