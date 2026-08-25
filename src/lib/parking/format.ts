/*
 * Formateurs de la vue parking — réexport de la base partagée `lib/format`.
 * `fmtEur` sert au CA (tarif versionné dans `parking_tarifs`, calculé côté
 * vue SQL). `fmtPct` (1 déc.) et `fmtPctInt` (entier) rendent identiquement
 * à l'ancienne implémentation locale.
 */
export { fmtEur, fmtInt, fmtPct, fmtPctInt } from '#/lib/format/index.ts'
