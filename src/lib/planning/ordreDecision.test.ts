import fc from 'fast-check'
import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  coutPlaceVide,
  EQUITE_MAX_PAR_SHIFT,
  generer,
  pireCoutRemplir,
  POIDS_DEPANNAGE_MINUTE,
  POIDS_EQUITE,
  POIDS_JOUR_FIXE,
  POIDS_PRESENCE_MINUTE,
  POIDS_REPOS_SEPARES,
  POIDS_SIXIEME_JOUR,
  POIDS_SOUS_CONTRAT,
  POIDS_SUR_CONTRAT,
} from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import {
  creneau as creneauModele,
  probleme,
  salarieSolveur,
} from '#/lib/planning/modele.ts'
import type {
  Creneau,
  Probleme,
  Resultat,
  SalarieSolveur,
} from '#/lib/planning/modele.ts'
import { debutApresReposHebdo } from '#/lib/planning/semaine.ts'
import { MINUTES_PAR_JOUR } from '#/lib/planning/temps.ts'
import {
  manquants,
  raisonsBlocage,
  violations,
} from '#/lib/planning/verificateur.ts'

/*
 * Étape 10 du plan « réglages cohérents » : l'ordre de décision du
 * générateur (la loi, les personnes nécessaires, le matin et le soir, les
 * contrats, titulaire avant dépannage, le confort). Un test par palier : un
 * cas où le palier du dessus l'emporte, un où il ne doit pas. Oracles : le
 * vérificateur (indépendant du modèle) et le recomptage à la main.
 */

const H = 60
let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})
const gen = (p: Probleme) => generer(p, highs)

function creneau(
  id: string,
  jour: number,
  debutH: number,
  finH: number,
  kw: Partial<Creneau> = {},
): Creneau {
  return creneauModele({
    id,
    poste: 'r',
    debut: jour * MINUTES_PAR_JOUR + debutH * H,
    fin: jour * MINUTES_PAR_JOUR + finH * H,
    ...kw,
  })
}

function personne(
  id: string,
  contratH: number,
  kw: Partial<SalarieSolveur> = {},
): SalarieSolveur {
  return salarieSolveur({
    id,
    postes: new Set(['r']),
    minutesHebdoContrat: contratH * H,
    minutesHebdoMax: 48 * H,
    minutesJourMax: 12 * H,
    joursTravaillesMaxSemaine: 6,
    joursPreferesSemaine: 5,
    reposQuotidienMin: 11 * H,
    ...kw,
  })
}

const qui = (r: Resultat, creneauId: string) =>
  r.affectations
    .filter((a) => a.creneauId === creneauId)
    .map((a) => a.salarieId)
const pris = (r: Resultat) => new Set(r.affectations.map((a) => a.creneauId))
const graines = [0, 1, 7, 42]

/** Cinq matins de 7 h (35 h) et un samedi de 4 h. */
const semaineEtSamedi = (samedi: Partial<Creneau>) => [
  ...[0, 1, 2, 3, 4].map((j) => creneau(`m${j}`, j, 7, 14)),
  creneau('sam', 5, 8, 12, samedi),
]

