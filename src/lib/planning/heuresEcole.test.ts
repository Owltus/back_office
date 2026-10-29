import fc from 'fast-check'
import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import { generer } from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import { creneau, jourDe, probleme, travail } from '#/lib/planning/modele.ts'
import type { Creneau } from '#/lib/planning/modele.ts'
import {
  MINEUR_SEMAINE_MAX,
  MINUTES_ECOLE_JOUR,
  SEMAINE_MAX,
  versSolveur,
} from '#/lib/planning/regles.ts'
import type { Fiche } from '#/lib/planning/regles.ts'
import { fiche as ficheSemaine } from '#/lib/planning/semaine.ts'
import type { Salarie } from '#/lib/planning/types.ts'
import { MINUTES_PAR_JOUR } from '#/lib/planning/temps.ts'
import { violations, violationsSalarie } from '#/lib/planning/verificateur.ts'

/*
 * R-ECOLE-HEURES (étape 9 du plan planning-coherence-2026-10-28).
 *
 * ÉCART VOULU AVEC LE PROTOTYPE : le prototype comptait le JOUR d'école comme
 * travaillé (R-ECOLE-JOURS) mais pas ses HEURES. Le Code du travail
 * (L6222-24) dit que le temps passé au CFA est compris dans l'horaire de
 * travail : il entre donc dans les plafonds de la semaine (48 h, et 35 h pour
 * un mineur, L3162-1). L'oracle différentiel contre le prototype ne tient
 * plus sur ce point.
 */

const H = 60

let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

const ECOLE = new Set([0, 1]) // lundi et mardi au CFA

function fiche(kw: Partial<Fiche> = {}): Fiche {
  return {
    id: 'a',
    postes: new Set(['rec']),
    typeContrat: 'apprenti',
    minutesHebdo: 35 * H,
    joursEcole: ECOLE,
    ...kw,
  }
}

/** Service du jour `jour`, de `debutH` à `finH` heures. */
function cr(id: string, jour: number, debutH: number, finH: number): Creneau {
  return creneau({
    id,
    poste: 'rec',
    debut: jour * MINUTES_PAR_JOUR + debutH * H,
    fin: jour * MINUTES_PAR_JOUR + finH * H,
  })
}

const reglesDe = (f: Fiche, creneaux: Creneau[]) =>
  violationsSalarie(versSolveur(f), creneaux, 7).map((v) => v.regle)

describe('R-ECOLE-HEURES : la journée d’école compte dans la semaine', () => {
  it('7 h par défaut', () => {
    expect(MINUTES_ECOLE_JOUR).toBe(7 * H)
    expect(versSolveur(fiche()).minutesEcoleJour).toBe(7 * H)
    expect(
      versSolveur(fiche({ minutesEcoleJour: 6 * H })).minutesEcoleJour,
    ).toBe(6 * H)
  })

  it('mineur : 2 jours d’école de 7 h + 3 jours de 7 h = 35 h, accepté', () => {
    const f = fiche({ mineur: true })
    expect(versSolveur(f).minutesHebdoMax).toBe(MINEUR_SEMAINE_MAX)
    const semaine = [cr('m', 2, 8, 15), cr('j', 3, 8, 15), cr('v', 4, 8, 15)]
    expect(reglesDe(f, semaine)).toEqual([])
  })

  it('mineur : une heure de plus est refusée, école comprise', () => {
    const f = fiche({ mineur: true })
    const semaine = [cr('m', 2, 8, 15), cr('j', 3, 8, 15), cr('v', 4, 8, 16)]
    const v = violationsSalarie(versSolveur(f), semaine, 7)
    expect(v.map((x) => x.regle)).toEqual(['R-SEMAINE-MAX'])
    expect(v[0].message).toBe(
      '36 h dans la semaine, école comprise (14 h), maximum 35 h',
    )
    // Avant cette règle (comme le prototype), la même semaine passait.
    expect(reglesDe({ ...f, minutesEcoleJour: 0 }, semaine)).toEqual([])
  })

  it('majeur : 14 h d’école + 34 h = 48 h accepté, 49 h refusé', () => {
    const f = fiche()
    expect(versSolveur(f).minutesHebdoMax).toBe(SEMAINE_MAX)
    const pile = [cr('m', 2, 7, 19), cr('j', 3, 7, 19), cr('v', 4, 8, 18)]
    expect(reglesDe(f, pile)).toEqual([])
    const plus = [cr('m', 2, 7, 19), cr('j', 3, 7, 19), cr('v', 4, 7, 18)]
    expect(reglesDe(f, plus)).toEqual(['R-SEMAINE-MAX'])
  })

  it('la durée vient de la fiche : 5 h d’école laissent passer 36 h', () => {
    const f = fiche({ mineur: true, minutesEcoleJour: 5 * H })
    const semaine = [cr('m', 2, 8, 16), cr('j', 3, 8, 16), cr('v', 4, 8, 16)]
    expect(reglesDe(f, semaine)).toEqual([]) // 10 h + 24 h = 34 h
    expect(
      reglesDe({ ...f, minutesEcoleJour: 6 * H }, semaine), // 12 + 24 = 36
    ).toEqual(['R-SEMAINE-MAX'])
  })

  it('la durée de la fiche en base arrive au moteur', () => {
    const lundi = '2026-11-02'
    const x: Salarie = {
      id: 1,
      prenom: 'Apprenti',
      nom: 'Un',
      groupe_id: null,
      type_contrat: 'apprenti',
      heures_hebdo: 35,
      forfait_jours: false,
      mineur: true,
      competences: [],
      semaine_type: [],
      shifts_autorises: [],
      heures_ecole_jour: 6 * H,
      date_entree: null,
      date_sortie: null,
      actif: true,
      suite_de: null,
    }
    const ctx = {
      sansDecompte: new Set<number>(),
      ecole: new Set([9]),
      absences: new Map([[1, new Map([['2026-11-02', 9]])]]),
    }
    const f = ficheSemaine(x, lundi, ctx)
    expect([...(f.joursEcole ?? [])]).toEqual([0])
    expect(versSolveur(f).minutesEcoleJour).toBe(6 * H)
    // Colonne absente (ancienne lecture) : le défaut de la colonne, 7 h.
    const { heures_ecole_jour: _, ...sans } = x
    expect(versSolveur(ficheSemaine(sans, lundi, ctx)).minutesEcoleJour).toBe(
      7 * H,
    )
  })

  it('le décompte des jours ne change pas : l’école reste un jour travaillé', () => {
    const f = fiche({ mineur: true, minutesEcoleJour: 0 })
    // 2 jours d'école + 4 jours à l'hôtel = 6 jours, maximum 5 pour un mineur.
    const semaine = [2, 3, 4, 5].map((j) => cr(`d${j}`, j, 8, 12))
    expect(reglesDe(f, semaine)).toContain('R-REPOS-HEBDO-HCR')
  })
})

