import fc from 'fast-check'
import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import { generer } from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import { creneau, jourDe, probleme, travail } from '#/lib/planning/modele.ts'
import type { Creneau, SalarieSolveur } from '#/lib/planning/modele.ts'
import {
  JOURNEE_PLEINE,
  MINEUR_SEMAINE_MAX,
  SEMAINE_MAX,
  heuresDues,
  journeeContrat,
  versSolveur,
} from '#/lib/planning/regles.ts'
import type { Fiche } from '#/lib/planning/regles.ts'
import { fiche as ficheSemaine } from '#/lib/planning/semaine.ts'
import type { Salarie } from '#/lib/planning/types.ts'
import { MINUTES_PAR_JOUR } from '#/lib/planning/temps.ts'
import { violations, violationsSalarie } from '#/lib/planning/verificateur.ts'

/*
 * R-ECOLE-HEURES (étape 9 du plan planning-coherence-2026-10-28, révisée le
 * 2026-10-29 par décision utilisateur : « les heures d'école sont
 * considérées comme des journées de travail complètes »).
 *
 * Un jour d'école vaut une journée de contrat (`journeeContrat`) :
 * - dans les heures dues, il est décompté comme un jour d'absence (même
 *   calcul que le prototype, journée étoile comprise) ;
 * - dans le plafond de la semaine (R-SEMAINE-MAX), il compte cette même
 *   journée, ce que le prototype ne faisait pas (L6222-24 : le temps de CFA
 *   est du temps de travail). Écart voulu : l'oracle différentiel ne tient
 *   plus sur le plafond d'une semaine avec école.
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

const reglesDe = (s: SalarieSolveur, creneaux: Creneau[]) =>
  violationsSalarie(s, creneaux, 7).map((v) => v.regle)

const dues = (kw: Partial<Fiche>) => heuresDues(fiche(kw))

describe('journeeContrat : ce que vaut un jour d’école', () => {
  it('contrat / 5 jusqu’à 35 h, journée pleine de 8 h au-delà', () => {
    expect(journeeContrat(fiche())).toBe(7 * H)
    expect(journeeContrat(fiche({ minutesHebdo: 20 * H }))).toBe(4 * H)
    expect(journeeContrat(fiche({ minutesHebdo: 39 * H }))).toBe(8 * H)
    expect(journeeContrat(fiche({ minutesHebdo: 42 * H }))).toBe(8 * H)
  })

  it('contrat sans durée horaire : au moins 8 h, la valeur prudente', () => {
    const extra = { typeContrat: 'extra' as const }
    expect(journeeContrat(fiche({ ...extra, minutesHebdo: 0 }))).toBe(
      JOURNEE_PLEINE,
    )
    expect(journeeContrat(fiche({ ...extra, minutesHebdo: 45 * H }))).toBe(
      9 * H,
    )
    expect(
      journeeContrat(fiche({ forfaitJours: true, minutesHebdo: 35 * H })),
    ).toBe(JOURNEE_PLEINE)
  })

  it('le plafond de la semaine compte la même journée', () => {
    for (const minutesHebdo of [20 * H, 35 * H, 39 * H]) {
      const f = fiche({ minutesHebdo })
      expect(versSolveur(f).minutesEcoleJour).toBe(journeeContrat(f))
    }
  })
})

describe('R-ECOLE-HEURES dans les heures dues', () => {
  it('39 h et deux jours d’école : 3 × 8 h, moins 1 h pour la journée étoile', () => {
    expect(dues({ minutesHebdo: 39 * H, etoileFixe: new Set([4]) })).toBe(
      23 * H,
    )
    // Sans journée étoile fixée (comme le prototype) : 3 journées pleines.
    expect(dues({ minutesHebdo: 39 * H })).toBe(24 * H)
    // Étoile fixée sur un jour d'école : elle ne tombe pas sur un jour qui
    // reste, les trois jours sont pleins.
    expect(dues({ minutesHebdo: 39 * H, etoileFixe: new Set([0]) })).toBe(
      24 * H,
    )
  })

  it('35 h et deux jours d’école : 3 × 7 h', () => {
    expect(dues({})).toBe(21 * H)
  })

  it('39 h et un jour d’école : 4 jours restants, dont la journée courte', () => {
    const f = { minutesHebdo: 39 * H, joursEcole: new Set([0]) }
    expect(dues({ ...f, etoileFixe: new Set([4]) })).toBe(31 * H)
    expect(dues(f)).toBe(32 * H)
  })

  it('un jour d’école pèse exactement comme un jour d’absence décompté', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(0, 10 * H, 20 * H, 35 * H, 39 * H, 42 * H),
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 5 }),
        fc.boolean(),
        fc.constantFrom('apprenti', 'cdi', 'extra') as fc.Arbitrary<
          Fiche['typeContrat']
        >,
        (minutesHebdo, nEcole, nAbsences, etoile, typeContrat) => {
          const jours = new Set([0, 1, 2, 3, 4].slice(0, nEcole))
          const base = {
            minutesHebdo,
            typeContrat,
            etoileFixe: etoile ? new Set([4]) : undefined,
          }
          const avecEcole = dues({
            ...base,
            joursEcole: jours,
            joursAbsenceDecomptes: nAbsences,
          })
          const toutAbsence = dues({
            ...base,
            joursEcole: new Set(),
            indisponibilites: jours,
            joursAbsenceDecomptes: nAbsences + nEcole,
          })
          expect(avecEcole).toBe(toutAbsence)
        },
      ),
      { numRuns: 300, seed: 20261029 },
    )
  })

  it('école et absences qui couvrent les cinq jours : rien de dû', () => {
    expect(dues({ joursAbsenceDecomptes: 3 })).toBe(0)
    expect(dues({ minutesHebdo: 39 * H, joursAbsenceDecomptes: 3 })).toBe(0)
    expect(dues({ joursEcole: new Set([0, 1, 2, 3, 4]) })).toBe(0)
    // Quatre jours pris : une journée reste.
    expect(dues({ joursAbsenceDecomptes: 2 })).toBe(7 * H)
  })

  it('depuis la base : le jour d’école est décompté une seule fois', () => {
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
      for (const [heures, attendu] of [
        [35, 21 * H],
        [39, 24 * H],
      ] as const) {
        const f = ficheSemaine({ ...x, heures_hebdo: heures }, '2026-11-02', {
          sansDecompte,
          ecole: new Set([9]),
          absences,
        })
        expect([...(f.joursEcole ?? [])]).toEqual([0, 1])
        expect(f.joursAbsenceDecomptes).toBe(0)
        expect(versSolveur(f).minutesHebdoContrat).toBe(attendu)
      }
    }
  })
})

describe('R-ECOLE-HEURES dans le plafond de la semaine (vérificateur)', () => {
  it('mineur 35 h : 2 jours d’école (14 h) + 21 h = 35 h, accepté', () => {
    const s = versSolveur(fiche({ mineur: true }))
    expect(s.minutesHebdoMax).toBe(MINEUR_SEMAINE_MAX)
    const semaine = [cr('m', 2, 8, 15), cr('j', 3, 8, 15), cr('v', 4, 8, 15)]
    expect(reglesDe(s, semaine)).toEqual([])
  })

  it('mineur 35 h : une heure de plus est refusée, école comprise', () => {
    const s = versSolveur(fiche({ mineur: true }))
    const semaine = [cr('m', 2, 8, 15), cr('j', 3, 8, 15), cr('v', 4, 8, 16)]
    const v = violationsSalarie(s, semaine, 7)
    expect(v.map((x) => x.regle)).toEqual(['R-SEMAINE-MAX'])
    expect(v[0].message).toBe(
      '36 h dans la semaine, école comprise (14 h), maximum 35 h',
    )
    // Sans compter l'école (prototype), la même semaine passait.
    expect(reglesDe({ ...s, minutesEcoleJour: 0 }, semaine)).toEqual([])
  })

  it('majeur 39 h : 2 jours d’école de 8 h + 32 h = 48 h accepté, 49 h refusé', () => {
    const s = versSolveur(fiche({ minutesHebdo: 39 * H }))
    expect(s.minutesHebdoMax).toBe(SEMAINE_MAX)
    expect(s.minutesEcoleJour).toBe(8 * H)
    const pile = [cr('m', 2, 7, 18), cr('j', 3, 7, 18), cr('v', 4, 8, 18)]
    expect(reglesDe(s, pile)).toEqual([])
    const plus = [cr('m', 2, 7, 18), cr('j', 3, 7, 18), cr('v', 4, 7, 18)]
    const v = violationsSalarie(s, plus, 7)
    expect(v.map((x) => x.regle)).toEqual(['R-SEMAINE-MAX'])
    expect(v[0].message).toBe(
      '49 h dans la semaine, école comprise (16 h), maximum 48 h',
    )
  })

  it('temps partiel 20 h : 2 jours d’école de 4 h + 18 h accepté, 19 h refusé (plafond 26 h 40)', () => {
    const s = versSolveur(fiche({ minutesHebdo: 20 * H }))
    expect(s.minutesHebdoMax).toBe(26 * H + 40) // 20 h + 1/3
    expect(s.minutesEcoleJour).toBe(4 * H)
    const pile = [cr('m', 2, 8, 14), cr('j', 3, 8, 14), cr('v', 4, 8, 14)]
    expect(reglesDe(s, pile)).toEqual([])
    const plus = [cr('m', 2, 8, 14), cr('j', 3, 8, 14), cr('v', 4, 8, 15)]
    expect(reglesDe(s, plus)).toEqual(['R-SEMAINE-MAX'])
  })

  it('dues et plafond d’accord : la semaine due tient toujours dans le plafond', () => {
    for (const kw of [
      { mineur: true },
      { minutesHebdo: 20 * H },
      { minutesHebdo: 39 * H },
      { minutesHebdo: 39 * H, etoileFixe: new Set([4]) },
      { mineur: true, joursEcole: new Set([0, 1, 2]) },
    ] satisfies Array<Partial<Fiche>>) {
      const f = fiche(kw)
      const s = versSolveur(f)
      const ecole = (f.joursEcole?.size ?? 0) * s.minutesEcoleJour
      expect(s.minutesHebdoContrat + ecole).toBeLessThanOrEqual(
        s.minutesHebdoMax,
      )
    }
    // Mineur 35 h : exactement le plafond, sans heure en trop ni manque.
    const s = versSolveur(fiche({ mineur: true }))
    expect(s.minutesHebdoContrat + 2 * s.minutesEcoleJour).toBe(
      s.minutesHebdoMax,
    )
  })

  it('le décompte des jours ne change pas : l’école reste un jour travaillé', () => {
    const s = versSolveur(fiche({ mineur: true }))
    // 2 jours d'école + 4 jours à l'hôtel = 6 jours, maximum 5 pour un mineur.
    const semaine = [2, 3, 4, 5].map((j) => cr(`d${j}`, j, 8, 12))
    expect(reglesDe(s, semaine)).toContain('R-REPOS-HEBDO-HCR')
  })

  it('l’école seule ne fait jamais une infraction', () => {
    const s = versSolveur(
      fiche({
        mineur: true,
        minutesHebdo: 39 * H,
        joursEcole: new Set([0, 1, 2, 3, 4]),
      }),
    )
    expect(reglesDe(s, [])).toEqual([])
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
    const s = versSolveur(fiche({ mineur: true }))
    const avec = probleme({ salaries: [s], creneaux })
    const r = generer(avec, highs)
    expect(r.affectations).toHaveLength(2)
    expect(violations(avec, r.affectations)).toEqual([])
    // Sans les heures d'école (prototype), il les prenait toutes les trois.
    const sans = probleme({
      salaries: [{ ...s, minutesEcoleJour: 0 }],
      creneaux,
    })
    expect(generer(sans, highs).affectations).toHaveLength(3)
  })

  it('majeur 39 h : jamais plus de 48 h, deux jours d’école de 8 h compris', () => {
    // Trois services de 11 h : 33 h + 16 h d'école = 49 h, donc deux au plus.
    const creneaux = [2, 3, 4].map((j) => cr(`h${j}`, j, 7, 18))
    const s = versSolveur(fiche({ minutesHebdo: 39 * H }))
    const p = probleme({ salaries: [s], creneaux })
    const r = generer(p, highs)
    expect(r.affectations).toHaveLength(2)
    expect(violations(p, r.affectations)).toEqual([])
    expect(
      minutesDe(
        p,
        r.affectations.map((a) => a.creneauId),
      ),
    ).toBe(22 * H)
    const sans = probleme({
      salaries: [{ ...s, minutesEcoleJour: 0 }],
      creneaux,
    })
    expect(generer(sans, highs).affectations).toHaveLength(3)
  })

  it('propriété : minutes de l’hôtel + école ≤ plafond de la personne', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.subarray([0, 1, 2, 3, 4, 5]),
        fc.constantFrom(20 * H, 35 * H, 39 * H),
        fc.array(
          fc.record({
            jour: fc.integer({ min: 0, max: 6 }),
            debut: fc.integer({ min: 7, max: 12 }),
            duree: fc.integer({ min: 3, max: 8 }),
          }),
          { minLength: 1, maxLength: 9 },
        ),
        (mineur, jours, minutesHebdo, services) => {
          const ecole = new Set(jours)
          const s = versSolveur(
            fiche({ mineur, joursEcole: ecole, minutesHebdo }),
          )
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
