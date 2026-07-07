/*
 * Formateurs monétaires de la caisse (euros, locale FR), partagés entre l'UI
 * (CaisseBoard) et la génération PDF (pdf.ts). Instances Intl créées une fois
 * au niveau module et réutilisées. Précision au centime (2 décimales), sauf
 * `fmtEurInt` (montant entier, ex. le fond de caisse cible).
 */

const eur = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const eur0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

/** Montant en euros, 2 décimales (ex. « 12,50 € »). */
export const fmtEur = (n: number) => `${eur.format(n)} €`
/** Montant en euros, entier (ex. « 150 € »). */
export const fmtEurInt = (n: number) => `${eur0.format(n)} €`
/** Écart signé, 2 décimales (ex. « +12,50 € » / « -3,00 € »). */
export const fmtEcart = (n: number) => `${n >= 0 ? '+' : ''}${eur.format(n)} €`
/** Écart signé SANS le symbole € (colonne compacte, responsive). */
export const fmtEcartBare = (n: number) => `${n >= 0 ? '+' : ''}${eur.format(n)}`
