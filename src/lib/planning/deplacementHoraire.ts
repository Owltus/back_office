import { nomHoraire } from '#/lib/planning/affichage.ts'
import { couleurHoraire } from '#/lib/planning/cycles.ts'
import { MOMENTS_HOTEL, momentPropose } from '#/lib/planning/moment.ts'
import type { Moments } from '#/lib/planning/moment.ts'
import type { Horaire, Periode } from '#/lib/planning/types.ts'

/*
 * Déplacer un horaire d'un moment à un autre (2026-11-12, demande
 * utilisateur : « déplacer les horaires de matin, middle, soir et nuit avec
 * un glisser-déposer… en changeant la couleur qui correspond »).
 *
 * Le moment calculé d'après les heures reste la règle. Poser l'horaire dans
 * un autre moment le marque « placé à la main » (`moment_force`) ; le remettre
 * dans le moment de ses heures retire la marque. Le nom et la couleur
 * suivent le moment, comme à l'enregistrement d'un horaire.
 */

export type ChangementMoment = Pick<
  Horaire,
  'periode' | 'moment_force' | 'nom' | 'couleur'
>

/** Ce qu'il faut écrire pour poser `h` dans le moment `vers`, ou null si
 * l'horaire y est déjà. */
export function deplacementHoraire(
  h: Pick<Horaire, 'debut' | 'fin' | 'pause' | 'periode' | 'moment_force'>,
  vers: Periode,
  l: Moments = MOMENTS_HOTEL,
): ChangementMoment | null {
  if (h.periode === vers) return null
  const calcule = momentPropose(h, l)
  const suite = { ...h, periode: vers }
  return {
    periode: vers,
    moment_force: vers !== calcule,
    nom: nomHoraire(suite, l),
    couleur: couleurHoraire(suite),
  }
}
