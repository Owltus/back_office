import { describe, expect, it } from 'vitest'

import { monthPace } from '#/lib/repjour/summaryMetrics.ts'
import type { KPIBlock, MonthBudget } from '#/lib/repjour/types.ts'

/*
 * Ces tests gardent la distinction qui a motivé la refonte de la 4e carte du
 * rapport journalier (2026-09-15) : ce qui est RENTRÉ n'est pas ce qui a été
 * GAGNÉ. Le cumul réalisé (`rentre`) est déjà contenu dans le carnet projeté au
 * 1er — il mesure l'avancement du mois, pas l'effort commercial du mois. Seul
 * `revision` (projeté d'aujourd'hui moins projeté du 1er) dit ce que le mois a
 * ajouté. La carte affiche `revision` ; la barre de progression garde `rentre`.
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

describe('monthPace — ce que le mois a ajouté au carnet du 1er', () => {
  it('compte le gain sur le carnet, pas le cumul réalisé', () => {
    // Le mois s'ouvre avec 100 000 € déjà projetés. À mi-parcours, 60 000 € sont
    // rentrés mais le projeté fin de mois est monté à 115 000 € : le mois a
    // GAGNÉ 15 000 €, pas 60 000 € (ceux-ci étaient déjà au carnet au 1er).
    const { revision, rentre } = monthPace({
      realiseMTD: kpi(60_000),
      projeteMois: kpi(115_000),
      budget: budget(120_000),
      dayOfMonth: 15,
      daysInMonth: 30,
      depart: 100_000,
    })
    expect(revision).toBe(15_000)
    expect(rentre).toBe(60_000)
  })

  it("devient négatif quand les annulations l'emportent", () => {
    const { revision } = monthPace({
      realiseMTD: kpi(60_000),
      projeteMois: kpi(96_500),
      budget: budget(120_000),
      dayOfMonth: 15,
      daysInMonth: 30,
      depart: 100_000,
    })
    expect(revision).toBe(-3_500)
  })

  it('vaut zéro le 1er, où le carnet est encore celui du départ', () => {
    const { revision } = monthPace({
      realiseMTD: kpi(3_000),
      projeteMois: kpi(100_000),
      budget: budget(120_000),
      dayOfMonth: 1,
      daysInMonth: 30,
      depart: 100_000,
    })
    expect(revision).toBe(0)
  })

  it('reste null sans carnet d\'ouverture connu (la carte affiche « — »)', () => {
    const { revision } = monthPace({
      realiseMTD: kpi(60_000),
      projeteMois: kpi(115_000),
      budget: budget(120_000),
      dayOfMonth: 15,
      daysInMonth: 30,
      depart: null,
    })
    expect(revision).toBeNull()
  })

  it('le cumul réalisé continue de piloter rythme, effort et avance', () => {
    // Garde-fou : la carte a changé de valeur, PAS les trois autres. `rentre`
    // reste la seule base des cartes de cadence et de la barre.
    const pace = monthPace({
      realiseMTD: kpi(60_000),
      projeteMois: kpi(115_000),
      budget: budget(120_000),
      dayOfMonth: 15,
      daysInMonth: 30,
      depart: 100_000,
    })
    expect(pace.rythmeTenu).toBe(4_000)
    expect(pace.effortJour).toBe(4_000)
    expect(pace.joursAvance).toBe(0)
    expect(pace.remainingDays).toBe(15)
  })
})