describe('R-ECOLE-HEURES dans les heures dues', () => {
  const dues = (kw: Partial<Fiche>) =>
    versSolveur(fiche(kw)).minutesHebdoContrat

  it('un jour d’école retire sa durée d’école des heures dues', () => {
    expect(dues({})).toBe(21 * H) // 35 h - 2 × 7 h
    expect(dues({ minutesEcoleJour: 8 * H })).toBe(19 * H)
    expect(dues({ minutesEcoleJour: 6 * H })).toBe(23 * H)
    expect(dues({ minutesHebdo: 39 * H })).toBe(25 * H)
    // Un congé en plus : sa journée de contrat, comme sans école.
    expect(dues({ joursAbsenceDecomptes: 1 })).toBe(14 * H)
  })

  it('dues et plafond d’accord : la semaine pleine est acceptée sans manque', () => {
    // Mineur, 8 h d'école par jour : 35 h - 16 h = 19 h à l'hôtel.
    const f = fiche({ mineur: true, minutesEcoleJour: 8 * H })
    const s = versSolveur(f)
    expect(s.minutesHebdoContrat).toBe(19 * H)
    expect(s.minutesHebdoContrat + 16 * H).toBe(s.minutesHebdoMax)
    const semaine = [cr('m', 2, 8, 15), cr('j', 3, 8, 14), cr('v', 4, 8, 14)]
    expect(reglesDe(f, semaine)).toEqual([])
  })

  it('les heures dues d’avant (21 h) ne tiennent plus : refusées', () => {
    // Placer les 21 h que l'on devait avant dépasse le plafond école comprise.
    const f = fiche({ mineur: true, minutesEcoleJour: 8 * H })
    const semaine = [cr('m', 2, 8, 15), cr('j', 3, 8, 15), cr('v', 4, 8, 15)]
    expect(reglesDe(f, semaine)).toEqual(['R-SEMAINE-MAX'])
  })

  it('cinq jours d’école ou d’absence : rien de dû, le week-end reste libre', () => {
    expect(dues({ joursEcole: new Set([0, 1, 2, 3, 4]) })).toBe(0)
    expect(
      dues({ minutesHebdo: 39 * H, joursEcole: new Set([0, 1, 2, 3, 4]) }),
    ).toBe(0)
    expect(dues({ joursAbsenceDecomptes: 3 })).toBe(0)
  })

  it('depuis la base : le jour d’école n’est pas compté en plus comme absence', () => {
    const x: Salarie = {
      id: 1,
      prenom: 'Apprenti',
      nom: 'Deux',
      groupe_id: null,
      type_contrat: 'apprenti',
      heures_hebdo: 35,
      forfait_jours: false,
      mineur: false,
      competences: [],
      semaine_type: [],
      shifts_autorises: [],
      heures_ecole_jour: 8 * H,
      date_entree: null,
      date_sortie: null,
      actif: true,
      suite_de: null,
    }
    const absences = new Map([
      [
        1,
        new Map([
          ['2026-11-02', 9],
          ['2026-11-03', 9],
        ]),
      ],
    ])
    // Motif d'école compté ou non dans les heures : même résultat.
    for (const sansDecompte of [new Set<number>(), new Set([9])]) {
      const f = ficheSemaine(x, '2026-11-02', {
        sansDecompte,
        ecole: new Set([9]),
        absences,
      })
      expect(f.joursAbsenceDecomptes).toBe(0)
      expect(versSolveur(f).minutesHebdoContrat).toBe(19 * H)
    }
  })
})

