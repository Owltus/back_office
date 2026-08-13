import { breakfastCode } from '#/lib/pdj/breakdown.ts'

/* --------------------------------------------------------------------------
 * « automode » — métier pur (sans React ni Supabase).
 *
 * Décide quelles chambres cocher quand on lance l'automode sur un jour : pour
 * chaque chambre FACTURÉE (PDJ inclus), poser `breakfasts_served` au DÛ
 * (`breakfasts_included`). C'est exactement ce qu'affiche la vue financière —
 * on « matérialise » le facturé, sans inventer d'extra (donc le CA calculé par
 * `computePdjCA` reste inchangé, cf. breakdown.ts).
 *
 * Deux garde-fous portés ici (le board s'y fie) :
 * - anti-écrasement : on ne cible QUE les chambres pas encore saisies
 *   (`breakfasts_served === 0`) → sûr et idempotent, même sur un jour partiel ;
 * - périmètre facturé : chambre avec un code PDJ (`breakfastCode(addons)`) ou une
 *   ligne manuelle `manual_kind === 'inclus'`, ET `breakfasts_included > 0`. Les
 *   lignes `manual_kind === 'extra'` (included = 0) sont exclues.
 * ------------------------------------------------------------------------ */

/** Lignes minimales nécessaires (PdjDayRow les satisfait structurellement). */
export interface AutoModeRow {
  room: number
  addons: string | null
  manual_kind: 'inclus' | 'extra' | null
  breakfasts_included: number
  breakfasts_served: number
}

/** Une chambre à cocher : `served` = valeur à poser (= le dû facturé). */
export interface AutoModeTarget {
  room: number
  served: number
}

/**
 * Chambres à cocher pour l'automode : facturées (code PDJ ou `manual_kind`
 * 'inclus', `breakfasts_included > 0`) et pas encore saisies
 * (`breakfasts_served === 0`). Pose `served = breakfasts_included`. Ne touche
 * jamais aux extras ni aux chambres déjà cochées.
 */
export function autoModeTargets(rows: AutoModeRow[]): AutoModeTarget[] {
  const out: AutoModeTarget[] = []
  for (const r of rows) {
    const isBilled =
      (breakfastCode(r.addons) != null || r.manual_kind === 'inclus') &&
      r.breakfasts_included > 0
    if (isBilled && (r.breakfasts_served ?? 0) === 0) {
      out.push({ room: r.room, served: r.breakfasts_included })
    }
  }
  return out
}

/** Vrai si AUCUNE case n'est cochée sur le jour (toutes les lignes à served 0). */
export function isPdjDayBlank(rows: AutoModeRow[]): boolean {
  return rows.every((r) => (r.breakfasts_served ?? 0) === 0)
}
