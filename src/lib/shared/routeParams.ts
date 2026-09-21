/*
 * Garde des params de route analytique `$year` / `$month` (chaînes de route).
 * Même esprit que `lib/shared/searchParams.ts` pour `?date=` : REPLI SILENCIEUX
 * sur le mois courant plutôt qu'un écran d'erreur (outil interne). Sans cette
 * garde, `Number('abc')` donne `NaN` et `Number('99')` un mois hors bornes, que
 * les boards propagent en requêtes / rendus incohérents.
 *
 * Écrit à la main depuis le 2026-09-21, sans zod — même raison que
 * `searchParams.ts` : ce module est tiré dans le chunk d'entrée par les
 * `validateSearch` / `params` des routes, donc payé par chaque page.
 * `Number.isInteger` reproduit exactement `z.coerce.number().int()` sur une
 * chaîne : `Number('')` vaut 0 (rejeté par les bornes), `Number('abc')` vaut
 * NaN, `Number(' 2026 ')` vaut 2026, `Number('2026.5')` n'est pas entier.
 */

/** Entier borné, ou `null` si la chaîne n'en est pas un dans l'intervalle. */
function borne(raw: string, min: number, max: number): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n >= min && n <= max ? n : null
}

/** Borne et convertit les params de route analytique. Repli silencieux sur le
 * mois courant si l'un des deux est absent, non numérique ou hors bornes. */
export function parseYearMonthParams(raw: { year: string; month: string }): {
  year: number
  month: number
} {
  const y = borne(raw.year, 2020, 2100)
  const m = borne(raw.month, 1, 12)
  const now = new Date()
  return {
    year: y ?? now.getFullYear(),
    month: m ?? now.getMonth() + 1,
  }
}
