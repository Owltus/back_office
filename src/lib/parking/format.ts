/*
 * Formateurs de la vue parking (locale FR), partagés par les deux boards
 * analytique (annuel + détail mensuel). Instances Intl créées une fois au niveau
 * module. Aucun montant € : la table parking ne porte pas de tarif.
 */

const int0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

/** Entier nu, sans symbole (ex. « 128 » — réservations, nuits, arrivées). */
export const fmtInt = (n: number) => int0.format(n)

/** Pourcentage, 1 décimale, virgule française (ex. « 72,5 % » — occupation). */
export const fmtPct = (n: number) => `${n.toFixed(1).replace('.', ',')} %`