describe('les poids sont des paliers dérivés', () => {
  it('une place vide coûte plus que tout ce qu’il faut payer pour la remplir', () => {
    for (const heures of [2, 4, 8, 12]) {
      const c = creneau('c', 0, 7, 7 + heures)
      for (const presence of [0, 48_000, 72_000]) {
        expect(coutPlaceVide(c, presence)).toBeGreaterThan(
          pireCoutRemplir(c, presence),
        )
        // Le pire coût contient bien chacun des paliers du dessous.
        expect(pireCoutRemplir(c, presence)).toBeGreaterThanOrEqual(
          POIDS_SIXIEME_JOUR +
            (POIDS_SUR_CONTRAT + POIDS_DEPANNAGE_MINUTE) * heures * H +
            POIDS_REPOS_SEPARES +
            presence +
            EQUITE_MAX_PAR_SHIFT,
        )
      }
    }
  })

  it('chaque palier est au-dessus du suivant, unité contre unité', () => {
    const huit = 8 * H
    // P2 > P3 (heures en plus et 6e jour) pour un shift de 8 h…
    expect(POIDS_PRESENCE_MINUTE * huit).toBeGreaterThan(
      POIDS_SIXIEME_JOUR + POIDS_SUR_CONTRAT * huit,
    )
    // …mais les heures dues passent devant (une personne due reste placée).
    expect(POIDS_SOUS_CONTRAT).toBeGreaterThan(POIDS_PRESENCE_MINUTE)
    // P3 > P4 : heures en plus et 6e jour avant le dépannage.
    expect(POIDS_SUR_CONTRAT).toBeGreaterThan(POIDS_DEPANNAGE_MINUTE)
    expect(POIDS_SIXIEME_JOUR).toBeGreaterThan(POIDS_DEPANNAGE_MINUTE * 12 * H)
    // P4 > P5 : un dépannage de 4 h coûte plus que le confort d'un jour.
    for (const confort of [
      POIDS_JOUR_FIXE,
      POIDS_REPOS_SEPARES,
      EQUITE_MAX_PAR_SHIFT,
    ])
      expect(POIDS_DEPANNAGE_MINUTE * 4 * H).toBeGreaterThan(confort)
    // L'équité ne fait jamais faire une heure en plus.
    expect(POIDS_SUR_CONTRAT * H).toBeGreaterThan(EQUITE_MAX_PAR_SHIFT)
    expect(POIDS_EQUITE).toBeGreaterThan(0)
  })
})

describe('P1 : une place nécessaire passe avant le 6e jour et les heures en plus (D3 = A)', () => {
  it('le samedi nécessaire est tenu, au prix d’un 6e jour et de 4 h au-delà du contrat', () => {
    // Avant l'étape 10 : trou de 4 h (24 000) < 6e jour (15 000) + 4 h en
    // plus (12 000) : le samedi restait vide.
    const p = probleme({
      salaries: [personne('a', 35)],
      creneaux: semaineEtSamedi({}),
    })
    const r = gen(p)
    expect(r.manques).toEqual([])
    expect(pris(r).has('sam')).toBe(true)
    expect(new Set(violations(p, r.affectations).map((v) => v.regle))).toEqual(
      new Set(['SIXIEME-JOUR']),
    )
  })

  it('un samedi facultatif n’est PAS tenu s’il coûte un 6e jour', () => {
    const p = probleme({
      salaries: [personne('a', 35)],
      creneaux: semaineEtSamedi({ effectif: 0, facultatif: 1 }),
    })
    const r = gen(p)
    expect(pris(r).has('sam')).toBe(false)
    expect(r.affectations).toHaveLength(5)
  })

  it('la loi passe avant : jamais un 7e jour pour tenir une place', () => {
    const p = probleme({
      salaries: [personne('a', 35)],
      creneaux: [0, 1, 2, 3, 4, 5, 6].map((j) => creneau(`m${j}`, j, 7, 12)),
    })
    const r = gen(p)
    expect(r.affectations).toHaveLength(6)
    expect(manquants(p, r.affectations).size).toBe(1)
    const [vide] = [...manquants(p, r.affectations).keys()]
    expect(
      raisonsBlocage(p, r.affectations, vide)
        .get('a')!
        .map((v) => v.regle),
    ).toContain('R-SIX-JOURS-MAX')
  })

  it('la coupure de 11 h passe avant une place nécessaire', () => {
    const p = probleme({
      salaries: [personne('a', 35)],
      creneaux: [creneau('soir', 0, 15, 23), creneau('matin', 1, 7, 15)],
    })
    const r = gen(p)
    expect(r.affectations).toHaveLength(1)
    expect(violations(p, r.affectations)).toEqual([])
  })
})

