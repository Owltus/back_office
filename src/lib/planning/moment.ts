/*
 * Le moment d'un horaire (matin, middle, soir, nuit) se DÉDUIT de ses heures,
 * jamais d'un nom ni d'un choix fait à la main (décision du 2026-11-05). Seule
 * source : `momentPropose`. Les noms et groupes montrés à l'écran ne sont que
 * des étiquettes.
 */

import { minutes } from '#/lib/planning/temps.ts'
import type { Horaire, Periode } from '#/lib/planning/types.ts'

/**
 * Moment d'un horaire, CALCULÉ d'après ses heures. Depuis le 2026-11-05
 * (décision d'une responsable : « que les notions de matin, nuit soient
 * abstraites, que le moteur se concentre sur les horaires »), il n'est plus
 * modifiable : la base le reçoit à chaque enregistrement et la lecture le
 * recalcule (`avecMomentCalcule`), si bien qu'aucun réglage ne peut faire
 * croire au moteur qu'une nuit est un matin. Règles,
 * relevées sur les 35 horaires de l'hôtel (toutes les retrouvent) :
 * - nuit : commence à 21 h ou plus tard, ou avant 5 h ;
 * - soir : finit à 21 h ou plus tard, après minuit, ou commence à 15 h ou
 *   plus tard ;
 * - matin : commence avant 9 h et finit à 17 h 45 au plus tard ;
 * - middle : le reste, à cheval sur le matin et le soir.
 * Plus de moment « court » (décision utilisateur du même jour : « s'il
 * commence à 17 h, c'est du soir ; à 7 h, du matin ») : un horaire court se
 * range d'après son début, sa longueur ne compte que pour les remplaçants
 * (`estCourt`, cycles.ts).
 */
export function momentPropose(
  h: Pick<Horaire, 'debut' | 'fin' | 'pause'>,
): Periode {
  const debut = minutes(h.debut)
  const fin = minutes(h.fin)
  if (debut >= 21 * 60 || debut < 5 * 60) return 'nuit'
  if (fin <= debut || fin >= 21 * 60 || debut >= 15 * 60) return 'soir'
  if (debut < 9 * 60 && fin <= 17 * 60 + 45) return 'matin'
  return 'middle'
}

/** L'horaire avec son moment recalculé d'après ses heures (lecture de la
 * base, enregistrement) : un moment ancien, choisi à la main avant le
 * 2026-11-05, ne survit pas. */
export function avecMomentCalcule<
  T extends Pick<Horaire, 'debut' | 'fin' | 'pause' | 'periode'>,
>(h: T): T {
  const periode = momentPropose(h)
  return h.periode === periode ? h : { ...h, periode }
}
