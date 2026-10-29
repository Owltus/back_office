/*
 * Lecture et écriture du contrôle des données à ranger (plan
 * `planning-coherence-2026-10-28`, étape 11). À part de `service.ts` : rien
 * d'autre ne s'en sert. Mêmes règles : colonnes explicites, `{ error }` lu,
 * toute écriture relue (un update refusé par la RLS rend 0 ligne SANS
 * erreur).
 */

import type { Correction, ShiftLu } from '#/lib/planning/donneesARanger.ts'
import { refusDroits } from '#/lib/planning/erreurs.ts'
import { supabase } from '#/lib/supabase.ts'

function verifier<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error
  return r.data as T
}

const COL_SHIFT_LU =
  'id, lundi, salarie_id, poste_id, jour, horaire_id, debut, fin, pause'
const PAGE_SHIFTS = 1000

/** Tous les shifts à partir de la semaine `depuis` (contrôle des données à
 * ranger, étape 11). Lus par pages de 1 000 (plafond de PostgREST), triés
 * par `id` : tri stable sur une clé unique, sinon une page peut sauter ou
 * répéter des lignes. */
export async function fetchShiftsDepuis(depuis: string): Promise<ShiftLu[]> {
  const tout: ShiftLu[] = []
  for (let debut = 0; ; debut += PAGE_SHIFTS) {
    const page = verifier(
      await supabase
        .from('planning_affectations')
        .select(COL_SHIFT_LU)
        .gte('lundi', depuis)
        .order('id')
        .range(debut, debut + PAGE_SHIFTS - 1),
    ) as ShiftLu[]
    tout.push(...page)
    if (page.length < PAGE_SHIFTS) return tout
  }
}

/**
 * Range des shifts (étape 11) : UNE requête, donc une seule instruction et
 * une seule transaction (tout ou rien). Une garde ne touche que les shifts
 * encore dans l'état constaté : rejouée, la correction ne change plus rien
 * (idempotente), et un shift retouché entre-temps par un collègue est
 * laissé. Rend le nombre de shifts modifiés.
 *
 * 0 ligne ne dit pas pourquoi (RLS : un update refusé rend 0 ligne sans
 * erreur) : les shifts sont relus, et s'il en reste un dans l'état d'avant,
 * c'est un refus. Une semaine verrouillée fait échouer le tout (PL423) :
 * l'appelant ne doit pas en envoyer.
 */
export async function rangerShifts(
  ids: readonly number[],
  correction: Correction,
): Promise<number> {
  if (!ids.length) return 0
  const table = () => supabase.from('planning_affectations')
  const r =
    correction.type === 'code'
      ? await table()
          .update({ horaire_id: correction.horaireId })
          .in('id', ids)
          .is('horaire_id', null)
          .eq('debut', correction.debut)
          .eq('fin', correction.fin)
          .eq('pause', correction.pause)
          .select('id')
      : await table()
          .update({ poste_id: correction.posteId })
          .in('id', ids)
          .eq('poste_id', correction.ancienPosteId)
          .eq('horaire_id', correction.horaireId)
          .select('id')
  const modifies = (verifier(r) as Array<{ id: number }> | null) ?? []
  if (modifies.length === ids.length) return modifies.length
  const relus = verifier(
    await table()
      .select('id, horaire_id, poste_id, debut, fin, pause')
      .in('id', ids),
  ) as Array<
    Pick<ShiftLu, 'id' | 'horaire_id' | 'poste_id' | 'debut' | 'fin' | 'pause'>
  >
  const restants = relus.filter((s) =>
    correction.type === 'code'
      ? s.horaire_id === null &&
        s.debut === correction.debut &&
        s.fin === correction.fin &&
        s.pause === correction.pause
      : s.poste_id === correction.ancienPosteId &&
        s.horaire_id === correction.horaireId,
  )
  if (restants.length) throw refusDroits()
  return modifies.length
}