describe('P2 : le matin et le soir, sous les places nécessaires (D1 = A)', () => {
  const lundi = (minimum: number) => ({
    jour: 0,
    periode: 'matin' as const,
    minimum,
    maximum: null,
  })

  it('une personne qui manque le matin passe avant un 6e jour', () => {
    // Cinq jours déjà tenus du mardi au samedi ; le lundi, un renfort de
    // 8 h facultatif qui compte dans la consigne « au moins 1 ».
    const creneaux = [
      ...[1, 2, 3, 4, 5].map((j) => creneau(`m${j}`, j, 7, 14)),
      creneau('lun', 0, 7, 15, {
        effectif: 0,
        facultatif: 1,
        presence: 'matin',
      }),
    ]
    const sans = gen(
      probleme({ salaries: [personne('a', 35)], creneaux, consignes: [] }),
    )
    expect(pris(sans).has('lun')).toBe(false)
    const avec = gen(
      probleme({
        salaries: [personne('a', 35)],
        creneaux,
        consignes: [lundi(1)],
      }),
    )
    expect(pris(avec).has('lun')).toBe(true)
  })

  it('une place nécessaire passe avant la consigne', () => {
    // Une seule personne, deux créneaux le même jour : la place nécessaire
    // (hors consigne) contre le renfort qui compterait dans la consigne.
    const p = probleme({
      salaries: [personne('a', 7)],
      creneaux: [
        creneau('besoin', 0, 13, 20),
        creneau('renfort', 0, 7, 14, {
          effectif: 0,
          facultatif: 1,
          presence: 'matin',
        }),
      ],
      consignes: [lundi(1)],
    })
    const r = gen(p)
    expect(qui(r, 'besoin')).toEqual(['a'])
    expect(r.manques).toEqual([])
  })
})

describe('P4 : titulaire avant dépannage (D13, D14)', () => {
  const depannage = (id: string, contratH: number) =>
    personne(id, contratH, { postesOccasionnels: new Set(['r']) })

  it('à coût égal, le titulaire est préféré', () => {
    for (const graine of graines) {
      const r = gen(
        probleme({
          salaries: [depannage('d', 7), personne('t', 7)],
          creneaux: [creneau('c', 0, 7, 14)],
          graine,
        }),
      )
      expect(qui(r, 'c')).toEqual(['t'])
    }
  })

  it('un dépannage vaut mieux qu’une place vide', () => {
    const r = gen(
      probleme({
        salaries: [
          depannage('d', 7),
          personne('t', 7, { indisponibilites: new Set([0]) }),
        ],
        creneaux: [creneau('c', 0, 7, 14)],
      }),
    )
    expect(qui(r, 'c')).toEqual(['d'])
    expect(r.manques).toEqual([])
  })

  it('les contrats passent avant : un titulaire au-delà de son contrat laisse la place au dépannage', () => {
    const r = gen(
      probleme({
        salaries: [personne('t', 0), depannage('d', 7)],
        creneaux: [creneau('c', 0, 7, 14)],
      }),
    )
    expect(qui(r, 'c')).toEqual(['d'])
  })

  it('un dépannage avec un soutien tient la place ; un soutien seul, jamais', () => {
    const soutien = personne('s', 7, {
      postes: new Set(),
      postesSoutien: new Set(['r']),
    })
    const c = creneau('c', 0, 7, 14, { soutien: 1 })
    const avec = gen(
      probleme({ salaries: [soutien, depannage('d', 7)], creneaux: [c] }),
    )
    expect(new Set(qui(avec, 'c'))).toEqual(new Set(['s', 'd']))
    const seul = gen(probleme({ salaries: [soutien], creneaux: [c] }))
    expect(seul.affectations).toEqual([])
  })
})

