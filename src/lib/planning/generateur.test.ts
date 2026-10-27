import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import { generer, type Highs } from '#/lib/planning/generateur.ts'
import {
  cle,
  creneau as creneauModele,
  probleme,
  salarieSolveur,
  type AffectationSolveur,
  type Creneau,
  type Probleme,
  type Resultat,
  type SalarieSolveur,
} from '#/lib/planning/modele.ts'
import { MINUTES_PAR_JOUR } from '#/lib/planning/temps.ts'
import {
  manquants,
  raisonsBlocage,
  violations,
} from '#/lib/planning/verificateur.ts'

/*
 * Port de `backend/tests/test_generateur.py` (prototype) : le moteur (ici
 * HiGHS) jugé par le vérificateur, avec les valeurs attendues du prototype.
 */

const H = 60

let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

const gen = (p: Probleme) => generer(p, highs)
/** `Resultat.complet` du prototype. */
const complet = (r: Resultat) =>
  r.statut !== 'inconnu' && r.manques.length === 0

function creneau(
  id: string,
  poste: string,
  jour: number,
  debutH: number,
  finH: number,
): Creneau {
  const base = jour * MINUTES_PAR_JOUR
  return creneauModele({
    id,
    poste,
    debut: base + debutH * H,
    fin: base + finH * H,
  })
}

function receptionniste(
  id: string,
  contratH = 35,
  kw: Partial<SalarieSolveur> = {},
): SalarieSolveur {
  return salarieSolveur({
    id,
    postes: new Set(['reception']),
    minutesHebdoContrat: contratH * H,
    minutesHebdoMax: 48 * H,
    minutesJourMax: 12 * H,
    joursTravaillesMaxSemaine: 5,
    reposQuotidienMin: 11 * H,
    ...kw,
  })
}

const aff = (
  salarieId: string,
  creneauId: string,
  court = false,
): AffectationSolveur => ({
  salarieId,
  creneauId,
  court,
})

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

function semaineReception(): Creneau[] {
  return range(7).flatMap((j) => [
    creneau(`matin-${j}`, 'reception', j, 7, 15),
    creneau(`soir-${j}`, 'reception', j, 15, 23),
  ])
}

const pris = (r: Resultat) => new Set(r.affectations.map((a) => a.creneauId))
const reglesDe = (p: Probleme, a: AffectationSolveur[]) =>
  new Set(violations(p, a).map((v) => v.regle))

