import { describe, expect, it } from 'vitest'

import { fmtJours, monthPace } from '#/lib/repjour/summaryMetrics.ts'
import type { KPIBlock, MonthBudget } from '#/lib/repjour/types.ts'

/*
 * Martin, 2026-09-15 — les cas limites que la première salve de tests laissait
 * passer. Mesuré par test de mutation : `summaryMetrics.ts` ne tuait que 42 %
 * des sabotages, le plus mauvais score du noyau de calcul. Tous les tests
 * portaient sur des mois « normaux » ; aucun ne descendait aux bornes, là où
 * les divisions deviennent dangereuses.
 *
 * Les quatre cartes du rapport journalier reposent sur trois divisions : par le
 * nombre de jours du mois, par le quantième du jour, et par les jours restants.
 * Chacune vaut zéro dans une situation réelle — un budget non saisi, le dernier
 * jour du mois, un mois dont on ignore encore le quantième. Une division par
 * zéro produirait un « Infinity € » à l'écran et dans l'e-mail du matin.
 */

const kpi = (roomRevenue: number): KPIBlock => ({
  nuitees: 0,
  to: 0,
  pm: 0,
  revpar: 0,
  roomRevenue,
})

const budget = (room_revenue: number): MonthBudget => ({
  id: 1,
  year: 2026,
  month: 9,
  nuitees: 0,
  taux_occupation: 0,
  prix_moyen: 0,
  revpar: 0,
  room_revenue,
})

/** Toutes les grandeurs rendues doivent rester des nombres présentables. */
function estPresentable(n: number | null): boolean {
  return n === null || (Number.isFinite(n) && !Number.isNaN(n))
}

describe('monthPace — budget non saisi (division par zéro)', () => {
  it("n'annonce aucune avance quand le budget du mois vaut zéro", () => {
    // Sans budget, la notion d'avance sur le rythme n'a pas de sens : la carte
    // doit s'effacer, surtout pas afficher une division par zéro.
    const p = monthPace({
      realiseMTD: kpi(40_000),
      projeteMois: kpi(90_000),
      budget: budget(0),
      dayOfMonth: 10,
      daysInMonth: 30,
      depart: 80_000,
    })
    expect(p.joursAvance).toBeNull()
    expect(p.budgetAtteint).toBe(false)
    expect(p.effortJour).toBe(0)
  })

  it("ne déclare jamais le budget atteint quand il n'y a pas de budget", () => {
    // Frontière stricte : `budgetCA > 0`. Sans elle, un budget à zéro serait
    // « atteint » dès le premier euro, et la carte annoncerait une victoire.
    const p = monthPace({
      realiseMTD: kpi(0),
      projeteMois: kpi(0),
      budget: budget(0),
      dayOfMonth: 1,
      daysInMonth: 30,
      depart: null,
    })
    expect(p.budgetAtteint).toBe(false)
  })
})

describe('monthPace — bornes du mois', () => {
  it('le dernier jour du mois : plus aucun jour restant, aucun effort par jour', () => {
    const p = monthPace({
      realiseMTD: kpi(90_000),
      projeteMois: kpi(95_000),
      budget: budget(120_000),
      dayOfMonth: 30,
      daysInMonth: 30,
      depart: 100_000,
    })
    expect(p.remainingDays).toBe(0)
    // Division par zéro évitée : sans jour restant, l'effort ne se répartit pas.
    expect(p.effortJour).toBe(0)
    expect(estPresentable(p.effortJour)).toBe(true)
  })

  it('quantième inconnu : les cartes de cadence s effacent au lieu de mentir', () => {
    const p = monthPace({
      realiseMTD: kpi(40_000),
      projeteMois: kpi(90_000),
      budget: budget(120_000),
      dayOfMonth: 0,
      daysInMonth: 0,
      depart: 80_000,
    })
    expect(p.hasDay).toBe(false)
    expect(p.joursAvance).toBeNull()
    expect(p.rythmeTenu).toBe(0)
    expect(p.effortJour).toBe(0)
  })

  it('le budget atteint À L EGALITE compte comme atteint', () => {
    // Frontière `>=` et non `>` : tenir exactement son budget, c'est le tenir.
    const p = monthPace({
      realiseMTD: kpi(120_000),
      projeteMois: kpi(120_000),
      budget: budget(120_000),
      dayOfMonth: 20,
      daysInMonth: 30,
      depart: 120_000,
    })
    expect(p.budgetAtteint).toBe(true)
    // Budget atteint : il ne reste rien à faire, jamais un montant négatif.
    expect(p.effortJour).toBe(0)
  })

  it("un euro sous le budget n'est pas le budget atteint", () => {
    const p = monthPace({
      realiseMTD: kpi(119_999),
      projeteMois: kpi(120_000),
      budget: budget(120_000),
      dayOfMonth: 20,
      daysInMonth: 30,
      depart: 120_000,
    })
    expect(p.budgetAtteint).toBe(false)
    expect(p.effortJour).toBeGreaterThan(0)
  })

  it("l'effort restant ne devient jamais négatif quand le budget est dépassé", () => {
    const p = monthPace({
      realiseMTD: kpi(200_000),
      projeteMois: kpi(210_000),
      budget: budget(120_000),
      dayOfMonth: 20,
      daysInMonth: 30,
      depart: 150_000,
    })
    expect(p.effortJour).toBe(0)
    expect(p.budgetAtteint).toBe(true)
  })

  it('aucune grandeur rendue ne peut valoir Infinity ni NaN, sur toutes les bornes', () => {
    // Balayage systématique des combinaisons dangereuses : quantième et nombre
    // de jours à zéro ou égaux, budget nul, cumul nul.
    for (const dayOfMonth of [0, 1, 15, 30, 31]) {
      for (const daysInMonth of [0, 28, 30, 31]) {
        for (const budgetCA of [0, 1, 120_000]) {
          for (const rentre of [0, 60_000, 500_000]) {
            const p = monthPace({
              realiseMTD: kpi(rentre),
              projeteMois: kpi(rentre),
              budget: budget(budgetCA),
              dayOfMonth,
              daysInMonth,
              depart: null,
            })
            const contexte = `jour ${dayOfMonth}/${daysInMonth}, budget ${budgetCA}, rentré ${rentre}`
            expect(estPresentable(p.effortJour), contexte).toBe(true)
            expect(estPresentable(p.rythmeTenu), contexte).toBe(true)
            expect(estPresentable(p.joursAvance), contexte).toBe(true)
            expect(p.remainingDays, contexte).toBeGreaterThanOrEqual(0)
            expect(p.effortJour, contexte).toBeGreaterThanOrEqual(0)
          }
        }
      }
    }
  })
})

describe('fmtJours — mise en forme de l avance', () => {
  it('porte toujours un signe explicite, et la virgule française', () => {
    expect(fmtJours(2.14)).toBe('+2,1 j')
    expect(fmtJours(-1.46)).toBe('-1,5 j')
  })

  it('affiche zéro comme une avance nulle, jamais comme un retard', () => {
    // Le signe de zéro est un piège classique : « -0,0 j » se lirait comme un
    // retard alors que le rythme est exactement tenu.
    expect(fmtJours(0)).toBe('+0,0 j')
  })

  it('arrondit au dixième de jour', () => {
    expect(fmtJours(1.04)).toBe('+1,0 j')
    expect(fmtJours(1.05)).toBe('+1,1 j')
  })
})