describe('P5 : équité au mieux, jamais avant les contrats (D15)', () => {
  const groupe = (id: string, contratH: number, kw = {}) =>
    personne(id, contratH, { groupeEquite: 'r', ...kw })
  const avant = (weekends: number, soirs = 0, matinsTot = 0) => ({
    equiteAvant: { weekends, soirs, matinsTot },
  })
  // Un samedi et un mercredi de 7 h, deux personnes à 7 h.
  const deuxJours = [creneau('sam', 5, 7, 14), creneau('mer', 2, 7, 14)]

  it('le week-end va à qui ne l’a pas fait la semaine d’avant', () => {
    for (const graine of graines) {
      const r = gen(
        probleme({
          salaries: [groupe('a', 7, avant(1)), groupe('b', 7, avant(0))],
          creneaux: deuxJours,
          graine,
        }),
      )
      expect(qui(r, 'sam')).toEqual(['b'])
    }
  })

  it('sans groupe commun, pas d’équité : la semaine d’avant ne compte pas', () => {
    const vus = new Set<string>()
    for (const graine of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const r = gen(
        probleme({
          salaries: [personne('a', 7, avant(1)), personne('b', 7, avant(0))],
          creneaux: deuxJours,
          graine,
        }),
      )
      vus.add(qui(r, 'sam')[0])
    }
    expect(vus).toEqual(new Set(['a', 'b']))
  })

  it('l’équité ne fait pas faire d’heures en plus', () => {
    // a a fait le week-end d'avant, mais b n'a pas d'heures à faire.
    const r = gen(
      probleme({
        salaries: [groupe('a', 14, avant(1)), groupe('b', 0, avant(0))],
        creneaux: deuxJours,
      }),
    )
    expect(qui(r, 'sam')).toEqual(['a'])
    expect(qui(r, 'mer')).toEqual(['a'])
  })

  it('les soirs tournent : le soir va à qui en a fait le moins', () => {
    const creneaux = [
      creneau('matin', 2, 7, 14),
      creneau('soir', 2, 15, 22, { soir: true }),
    ]
    for (const graine of graines) {
      const r = gen(
        probleme({
          salaries: [groupe('a', 7, avant(0, 3)), groupe('b', 7, avant(0, 0))],
          creneaux,
          graine,
        }),
      )
      expect(qui(r, 'soir')).toEqual(['b'])
    }
  })

  it('les matins tôt tournent aussi', () => {
    const creneaux = [
      creneau('tot', 2, 6, 13, { matinTot: true }),
      creneau('tard', 2, 15, 22),
    ]
    const r = gen(
      probleme({
        salaries: [groupe('a', 7, avant(0, 0, 2)), groupe('b', 7)],
        creneaux,
      }),
    )
    expect(qui(r, 'tot')).toEqual(['b'])
  })

  it('l’équité ne laisse jamais une place nécessaire vide', () => {
    const r = gen(
      probleme({
        salaries: [groupe('a', 7, avant(1, 7, 7)), groupe('b', 7)],
        creneaux: [
          creneau('sam', 5, 15, 22, { soir: true }),
          creneau('dim', 6, 15, 22, { soir: true }),
        ],
      }),
    )
    expect(r.manques).toEqual([])
  })
})

describe('propriété : jamais d’infraction, une place vide a toujours une raison', () => {
  it('sur des semaines tirées au hasard', () => {
    const arbSalarie = fc.record({
      contratH: fc.integer({ min: 0, max: 39 }),
      depannage: fc.boolean(),
      absents: fc.subarray([0, 1, 2, 3, 4, 5, 6]),
      reposHebdo: fc.boolean(),
      groupe: fc.boolean(),
      weekends: fc.integer({ min: 0, max: 1 }),
      soirs: fc.integer({ min: 0, max: 5 }),
    })
    const arbCreneau = fc.record({
      jour: fc.integer({ min: 0, max: 6 }),
      debutH: fc.integer({ min: 5, max: 16 }),
      dureeH: fc.integer({ min: 3, max: 10 }),
      effectif: fc.integer({ min: 0, max: 2 }),
      facultatif: fc.integer({ min: 0, max: 1 }),
    })
    fc.assert(
      fc.property(
        fc.array(arbSalarie, { minLength: 1, maxLength: 4 }),
        fc.array(arbCreneau, { minLength: 1, maxLength: 10 }),
        fc.integer({ min: 0, max: 1000 }),
        (gens, places, graine) => {
          const salaries = gens.map((g, i) =>
            personne(`s${i}`, g.contratH, {
              postesOccasionnels: g.depannage ? new Set(['r']) : new Set(),
              indisponibilites: new Set(g.absents),
              reposHebdoMin: g.reposHebdo ? 35 * H : 0,
              reposDeuxSemaines: 3,
              groupeEquite: g.groupe ? 'r' : null,
              equiteAvant: {
                weekends: g.weekends,
                soirs: g.soirs,
                matinsTot: 0,
              },
            }),
          )
          const creneaux = places.map((c, i) =>
            creneau(`c${i}`, c.jour, c.debutH, c.debutH + c.dureeH, {
              effectif: c.effectif,
              facultatif: c.facultatif,
              soir: c.debutH >= 13,
              matinTot: c.debutH <= 6,
            }),
          )
          const p = probleme({ salaries, creneaux, graine })
          const r = gen(p)
          expect(r.statut).toBe('optimal')
          expect(violations(p, r.affectations)).toEqual([])
          for (const [vide] of manquants(p, r.affectations)) {
            for (const [, liste] of raisonsBlocage(p, r.affectations, vide)) {
              // Une raison légale ou d'éligibilité, jamais le seul confort.
              expect(liste.some((v) => v.regle !== 'SIXIEME-JOUR')).toBe(true)
            }
          }
        },
      ),
      { numRuns: 60, seed: 20261029 },
    )
  }, 120_000)
})