describe('R-ECOLE-HEURES dans le générateur', () => {
  const minutesDe = (p: ReturnType<typeof probleme>, ids: string[]) =>
    ids.reduce(
      (t, id) => t + travail(p.creneaux.find((c) => c.id === id) as Creneau),
      0,
    )

  it('mineur : jamais plus de 35 h école comprise', () => {
    // Trois services de 8 h : 24 h + 14 h d'école = 38 h, donc deux au plus.
    const creneaux = [2, 3, 4].map((j) => cr(`h${j}`, j, 8, 16))
    const avec = probleme({
      salaries: [versSolveur(fiche({ mineur: true }))],
      creneaux,
    })
    const r = generer(avec, highs)
    expect(r.affectations).toHaveLength(2)
    expect(violations(avec, r.affectations)).toEqual([])
    // Sans les heures d'école (prototype), il les prenait toutes les trois.
    const sans = probleme({
      salaries: [versSolveur(fiche({ mineur: true, minutesEcoleJour: 0 }))],
      creneaux,
    })
    expect(generer(sans, highs).affectations).toHaveLength(3)
  })

  it('majeur : jamais plus de 48 h école comprise', () => {
    // Trois services de 12 h : 36 h + 14 h d'école = 50 h, donc deux au plus.
    const creneaux = [2, 3, 4].map((j) => cr(`h${j}`, j, 7, 19))
    const p = probleme({ salaries: [versSolveur(fiche())], creneaux })
    const r = generer(p, highs)
    expect(r.affectations).toHaveLength(2)
    expect(violations(p, r.affectations)).toEqual([])
    const sans = probleme({
      salaries: [versSolveur(fiche({ minutesEcoleJour: 0 }))],
      creneaux,
    })
    expect(generer(sans, highs).affectations).toHaveLength(3)
    expect(
      minutesDe(
        p,
        r.affectations.map((a) => a.creneauId),
      ),
    ).toBe(24 * H)
  })

  it('propriété : minutes de l’hôtel + école ≤ plafond de la personne', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.subarray([0, 1, 2, 3, 4, 5]),
        fc.integer({ min: 0, max: 20 }),
        fc.array(
          fc.record({
            jour: fc.integer({ min: 0, max: 6 }),
            debut: fc.integer({ min: 7, max: 12 }),
            duree: fc.integer({ min: 3, max: 8 }),
          }),
          { minLength: 1, maxLength: 9 },
        ),
        (mineur, jours, demiHeures, services) => {
          const ecole = new Set(jours)
          const f = fiche({
            mineur,
            joursEcole: ecole,
            minutesEcoleJour: demiHeures * 30,
          })
          const s = versSolveur(f)
          const creneaux = services.map((x, i) =>
            cr(`c${i}`, x.jour, x.debut, x.debut + x.duree),
          )
          const p = probleme({ salaries: [s], creneaux })
          const r = generer(p, highs)
          const pris = r.affectations.map((a) => a.creneauId)
          const hotel = minutesDe(p, pris)
          const total = hotel + ecole.size * s.minutesEcoleJour
          if (pris.length) expect(total).toBeLessThanOrEqual(s.minutesHebdoMax)
          expect(
            pris.every((id) => {
              const c = creneaux.find((x) => x.id === id) as Creneau
              return !ecole.has(jourDe(c))
            }),
          ).toBe(true)
          expect(
            violations(p, r.affectations).filter(
              (v) => v.regle === 'R-SEMAINE-MAX',
            ),
          ).toEqual([])
        },
      ),
      { numRuns: 60, seed: 20261029 },
    )
  }, 60_000)
})
