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

/*
 * Écrit à la main depuis le 2026-09-21, sans zod.
 *
 * Ce module est tiré dans le CHUNK D'ENTRÉE de l'application : les
 * `validateSearch` vivent dans la partie non code-splittée des routes, donc
 * toute dépendance qu'ils touchent est payée par CHAQUE page, avant le premier
 * chiffre affiché. Zod y pesait 53 002 octets bruts / 14 279 compressés — dont
 * 8 712 octets de conversion vers JSON Schema que ce projet n'appellera jamais
 * — pour une expression régulière, un contrôle de calendrier et deux bornes
 * entières. Le comportement ci-dessous est identique à la virgule près ;
 * `searchParams.test.ts` en est le filet.
 *
 * ⚠ Ne pas réintroduire zod ici. S'il devient utile ailleurs, qu'il y reste :
 * la règle est qu'aucun `validateSearch` ne doit tirer de dépendance lourde.
 */

/** Vrai si la chaîne est une date `YYYY-MM-DD` réellement existante. */
export function isValidIsoDate(value: unknown): boolean {
  if (typeof value !== 'string') return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  /*
   * La regex seule laisserait passer `2026-02-31` ou `2026-13-01`. En JS, ces
   * valeurs ne donnent PAS Invalid Date : `new Date('2026-02-31T00:00:00')`
   * bascule silencieusement au 3 mars. On reformate donc la date obtenue et on
   * la compare à l'entrée — si elles diffèrent, la date n'existait pas.
   */
  const d = new Date(`${value}T00:00:00`)
  return !Number.isNaN(d.getTime()) && toIso(d) === value
}

/**
 * `validateSearch` des routes à `?date=`. Retourne `{}` — donc le jour courant
 * côté board — dès que la valeur est absente, mal formée ou inexistante.
 */
export function parseDateSearch(
  search: Record<string, unknown>,
): { date?: string } {
  const value = search.date
  return isValidIsoDate(value) ? { date: value as string } : {}
}
