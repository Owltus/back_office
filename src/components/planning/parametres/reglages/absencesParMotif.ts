/*
 * Usage des motifs d'absence (prototype `HorairesPage.tsx`, « Utilisé par N
 * personnes ») : la semaine type ET les jours d'absence posés. Le référentiel
 * ne porte pas les jours posés : une lecture dédiée les compte, colonnes
 * explicites, par pages (une réponse de la base est plafonnée en lignes).
 *
 * Exception assumée à la règle « tout passe par `lib/planning/service.ts` »
 * (demande du chantier) : lecture seule, deux colonnes, rien d'écrit.
 */

import { supabase } from '#/lib/supabase.ts'
import type { Salarie } from '#/lib/planning/types.ts'

export interface LigneAbsence {
  motif_id: number
  salarie_id: number
}

const PAGE = 1000

/** Toutes les lignes (motif, personne) des jours d'absence posés. */
export async function compterAbsencesParMotif(): Promise<LigneAbsence[]> {
  const lignes: LigneAbsence[] = []
  for (let debut = 0; ; debut += PAGE) {
    const { data, error } = await supabase
      .from('planning_absences')
      .select('motif_id, salarie_id')
      .order('id')
      .range(debut, debut + PAGE - 1)
    if (error) throw error
    const page = data as LigneAbsence[]
    lignes.push(...page)
    if (page.length < PAGE) return lignes
  }
}

export interface UsageMotif {
  /** Personnes qui l'ont dans leur semaine type OU un jour posé. */
  personnes: number
  /** Jours d'absence posés avec ce motif (effacés à la suppression). */
  jours: number
}

/** Usage d'un motif, d'après les fiches et les jours posés (pur). */
export function usageMotif(
  motifId: number,
  salaries: Salarie[],
  absences: LigneAbsence[],
): UsageMotif {
  const personnes = new Set<number>()
  for (const s of salaries) {
    if (s.semaine_type.some((e) => e.type_absence_id === motifId))
      personnes.add(s.id)
  }
  let jours = 0
  for (const a of absences) {
    if (a.motif_id !== motifId) continue
    jours++
    personnes.add(a.salarie_id)
  }
  return { personnes: personnes.size, jours }
}
