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
 * l'y ramène. Un horaire plus long peut aussi être posé dans Extra (marque
 * `extra`, retours de la RH du 2026-11-12 : 07:00–13:00 et 08:00–14:00) ;
 * le reposer dans un moment retire la marque. Extra est un rangement de la
 * page : le calcul compte toujours l'horaire dans son moment. Le nom et la
 * couleur suivent le moment.
 */

/** Le tableau Extra (pas un moment du calcul). */
export const EXTRA = 'extra'
/** Moins que ce travail, en minutes : l'horaire va dans Extra. */
export const EXTRA_TRAVAIL_MAX = 6 * 60

export type Groupe = Periode | typeof EXTRA

type HoraireRange = Pick<
  Horaire,
  'debut' | 'fin' | 'pause' | 'periode' | 'moment_force' | 'extra'
>

export type ChangementMoment = Pick<
  Horaire,
  'periode' | 'moment_force' | 'extra' | 'nom' | 'couleur'
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
  if (h.extra || (estExtra(h) && !h.moment_force)) return EXTRA
  return momentDeLHoraire(h, l)
}

/** Ce qu'il faut écrire pour poser `h` dans le tableau `vers`, ou null s'il
 * y est déjà. */
export function deplacementHoraire(
  h: HoraireRange,
  vers: Groupe,
  l: Moments = MOMENTS_HOTEL,
): ChangementMoment | null {
  if (groupeHoraire(h, l) === vers) return null
  const calcule = momentPropose(h, l)
  // Extra : son moment repart du calcul ; seul un horaire de 6 h ou plus a
  // besoin de la marque pour y rester.
  if (vers === EXTRA) return changement(h, calcule, false, !estExtra(h), l)
  return changement(h, vers, estExtra(h) || vers !== calcule, false, l)
}

function changement(
  h: HoraireRange,
  periode: Periode,
  moment_force: boolean,
  extra: boolean,
  l: Moments,
): ChangementMoment {
  const suite = { ...h, periode }
  return {
    periode,
    moment_force,
    extra,
    nom: nomHoraire(suite, l),
    couleur: couleurHoraire(suite),
  }
}
