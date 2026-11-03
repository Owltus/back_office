import { describe, expect, it } from 'vitest'

import { creneau, salarieSolveur } from '#/lib/planning/modele.ts'
import { reposDeduits } from '#/lib/planning/semaine.ts'
import type { Salarie } from '#/lib/planning/types.ts'

/*
 * Repos déduits et jours passés (décision utilisateur du 2026-11-03,
 * « même règle pour tous »). Oracle écrit à la main : un jour passé vide
 * sort de la semaine, le rythme de 5 jours se tient sur ce qui reste.
 */

const H = 60
const x = {
  id: 1,
  type_contrat: 'cdi',
  heures_hebdo: 35,
  semaine_type: [],
} as unknown as Salarie
const sol = salarieSolveur({
  id: '1',
  postes: new Set(['1']),
  minutesHebdoContrat: 39 * H,
  minutesHebdoMax: 48 * H,
  minutesJourMax: 10 * H,
  joursTravaillesMaxSemaine: 6,
  reposQuotidienMin: 11 * H,
})
const jourDeTravail = (j: number) =>
  creneau({
    id: `c${j}`,
    poste: '1',
    debut: j * 24 * H + 7 * H,
    fin: j * 24 * H + 15 * H,
    jourPlanning: j,
  })
const deduits = (jours: number[], passes: number) =>
  reposDeduits(
    x,
    sol,
    jours.map(jourDeTravail),
    '2026-11-02',
    new Map(),
    true,
    new Set(),
    new Set(),
    passes,
  )

describe('repos déduits sur un jour passé (2026-11-03)', () => {
  it('accepté : lundi passé vide, mardi au samedi travaillés, un repos le dimanche', () => {
    // 6 jours à venir, 5 travaillés : un seul repos, jamais le lundi.
    expect(deduits([1, 2, 3, 4, 5], 1)).toEqual([6])
  })

  it('refusé (témoin) : le même lundi, aujourd’hui, devient un repos', () => {
    expect(deduits([1, 2, 3, 4, 5], 0)).toEqual([0, 6])
  })

  it('les repos se placent sur les jours à venir : deux passés vides, trois libres', () => {
    // Mercredi : lundi et mardi passés vides ; travail mercredi, jeudi,
    // samedi ; libres vendredi et dimanche. 5 jours restent : aucun repos à
    // « devoir », les libres restent libres (heures non faites).
    expect(deduits([2, 3, 5], 2)).toEqual([])
    // Le même jour vu le lundi : deux repos placés, ensemble au plus tard.
    expect(deduits([2, 3, 5], 0)).toHaveLength(2)
  })
})
