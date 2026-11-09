import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import { generer } from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import {
  creneau as creneauModele,
  probleme,
  salarieSolveur,
} from '#/lib/planning/modele.ts'
import type { Creneau, SalarieSolveur } from '#/lib/planning/modele.ts'
import { rythmeHumain } from '#/lib/planning/regles.ts'
import { MINUTES_PAR_JOUR } from '#/lib/planning/temps.ts'
import {
  JOUR_ISOLE_A_EVITER,
  JOUR_ISOLE_INTERDIT,
  moraleQuiBloque,
  raisonsBlocage,
  violations,
} from '#/lib/planning/verificateur.ts'
import { SANS_RYTHME_STRICT } from '#/lib/planning/test/reglesTest.ts'

/*
 * Des semaines humaines (décisions d'une responsable du 2026-11-04 : « tu ne
 * peux pas donner des jours et redonner des jours ensuite » ; « privilégie
 * vraiment les semaines de 5 jours »). Pour un contrat de 35 h et plus
 * (`rythmeHumain`) : jamais un jour de travail seul entre deux repos, jamais
 * plus de 5 jours d'affilée, semaines voisines comprises. Une place reste
 * vide plutôt, et sa raison le dit.
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

const personne = (
  contratH: number,
  kw: Partial<SalarieSolveur> = {},
): SalarieSolveur =>
  salarieSolveur({
    id: 'a',
    postes: new Set(['r']),
    minutesHebdoContrat: contratH * H,
    minutesHebdoMax: 48 * H,
    minutesJourMax: 10 * H,
    joursTravaillesMaxSemaine: 6,
    joursPreferesSemaine: 5,
    reposQuotidienMin: 11 * H,
    ...kw,
  })

const resoudre = (
  s: SalarieSolveur,
  jours: number[],
  imposes: number[] = [],
) => {
  const p = probleme({
    salaries: [s],
    creneaux: jours.map((j) => cr(j)),
    imposees: new Set(imposes.map((j) => `${s.id}|j${j}`)),
    graine: 1,
    // Le jour isolé et les jours d'affilée seuls : le rythme 5 et 2 strict
    // (2026-11-09) a ses essais à part (`rythmeStrict.test.ts`).
    regles: SANS_RYTHME_STRICT,
  })
  return { p, r: generer(p, highs) }
}
const raisons = (x: ReturnType<typeof resoudre>, jour: number): string[] =>
  (raisonsBlocage(x.p, x.r.affectations, `j${jour}`).get('a') ?? []).map(
    (v) => v.regle,
  )
const tenus = (r: ReturnType<typeof generer>) =>
  r.affectations.map((a) => Number(a.creneauId.slice(1))).sort((a, b) => a - b)

// Le dimanche d'avant connu libre : le lundi n'a pas de travail à côté.
const dimancheLibre = { joursSemainePrecedente: 5, serieAvant: 0 }

describe('rythmeHumain : qui est concerné', () => {
  it('35 h et plus, ni forfait ni extra', () => {
    const x = { contratIndicatif: false, placementManuel: false }
    expect(rythmeHumain({ ...x, minutesHebdoContrat: 35 * H })).toBe(true)
    expect(rythmeHumain({ ...x, minutesHebdoContrat: 34 * H })).toBe(false)
    expect(
      rythmeHumain({
        ...x,
        contratIndicatif: true,
        minutesHebdoContrat: 39 * H,
      }),
    ).toBe(false)
    expect(
      rythmeHumain({
        ...x,
        placementManuel: true,
        minutesHebdoContrat: 39 * H,
      }),
    ).toBe(false)
  })
})

describe('jamais un jour de travail seul entre deux repos', () => {
  it('refusé : un 35 h ne vient pas un lundi et un mercredi seuls, et les places le disent', () => {
    const { p, r } = resoudre(personne(35, dimancheLibre), [0, 2])
    expect(tenus(r)).toEqual([])
    for (const vide of ['j0', 'j2']) {
      const liste = raisonsBlocage(p, r.affectations, vide).get('a')!
      expect(liste.map((v) => v.regle)).toEqual(['JOUR-ISOLE'])
      expect(liste.every(moraleQuiBloque)).toBe(true)
    }
  })

  it('accepté : un petit contrat peut, et ce n’est qu’un conseil', () => {
    const { p, r } = resoudre(personne(16, dimancheLibre), [0, 2])
    expect(tenus(r)).toEqual([0, 2])
    // Une semaine de moins de 3 jours : rien n'est dit à l'écran.
    expect(violations(p, r.affectations).map((v) => v.regle)).not.toContain(
      'JOUR-ISOLE',
    )
  })

  it('accepté : deux jours qui se suivent ne sont pas isolés', () => {
    const { r } = resoudre(personne(35, dimancheLibre), [0, 1])
    expect(tenus(r)).toEqual([0, 1])
  })

  it('accepté : semaine d’avant inconnue, le lundi a peut-être du travail à côté', () => {
    const { r } = resoudre(personne(35), [0])
    expect(tenus(r)).toEqual([0])
  })

  it('le message dit si c’est interdit ou à éviter', () => {
    const jours = [0, 2, 3, 4].map((j) => cr(j))
    const aff = jours.map((c) => ({ salarieId: 'a', creneauId: c.id }))
    const message = (h: number) =>
      violations(
        probleme({ salaries: [personne(h, dimancheLibre)], creneaux: jours }),
        aff,
      )
        .filter((v) => v.regle === 'JOUR-ISOLE')
        .map((v) => v.message)
    expect(message(35)).toEqual([JOUR_ISOLE_INTERDIT])
    expect(message(20)).toEqual([JOUR_ISOLE_A_EVITER])
    expect(
      moraleQuiBloque({ regle: 'JOUR-ISOLE', message: JOUR_ISOLE_A_EVITER }),
    ).toBe(false)
  })
})

describe('relecture adverse du 2026-11-04 : cas qui passaient à travers', () => {
  it('un congé ne lève pas la règle : 39 h, congé du lundi au jeudi, le vendredi ne reste pas seul', () => {
    // Les heures DUES de la semaine tombent à 8 h ; le contrat reste 39 h.
    const s = personne(8, {
      minutesContrat: 39 * H,
      indisponibilites: new Set([0, 1, 2, 3, 5, 6]),
      ...dimancheLibre,
    })
    expect(rythmeHumain(s)).toBe(true)
    const x = resoudre(s, [4])
    expect(tenus(x.r)).toEqual([])
    expect(raisons(x, 4)).toEqual(['JOUR-ISOLE'])
  })

  it('un jour isolé déjà posé ne cache pas la raison du suivant', () => {
    const s = personne(35, {
      indisponibilites: new Set([1, 2, 4, 5, 6]),
      ...dimancheLibre,
    })
    const x = resoudre(s, [0, 3], [0])
    expect(tenus(x.r)).toEqual([0])
    expect(raisons(x, 3)).toEqual(['JOUR-ISOLE'])
  })

  it('arrivée le lundi : pas un premier jour seul suivi d’un repos', () => {
    // La veille de l'arrivée compte comme du repos (avant le contrat).
    const s = personne(35, { contratDebut: 0, ...dimancheLibre })
    expect(tenus(resoudre(s, [0]).r)).toEqual([])
    expect(tenus(resoudre(s, [0, 1]).r)).toEqual([0, 1])
    // Arrivée le mercredi : lundi et mardi hors contrat, même lecture.
    const mer = personne(35, {
      contratDebut: 2 * MINUTES_PAR_JOUR,
      horsContrat: new Set([0, 1]),
      ...dimancheLibre,
    })
    expect(tenus(resoudre(mer, [2]).r)).toEqual([])
    expect(tenus(resoudre(mer, [2, 3]).r)).toEqual([2, 3])
  })

  it('départ le dimanche : le lendemain est hors contrat, le dimanche n’est pas seul', () => {
    const s = personne(35, {
      contratFin: 7 * MINUTES_PAR_JOUR,
      indisponibilites: new Set([5]),
      joursSemaineSuivante: 5,
      serieApres: 0,
    })
    expect(tenus(resoudre(s, [6]).r)).toEqual([6])
  })

  it('du lundi au samedi, c’est 6 d’affilée même avec dimanche et lundi suivant libres', () => {
    const s = personne(35, {
      ...dimancheLibre,
      joursSemaineSuivante: 5,
      serieApres: 0,
    })
    const x = resoudre(s, [0, 1, 2, 3, 4, 5])
    expect(tenus(x.r)).toHaveLength(5)
    const vide = [0, 1, 2, 3, 4, 5].find((j) => !tenus(x.r).includes(j))!
    expect(raisons(x, vide)).toContain('JOURS-AFFILES')
  })
})

describe('jamais plus de 5 jours d’affilée, semaines voisines comprises', () => {
  // Trois jours travaillés à la fin de la semaine d'avant.
  const finDeSemaine = { joursSemainePrecedente: 5, serieAvant: 3 }

  it('refusé : un 35 h ne fait pas un 6e jour d’affilée le mercredi', () => {
    const { r } = resoudre(personne(35, finDeSemaine), [0, 1, 2])
    const t = tenus(r)
    // Lundi et mardi au plus (3 + 2 = 5) ; jamais les trois.
    expect(t.length).toBeLessThanOrEqual(2)
    expect(t).not.toContain(2)
  })

  it('accepté : un petit contrat peut aller jusqu’à 6', () => {
    const { r } = resoudre(personne(24, finDeSemaine), [0, 1, 2])
    expect(tenus(r)).toEqual([0, 1, 2])
  })

  it('le vérificateur le dit au 6e jour pour un 35 h, au 7e pour les autres', () => {
    const jours = [0, 1, 2].map((j) => cr(j))
    const aff = jours.map((c) => ({ salarieId: 'a', creneauId: c.id }))
    const affiles = (h: number, serie: number) =>
      violations(
        probleme({
          salaries: [
            personne(h, { joursSemainePrecedente: 5, serieAvant: serie }),
          ],
          creneaux: jours,
          regles: SANS_RYTHME_STRICT,
        }),
        aff,
      ).filter((v) => v.regle === 'JOURS-AFFILES')
    expect(affiles(35, 3)).toHaveLength(1)
    expect(affiles(35, 2)).toEqual([])
    expect(affiles(24, 3)).toEqual([])
    expect(affiles(24, 4)).toHaveLength(1)
  })
})
