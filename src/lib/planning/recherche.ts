/*
 * Paramètres d'URL de `/planning` : `?vue=mois&mois=2026-11` ou
 * `?vue=semaine&lundi=2026-11-02`. Validés à la main (comme
 * `lib/shared/searchParams.ts`, sans zod) ; une valeur invalide est ignorée
 * en silence.
 */

export interface PlanningSearch {
  vue?: 'semaine' | 'mois'
  lundi?: string
  mois?: string
}

function dateValide(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const [a, m, j] = v.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1, j))
  return (
    d.getUTCFullYear() === a &&
    d.getUTCMonth() === m - 1 &&
    d.getUTCDate() === j
  )
}

export function lirePlanningSearch(s: Record<string, unknown>): PlanningSearch {
  const r: PlanningSearch = {}
  if (s.vue === 'semaine' || s.vue === 'mois') r.vue = s.vue
  if (
    dateValide(s.lundi) &&
    new Date(`${s.lundi}T12:00:00Z`).getUTCDay() === 1
  ) {
    r.lundi = s.lundi
  }
  if (typeof s.mois === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s.mois))
    r.mois = s.mois
  return r
}

/** Paramètres d'URL des écrans de réglages : `?ouvrir=poste-3` ouvre le
 * réglage visé (lien d'un point « À vérifier », `coherence.ts`). */
export interface ReglagesSearch {
  ouvrir?: string
}

export function lireReglagesSearch(s: Record<string, unknown>): ReglagesSearch {
  return typeof s.ouvrir === 'string' && /^[a-z]+(-\d+)?$/.test(s.ouvrir)
    ? { ouvrir: s.ouvrir }
    : {}
}
