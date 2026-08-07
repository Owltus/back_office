import type { KPIBlock, MonthBudget } from './types.ts'

/*
 * Métriques de rythme du mois — SOURCE UNIQUE des cartes de synthèse du rapport
 * journalier. Le composant écran (`SummaryCards`) ET le document PDF (`pdf.ts`)
 * en dérivent leurs 4 cartes, pour que le PDF colle TOUJOURS à l'écran (même
 * intention que le PDF analytique, qui lit le DOM rendu).
 *
 * Aucune de ces valeurs n'est une cellule du tableau : ce sont des vitesses et
 * des positions dans le mois (effort restant, avance sur le rythme, cumul réel).
 */

export interface MonthPaceInput {
  /** Cumul mois à date (réalisé). */
  realiseMTD: KPIBlock
  /** Projeté fin de mois (au jour affiché). */
  projeteMois: KPIBlock
  budget: MonthBudget
  /** Quantième du jour affiché (1..31), 0 si inconnu. */
  dayOfMonth: number
  /** Nombre de jours du mois, 0 si inconnu. */
  daysInMonth: number
  /** Projeté fin de mois tel qu'il était au 1er (carnet d'ouverture), ou `null`. */
  depart: number | null
}

export interface MonthPace {
  /** CA réellement réalisé en cumul depuis le 1er (= total de la barre). */
  rentre: number
  /** Jours restants après le jour affiché. */
  remainingDays: number
  /** Le jour et le mois sont connus (sinon les cartes temporelles s'effacent). */
  hasDay: boolean
  /** CA/jour à réaliser sur les jours restants pour tenir le budget. */
  effortJour: number
  /** CA/jour déjà tenu en moyenne (cumul / jour écoulé). */
  rythmeTenu: number
  /** Le budget du mois est déjà atteint. */
  budgetAtteint: boolean
  /** Avance (+) ou retard (-) en jours sur le rythme linéaire du budget, ou
   * `null` si le jour du mois est inconnu. */
  joursAvance: number | null
  /** Écart du projeté fin de mois vs le projeté du 1er (carnet d'ouverture) :
   * positif = on fait mieux que prévu à l'ouverture, négatif = moins bien. `null`
   * si le carnet d'ouverture est inconnu. */
  revision: number | null
}

export function monthPace({
  realiseMTD,
  projeteMois,
  budget,
  dayOfMonth,
  daysInMonth,
  depart,
}: MonthPaceInput): MonthPace {
  const rentre = realiseMTD.roomRevenue
  const budgetCA = budget.room_revenue
  const remainingDays = Math.max(0, daysInMonth - dayOfMonth)
  const hasDay = dayOfMonth > 0 && daysInMonth > 0

  const resteAFaire = Math.max(0, budgetCA - rentre)
  const effortJour = remainingDays > 0 ? resteAFaire / remainingDays : 0
  const rythmeTenu = dayOfMonth > 0 ? rentre / dayOfMonth : 0
  const budgetAtteint = budgetCA > 0 && rentre >= budgetCA

  const rythmeBudgetJour = daysInMonth > 0 ? budgetCA / daysInMonth : 0
  const joursAvance =
    hasDay && rythmeBudgetJour > 0 ? rentre / rythmeBudgetJour - dayOfMonth : null

  const revision = depart != null ? projeteMois.roomRevenue - depart : null

  return {
    rentre,
    remainingDays,
    hasDay,
    effortJour,
    rythmeTenu,
    budgetAtteint,
    joursAvance,
    revision,
  }
}

/** Signe + jours à 1 décimale (ex. « +2,1 j », « -1,5 j »). */
export function fmtJours(n: number): string {
  const s = n >= 0 ? '+' : '-'
  return `${s}${Math.abs(n).toFixed(1).replace('.', ',')} j`
}