describe('générateur', () => {
  it('une semaine de réception respecte toutes les règles', () => {
    const p = probleme({
      salaries: range(4).map((i) => receptionniste(`r${i}`)),
      creneaux: semaineReception(),
    })
    const r = gen(p)
    expect(['optimal', 'realisable']).toContain(r.statut)
    expect(complet(r)).toBe(true)
    expect(violations(p, r.affectations)).toEqual([])
  })

  it('trop peu de monde laisse des trous mais reste légal', () => {
    const p = probleme({
      salaries: [receptionniste('r0'), receptionniste('r1')],
      creneaux: semaineReception(),
    })
    const r = gen(p)
    expect(complet(r)).toBe(false)
    expect(r.manques.reduce((t, m) => t + m.manquant, 0)).toBe(4)
    expect(manquants(p, r.affectations)).toEqual(
      new Map(r.manques.map((m) => [m.creneauId, m.manquant])),
    )
    expect(violations(p, r.affectations)).toEqual([])
  })

  it('pas de matin après un soir', () => {
    const creneaux = [
      creneau('soir-0', 'reception', 0, 15, 23),
      creneau('matin-1', 'reception', 1, 7, 15),
    ]
    const seul = probleme({ salaries: [receptionniste('r0')], creneaux })
    let r = gen(seul)
    expect(r.manques.length).toBe(1)
    const vide = r.manques[0].creneauId
    const regles = new Set(
      raisonsBlocage(seul, r.affectations, vide)
        .get('r0')!
        .map((v) => v.regle),
    )
    expect(regles).toEqual(new Set(['R-REPOS-QUOTIDIEN']))

    const duo = probleme({
      salaries: [receptionniste('r0'), receptionniste('r1')],
      creneaux,
    })
    r = gen(duo)
    expect(violations(duo, r.affectations)).toEqual([])
  })

  it('les postes et les indisponibilités sont respectés', () => {
    const p = probleme({
      salaries: [
        receptionniste('r0', 35, { indisponibilites: new Set([0]) }),
        receptionniste('r1'),
        receptionniste('e0', 35, { postes: new Set(['etages']) }),
      ],
      creneaux: [
        creneau('matin-0', 'reception', 0, 7, 15),
        creneau('menage-0', 'etages', 0, 8, 12),
      ],
    })
    const r = gen(p)
    expect(
      new Set(r.affectations.map((a) => `${a.salarieId}|${a.creneauId}`)),
    ).toEqual(new Set(['r1|matin-0', 'e0|menage-0']))
  })

  it('le volume horaire suit le contrat', () => {
    const creneaux = range(6).map((j) =>
      creneauModele({
        id: `c-${j}`,
        poste: 'reception',
        debut: j * MINUTES_PAR_JOUR + 7 * H,
        fin: j * MINUTES_PAR_JOUR + 14 * H,
        effectif: j < 2 ? 2 : 1,
      }),
    )
    const p = probleme({
      salaries: [receptionniste('plein', 35), receptionniste('partiel', 21)],
      creneaux,
    })
    const r = gen(p)
    const compte: Record<string, number> = { plein: 0, partiel: 0 }
    for (const a of r.affectations) compte[a.salarieId] += 1
    expect(compte).toEqual({ plein: 5, partiel: 3 })
    expect(r.ecartTotalMinutes).toBe(0)
    expect(violations(p, r.affectations)).toEqual([])
  })

  it('un mineur ne travaille pas la nuit et a deux jours de repos consécutifs', () => {
    const nuits = range(7).map((j) =>
      creneau(`nuit-${j}`, 'reception', j, 23, 30),
    )
    const matins = range(7).map((j) =>
      creneau(`matin-${j}`, 'reception', j, 8, 14),
    )
    const mineur = receptionniste('m0', 35, {
      reposConsecutifs: true,
      nuitInterdite: true,
    })
    const p = probleme({ salaries: [mineur], creneaux: [...nuits, ...matins] })
    const r = gen(p)
    const tenus = pris(r)
    expect(tenus.size).toBeGreaterThan(0)
    expect([...tenus].every((c) => c.startsWith('matin'))).toBe(true)
    expect(violations(p, r.affectations)).toEqual([])

    const illegal = ['nuit-0', 'matin-2', 'matin-4', 'matin-6'].map((c) =>
      aff('m0', c),
    )
    const regles = reglesDe(p, illegal)
    expect(regles.has('R-NUIT-MINEUR')).toBe(true)
    expect(regles.has('R-REPOS-HEBDO-MINEUR')).toBe(true)
  })

  it('deux graines peuvent donner deux plannings aussi bons', () => {
    const p = probleme({
      salaries: range(4).map((i) => receptionniste(`r${i}`)),
      creneaux: semaineReception(),
    })
    const a = gen(p)
    const b = gen({ ...p, graine: 7 })
    expect(complet(a) && complet(b)).toBe(true)
    expect(violations(p, b.affectations)).toEqual([])
  })

  it('39 heures : quatre jours de 8 h et un jour court, pause déduite', () => {
    const matins = range(5).map((j) =>
      creneauModele({
        id: `m${j}`,
        poste: 'reception',
        debut: j * MINUTES_PAR_JOUR + 7 * H,
        fin: j * MINUTES_PAR_JOUR + 15 * H + 45,
        pause: 45,
        raccourci: H,
      }),
    )
    const p = probleme({
      salaries: [receptionniste('r0', 39)],
      creneaux: matins,
    })
    const r = gen(p)
    expect(complet(r)).toBe(true)
    expect(r.affectations.filter((a) => a.court).length).toBe(1)
    expect(r.ecartTotalMinutes).toBe(0)

    const longs = range(5).map((j) =>
      creneauModele({
        id: `l${j}`,
        poste: 'reception',
        debut: j * MINUTES_PAR_JOUR + 7 * H,
        fin: j * MINUTES_PAR_JOUR + 16 * H + 45,
        pause: 45,
      }),
    )
    const plafond = receptionniste('r0', 35, { minutesHebdoMax: 45 * H })
    const affs = longs.map((c) => aff('r0', c.id))
    expect(
      violations(probleme({ salaries: [plafond], creneaux: longs }), affs),
    ).toEqual([])
    const sansPause = longs.map((c) =>
      creneauModele({ id: c.id, poste: c.poste, debut: c.debut, fin: c.fin }),
    )
    expect(
      reglesDe(probleme({ salaries: [plafond], creneaux: sansPause }), affs),
    ).toEqual(new Set(['R-SEMAINE-MAX']))
  })

  it('le middle facultatif est rempli seulement s’il manque des heures', () => {
    const matin = creneau('matin', 'reception', 0, 7, 15)
    const middle = creneauModele({
      id: 'middle',
      poste: 'reception',
      debut: MINUTES_PAR_JOUR + 9 * H,
      fin: MINUTES_PAR_JOUR + 17 * H,
      effectif: 0,
      facultatif: 1,
    })
    const cas: Array<[number, string[]]> = [
      [16, ['matin', 'middle']],
      [8, ['matin']],
    ]
    for (const [contratH, attendu] of cas) {
      const p = probleme({
        salaries: [receptionniste('r0', contratH)],
        creneaux: [matin, middle],
      })
      const r = gen(p)
      expect(complet(r)).toBe(true)
      expect(pris(r)).toEqual(new Set(attendu))
      expect(violations(p, r.affectations)).toEqual([])
    }

    const deux = [receptionniste('r0'), receptionniste('r1')]
    const affs = [aff('r0', 'middle'), aff('r1', 'middle')]
    expect(
      reglesDe(probleme({ salaries: deux, creneaux: [middle] }), affs),
    ).toEqual(new Set(['SUREFFECTIF']))
  })

  it('repos de 11 h avec la semaine précédente', () => {
    const veille = receptionniste('r1', 35, { finServicePrecedent: -1 * H })
    const matin = creneau('matin', 'reception', 0, 7, 15)
    const soir = creneau('soir', 'reception', 0, 15, 23)

    expect(
      gen(probleme({ salaries: [veille], creneaux: [matin] })).affectations,
    ).toEqual([])
    expect(
      gen(probleme({ salaries: [veille], creneaux: [soir] })).affectations,
    ).toEqual([aff('r1', 'soir')])

    const p = probleme({ salaries: [veille], creneaux: [matin, soir] })
    expect(violations(p, [aff('r1', 'soir')])).toEqual([])
    expect(violations(p, [aff('r1', 'matin')]).map((v) => v.regle)).toEqual([
      'R-REPOS-QUOTIDIEN',
    ])
  })

  it('repos de 11 h avant la semaine suivante', () => {
    const lendemain = receptionniste('r1', 35, {
      debutServiceSuivant: 7 * MINUTES_PAR_JOUR + 7 * H,
    })
    const soir = creneau('soir', 'reception', 6, 15, 23)
    const matin = creneau('matin', 'reception', 6, 7, 15)
    const p = probleme({ salaries: [lendemain], creneaux: [soir, matin] })
    expect(gen(p).affectations).toEqual([aff('r1', 'matin')])
    expect(violations(p, [aff('r1', 'soir')]).map((v) => v.regle)).toEqual([
      'R-REPOS-QUOTIDIEN',
    ])
  })

  const base39 = {
    postes: new Set(['reception']),
    minutesHebdoContrat: 39 * H,
    minutesHebdoMax: 48 * H,
    minutesJourMax: 12 * H,
    joursTravaillesMaxSemaine: 5,
    reposQuotidienMin: 11 * H,
    journeesCourtesMax: 1 as number | null,
    journeePleine: 8 * H,
  }

  it('journée étoile : une seule par semaine', () => {
    const courts = range(4).map((j) =>
      creneau(`court-${j}`, 'reception', j, 15, 22),
    )
    const pleins = [4, 5, 6].map((j) =>
      creneau(`plein-${j}`, 'reception', j, 7, 15),
    )
    const idsCourts = new Set(courts.map((c) => c.id))
    const tenusPar = (s: SalarieSolveur): [Probleme, Set<string>] => {
      const p = probleme({ salaries: [s], creneaux: [...courts, ...pleins] })
      return [p, pris(gen(p))]
    }

    const [p, tenus] = tenusPar(salarieSolveur({ id: 'a', ...base39 }))
    expect([...tenus].filter((c) => idsCourts.has(c)).length).toBe(1)
    for (const c of pleins) expect(tenus.has(c.id)).toBe(true)
    expect(
      violations(
        p,
        [...tenus].map((c) => aff('a', c)),
      ),
    ).toEqual([])

    const libre = salarieSolveur({
      id: 'a',
      ...base39,
      journeesCourtesMax: null,
    })
    const [pLibre, tenusLibre] = tenusPar(libre)
    expect([...tenusLibre].filter((c) => idsCourts.has(c)).length).toBe(2)

    const deux = courts.slice(0, 2).map((c) => aff('a', c.id))
    expect(reglesDe(p, deux)).toEqual(new Set(['R-JOURNEE-ETOILE']))
    expect(violations(pLibre, deux)).toEqual([])
  })

  it('un shift posé à la main hors des besoins reste fermé', () => {
    const pose = creneauModele({
      id: 'a1',
      poste: 'reception',
      debut: 12 * H,
      fin: 19 * H,
      ferme: true,
    })
    const apprentie = receptionniste('app', 35, {
      postes: new Set(),
      postesSoutien: new Set(['reception']),
    })
    const p = probleme({
      salaries: [apprentie, receptionniste('r0')],
      creneaux: [pose],
      imposees: new Set([cle('app', 'a1')]),
    })
    const r = gen(p)
    expect(
      new Set(r.affectations.map((a) => `${a.salarieId}|${a.creneauId}`)),
    ).toEqual(new Set(['app|a1']))
    expect(r.manques).toEqual([])
  })

  it('repos accolés de préférence, mais les besoins d’abord', () => {
    let p = probleme({
      salaries: [receptionniste('r0')],
      creneaux: range(7).map((j) =>
        creneau(`soir-${j}`, 'reception', j, 15, 22),
      ),
    })
    const jours = new Set(
      gen(p).affectations.map((a) => Number(a.creneauId.split('-')[1])),
    )
    const libres = range(7).filter((j) => !jours.has(j))
    expect(libres.length).toBe(2)
    expect(libres[1] - libres[0]).toBe(1)

    p = probleme({
      salaries: [receptionniste('r0')],
      creneaux: [0, 1, 2, 4, 5].map((j) =>
        creneau(`soir-${j}`, 'reception', j, 15, 22),
      ),
    })
    const r = gen(p)
    expect(complet(r)).toBe(true)
    expect(r.affectations.length).toBe(5)
  })

  it('journée étoile fixée un jour', () => {
    const jours = range(5).map((j) =>
      creneauModele({
        id: `j${j}`,
        poste: 'reception',
        debut: j * MINUTES_PAR_JOUR + 8 * H,
        fin: j * MINUTES_PAR_JOUR + 16 * H + 45,
        pause: 45,
        raccourci: 60,
      }),
    )
    for (const fixe of [4, 1]) {
      const p = probleme({
        salaries: [
          salarieSolveur({ id: 't', etoileFixe: new Set([fixe]), ...base39 }),
        ],
        creneaux: jours,
      })
      const r = gen(p)
      const courts = new Set(
        r.affectations.filter((a) => a.court).map((a) => a.creneauId),
      )
      expect(courts).toEqual(new Set([`j${fixe}`]))
      expect(r.affectations.length).toBe(5)
    }

    const plein = creneauModele({
      id: 'v',
      poste: 'reception',
      debut: 4 * MINUTES_PAR_JOUR + 8 * H,
      fin: 4 * MINUTES_PAR_JOUR + 16 * H + 45,
      pause: 45,
    })
    const p = probleme({
      salaries: [
        salarieSolveur({ id: 't', etoileFixe: new Set([4]), ...base39 }),
      ],
      creneaux: [plein],
    })
    expect(reglesDe(p, [aff('t', 'v')])).toEqual(new Set(['R-JOURNEE-ETOILE']))
  })

  it('repos hebdomadaire de 35 h consécutives', () => {
    const s = receptionniste('r0', 43, {
      joursTravaillesMaxSemaine: 6,
      reposHebdoMin: 35 * H,
    })
    const matins = [2, 3, 4, 5, 6].map((j) =>
      creneau(`matin-${j}`, 'reception', j, 7, 14),
    )
    const soir = creneauModele({
      id: 'soir-0',
      poste: 'reception',
      debut: 15 * H + 15,
      fin: 23 * H + 15,
    })
    const matin = creneau('matin-0', 'reception', 0, 7, 14)
    const p = probleme({
      salaries: [s],
      creneaux: [...matins, soir, matin],
      imposees: new Set(matins.map((c) => cle('r0', c.id))),
    })
    const r = gen(p)
    const tenus = pris(r)
    expect(tenus.has('matin-0')).toBe(true)
    expect(tenus.has('soir-0')).toBe(false)
    expect(violations(p, r.affectations)).toEqual([])

    const fixes = matins.map((c) => aff('r0', c.id))
    expect(reglesDe(p, [...fixes, aff('r0', 'soir-0')])).toEqual(
      new Set(['R-REPOS-HEBDO-35H']),
    )
    expect(violations(p, fixes)).toEqual([])
    const sans = probleme({
      salaries: [receptionniste('r0', 35, { joursTravaillesMaxSemaine: 6 })],
      creneaux: p.creneaux,
    })
    expect(violations(sans, [...fixes, aff('r0', 'soir-0')])).toEqual([])
  })

  const sixJours = (kw: Partial<SalarieSolveur> = {}) =>
    receptionniste(kw.id ?? 'r0', 35, {
      joursTravaillesMaxSemaine: 6,
      joursPreferesSemaine: 5,
      reposDeuxSemaines: 3,
      ...kw,
    })
  const soirs = () =>
    range(7).map((j) => creneau(`soir-${j}`, 'reception', j, 15, 22))

  it('six jours pour couvrir un trou, jamais sept', () => {
    const p = probleme({ salaries: [sixJours()], creneaux: soirs() })
    const r = gen(p)
    expect(r.affectations.length).toBe(6)
    expect(reglesDe(p, r.affectations)).toEqual(new Set(['SIXIEME-JOUR']))
    const sept = p.creneaux.map((c) => aff('r0', c.id))
    expect(reglesDe(p, sept).has('R-SIX-JOURS-MAX')).toBe(true)
  })

  it('cinq jours de préférence', () => {
    const p = probleme({
      salaries: [sixJours(), sixJours({ id: 'r1' })],
      creneaux: soirs(),
    })
    const r = gen(p)
    const parPersonne = new Map<string, number>()
    for (const a of r.affectations) {
      parPersonne.set(a.salarieId, (parPersonne.get(a.salarieId) ?? 0) + 1)
    }
    expect(complet(r)).toBe(true)
    expect(Math.max(...parPersonne.values())).toBeLessThanOrEqual(5)
  })

  it('trois jours de repos sur deux semaines', () => {
    const s = soirs()
    const p = probleme({
      salaries: [sixJours({ joursSemainePrecedente: 6 })],
      creneaux: s,
    })
    expect(gen(p).affectations.length).toBe(5)
    const six = s.slice(0, 6).map((c) => aff('r0', c.id))
    expect(reglesDe(p, six).has('R-REPOS-HEBDO-HCR')).toBe(true)
    const apresCinq = probleme({
      salaries: [sixJours({ joursSemainePrecedente: 5 })],
      creneaux: s,
    })
    expect(reglesDe(apresCinq, six).has('R-REPOS-HEBDO-HCR')).toBe(false)
  })
})
