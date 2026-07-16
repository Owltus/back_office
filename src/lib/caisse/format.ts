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
/** Entier nu, sans symbole (ex. « 12 » — nombre de feuilles). */
export const fmtInt = (n: number) => eur0.format(n)
// Écart signé : « +12,50 », « -3,00 », mais « 0,00 » NU dès que ça arrondit à
// zéro — jamais « +0,00 » ni le trompeur « -0,00 » / « +-0,00 » du zéro négatif
// flottant (où -0 >= 0 est vrai en JS, donc « + », mais Intl rend « -0,00 »).
const signEcart = (n: number): string => {
  const r = Math.round(n * 100) / 100
  if (r === 0) return eur.format(0)
  return `${r > 0 ? '+' : ''}${eur.format(r)}`
}
/** Écart signé, 2 décimales (ex. « +12,50 € » / « -3,00 € »). */
export const fmtEcart = (n: number) => `${signEcart(n)} €`
/** Écart signé SANS le symbole € (colonne compacte, responsive). */
export const fmtEcartBare = (n: number) => signEcart(n)
