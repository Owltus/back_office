/*
 * Formateurs de la vue PDJ (locale FR), partagés par les deux boards analytique
 * (annuel + détail mensuel). Instances Intl créées une fois au niveau module.
 */

const int0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

/** Entier nu, sans symbole (ex. « 128 » — clients, PDJ, jours). */
export const fmtInt = (n: number) => int0.format(n)

/** Pourcentage, 1 décimale, virgule française (ex. « 72,5 % » — occupation). */
export const fmtPct = (n: number) => `${n.toFixed(1).replace('.', ',')} %`
