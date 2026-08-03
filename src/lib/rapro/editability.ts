import { RAPRO_GRACE_DAYS } from '#/lib/permissions/actions.ts'
import { atLeastLevel } from '#/lib/permissions/levels.ts'
import type { PageLevel } from '#/lib/permissions/levels.ts'
import { addDays } from '#/lib/rapro/day.ts'

/* --------------------------------------------------------------------------
 * Éditabilité d'un jour de rapprochement (pur : sans React).
 *
 * Le rapprochement se fait JOUR par JOUR. Règle d'accès :
 *   - lecture  : consultation seule (aucune action).
 *   - ecriture : agit uniquement dans la FENÊTRE de grâce — le jour affiché doit
 *     être dans les RAPRO_GRACE_DAYS derniers jours (aujourd'hui, J-1, J-2). Dans
 *     cette fenêtre : éditer la grille, clôturer, rouvrir puis re-clôturer. Au-delà
 *     dans le passé : AUCUNE modification, même si le jour n'est pas clôturé.
 *   - gestion  : peut tout faire, n'importe quel jour.
 *
 * Les dates sont des chaînes 'YYYY-MM-DD' (comparaison lexicale = chronologique).
 * Miroir de la borne RLS `report_date >= current_date - RAPRO_GRACE_DAYS`.
 * ------------------------------------------------------------------------ */

/** Le jour est-il dans la fenêtre d'action de l'écriture (J-0..J-grâce) ? */
export function isDayWithinGrace(day: string, today: string): boolean {
  return day >= addDays(today, -RAPRO_GRACE_DAYS)
}

/**
 * L'utilisateur peut-il agir sur CE jour (éditer la grille, clôturer, rouvrir) ?
 * gestion : toujours ; ecriture : seulement dans la fenêtre de grâce ; en dessous
 * d'écriture (lecture / aucun accès) : jamais.
 */
export function canReconcileDay(
  day: string,
  today: string,
  level: PageLevel | null | undefined,
): boolean {
  if (atLeastLevel(level, 'gestion')) return true
  if (!atLeastLevel(level, 'ecriture')) return false
  return isDayWithinGrace(day, today)
}
