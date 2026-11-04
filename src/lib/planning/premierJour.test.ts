import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  generer,
  POIDS_FATIGUE,
  POIDS_JOUR_FIXE,
  POIDS_JOUR_ISOLE,
  POIDS_PREMIER_JOUR,
  POIDS_REPOS_SEPARES,
  premierJourSurPlace,
} from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import {
  creneau as creneauModele,
  probleme,
  salarieSolveur,
} from '#/lib/planning/modele.ts'
import type { Creneau, SalarieSolveur } from '#/lib/planning/modele.ts'
import { MINUTES_PAR_JOUR } from '#/lib/planning/temps.ts'

/*
 * Le premier jour du contrat est travaillé (demande d'une responsable du
 * 2026-11-04 : « mes stagiaires commencent leur stage par deux jours de
 * repos »). Oracle : une semaine où cinq jours habituels (mercredi à
 * dimanche) attirent la personne ; sans la règle, ses deux repos tombent
 * lundi et mardi.
 */

const H = 60
let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

const cr = (jour: number, kw: Partial<Creneau> = {}): Creneau =>
  creneauModele({
    id: `j${jour}`,
    poste: 'r',
    debut: jour * MINUTES_PAR_JOUR + 8 * H,
    fin: jour * MINUTES_PAR_JOUR + 15 * H,
    effectif: 1,
    ...kw,
  })

const stagiaire = (kw: Partial<SalarieSolveur> = {}): SalarieSolveur =>
  salarieSolveur({
    id: 's',
    postes: new Set(['r']),
    minutesHebdoContrat: 35 * H,
    minutesHebdoMax: 48 * H,
    minutesJourMax: 10 * H,
    joursTravaillesMaxSemaine: 5,
    joursPreferesSemaine: 5,
    reposQuotidienMin: 11 * H,
    travailFixe: new Set([2, 3, 4, 5, 6]),
    ...kw,
  })

const joursTravailles = (s: SalarieSolveur) => {
  const r = generer(
    probleme({
      salaries: [s],
      creneaux: [0, 1, 2, 3, 4, 5, 6].map((j) => cr(j)),
      graine: 1,
    }),
    highs,
  )
  return r.affectations
    .map((a) => Number(a.creneauId.slice(1)))
    .sort((a, b) => a - b)
}

describe('le premier jour du contrat est travaillé', () => {
  it('le poids : au-dessus des repos accolés, sous la fatigue', () => {
    expect(POIDS_PREMIER_JOUR).toBeGreaterThan(POIDS_REPOS_SEPARES)
    expect(POIDS_PREMIER_JOUR).toBeGreaterThan(
      POIDS_JOUR_ISOLE + POIDS_JOUR_FIXE,
    )
    expect(POIDS_PREMIER_JOUR).toBeLessThan(POIDS_FATIGUE)
  })

  it('accepté : un stage qui commence lundi commence par un jour de travail', () => {
    const jours = joursTravailles(stagiaire({ contratDebut: 0 }))
    expect(jours).toContain(0)
    expect(jours).toHaveLength(5)
  })

  it('refusé : un contrat commencé avant cette semaine garde ses repos lundi et mardi', () => {
    expect(
      joursTravailles(stagiaire({ contratDebut: -7 * MINUTES_PAR_JOUR })),
    ).toEqual([2, 3, 4, 5, 6])
    expect(joursTravailles(stagiaire({ contratDebut: null }))).toEqual([
      2, 3, 4, 5, 6,
    ])
  })

  it('arrivée un mercredi : le mercredi est travaillé', () => {
    const jours = joursTravailles(
      stagiaire({
        contratDebut: 2 * MINUTES_PAR_JOUR,
        horsContrat: new Set([0, 1]),
        travailFixe: new Set([4, 5, 6]),
      }),
    )
    expect(jours[0]).toBe(2)
  })

  it('le premier jour sur place : un jour pris (absence, école, repos fixe) passe au suivant', () => {
    const base = {
      contratDebut: 0,
      indisponibilites: new Set<number>(),
      joursHorsSite: new Set<number>(),
      reposFixes: new Set<number>(),
    }
    expect(premierJourSurPlace(base, 7)).toBe(0)
    expect(
      premierJourSurPlace({ ...base, indisponibilites: new Set([0]) }, 7),
    ).toBe(1)
    expect(
      premierJourSurPlace(
        { ...base, joursHorsSite: new Set([0]), reposFixes: new Set([1]) },
        7,
      ),
    ).toBe(2)
    // Changement d'heure : minuit du jeudi à une heure près.
    expect(
      premierJourSurPlace({ ...base, contratDebut: 3 * 1440 - 60 }, 7),
    ).toBe(3)
    expect(
      premierJourSurPlace({ ...base, contratDebut: 3 * 1440 + 60 }, 7),
    ).toBe(3)
    expect(premierJourSurPlace({ ...base, contratDebut: -1 }, 7)).toBeNull()
    expect(premierJourSurPlace({ ...base, contratDebut: null }, 7)).toBeNull()
    expect(
      premierJourSurPlace(
        { ...base, indisponibilites: new Set([0, 1, 2, 3, 4, 5, 6]) },
        7,
      ),
    ).toBeNull()
  })
})