describe('la loi d’une semaine à l’autre : R-REPOS-HEBDO-35H', () => {
  const s = personne('a', 35, { reposHebdoMin: 35 * H })
  // Semaine d'avant (jours -7 à -1) : du lundi au samedi, fin samedi 22 h.
  const lundiAuSamedi = [-7, -6, -5, -4, -3, -2].map((j) =>
    creneau(`p${j}`, j, 14, 22),
  )
  const jours = (cs: Creneau[]) => new Set(cs.map((c) => c.jourPlanning! + 7))
  const avecJour = (cs: Creneau[]) =>
    cs.map((c) => ({
      ...c,
      jourPlanning: Math.floor(c.debut / MINUTES_PAR_JOUR),
    }))

  it('repos seulement en fin de semaine : le lundi suivant ne commence pas avant samedi 22 h + 35 h', () => {
    const avant = avecJour(lundiAuSamedi)
    const borne = debutApresReposHebdo(s, avant, jours(avant))
    expect(borne).toBe(-2 * MINUTES_PAR_JOUR + 22 * H + 35 * H)
  })

  it('un repos de 35 h déjà pris dans la semaine : aucune borne', () => {
    // Le mercredi libre : mardi 22 h → jeudi 14 h = 40 h.
    const avant = avecJour(lundiAuSamedi.filter((c) => c.id !== 'p-5'))
    expect(debutApresReposHebdo(s, avant, jours(avant))).toBeNull()
    // Dimanche travaillé : la frontière n'y peut rien, aucune borne.
    const dimanche = avecJour([...lundiAuSamedi, creneau('p-1', -1, 7, 12)])
    expect(debutApresReposHebdo(s, dimanche, jours(dimanche))).toBeNull()
    // Un mineur n'a pas cette règle (deux jours consécutifs à la place).
    expect(
      debutApresReposHebdo(
        personne('m', 35),
        avecJour(lundiAuSamedi),
        jours(avecJour(lundiAuSamedi)),
      ),
    ).toBeNull()
  })

  it('le moteur respecte la borne, le vérificateur la contrôle', () => {
    const borne = -2 * MINUTES_PAR_JOUR + 22 * H + 35 * H // lundi 9 h
    const t = personne('a', 35, { debutAuPlusTot: borne })
    const tot = creneau('tot', 0, 7, 14)
    const tard = creneau('tard', 0, 10, 17)
    const p = probleme({ salaries: [t], creneaux: [tot] })
    const r = gen(p)
    expect(r.affectations).toEqual([])
    expect(
      raisonsBlocage(p, r.affectations, 'tot')
        .get('a')!
        .map((v) => v.regle),
    ).toEqual(['R-REPOS-HEBDO-35H'])
    const p2 = probleme({ salaries: [t], creneaux: [tard] })
    expect(qui(gen(p2), 'tard')).toEqual(['a'])
    expect(
      violations(p2, [{ salarieId: 'a', creneauId: 'tard', court: false }]),
    ).toEqual([])
  })
})
