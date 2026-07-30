/*
 * Formateurs de nombres GÉNÉRIQUES (locale FR), base partagée par toutes les
 * features. Chaque feature réexporte tel quel (pdj, parking) ou spécialise (caisse,
 * au centime). Convention : une espace avant % et € (norme typographique FR).
 * Instances Intl créées une fois au niveau module (coûteux à construire).
 */

const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
const nf2 = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Entier nu, séparateur de milliers FR (ex. « 1 234 »). */
export const fmtInt = (n: number) => nf0.format(n)

/** Pourcentage avec espace avant % (ex. « 72,5 % »). `decimals` = 1 par défaut. */
export const fmtPct = (n: number, decimals: 0 | 1 = 1) =>
  `${(decimals === 0 ? nf0 : nf1).format(n)} %`

/** Pourcentage arrondi à l'entier (ex. « 73 % »). */
export const fmtPctInt = (n: number) => fmtPct(n, 0)

/** Montant en euros avec espace avant € (ex. « 12 345 € » ou « 12,50 € »). */
export const fmtEur = (n: number, decimals: 0 | 2 = 0) =>
  `${(decimals === 2 ? nf2 : nf0).format(n)} €`
