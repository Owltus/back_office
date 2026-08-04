import { z } from 'zod'

/*
 * Garde des params de route analytique `$year` / `$month` (chaînes de route).
 * Même esprit que `lib/shared/searchParams.ts` pour `?date=` : REPLI SILENCIEUX
 * sur le mois courant plutôt qu'un écran d'erreur (outil interne). Sans cette
 * garde, `Number('abc')` donne `NaN` et `Number('99')` un mois hors bornes, que
 * les boards propagent en requêtes / rendus incohérents.
 */

const yearSchema = z.coerce.number().int().min(2020).max(2100)
const monthSchema = z.coerce.number().int().min(1).max(12)

/** Borne et convertit les params de route analytique. Repli silencieux sur le
 * mois courant si l'un des deux est absent, non numérique ou hors bornes. */
export function parseYearMonthParams(raw: { year: string; month: string }): {
  year: number
  month: number
} {
  const y = yearSchema.safeParse(raw.year)
  const m = monthSchema.safeParse(raw.month)
  const now = new Date()
  return {
    year: y.success ? y.data : now.getFullYear(),
    month: m.success ? m.data : now.getMonth() + 1,
  }
}
