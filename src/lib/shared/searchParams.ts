import { z } from 'zod'

/*
 * Validation du paramètre `?date=` des routes qui ouvrent un board sur un jour
 * précis (parking, pdj, rapro, caisse).
 *
 * POURQUOI : `validateSearch` portait son nom sans le tenir. Il ne vérifiait que
 * le TYPE (`typeof d === 'string'`), jamais le format — `?date=lol` traversait
 * donc jusqu'aux boards. Dans ParkingBoard.tsx:335-336,
 * `new Date('lol' + 'T00:00:00')` donne Invalid Date, `differenceInCalendarDays`
 * renvoie NaN, et la grille se casse. Ce n'est ni un XSS (la valeur ne rejoint
 * aucun sink HTML) ni une injection (le client Supabase paramètre ses filtres) :
 * c'est un plantage auto-infligé, mais il est réel.
 *
 * Le repli est SILENCIEUX : une date invalide est ignorée et le board s'ouvre
 * sur le jour courant. Sur un outil interne, afficher un écran d'erreur parce
 * qu'un lien a été mal copié serait plus pénible qu'utile.
 */

/** Formate une Date en `YYYY-MM-DD` selon le fuseau local. */
const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'format attendu : YYYY-MM-DD')
  /*
   * La regex seule laisserait passer `2026-02-31` ou `2026-13-01`. En JS, ces
   * valeurs ne donnent PAS Invalid Date : `new Date('2026-02-31T00:00:00')`
   * bascule silencieusement au 3 mars. On reformate donc la date obtenue et on
   * la compare à l'entrée — si elles diffèrent, la date n'existait pas.
   */
  .refine((v) => {
    const d = new Date(`${v}T00:00:00`)
    return !Number.isNaN(d.getTime()) && toIso(d) === v
  }, 'date inexistante au calendrier')

/**
 * `validateSearch` des routes à `?date=`. Retourne `{}` — donc le jour courant
 * côté board — dès que la valeur est absente, mal formée ou inexistante.
 */
export function parseDateSearch(
  search: Record<string, unknown>,
): { date?: string } {
  const parsed = isoDate.safeParse(search.date)
  return parsed.success ? { date: parsed.data } : {}
}

/** Vrai si la chaîne est une date `YYYY-MM-DD` réellement existante. */
export function isValidIsoDate(value: unknown): boolean {
  return isoDate.safeParse(value).success
}
