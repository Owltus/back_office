import { describe, expect, it } from 'vitest'

import { validateCoherence, validateForecast } from '#/lib/repjour/calc/validate.ts'
import { TOTAL_ROOMS } from '#/lib/repjour/constants.ts'
import type { ForecastRow, KPIBlock } from '#/lib/repjour/types.ts'

// `validateCoherence` ne lit que `nuitees` et `roomRevenue` sur le bloc KPI ; les
// trois autres champs (to/pm/revpar, dérivés) n'entrent dans aucune règle et sont
// donc mis à 0 sans conséquence sur le comportement testé.
function kpi(nuitees: number, roomRevenue: number): KPIBlock {
  return { nuitees, to: 0, pm: 0, revpar: 0, roomRevenue }
}

const hasError = (alerts: { type: string }[]) => alerts.some((a) => a.type === 'error')
const hasWarning = (alerts: { type: string }[]) => alerts.some((a) => a.type === 'warning')

describe('validateCoherence — 11. matrice exhaustive des cas et frontières', () => {
  it('nuitées négatives ⇒ erreur (réalNegatives)', () => {
    const alerts = validateCoherence(kpi(-1, 1000))
    expect(hasError(alerts)).toBe(true)
  })

  it('CA négatif ⇒ erreur (réalNegatives)', () => {
    const alerts = validateCoherence(kpi(10, -1))
    expect(hasError(alerts)).toBe(true)
  })

  it('nuitées ET CA négatifs ⇒ une seule erreur réalNegatives, pas de doublon par champ', () => {
    const alerts = validateCoherence(kpi(-1, -1))
    expect(alerts.filter((a) => a.type === 'error')).toHaveLength(1)
  })

  it(`nuitées = ${TOTAL_ROOMS} (frontière exacte) ⇒ acceptée, aucune erreur`, () => {
    const alerts = validateCoherence(kpi(TOTAL_ROOMS, 8000))
    expect(hasError(alerts)).toBe(false)
  })

  it(`nuitées = ${TOTAL_ROOMS + 1} (juste au-dessus) ⇒ refusée (tooManyRooms)`, () => {
    const alerts = validateCoherence(kpi(TOTAL_ROOMS + 1, 8000))
    expect(hasError(alerts)).toBe(true)
  })

  it('nuitées > 0 avec CA = 0 (frontière exacte) ⇒ avertissement (roomNoRevenue)', () => {
    const alerts = validateCoherence(kpi(10, 0))
    expect(hasWarning(alerts)).toBe(true)
    expect(hasError(alerts)).toBe(false)
  })

  it('nuitées = 0 avec CA > 0 ⇒ avertissement (revenueNoRoom)', () => {
    const alerts = validateCoherence(kpi(0, 100))
    expect(hasWarning(alerts)).toBe(true)
    expect(hasError(alerts)).toBe(false)
  })

  it('nuitées = 0 et CA = 0 (cas nul) ⇒ aucune alerte', () => {
    expect(validateCoherence(kpi(0, 0))).toEqual([])
  })

  it('nuitées > 0 et CA > 0 (cas nominal) ⇒ aucune alerte', () => {
    expect(validateCoherence(kpi(40, 4000))).toEqual([])
  })
})

describe('validateCoherence vs validateForecast — 12. asymétrie assumée sur le surbooking', () => {
  /*
   * Différence VOLONTAIRE, à ne pas effacer par un futur « nettoyage » qui
   * unifierait les deux fonctions : le réalisé (`validateCoherence`) ne peut
   * physiquement pas dépasser l'inventaire (snapshot de nuit certain), donc
   * nuitées > 80 y est une erreur bloquante. Le forecast (`validateForecast`)
   * porte une PRÉVISION, où le surbooking commercial (relance après annulation
   * attendue) est légitime : `occ > TOTAL_ROOMS` n'y déclenche AUCUNE alerte.
   */
  it('réalisé : nuitées > 80 ⇒ erreur bloquante', () => {
    const alerts = validateCoherence(kpi(TOTAL_ROOMS + 5, 10000))
    expect(hasError(alerts)).toBe(true)
  })

  it('forecast : occ > 80 (surbooking) sur toutes les lignes ⇒ aucune erreur ni avertissement liés au dépassement', () => {
    const rows: ForecastRow[] = Array.from({ length: 31 }, (_, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, '0')}`,
      month: 9,
      year: 2026,
      occ: TOTAL_ROOMS + 5, // surbooking sur l'ensemble du mois
      revHT: (TOTAL_ROOMS + 5) * 90,
      revTTC: (TOTAL_ROOMS + 5) * 99,
    }))
    const alerts = validateForecast(rows, 31, null)
    expect(alerts).toEqual([])
  })
})
