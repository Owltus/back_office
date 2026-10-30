import fc from 'fast-check'
import highsLoader from 'highs'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  BRUIT_MAX,
  coutConsigne,
  coutDepannage,
  coutManqueMinimum,
  coutPlaceVide,
  coutPlaceVideGroupe,
  EQUITE_MAX_PAR_SHIFT,
  generer,
  minutesDues,
  minutesDuesCourt,
  minutesEnPlus,
  minutesEnPlusCourt,
  PART_FIXE_DEPANNAGE,
  PART_TEMPS_1,
  pireCoutRemplir,
  POIDS_DEJA_PROPOSE,
  POIDS_DEPANNAGE_MINUTE,
  POIDS_EQUITE,
  POIDS_JOUR_FIXE,
  POIDS_PRESENCE_MINUTE,
  POIDS_REMPLACANT,
  POIDS_REPOS_SEPARES,
  POIDS_SIXIEME_JOUR,
  POIDS_SOUS_CONTRAT,
  POIDS_SUR_CONTRAT,
  POIDS_TROU_QUART,
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
  trous as trousVerifies,
  violations,
  violationsSalarie,
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
    // P4 > P5 : un dépannage, même d'une heure, coûte plus que TOUT le
    // confort d'un shift additionné.
    expect(coutDepannage(creneau('c', 0, 7, 8))).toBeGreaterThan(
      POIDS_JOUR_FIXE + POIDS_REPOS_SEPARES + EQUITE_MAX_PAR_SHIFT,
    )
    // P3 > P4 : dès 2 h, un titulaire en heures en plus laisse la place ;
    // le 6e jour, jusqu'à 17 h de shift.
    expect(POIDS_SUR_CONTRAT * 2 * H).toBeGreaterThan(
      coutDepannage(creneau('c', 0, 7, 9)),
    )
    expect(POIDS_SIXIEME_JOUR).toBeGreaterThan(
      coutDepannage(creneau('c', 0, 6, 23)),
    )
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

  // Relecture adverse du 2026-10-29 : le coût d'une consigne suivait le
  // plus long créneau de la période (10 h = 60 000) et dépassait les heures
  // dues d'une personne sur un créneau de 2 h (48 000).
  it('une personne due reste placée, même si une consigne « au plus » est dépassée', () => {
    for (const longue of [6, 10]) {
      const p = probleme({
        salaries: [personne('a', longue), personne('b', 2)],
        creneaux: [
          creneau('long', 0, 7, 7 + longue, { presence: 'matin' }),
          creneau('court', 0, 7, 9, {
            presence: 'matin',
            effectif: 0,
            facultatif: 1,
          }),
        ],
        consignes: [{ jour: 0, periode: 'matin', minimum: 0, maximum: 1 }],
      })
      const r = gen(p)
      expect(qui(r, 'long')).toEqual(['a'])
      expect(qui(r, 'court')).toEqual(['b'])
    }
  })

  // Vague 1 des cycles (D7) : ce plafond ne vaut plus que pour le MAXIMUM ;
  // le minimum est une place nécessaire (P1), voir plus bas.
  it('le coût du maximum d’une consigne est plafonné sous les heures dues de chaque créneau qui y compte', () => {
    const long = creneau('long', 0, 7, 17, { presence: 'matin' })
    const court = creneau('court', 0, 7, 9, { presence: 'matin' })
    // Un seul créneau long : proportionnel, comme avant.
    expect(coutConsigne([long])).toBe(POIDS_PRESENCE_MINUTE * 10 * H)
    // Avec un créneau de 2 h : sous ce que rapportent ses heures dues, une
    // fois payés un dépannage et le confort.
    expect(coutConsigne([long, court])).toBeLessThanOrEqual(
      POIDS_SOUS_CONTRAT * 2 * H - coutDepannage(court),
    )
    expect(coutConsigne([long, court])).toBeLessThan(
      POIDS_PRESENCE_MINUTE * 10 * H,
    )
    expect(coutConsigne([long, court])).toBeGreaterThan(0)
    expect(coutConsigne([])).toBe(0)
    // Le minimum, lui, n'est pas plafonné : il passe au-dessus de tout ce
    // qu'il faut payer pour ajouter quelqu'un.
    expect(coutManqueMinimum([long, court], 0)).toBeGreaterThan(
      coutConsigne([long, court]),
    )
  })

  // Vague 1 des cycles (D7) : le minimum est AU NIVEAU d'une place
  // nécessaire. Avant, la place passait toujours devant la consigne ; à
  // durée égale, les deux coûtent désormais la même chose.
  it('une place nécessaire et le minimum d’une consigne sont au même niveau', () => {
    const besoin = creneau('besoin', 0, 13, 20)
    const renfort = creneau('renfort', 0, 7, 14, {
      effectif: 0,
      facultatif: 1,
      presence: 'matin',
    })
    expect(coutManqueMinimum([renfort], 0)).toBe(coutPlaceVide(besoin, 0))
    // Une seule personne : elle tient l'un des deux, l'autre manque.
    const r = gen(
      probleme({
        salaries: [personne('a', 7)],
        creneaux: [besoin, renfort],
        consignes: [lundi(1)],
      }),
    )
    expect(r.affectations).toHaveLength(1)
    // Le besoin qui compte LUI-MÊME dans la consigne passe devant un besoin
    // qui n'y compte pas : son manque se paierait deux fois.
    const r2 = gen(
      probleme({
        salaries: [personne('a', 7)],
        creneaux: [besoin, creneau('matin', 0, 7, 14, { presence: 'matin' })],
        consignes: [lundi(1)],
      }),
    )
    expect(qui(r2, 'matin')).toEqual(['a'])
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

  // Relecture adverse du 2026-10-29 : la prime de jour habituel d'un
  // dépannage, ajoutée à l'équité qui pèse sur le titulaire, battait le coût
  // du dépannage sur un shift de 3 h ou 4 h.
  it('les coûts de confort ADDITIONNÉS ne font jamais passer un dépannage devant un titulaire libre', () => {
    // Le confort, au pire, pour un shift : moins que la part fixe seule.
    expect(PART_FIXE_DEPANNAGE).toBeGreaterThan(
      POIDS_JOUR_FIXE +
        POIDS_REPOS_SEPARES +
        EQUITE_MAX_PAR_SHIFT +
        POIDS_DEJA_PROPOSE +
        BRUIT_MAX,
    )
    for (const heures of [1, 2, 3, 4, 5, 6]) {
      for (const graine of graines) {
        const c = creneau('c', 0, 18, 18 + heures, { soir: true })
        // Le titulaire a fait 7 soirs de plus que son collègue (absent) ;
        // le dépannage travaille ce jour-là d'habitude.
        const titulaire = personne('t', 35, {
          groupeEquite: 'g',
          equiteAvant: { weekends: 0, soirs: 7, matinsTot: 0 },
        })
        const collegue = personne('t2', 35, {
          groupeEquite: 'g',
          equiteAvant: { weekends: 0, soirs: 0, matinsTot: 0 },
          indisponibilites: new Set([0]),
        })
        const d = personne('d', 35, {
          postesOccasionnels: new Set(['r']),
          travailFixe: new Set([0]),
        })
        const r = gen(
          probleme({
            salaries: [titulaire, collegue, d],
            creneaux: [c],
            graine,
          }),
        )
        expect(qui(r, 'c')).toEqual(['t'])
      }
    }
  })

  it('jour habituel seul : le titulaire libre passe devant, même sur 3 h', () => {
    for (const heures of [3, 4]) {
      const r = gen(
        probleme({
          salaries: [
            personne('t', 35, { contratIndicatif: false }),
            personne('d', 35, {
              postesOccasionnels: new Set(['r']),
              travailFixe: new Set([0]),
            }),
          ],
          creneaux: [creneau('c', 0, 18, 18 + heures)],
        }),
      )
      expect(qui(r, 'c')).toEqual(['t'])
    }
  })

  it('le jour habituel garde sa prime quand la personne y est titulaire', () => {
    // Deux titulaires, l'un travaille ce jour-là d'habitude : c'est lui.
    for (const graine of graines) {
      const r = gen(
        probleme({
          salaries: [
            personne('a', 35),
            personne('b', 35, { travailFixe: new Set([0]) }),
          ],
          creneaux: [creneau('c', 0, 18, 21)],
          graine,
        }),
      )
      expect(qui(r, 'c')).toEqual(['b'])
    }
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
    const borne = debutApresReposHebdo(s, avant, jours(avant), null)
    expect(borne).toBe(-2 * MINUTES_PAR_JOUR + 22 * H + 35 * H)
  })

  it('un repos de 35 h déjà pris dans la semaine : aucune borne', () => {
    // Le mercredi libre : mardi 22 h → jeudi 14 h = 40 h.
    const avant = avecJour(lundiAuSamedi.filter((c) => c.id !== 'p-5'))
    expect(debutApresReposHebdo(s, avant, jours(avant), null)).toBeNull()
    // Dimanche travaillé : la frontière n'y peut rien, aucune borne.
    const dimanche = avecJour([...lundiAuSamedi, creneau('p-1', -1, 7, 12)])
    expect(debutApresReposHebdo(s, dimanche, jours(dimanche), null)).toBeNull()
    // Un mineur n'a pas cette règle (deux jours consécutifs à la place).
    expect(
      debutApresReposHebdo(
        personne('m', 35),
        avecJour(lundiAuSamedi),
        jours(avecJour(lundiAuSamedi)),
        null,
      ),
    ).toBeNull()
  })

  // Relecture adverse du 2026-10-29 : semaine d'avant lundi libre, du mardi
  // au vendredi 7 h - 15 h, samedi 14 h - 22 h, dimanche libre. Son repos
  // de 35 h dépend de la semaine d'avant-avant.
  const mardiAuSamedi = avecJour([
    ...[-6, -5, -4, -3].map((j) => creneau(`q${j}`, j, 7, 15)),
    creneau('q-2', -2, 14, 22),
  ])
  const samedi22h35 = -2 * MINUTES_PAR_JOUR + 22 * H + 35 * H // lundi 9 h

  it('avant-avant fini le dimanche à 23 h : le lundi libre ne fait pas 35 h, borne posée', () => {
    const dimanche23h = -7 * MINUTES_PAR_JOUR - H
    expect(
      debutApresReposHebdo(s, mardiAuSamedi, jours(mardiAuSamedi), dimanche23h),
    ).toBe(samedi22h35)
    // Le vérificateur dit la même chose de la semaine d'avant, relue comme
    // une semaine ordinaire avec ses vraies voisines (avant-avant, puis un
    // lundi 7 h) : tout décalé d'une semaine.
    const S = 7 * MINUTES_PAR_JOUR
    const semaine = mardiAuSamedi.map((c) => ({
      ...c,
      debut: c.debut + S,
      fin: c.fin + S,
      jourPlanning: c.jourPlanning + 7,
    }))
    const relue = { ...s, finServicePrecedent: dimanche23h + S }
    const regles = (suivant: number) =>
      violationsSalarie(
        { ...relue, debutServiceSuivant: suivant + S },
        semaine,
        7,
      ).map((v) => v.regle)
    expect(regles(7 * H)).toContain('R-REPOS-HEBDO-35H')
    // Commencer à la borne suffit : plus d'infraction.
    expect(regles(samedi22h35)).not.toContain('R-REPOS-HEBDO-35H')
  })

  it('avant-avant fini le samedi à 22 h : 57 h de repos jusqu’au mardi, aucune borne', () => {
    const samediAvantAvant = -9 * MINUTES_PAR_JOUR + 22 * H
    expect(
      debutApresReposHebdo(
        s,
        mardiAuSamedi,
        jours(mardiAuSamedi),
        samediAvantAvant,
      ),
    ).toBeNull()
    // Avant-avant sans aucun service : le repos y est pris, aucune borne.
    expect(
      debutApresReposHebdo(s, mardiAuSamedi, jours(mardiAuSamedi), null),
    ).toBeNull()
    // Avant-avant non lue : valeur prudente (lundi 0 h), borne posée.
    expect(
      debutApresReposHebdo(
        s,
        mardiAuSamedi,
        jours(mardiAuSamedi),
        -7 * MINUTES_PAR_JOUR,
      ),
    ).toBe(samedi22h35)
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

/*
 * Plan planning-cycles-2026-10-30, vague 1, lot B : remplaçants, minimum par
 * cycle, trous entre équipes. Les créneaux remplaçants (`r…`) sont écrits à
 * la main comme le lot C les fabriquera (contrat §2) : `place` = id du
 * besoin, effectif 0, autre code. Oracle : le recomptage à la main (le
 * vérificateur compte les places par `c.place ?? c.id` après le lot D).
 */
describe('cycles : un autre code du même cycle tient la place (D5, D13, D16)', () => {
  /** Besoin M3 lundi 7 h - 14 h ; remplaçant M6 10 h - 17 h (même durée). */
  const besoin = creneau('b1', 0, 7, 14, { typeShift: 'M3' })
  const remplacant = creneau('r1-M6', 0, 10, 17, {
    typeShift: 'M6',
    place: 'b1',
    effectif: 0,
  })
  const place = [besoin, remplacant]
  const seulement = (...codes: string[]) => ({
    shiftsAutorises: new Set(codes),
  })
  const depannage = (id: string, kw: Partial<SalarieSolveur> = {}) =>
    personne(id, 7, { postesOccasionnels: new Set(['r']), ...kw })
  /** Qui tient la place, sur quel créneau. */
  const tenue = (r: Resultat) =>
    r.affectations.map((a) => `${a.salarieId}@${a.creneauId}`)

  it('M3 impossible (repos de 11 h), M6 possible : le remplaçant est posé', () => {
    // Fin la veille à 22 h : 9 h avant M3, 12 h avant M6.
    const a = personne('a', 7, { finServicePrecedent: -2 * H })
    for (const graine of graines) {
      const r = gen(probleme({ salaries: [a], creneaux: place, graine }))
      expect(tenue(r)).toEqual(['a@r1-M6'])
      expect(r.manques).toEqual([])
    }
  })

  it('M3 possible : le code imposé, jamais le remplaçant', () => {
    for (const graine of graines) {
      const r = gen(
        probleme({ salaries: [personne('a', 7)], creneaux: place, graine }),
      )
      expect(tenue(r)).toEqual(['a@b1'])
    }
  })

  it('aucun code possible : la place reste vide, au nom du besoin', () => {
    const a = personne('a', 7, { finServicePrecedent: 0 })
    const r = gen(probleme({ salaries: [a], creneaux: place }))
    expect(r.affectations).toEqual([])
    expect(r.manques).toEqual([{ creneauId: 'b1', manquant: 1 }])
  })

  it('une seule personne sur la place, besoin et remplaçant ensemble', () => {
    // Deux personnes libres qui doivent chacune 7 h : la place n'en prend
    // qu'une (effectif 1, aucun facultatif).
    for (const graine of graines) {
      const r = gen(
        probleme({
          salaries: [personne('a', 7), personne('b', 7)],
          creneaux: place,
          graine,
        }),
      )
      expect(r.affectations).toHaveLength(1)
      expect(r.manques).toEqual([])
    }
    // Avec une place facultative en plus, les deux.
    const r = gen(
      probleme({
        salaries: [personne('a', 7), personne('b', 7)],
        creneaux: [{ ...besoin, facultatif: 1 }, remplacant],
      }),
    )
    expect(r.affectations).toHaveLength(2)
  })

  it('soutien jamais seul : compté sur la place entière', () => {
    const soutien = personne('s', 7, {
      postes: new Set(),
      postesSoutien: new Set(['r']),
    })
    const avecSoutien = [{ ...besoin, soutien: 1 }, remplacant]
    const r = gen(
      probleme({
        salaries: [soutien, personne('t', 7, seulement('M6'))],
        creneaux: avecSoutien,
      }),
    )
    expect(new Set(tenue(r))).toEqual(new Set(['s@b1', 't@r1-M6']))
    const seul = gen(probleme({ salaries: [soutien], creneaux: avecSoutien }))
    expect(seul.affectations).toEqual([])
  })

  it('les paliers D13 sont dans l’ordre, unité contre unité', () => {
    expect(POIDS_REMPLACANT).toBeGreaterThan(0)
    // Titulaire remplaçant < dépannage au code imposé, quelle que soit la
    // durée du shift.
    expect(POIDS_REMPLACANT).toBeLessThan(PART_FIXE_DEPANNAGE)
    // Dépannage au code imposé < dépannage remplaçant < place vide.
    expect(coutDepannage(remplacant) + POIDS_REMPLACANT).toBeLessThan(
      coutPlaceVideGroupe(place, 0),
    )
    // La place vide d'une place à remplaçants dépasse le pire de ses codes.
    expect(coutPlaceVideGroupe(place, 0)).toBeGreaterThan(
      pireCoutRemplir(remplacant, 0),
    )
    expect(pireCoutRemplir(remplacant, 0)).toBe(
      pireCoutRemplir(besoin, 0) + POIDS_REMPLACANT,
    )
    // Sans remplaçant, la place vide est celle d'avant.
    expect(coutPlaceVideGroupe([besoin], 0)).toBe(coutPlaceVide(besoin, 0))
  })

  // Les quatre paliers, chacun seul possible, puis deux à la fois : le plus
  // haut gagne. tE / tR : titulaire qui ne peut faire que M3 / que M6 ; t :
  // les deux ; dE, dR, d : de même en dépannage.
  const cas: Array<[string, SalarieSolveur[], string[]]> = [
    [
      'titulaire au code imposé',
      [personne('tE', 7, seulement('M3'))],
      ['tE@b1'],
    ],
    [
      'titulaire remplaçant',
      [personne('tR', 7, seulement('M6'))],
      ['tR@r1-M6'],
    ],
    ['dépannage au code imposé', [depannage('dE', seulement('M3'))], ['dE@b1']],
    ['dépannage remplaçant', [depannage('dR', seulement('M6'))], ['dR@r1-M6']],
    ['titulaire : imposé avant remplaçant', [personne('t', 7)], ['t@b1']],
    ['dépannage : imposé avant remplaçant', [depannage('d')], ['d@b1']],
    [
      'titulaire imposé avant titulaire remplaçant',
      [personne('tR', 7, seulement('M6')), personne('tE', 7, seulement('M3'))],
      ['tE@b1'],
    ],
    [
      'titulaire remplaçant avant dépannage imposé',
      [depannage('dE', seulement('M3')), personne('tR', 7, seulement('M6'))],
      ['tR@r1-M6'],
    ],
    [
      'dépannage imposé avant dépannage remplaçant',
      [depannage('dR', seulement('M6')), depannage('dE', seulement('M3'))],
      ['dE@b1'],
    ],
    [
      'titulaire remplaçant avant dépannage remplaçant',
      [depannage('dR', seulement('M6')), personne('tR', 7, seulement('M6'))],
      ['tR@r1-M6'],
    ],
  ]
  for (const [nom, salaries, attendu] of cas) {
    it(`palier : ${nom}`, () => {
      for (const graine of graines) {
        const r = gen(probleme({ salaries, creneaux: place, graine }))
        expect(tenue(r)).toEqual(attendu)
        expect(r.manques).toEqual([])
      }
    })
  }
})

describe('cycles : le minimum d’une consigne est une place nécessaire (D7)', () => {
  const lundi = (periode: 'matin' | 'soir' | 'nuit', minimum: number) => ({
    jour: 0,
    periode,
    minimum,
    maximum: null,
  })

  it('le coût du manque est dérivé comme une place vide', () => {
    for (const heures of [2, 7, 10]) {
      const c = creneau('c', 0, 7, 7 + heures, { presence: 'matin' })
      const r = creneau('r', 0, 8, 8 + heures, {
        presence: 'matin',
        place: 'c',
        effectif: 0,
      })
      for (const presence of [0, 48_000]) {
        // Au-dessus du pire coût d'ajouter quelqu'un sur CHACUN des créneaux
        // qui comptent, remplaçant compris.
        for (const k of [c, r]) {
          expect(coutManqueMinimum([c, r], presence)).toBeGreaterThan(
            pireCoutRemplir(k, presence),
          )
        }
      }
      // Un shift posé à la main ne reçoit personne : hors du calcul.
      const pose = creneau('pose', 0, 0, 23, { presence: 'matin', ferme: true })
      expect(coutManqueMinimum([c, pose], 0)).toBe(coutPlaceVide(c, 0))
      expect(coutManqueMinimum([pose], 0)).toBe(0)
    }
  })

  it('un matin de 2 h manquant passe avant un 6e jour et des heures en plus', () => {
    const creneaux = [
      ...[1, 2, 3, 4, 5].map((j) => creneau(`m${j}`, j, 7, 14)),
      creneau('lun', 0, 7, 9, {
        effectif: 0,
        facultatif: 1,
        presence: 'matin',
      }),
    ]
    // Avant la vague (P2, plafonné) : 12 000 < 6e jour + 2 h en plus.
    expect(coutConsigne([creneaux[5]])).toBeLessThan(
      POIDS_SIXIEME_JOUR + POIDS_SUR_CONTRAT * 2 * H,
    )
    expect(coutManqueMinimum([creneaux[5]], 0)).toBeGreaterThan(
      POIDS_SIXIEME_JOUR + POIDS_SUR_CONTRAT * 2 * H,
    )
    for (const graine of graines) {
      const r = gen(
        probleme({
          salaries: [personne('a', 35)],
          creneaux,
          consignes: [lundi('matin', 1)],
          graine,
        }),
      )
      expect(qui(r, 'lun')).toEqual(['a'])
      expect(r.affectations).toHaveLength(6)
    }
  })

  it('le minimum du matin passe avant des heures dues un autre jour', () => {
    // a doit 8 h 50 et ne travaille qu'un jour : le mardi de 8 h 50 les
    // donne toutes, le matin du lundi (7 h) en laisse 110 min dues.
    const a = personne('a', 0, {
      minutesHebdoContrat: 530,
      joursTravaillesMaxSemaine: 1,
      joursPreferesSemaine: 1,
    })
    const lun = creneau('lun', 0, 7, 14, {
      effectif: 0,
      facultatif: 1,
      presence: 'matin',
    })
    const mar = creneauModele({
      id: 'mar',
      poste: 'r',
      debut: MINUTES_PAR_JOUR + 7 * H,
      fin: MINUTES_PAR_JOUR + 7 * H + 530,
      effectif: 0,
      facultatif: 1,
    })
    // Avant (P2) : 42 000 < 110 min dues (44 000) < maintenant (P1).
    expect(coutConsigne([lun])).toBeLessThan(POIDS_SOUS_CONTRAT * 110)
    expect(coutManqueMinimum([lun], 0)).toBeGreaterThan(
      POIDS_SOUS_CONTRAT * 110,
    )
    const sans = gen(probleme({ salaries: [a], creneaux: [lun, mar] }))
    expect(qui(sans, 'mar')).toEqual(['a'])
    for (const graine of graines) {
      const r = gen(
        probleme({
          salaries: [a],
          creneaux: [lun, mar],
          consignes: [lundi('matin', 1)],
          graine,
        }),
      )
      expect(qui(r, 'lun')).toEqual(['a'])
    }
  })

  it('la nuit compte aussi', () => {
    const veille = creneau('veille', 0, 23, 31, {
      effectif: 0,
      facultatif: 1,
      presence: 'nuit',
    })
    const p = (consignes: Probleme['consignes']) =>
      gen(
        probleme({
          salaries: [personne('a', 0)],
          creneaux: [veille],
          consignes,
        }),
      )
    expect(p([]).affectations).toEqual([])
    expect(qui(p([lundi('nuit', 1)]), 'veille')).toEqual(['a'])
  })

  it('le maximum garde son coût P2 : une personne due reste placée', () => {
    // Le même cas qu'au-dessus (P2), avec un minimum en plus : rien ne change
    // pour le maximum.
    const p = probleme({
      salaries: [personne('a', 10), personne('b', 2)],
      creneaux: [
        creneau('long', 0, 7, 17, { presence: 'matin' }),
        creneau('court', 0, 7, 9, {
          presence: 'matin',
          effectif: 0,
          facultatif: 1,
        }),
      ],
      consignes: [{ jour: 0, periode: 'matin', minimum: 1, maximum: 1 }],
    })
    const r = gen(p)
    expect(qui(r, 'long')).toEqual(['a'])
    expect(qui(r, 'court')).toEqual(['b'])
  })
})

describe('cycles : pas de trou entre deux équipes (D10)', () => {
  // Réception comptée dans la présence : matin 7 h - 15 h, soir 16 h - 23 h,
  // et un autre code du soir, 15 h - 23 h, qui touche le matin.
  const matin = creneau('mat', 0, 7, 15, { typeShift: 'M', presence: 'matin' })
  const soir = creneau('soi', 0, 16, 23, { typeShift: 'S1', presence: 'soir' })
  const soirLong = creneau('soi-S2', 0, 15, 23, {
    typeShift: 'S2',
    presence: 'soir',
    place: 'soi',
    effectif: 0,
  })
  const equipe = [
    personne('a', 8, { shiftsAutorises: new Set(['M']) }),
    // b doit 7 h : le soir long lui fait une heure en plus.
    personne('b', 7, { shiftsAutorises: new Set(['S1', 'S2']) }),
  ]

  it('le coût d’un trou : par quart d’heure, au niveau d’une consigne', () => {
    expect(POIDS_TROU_QUART).toBe(15 * POIDS_PRESENCE_MINUTE)
    // Un quart d'heure ne vaut pas un changement de code, une demi-heure si.
    expect(POIDS_TROU_QUART).toBeLessThan(POIDS_REMPLACANT)
    expect(2 * POIDS_TROU_QUART).toBeGreaterThan(POIDS_REMPLACANT)
    // Le trou d'une heure contre le soir long : une heure en plus et un
    // changement de code.
    expect(4 * POIDS_TROU_QUART).toBeGreaterThan(
      POIDS_SUR_CONTRAT * H + POIDS_REMPLACANT,
    )
  })

  it('un code qui couvre le trou de 15 h à 16 h est choisi', () => {
    for (const graine of graines) {
      const r = gen(
        probleme({
          salaries: equipe,
          creneaux: [matin, soir, soirLong],
          graine,
        }),
      )
      expect(qui(r, 'mat')).toEqual(['a'])
      expect(qui(r, 'soi-S2')).toEqual(['b'])
      expect(r.trous).toEqual([])
    }
  })

  it('sans code qui le couvre, le trou reste et il est rendu', () => {
    const r = gen(probleme({ salaries: equipe, creneaux: [matin, soir] }))
    expect(qui(r, 'soi')).toEqual(['b'])
    expect(r.trous).toEqual([
      { poste: 'r', jour: 0, debut: 15 * H, fin: 16 * H },
    ])
  })

  it('un poste hors présence n’a pas de trou : le code imposé reste', () => {
    const horsPresence = [matin, soir, soirLong].map((c) => ({
      ...c,
      presence: null,
    }))
    const r = gen(probleme({ salaries: equipe, creneaux: horsPresence }))
    expect(qui(r, 'soi')).toEqual(['b'])
    expect(r.trous).toEqual([])
  })

  it('une place vide laisse un trou sur toute sa durée', () => {
    const r = gen(probleme({ salaries: [equipe[0]], creneaux: [matin, soir] }))
    expect(r.trous).toEqual([
      { poste: 'r', jour: 0, debut: 15 * H, fin: 23 * H },
    ])
  })

  it('un middle ferme le trou ; un soutien, non', () => {
    const middle = creneau('mid', 0, 12, 20, { effectif: 0, facultatif: 1 })
    const c = personne('c', 8, { shiftsAutorises: new Set(['']) })
    const r = gen(
      probleme({ salaries: [...equipe, c], creneaux: [matin, soir, middle] }),
    )
    expect(qui(r, 'mid')).toEqual(['c'])
    expect(r.trous).toEqual([])
    // Un soutien n'est pas autonome : il ne compte pas. Ici il est posé sur
    // un middle 15 h - 21 h dont la place est tenue par d sur son autre
    // code, 16 h - 22 h : de 15 h à 16 h, il n'y a que le soutien.
    const s = personne('s', 6, {
      postes: new Set(),
      postesSoutien: new Set(['r']),
    })
    const d = personne('d', 6, { shiftsAutorises: new Set(['Y']) })
    const mid = creneau('mid', 0, 15, 21, {
      typeShift: 'X',
      effectif: 0,
      facultatif: 1,
      soutien: 1,
    })
    const midR = creneau('mid-Y', 0, 16, 22, {
      typeShift: 'Y',
      effectif: 0,
      place: 'mid',
    })
    const r2 = gen(
      probleme({
        salaries: [...equipe, s, d],
        creneaux: [matin, soir, mid, midR],
      }),
    )
    expect(qui(r2, 'mid')).toEqual(['s'])
    expect(qui(r2, 'mid-Y')).toEqual(['d'])
    expect(r2.trous).toEqual([
      { poste: 'r', jour: 0, debut: 15 * H, fin: 16 * H },
    ])
  })

  it('la nuit du dimanche, écrite le dimanche, ferme la plage du dimanche', () => {
    const soir6 = creneau('soir6', 6, 15, 23, { presence: 'soir' })
    // « 24:00 → 07:00 » : commence lundi 0 h, écrite dimanche.
    const nuit = creneau('nuit6', 7, 0, 7, { jourPlanning: 6 })
    const r = gen(
      probleme({
        salaries: [
          personne('x', 8),
          personne('y', 7, { nuitInterdite: false }),
        ],
        creneaux: [soir6, nuit],
      }),
    )
    expect(r.manques).toEqual([])
    expect(r.trous).toEqual([
      {
        poste: 'r',
        jour: 6,
        debut: 6 * MINUTES_PAR_JOUR + 23 * H,
        fin: 7 * MINUTES_PAR_JOUR,
      },
    ])
  })
})

describe('cycles : ce que le lot C pose et ce que l’oracle compte', () => {
  it('un M6 posé (imposé) sur le remplaçant tient la place : aucun manque, personne de plus sur le besoin', () => {
    const besoin = creneau('b1', 0, 7, 14, { typeShift: 'M3' })
    const r6 = creneau('r1-M6', 0, 10, 17, {
      typeShift: 'M6',
      place: 'b1',
      effectif: 0,
    })
    for (const graine of graines) {
      const r = gen(
        probleme({
          // b doit 7 h et pourrait tenir M3 : il ne s'ajoute pas.
          salaries: [personne('a', 7), personne('b', 7)],
          creneaux: [besoin, r6],
          imposees: new Set(['a|r1-M6']),
          graine,
        }),
      )
      expect(r.statut).toBe('optimal')
      expect(r.manques).toEqual([])
      expect(qui(r, 'r1-M6')).toEqual(['a'])
      expect(qui(r, 'b1')).toEqual([])
    }
  })

  // Les trois cas de bord de la définition commune (contrat §3) : le
  // générateur et l'oracle (`trous` du vérificateur, `trousDuJour`) disent
  // la même chose.
  const matin = (fin: number, kw: Partial<Creneau> = {}) =>
    creneauModele({
      id: 'mat',
      poste: 'r',
      debut: 7 * H,
      fin,
      presence: 'matin',
      typeShift: 'M',
      ...kw,
    })
  const soirDe = (debut: number) =>
    creneauModele({
      id: 'soi',
      poste: 'r',
      debut,
      fin: 23 * H,
      presence: 'soir',
      typeShift: 'S',
    })
  const deux = [personne('a', 0), personne('b', 0)]

  it('un relais au milieu d’un quart d’heure laisse ce quart compté comme un trou', () => {
    const p = probleme({
      salaries: deux,
      creneaux: [matin(15 * H + 5), soirDe(15 * H + 5)],
    })
    const r = gen(p)
    expect(r.manques).toEqual([])
    const attendu = [{ poste: 'r', jour: 0, debut: 15 * H, fin: 15 * H + 15 }]
    expect(r.trous).toEqual(attendu)
    expect(trousVerifies(p, r.affectations)).toEqual(attendu)
  })

  it('une journée courte qui part avant l’équipe du soir laisse un trou', () => {
    // a fait sa journée étoile (courte, une heure de moins) ce lundi.
    const p = probleme({
      salaries: [
        personne('a', 7, {
          etoileFixe: new Set([0]),
          shiftsAutorises: new Set(['M']),
        }),
        personne('b', 8, { shiftsAutorises: new Set(['S']) }),
      ],
      creneaux: [matin(15 * H, { raccourci: H }), soirDe(15 * H)],
    })
    const r = gen(p)
    expect(r.affectations.find((x) => x.creneauId === 'mat')?.court).toBe(true)
    const attendu = [{ poste: 'r', jour: 0, debut: 14 * H, fin: 15 * H }]
    expect(r.trous).toEqual(attendu)
    expect(trousVerifies(p, r.affectations)).toEqual(attendu)
  })

  it('une plage qui ne commence pas au quart d’heure est coupée à son bord', () => {
    const p = probleme({
      salaries: deux,
      creneaux: [matin(15 * H, { debut: 7 * H + 5 }), soirDe(15 * H + 20)],
    })
    const r = gen(p)
    const attendu = [{ poste: 'r', jour: 0, debut: 15 * H, fin: 15 * H + 30 }]
    expect(r.trous).toEqual(attendu)
    expect(trousVerifies(p, r.affectations)).toEqual(attendu)
  })
})

/*
 * Relecture adverse du 2026-10-30 : un remplaçant d'une AUTRE DURÉE que son
 * besoin ne doit jamais passer devant le code imposé pour des heures de
 * contrat (D13). Avant le correctif, un M6 d'une heure plus long rapportait
 * 60 × 400 = 24 000 d'heures dues contre 2 000 de changement de code : le
 * moteur posait M6 partout, sans motif.
 */
describe('cycles : un remplaçant d’une autre durée, jamais pour des heures', () => {
  /** Lundi à vendredi : besoin M3 (7 h - 14 h) et son remplaçant `code`. */
  const semaine = (code: string, debutH: number, finH: number) =>
    [0, 1, 2, 3, 4].flatMap((j) => [
      creneau(`b${j}`, j, 7, 14, { typeShift: 'M3' }),
      creneau(`r${j}-${code}`, j, debutH, finH, {
        typeShift: code,
        place: `b${j}`,
        effectif: 0,
        facultatif: 0,
        soutien: 0,
      }),
    ])
  const codes = (r: Resultat) => r.affectations.map((a) => a.creneauId).sort()

  it('contrat de 39 h, M3 de 7 h, M6 de 8 h : M3 partout, aucun remplaçant', () => {
    const m6 = semaine('M6', 7, 15)
    for (const graine of graines) {
      const r = gen(
        probleme({ salaries: [personne('a', 39)], creneaux: m6, graine }),
      )
      expect(codes(r)).toEqual(['b0', 'b1', 'b2', 'b3', 'b4'])
      expect(r.manques).toEqual([])
    }
  })

  it('une heure au-dessus du contrat, remplaçant plus court : le code imposé reste', () => {
    // 34 h de contrat, 5 × 7 h = 35 h : un M2 de 6 h ramènerait au contrat
    // (3 000 d'heures en plus épargnés contre 2 000 de changement de code).
    const m2 = semaine('M2', 8, 14)
    for (const graine of graines) {
      const r = gen(
        probleme({ salaries: [personne('a', 34)], creneaux: m2, graine }),
      )
      expect(codes(r)).toEqual(['b0', 'b1', 'b2', 'b3', 'b4'])
    }
  })

  it('M3 impossible le lundi : M6 reste posé, pas de place vide', () => {
    // Fin la veille à 22 h : 9 h avant M3 (7 h), 11 h avant un M6 à 9 h.
    const m6 = semaine('M6', 9, 17)
    const a = personne('a', 39, { finServicePrecedent: -2 * H })
    for (const graine of graines) {
      const p = probleme({ salaries: [a], creneaux: m6, graine })
      const r = gen(p)
      expect(codes(r)).toEqual(['b1', 'b2', 'b3', 'b4', 'r0-M6'])
      expect(r.manques).toEqual([])
      expect(violations(p, r.affectations)).toEqual([])
    }
  })

  it('le manque au contrat ne compte que les heures du besoin', () => {
    // Même semaine, une seule personne : 4 × 7 h + 1 × 8 h. Le manque au
    // contrat (39 h) compte 5 × 7 h = 35 h : 4 h dues, comme avec M3.
    const m6 = semaine('M6', 9, 17)
    const a = personne('a', 39, { finServicePrecedent: -2 * H })
    const r = gen(probleme({ salaries: [a], creneaux: m6 }))
    expect(r.ecartTotalMinutes).toBe(4 * H)
  })
})

/*
 * Calcul en deux temps (`generer`) : d'abord sans les remplaçants non
 * imposés ; le problème avec remplaçants seulement s'il reste une place
 * vide, un minimum manqué, un trou, ou une place à remplaçants tenue en
 * dépannage. `etapes` dit lequel a servi.
 */
describe('cycles : le code exact d’abord, en deux temps', () => {
  const besoin = creneau('b1', 0, 7, 14, { typeShift: 'M3' })
  const r6 = creneau('r1-M6', 0, 10, 17, {
    typeShift: 'M6',
    place: 'b1',
    effectif: 0,
  })
  const r9 = creneau('r1-M9', 0, 8, 15, {
    typeShift: 'M9',
    place: 'b1',
    effectif: 0,
  })
  const remplacants = (r: Resultat, p: Probleme) => {
    const places = new Map(p.creneaux.map((c) => [c.id, c.place]))
    return r.affectations.filter((a) => places.get(a.creneauId) != null)
  }

  it('sans manque : un seul temps, aucun remplaçant, comme sans remplaçant', () => {
    const semaine = [
      ...[1, 2, 3, 4].map((j) => creneau(`m${j}`, j, 7, 14)),
      besoin,
    ]
    const salaries = [personne('a', 35), personne('b', 7)]
    for (const graine of graines) {
      const p = probleme({
        salaries,
        creneaux: [...semaine, r6, r9],
        graine,
      })
      const r = gen(p)
      expect(r.etapes).toBe(1)
      expect(remplacants(r, p)).toEqual([])
      const sans = gen(probleme({ salaries, creneaux: semaine, graine }))
      expect(sans.etapes).toBe(1)
      expect(r.affectations).toEqual(sans.affectations)
      expect(r.manques).toEqual([])
    }
  })

  it('M3 impossible (repos de 11 h) : second temps, M6 posé', () => {
    const a = personne('a', 7, {
      finServicePrecedent: -2 * H,
      shiftsAutorises: new Set(['M3', 'M6']),
    })
    for (const graine of graines) {
      const r = gen(probleme({ salaries: [a], creneaux: [besoin, r6], graine }))
      expect(r.etapes).toBe(2)
      expect(qui(r, 'r1-M6')).toEqual(['a'])
      expect(r.manques).toEqual([])
    }
  })

  it('aucun code possible : second temps, place vide au nom du besoin', () => {
    const a = personne('a', 7, { finServicePrecedent: 0 })
    const r = gen(probleme({ salaries: [a], creneaux: [besoin, r6] }))
    expect(r.etapes).toBe(2)
    expect(r.affectations).toEqual([])
    expect(r.manques).toEqual([{ creneauId: 'b1', manquant: 1 }])
  })

  it('un minimum manqué au premier temps, tenu par un remplaçant : second temps', () => {
    // Place facultative (aucune place vide au premier temps), mais le
    // minimum du matin n'est tenu que par le code voisin.
    const facultatif = { ...besoin, effectif: 0, facultatif: 1 }
    const voisin = { ...r6, presence: 'matin' as const }
    const a = personne('a', 7, { finServicePrecedent: -2 * H })
    const consignes = [
      { jour: 0, periode: 'matin' as const, minimum: 1, maximum: null },
    ]
    for (const graine of graines) {
      const p = probleme({
        salaries: [a],
        creneaux: [{ ...facultatif, presence: 'matin' }, voisin],
        consignes,
        graine,
      })
      const r = gen(p)
      expect(r.etapes).toBe(2)
      expect(qui(r, 'r1-M6')).toEqual(['a'])
      // Le même problème sans le remplaçant laisse le minimum manqué.
      const sans = gen({ ...p, creneaux: [p.creneaux[0]] })
      expect(sans.affectations).toEqual([])
    }
  })

  it('un trou au premier temps, fermé par un remplaçant : second temps', () => {
    const matin = creneau('mat', 0, 7, 15, {
      typeShift: 'M',
      presence: 'matin',
    })
    const soir = creneau('soi', 0, 16, 23, {
      typeShift: 'S1',
      presence: 'soir',
    })
    const soirLong = creneau('soi-S2', 0, 15, 23, {
      typeShift: 'S2',
      presence: 'soir',
      place: 'soi',
      effectif: 0,
    })
    const equipe = [
      personne('a', 8, { shiftsAutorises: new Set(['M']) }),
      personne('b', 7, { shiftsAutorises: new Set(['S1', 'S2']) }),
    ]
    for (const graine of graines) {
      const r = gen(
        probleme({
          salaries: equipe,
          creneaux: [matin, soir, soirLong],
          graine,
        }),
      )
      expect(r.etapes).toBe(2)
      expect(qui(r, 'soi-S2')).toEqual(['b'])
      expect(r.trous).toEqual([])
    }
  })

  it('un remplaçant imposé reste au premier temps, les autres sont retirés', () => {
    for (const graine of graines) {
      const r = gen(
        probleme({
          salaries: [personne('a', 7), personne('b', 7)],
          creneaux: [besoin, r6, r9],
          imposees: new Set(['a|r1-M6']),
          graine,
        }),
      )
      expect(r.etapes).toBe(1)
      expect(r.statut).toBe('optimal')
      expect(r.manques).toEqual([])
      expect(qui(r, 'r1-M6')).toEqual(['a'])
      expect(qui(r, 'b1')).toEqual([])
      expect(qui(r, 'r1-M9')).toEqual([])
    }
  })

  it('une place à remplaçants tenue en dépannage : second temps (D13)', () => {
    const dE = personne('dE', 7, {
      postesOccasionnels: new Set(['r']),
      shiftsAutorises: new Set(['M3']),
    })
    const tR = personne('tR', 7, { shiftsAutorises: new Set(['M6']) })
    for (const graine of graines) {
      const r = gen(
        probleme({ salaries: [dE, tR], creneaux: [besoin, r6, r9], graine }),
      )
      expect(r.etapes).toBe(2)
      expect(qui(r, 'r1-M6')).toEqual(['tR'])
      // Personne pour le code voisin : le dépannage au code imposé reste.
      const seul = gen(
        probleme({ salaries: [dE], creneaux: [besoin, r6, r9], graine }),
      )
      expect(seul.etapes).toBe(2)
      expect(qui(seul, 'b1')).toEqual(['dE'])
    }
  })

  it('un dépannage sur une place SANS remplaçant ne relance rien', () => {
    const dE = personne('dE', 7, { postesOccasionnels: new Set(['r']) })
    const autre = creneau('b2', 1, 7, 14, { typeShift: 'M3' })
    const r = gen(
      probleme({
        // tR tient b1 (sur M3), dE tient b2 en dépannage : b2 n'a pas de
        // remplaçant, le code exact suffit.
        salaries: [personne('tR', 7, { indisponibilites: new Set([1]) }), dE],
        creneaux: [besoin, r6, autre],
      }),
    )
    expect(r.etapes).toBe(1)
    expect(r.manques).toEqual([])
  })
})

/*
 * Relecture adverse du 2026-10-30 (V4b) : quatre défauts confirmés par
 * exécution, un test chacun.
 */
describe('deux temps : résultats sans solution, heures dues, budget', () => {
  const m3 = (j: number) => creneau(`b${j}`, j, 7, 14, { typeShift: 'M3' })
  const m6 = (j: number) =>
    creneau(`r${j}-M6`, j, 9, 16, {
      typeShift: 'M6',
      place: `b${j}`,
      effectif: 0,
    })
  /** Un CDI de 35 h sur cinq M3 ; le lundi, le M3 est interdit (fin la
   * veille à 22 h, repos de 11 h), le M6 (9 h) se peut ; un extra libre. */
  const semaineCdi = () => ({
    salaries: [
      personne('a', 35, { finServicePrecedent: -2 * H }),
      personne('x', 0, { contratIndicatif: true }),
    ],
    creneaux: [0, 1, 2, 3, 4].flatMap((j) => [m3(j), m6(j)]),
  })

  /** Ce que rend HiGHS au temps limite SANS solution : colonnes à zéro,
   * objectif infini. */
  const sansSolution = (lp: string, o?: Record<string, unknown>) => {
    const vrai = highs.solve(lp, o as Record<string, string | number>)
    const Columns: Record<string, { Primal: number }> = {}
    for (const k of Object.keys(vrai.Columns)) Columns[k] = { Primal: 0 }
    return {
      Status: 'Time limit reached',
      ObjectiveValue: Number.POSITIVE_INFINITY,
      Columns,
    }
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('temps limite sans solution au temps 1 : jamais pris pour un planning vide', () => {
    // Le temps 2 atteint lui aussi la limite, AVEC une solution (une place
    // reste vide : deux places en même temps pour une personne). Le planning
    // vide « sans manque » du temps 1 ne doit pas lui être préféré.
    let appels = 0
    const faux: Highs = {
      solve: (lp, o) =>
        appels++ === 0
          ? sansSolution(lp, o)
          : { ...highs.solve(lp, o), Status: 'Time limit reached' },
    }
    const p = probleme({
      salaries: [personne('a', 7)],
      creneaux: [m3(0), m6(0), creneau('c0', 0, 7, 14, { typeShift: 'M3' })],
    })
    const r = generer(p, faux)
    expect(appels).toBe(2)
    expect(r.etapes).toBe(2)
    expect(r.statut).toBe('realisable')
    expect(r.affectations).toHaveLength(1)
    expect(r.manques).toHaveLength(1)
  })

  it('temps limite sans solution, une seule résolution : inconnu', () => {
    const faux: Highs = { solve: sansSolution }
    const r = generer(
      probleme({ salaries: [personne('a', 7)], creneaux: [m3(0)] }),
      faux,
    )
    expect(r.statut).toBe('inconnu')
    // Et aux deux temps : rien de trouvé, rien de rendu comme planning.
    const r2 = generer(
      probleme({ salaries: [personne('a', 7)], creneaux: [m3(0), m6(0)] }),
      faux,
    )
    expect(r2.statut).toBe('inconnu')
  })

  it('heures dues perdues au code imposé : second temps, le CDI prend le M6 (P3 avant P4)', () => {
    for (const graine of graines) {
      const r = gen(probleme({ ...semaineCdi(), graine }))
      expect(r.etapes).toBe(2)
      expect(qui(r, 'r0-M6')).toEqual(['a'])
      expect(qui(r, 'b0')).toEqual([])
      for (const j of [1, 2, 3, 4]) expect(qui(r, `b${j}`)).toEqual(['a'])
      expect(r.manques).toEqual([])
      // Aucun manque d'heures : 35 h faites sur 35 h dues.
      expect(r.ecartTotalMinutes).toBe(0)
    }
  })

  it('un manque d’heures structurel (personne pour céder) ne relance rien', () => {
    // Deux CDI pour cinq shifts : l'un reste sous son contrat quoi qu'il
    // arrive ; aucun extra ne tient de place : le temps 2 n'y gagnerait rien.
    const p = probleme({
      salaries: [personne('a', 35), personne('b', 35)],
      creneaux: [0, 1, 2, 3, 4].flatMap((j) => [m3(j), m6(j)]),
    })
    expect(gen(p).etapes).toBe(1)
  })

  it('budget : le temps 1 n’en prend que sa part, le temps 2 a le reste', () => {
    // Le solveur use tout le temps qu'on lui laisse (horloge simulée).
    let maintenant = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => maintenant)
    const limites: number[] = []
    const lent: Highs = {
      solve: (lp, o) => {
        const t = Number(o?.time_limit)
        limites.push(t)
        maintenant += t * 1000
        return highs.solve(lp, o)
      },
    }
    const budget = 4
    const r = generer(
      { ...probleme({ ...semaineCdi(), graine: 1 }), tempsMaxSecondes: budget },
      lent,
    )
    expect(limites).toHaveLength(2)
    expect(limites[0]).toBeLessThanOrEqual(budget * PART_TEMPS_1)
    expect(limites[1]).toBeCloseTo(budget - limites[0], 6)
    expect(r.etapes).toBe(2)
    expect(r.manques).toEqual([])
    expect(qui(r, 'r0-M6')).toEqual(['a'])
  })

  it('temps 1 au temps limite (sans optimum prouvé) : problème complet ensuite', () => {
    let appels = 0
    const lps: string[] = []
    const faux: Highs = {
      solve: (lp, o) => {
        lps.push(lp)
        const r = highs.solve(lp, o)
        return appels++ === 0 ? { ...r, Status: 'Time limit reached' } : r
      },
    }
    // Sans manque ni dépannage : un optimum au temps 1 s'arrêterait là.
    const p = probleme({
      salaries: [personne('a', 7)],
      creneaux: [m3(0), m6(0)],
    })
    const r = generer(p, faux)
    expect(appels).toBe(2)
    // Le second modèle porte le remplaçant (des variables de plus).
    expect(lps[1].length).toBeGreaterThan(lps[0].length)
    expect(r.etapes).toBe(2)
    expect(r.manques).toEqual([])
  })

  it('remplaçant fait court : heures dues sur ses minutes réelles', () => {
    const besoin = creneau('b', 0, 7, 14, { typeShift: 'M3' })
    const long = creneau('r', 0, 9, 17, {
      typeShift: 'M6',
      place: 'b',
      effectif: 0,
      raccourci: H,
    })
    // M6 de 8 h fait en 7 h sur un M3 de 7 h : 7 h comptées, pas 6.
    expect(minutesDuesCourt(long, besoin)).toBe(7 * H)
    expect(minutesEnPlusCourt(long, besoin)).toBe(7 * H)
    expect(minutesDues(long, besoin)).toBe(7 * H)
    expect(minutesEnPlus(long, besoin)).toBe(8 * H)
    // Sans remplaçant : le raccourci seul.
    const seul = { ...long, place: null }
    expect(minutesDuesCourt(seul)).toBe(7 * H)
    expect(minutesEnPlusCourt(seul)).toBe(7 * H)
    // Dans le modèle : le CDI de 7 h, M3 interdit, M6 obligatoirement
    // court (7 h par jour au plus) : aucun écart au contrat.
    const a = personne('a', 7, {
      finServicePrecedent: -2 * H,
      minutesJourMax: 7 * H,
    })
    for (const graine of graines) {
      const r = gen(
        probleme({ salaries: [a], creneaux: [besoin, long], graine }),
      )
      expect(qui(r, 'r')).toEqual(['a'])
      expect(r.affectations[0].court).toBe(true)
      expect(r.ecartTotalMinutes).toBe(0)
    }
  })
})
