/*
 * Formateurs de la vue parking — réexport de la base partagée `lib/format`. Aucun
 * montant € (la table parking ne porte pas de tarif). `fmtPct` (1 déc.) et
 * `fmtPctInt` (entier) rendent identiquement à l'ancienne implémentation locale.
 */
export { fmtInt, fmtPct, fmtPctInt } from '#/lib/format/index.ts'
