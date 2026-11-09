import fc from 'fast-check'
import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import { construire, generer } from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import {
  cle,
  creneau as creneauModele,
  probleme,
  salarieSolveur,
} from '#/lib/planning/modele.ts'
import type {
  AffectationSolveur,
  Creneau,
  Probleme,
  Resultat,
  SalarieSolveur,
} from '#/lib/planning/modele.ts'
import { REGLES_PAR_DEFAUT } from '#/lib/planning/reglesEtablissement.ts'
import { MINUTES_PAR_JOUR } from '#/lib/planning/temps.ts'
import {
  manquants,
  raisonsBlocage,
  REGLES_MORALES,
  trous as trousVerifies,
  violations,
} from '#/lib/planning/verificateur.ts'
import { SANS_RYTHME_STRICT } from '#/lib/planning/test/reglesTest.ts'

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

/** Version étoile d'un besoin (2026-11-02) : la même place (`place`), une
 * fin avancée de `moins` minutes, marquée `etoile` (aucun coût de
 * remplaçant, ses vraies minutes). */
function versionEtoile(b: Creneau, id: string, moins: number): Creneau {
  return {
    ...b,
    id,
    fin: b.fin - moins,
    effectif: 0,
    facultatif: 0,
    soutien: 0,
    place: b.id,
    etoile: true,
  }
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

const aff = (salarieId: string, creneauId: string): AffectationSolveur => ({
  salarieId,
  creneauId,
})

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

function semaineReception(): Creneau[] {
  return range(7).flatMap((j) => [
    creneau(`matin-${j}`, 'reception', j, 7, 15),
    creneau(`soir-${j}`, 'reception', j, 15, 23),
  ])
}

/** La loi et l'organisation, sans les règles morales du PRD : celles-ci
 * se départagent entre personnes (un jour seul pour l'un, une paire de
 * repos perdue pour l'autre) et ont leurs propres tests
 * (`reglesMorales.test.ts`). */
const horsMorales = (p: Probleme, a: AffectationSolveur[]) =>
  violations(p, a).filter((v) => !REGLES_MORALES.has(v.regle))

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
    expect(horsMorales(p, r.affectations)).toEqual([])
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
    expect(horsMorales(p, r.affectations)).toEqual([])
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
    expect(horsMorales(p, b.affectations)).toEqual([])
  })

  it('39 heures : quatre jours de 8 h et un jour court, pause déduite', () => {
    // Journée étoile sur un horaire qui existe (2026-11-02) : chaque matin de
    // 8 h a sa version étoile de 7 h (`etoile`, même place).
    const matins = range(5).map((j) =>
      creneauModele({
        id: `m${j}`,
        poste: 'reception',
        debut: j * MINUTES_PAR_JOUR + 7 * H,
        fin: j * MINUTES_PAR_JOUR + 15 * H + 45,
        pause: 45,
      }),
    )
    const versions = matins.map((m, j) => versionEtoile(m, `e${j}`, H))
    const p = probleme({
      salaries: [receptionniste('r0', 39)],
      creneaux: [...matins, ...versions],
    })
    const r = gen(p)
    expect(complet(r)).toBe(true)
    expect(r.affectations.filter((a) => a.creneauId[0] === 'e').length).toBe(1)
    expect(r.affectations.length).toBe(5)
    expect(r.ecartTotalMinutes).toBe(0)
    // Sans version étoile, 39 h ne se font pas en 5 jours de 8 h : 1 h en plus.
    const sans = gen(
      probleme({ salaries: [receptionniste('r0', 39)], creneaux: matins }),
    )
    expect(sans.ecartTotalMinutes).toBe(H)

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
      // La journée étoile seule : sans le rythme 5 et 2 strict, qui ne
      // laisse pas trois repos entre le jour court et les jours pleins.
      const p = probleme({
        salaries: [s],
        creneaux: [...courts, ...pleins],
        regles: SANS_RYTHME_STRICT,
      })
      return [p, pris(gen(p))]
    }

    const [p, tenus] = tenusPar(salarieSolveur({ id: 'a', ...base39 }))
    expect([...tenus].filter((c) => idsCourts.has(c)).length).toBe(1)
    for (const c of pleins) expect(tenus.has(c.id)).toBe(true)
    // La loi ; le jour seul entre deux repos choisis n'est qu'une alerte.
    expect(
      violations(
        p,
        [...tenus].map((c) => aff('a', c)),
      ).filter((v) => !REGLES_MORALES.has(v.regle)),
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

  // La règle seule, sans le rythme 5 et 2 strict (2026-11-09), qui garde
  // ici moins de soirs (`rythmeStrict.test.ts`).
  it('deux repos de suite, avant les besoins (2026-11-04)', () => {
    let p = probleme({
      salaries: [receptionniste('r0')],
      creneaux: range(7).map((j) =>
        creneau(`soir-${j}`, 'reception', j, 15, 22),
      ),
      regles: SANS_RYTHME_STRICT,
    })
    const jours = new Set(
      gen(p).affectations.map((a) => Number(a.creneauId.split('-')[1])),
    )
    const libres = range(7).filter((j) => !jours.has(j))
    expect(libres.length).toBe(2)
    expect(libres[1] - libres[0]).toBe(1)

    // Cinq soirs les lundi, mardi, mercredi, vendredi et samedi : les tenir
    // tous laisserait le jeudi et le dimanche, deux repos séparés. Un soir
    // reste vide, et c'est dit (décision d'une responsable : « si je dois
    // avoir des trous dans mes besoins, tu me dis »).
    p = probleme({
      salaries: [receptionniste('r0')],
      creneaux: [0, 1, 2, 4, 5].map((j) =>
        creneau(`soir-${j}`, 'reception', j, 15, 22),
      ),
      regles: SANS_RYTHME_STRICT,
    })
    const r = gen(p)
    expect(r.affectations.length).toBe(4)
    const tenus = new Set(
      r.affectations.map((a) => Number(a.creneauId.split('-')[1])),
    )
    expect(range(6).some((j) => !tenus.has(j) && !tenus.has(j + 1))).toBe(true)
    const [vide] = r.manques.map((m) => m.creneauId)
    expect(
      raisonsBlocage(p, r.affectations, vide)
        .get('r0')!
        .map((v) => v.regle),
    ).toContain('REPOS-SEPARES')
  })

  it('journée étoile fixée un jour', () => {
    const jours = range(5).map((j) =>
      creneauModele({
        id: `j${j}`,
        poste: 'reception',
        debut: j * MINUTES_PAR_JOUR + 8 * H,
        fin: j * MINUTES_PAR_JOUR + 16 * H + 45,
        pause: 45,
      }),
    )
    const versions = jours.map((c, j) => versionEtoile(c, `e${j}`, H))
    for (const fixe of [4, 1]) {
      const p = probleme({
        salaries: [
          salarieSolveur({ id: 't', etoileFixe: new Set([fixe]), ...base39 }),
        ],
        creneaux: [...jours, ...versions],
      })
      const r = gen(p)
      const etoiles = new Set(
        r.affectations
          .filter((a) => a.creneauId[0] === 'e')
          .map((a) => a.creneauId),
      )
      expect(etoiles).toEqual(new Set([`e${fixe}`]))
      expect(r.affectations.length).toBe(5)
      expect(violations(p, r.affectations)).toEqual([])
    }
    // Refusé : le jour fixé n'a aucune version étoile, il n'est pas
    // travaillé (jamais d'horaire de 8 h ce jour-là, contrainte dure).
    const sansVersion = probleme({
      salaries: [
        salarieSolveur({ id: 't', etoileFixe: new Set([4]), ...base39 }),
      ],
      creneaux: [...jours, ...versions.filter((c) => c.id !== 'e4')],
    })
    const r = gen(sansVersion)
    expect(pris(r).has('j4')).toBe(false)
    expect(pris(r).has('e4')).toBe(false)

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
    // Depuis le 2026-11-04, le lundi et le mardi restent libres : deux repos
    // de suite, qui couvrent le repos de 35 h. Ni le soir qui l'aurait
    // coupé, ni le matin.
    expect(tenus.has('matin-0')).toBe(false)
    expect(tenus.has('soir-0')).toBe(false)
    expect(violations(p, r.affectations)).toEqual([])

    const fixes = matins.map((c) => aff('r0', c.id))
    // Six jours : sans deux repos de suite non plus (2026-11-04), ni le
    // rythme 5 et 2 (2026-11-09 : un repos seul, dit « manque de
    // personnel » depuis le même jour).
    expect(reglesDe(p, [...fixes, aff('r0', 'soir-0')])).toEqual(
      new Set(['R-REPOS-HEBDO-35H', 'REPOS-SEPARES', 'RYTHME-REPOS-SEUL']),
    )
    expect(violations(p, fixes)).toEqual([])
    const sans = probleme({
      salaries: [receptionniste('r0', 35, { joursTravaillesMaxSemaine: 6 })],
      creneaux: p.creneaux,
    })
    expect(
      violations(sans, [...fixes, aff('r0', 'soir-0')]).filter(
        (v) => !REGLES_MORALES.has(v.regle),
      ),
    ).toEqual([])
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

  it('cinq jours et deux repos de suite, même avec un trou ; jamais sept', () => {
    // Avant le 2026-11-04 : six jours pour couvrir un trou. Les deux repos
    // de suite passent désormais avant la place.
    const p = probleme({ salaries: [sixJours()], creneaux: soirs() })
    const r = gen(p)
    expect(r.affectations.length).toBe(5)
    expect(reglesDe(p, r.affectations)).toEqual(new Set())
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

/*
 * Cycles (plan planning-cycles-2026-10-30, vague 1, lot B) : sans créneau
 * remplaçant, sans consigne et sans poste compté dans la présence, le modèle
 * écrit est OCTET POUR OCTET celui d'avant la vague (empreinte relevée sur le
 * commit 7e9a566, avant toute modification du générateur). Le même modèle
 * donne la même solution : rien ne bouge pour une semaine sans cycles.
 */
/** Empreinte du modèle avec le rythme 5 et 2 strict (le défaut). */
const EMPREINTE_STRICT = '15e530ae'

describe('sans remplaçant, consigne ni présence : le modèle d’avant', () => {
  /** FNV-1a 32 bits, assez pour reconnaître un texte. */
  const empreinte = (texte: string) => {
    let h = 0x811c9dc5
    for (let i = 0; i < texte.length; i++) {
      h ^= texte.charCodeAt(i)
      h = Math.imul(h, 0x01000193) >>> 0
    }
    return h.toString(16).padStart(8, '0')
  }

  // Rythme 5 et 2 strict (2026-11-09) : réglage à non, le modèle d'avant au
  // caractère près ; à oui, une empreinte relevée à part (plus bas).
  const textesLp = (strict: boolean) => {
    const arbSalarie = fc.record({
      contratH: fc.integer({ min: 0, max: 39 }),
      depannage: fc.boolean(),
      soutien: fc.boolean(),
      deuxPostes: fc.boolean(),
      absents: fc.subarray([0, 1, 2, 3, 4, 5, 6]),
      reposHebdo: fc.boolean(),
      groupe: fc.boolean(),
      soirs: fc.integer({ min: 0, max: 5 }),
      fixe: fc.subarray([0, 1, 2, 3, 4, 5, 6]),
    })
    const arbCreneau = fc.record({
      poste: fc.constantFrom('reception', 'club'),
      jour: fc.integer({ min: 0, max: 6 }),
      debutH: fc.integer({ min: 5, max: 16 }),
      dureeH: fc.integer({ min: 3, max: 10 }),
      effectif: fc.integer({ min: 0, max: 2 }),
      facultatif: fc.integer({ min: 0, max: 1 }),
      soutien: fc.integer({ min: 0, max: 1 }),
    })
    // Empreinte relevée de nouveau le 2026-11-01 : le poids des repos
    // accolés (POIDS_REPOS_SEPARES 1 000 → 8 000) et le rythme de 5 jours
    // d'un contrat de 35 h ou plus (POIDS_JOUR_MANQUANT) ; le reste du modèle
    // est le même. Relevée encore le 2026-11-02 : plus de raccourci (les
    // créneaux tirés n'en ont plus, ni le modèle de variable « court »).
    const textes: string[] = []
    fc.assert(
      fc.property(
        fc.array(arbSalarie, { minLength: 1, maxLength: 4 }),
        fc.array(arbCreneau, { minLength: 1, maxLength: 10 }),
        fc.integer({ min: 0, max: 1000 }),
        (gens, places, graine) => {
          const salaries = gens.map((g, i) =>
            receptionniste(`s${i}`, g.contratH, {
              postes: g.soutien
                ? new Set()
                : new Set(g.deuxPostes ? ['reception', 'club'] : ['reception']),
              postesSoutien: g.soutien ? new Set(['reception']) : new Set(),
              postesOccasionnels:
                g.depannage && g.deuxPostes ? new Set(['club']) : new Set(),
              indisponibilites: new Set(g.absents),
              reposHebdoMin: g.reposHebdo ? 35 * H : 0,
              groupeEquite: g.groupe ? 'reception' : null,
              travailFixe: new Set(g.fixe),
              equiteAvant: { weekends: 1, soirs: g.soirs, matinsTot: 0 },
            }),
          )
          const creneaux = places.map((c, i) => ({
            ...creneau(`c${i}`, c.poste, c.jour, c.debutH, c.debutH + c.dureeH),
            effectif: c.effectif,
            facultatif: c.facultatif,
            soutien: c.soutien,
            soir: c.debutH >= 13,
          }))
          textes.push(
            construire(
              probleme({
                salaries,
                creneaux,
                graine,
                regles: {
                  ...REGLES_PAR_DEFAUT,
                  repos: { ...REGLES_PAR_DEFAUT.repos, rythmeStrict: strict },
                },
              }),
            ).modele.lp(),
          )
        },
      ),
      { numRuns: 80, seed: 20261030 },
    )
    return textes.join('\n=====\n')
  }

  it('même texte LP sur des semaines tirées au hasard', () => {
    // 05fa1c2a : jour isolé contre un congé, plus de 6 jours d'affilée, et
    // mineur un jour férié, plus de 5 jours d'affilée, dans le pire coût
    // d'une place (2026-11-02).
    // 9d7c36ec (2026-11-02, règles morales du PRD) : une variable par heure
    // de fin suivie d'un service à moins de 13 h le lendemain (règle 3), et
    // le pire coût d'une place qui compte les règles morales (`pireMoral`,
    // heures en plus partagées) ; la part fixe du dépannage compte les mêmes
    // repos d'une semaine à l'autre (règle 8, confort).
    // Inchangée par la relecture du 2026-11-03 : ces semaines n'ont pas de
    // semaine d'avant, donc ni la paire « dimanche d'avant libre » retirée
    // (règle 1) ni la règle 8 neutre pour le week-end n'y écrivent rien ; le
    // jour isolé et le pire coût d'une place n'ont pas changé.
    // 98d3081a (2026-11-03, décisions de l'utilisateur) : 12 h conseillées
    // entre deux services au lieu de 13 (moins de paires écrites, règle 3),
    // et l'extra qui coûte en plus tout le moral et le confort qu'il
    // épargnerait (`partMoraleExtra`), donc un pire coût d'une place plus
    // haut.
    // 6e510457 (2026-11-03, règle 17, équipes de l'accueil) : seul le pire
    // coût d'une place change ici (arrivées et départs du soir étalés,
    // relève de chacun) ; ces semaines n'ont pas de candidat de l'accueil.
    // 69dca6e4 (2026-11-03, la fatigue avant les heures, décision de
    // l'utilisateur) : repos de moins de 12 h, reprise après des nuits et
    // week-end libre au poids `POIDS_FATIGUE` ; plus de 6 jours d'affilée
    // devient une contrainte dure ; la nuit du vendredi compte pour le
    // week-end.
    // 30e32394 (2026-11-04, les heures avant la fatigue et la passation avec
    // le veilleur, décisions de l'utilisateur) : poids de la fatigue sous
    // une heure due ; le pire coût d'une place change (passation d'un
    // veilleur) ; ces semaines n'ont pas de nuit de l'accueil.
    // 887b8ecd (2026-11-04, deux repos de suite, décision d'une
    // responsable) : la paire de repos devient une contrainte dure (plus de
    // prime de repos accolés) ; un 6e jour n'en laisse plus.
    // 8874c146 (2026-11-04, semaines de 5 jours, décision d'une
    // responsable) : pour un contrat de 35 h et plus (`rythmeHumain`), plus
    // de 5 jours d'affilée et le jour isolé deviennent des contraintes dures ;
    // les autres contrats gardent le modèle d'avant.
    // Inchangée par les règles de l'établissement (2026-11-05) : les défauts
    // reproduisent l'hôtel ; la continuité obligatoire (D8) ne touche que les
    // variables de trou et de passation, et ces créneaux n'ont ni moment de
    // l'accueil ni nuit (aucun trou, aucune passation).
    // Inchangée par le rythme 5 et 2 strict (2026-11-09) quand le réglage est
    // à non : `rythmeStrictModele` n'écrit rien.
    // 99598680 (2026-11-09, soutien jamais seul pendant tout le shift,
    // décision de l'utilisateur) : ces semaines tirent des soutiens et des
    // places avec `soutien` ; leur ligne « soutien <= les référents de la
    // même place » devient une ligne par morceau du shift (`morceaux`), avec
    // les référents des créneaux du même poste qui couvrent ce morceau (ces
    // créneaux n'ont pas de zone : le poste). Le reste du modèle est le même.
    // d5e6159c (2026-11-09, ORDRE DE DÉCISION, `prixOrdre`) : le manque
    // d'heures dues n'est plus payé 400 par minute mais `minuteDue` (une
    // heure due vaut plus qu'une transition et une place ensemble), et ce
    // prix est posé à la fin, quand la place la plus chère est connue : le
    // coefficient de chaque variable de manque et sa place dans l'objectif
    // changent. Ces semaines n'ont ni chiffre de l'accueil (pas
    // d'équilibre) ni rythme strict : rien d'autre ne bouge.
    // 5f88f9d7 (2026-11-09, suite des décisions de l'utilisateur) : le
    // prix d'une heure due se lit désormais au-dessus d'un repos seul
    // (`urgence`, 3 places), et le pire coût d'une place compte un
    // apprenti ou un stagiaire de plus au même moment (`POIDS_EPARPILLER`) :
    // tous les prix de place et d'heure changent, rien d'autre.
    expect(empreinte(textesLp(false))).toBe('5f88f9d7')
  })

  it('rythme 5 et 2 strict : une empreinte à part', () => {
    // EMPREINTE_STRICT (2026-11-09, réglage à oui, le défaut) : les mêmes
    // semaines, plus les motifs interdits du rythme 5 et 2
    // (`rythmeStrictModele`) pour les contrats de 35 h et plus ; ces
    // semaines n'ont pas de semaine voisine, donc aucun coût de bord.
    // Relevée de nouveau le même jour (69e93268 → ce15d100, l'école et les
    // absences comptent comme du travail) : les jours d'absence tirés
    // (`indisponibilites`, hors repos fixe) sont des absences décomptées,
    // du TRAVAIL connu d'avance dans les motifs quand ils sont 5 au plus
    // d'affilée, neutres au-delà (`joursRythmeDe`) ; avant, tous neutres.
    // Et (même jour, fb6eed48) : les motifs autres que les 6 jours ne sont
    // plus durs mais payés (`prixFauteRythme`, plus que tout le reste) ;
    // un motif qui ne peut jamais être en faute n'est pas écrit.
    // ed536f1a (2026-11-09, soutien jamais seul pendant tout le shift) :
    // même changement que l'empreinte sans le rythme strict (99598680).
    // 8818eea4 (2026-11-09, ORDRE DE DÉCISION) : le prix des heures dues
    // (comme d5e6159c), et les motifs rangés par genre (`genreMotif`) : une
    // transition (3 repos, bloc de 4) a une variable de plus à son prix,
    // au plus une par personne ; 4 repos ou plus au prix `dur`.
    // 15e530ae (2026-11-09, suite) : comme 5f88f9d7, plus les motifs
    // rangés autrement : 3 repos au prix `dur`, le repos seul au prix
    // `urgence` (un sur 4 semaines), les transitions (bloc de 4) sans
    // plafond, à prix croissant (`prixTransition`).
    expect(empreinte(textesLp(true))).toBe(EMPREINTE_STRICT)
  })
})

/*
 * Optimisation B2 (plan planning-cycles-2026-10-30) : avec des créneaux
 * remplaçants, les paires et triplets impliqués par « un shift par jour » ne
 * sont plus écrits un à un (REDUCTION DES REMPLAÇANTS, `construire`). Preuve
 * que l'espace des solutions ne change pas : sur des semaines tirées au
 * hasard AVEC remplaçants (fabriqués comme le lot C), la valeur optimale est
 * la même avec et sans réduction, et la solution réduite ne viole aucune
 * règle de la loi.
 */
describe('réduction des remplaçants : même optimum', () => {
  const resoudre = (lp: string) =>
    highs.solve(lp, {
      mip_rel_gap: 0,
      mip_abs_gap: 0,
      output_flag: false,
    }) as ReturnType<Highs['solve']> & { ObjectiveValue: number }

  /** Un besoin et ses remplaçants (r<besoin>-<code>, place b<besoin>). */
  function place(
    i: number,
    jour: number,
    debutH: number,
    dureeH: number,
    effectif: number,
    decalages: number[],
  ): Creneau[] {
    const besoin: Creneau = {
      ...creneau(`b${i}`, 'reception', jour, debutH, debutH + dureeH),
      typeShift: `M${i}`,
      effectif,
      soir: debutH >= 13,
    }
    const remplacants = decalages.map((d, k): Creneau => ({
      ...creneau(
        `r${i}-H${i}${k}`,
        'reception',
        jour,
        debutH + d,
        debutH + d + dureeH,
      ),
      typeShift: `H${i}${k}`,
      place: `b${i}`,
      effectif: 0,
      facultatif: 0,
      soutien: 0,
      soir: debutH + d >= 13,
    }))
    return [besoin, ...remplacants]
  }

  const affectations = (
    c: ReturnType<typeof construire>,
    lp: ReturnType<typeof resoudre>,
  ) => {
    const un = (v: string) => Math.round(lp.Columns[v]?.Primal ?? 0) === 1
    const affs: AffectationSolveur[] = []
    for (const [k, v] of c.x) {
      if (!un(v)) continue
      const i = k.indexOf('|')
      affs.push(aff(k.slice(0, i), k.slice(i + 1)))
    }
    return affs
  }

  it('sur des semaines tirées au hasard avec remplaçants', () => {
    const arbSalarie = fc.record({
      contratH: fc.integer({ min: 0, max: 39 }),
      absents: fc.subarray([0, 1, 2, 3, 4, 5, 6], { maxLength: 2 }),
      reposHebdo: fc.boolean(),
      // Fin du service d'avant / début du suivant : force les triplets.
      bords: fc.boolean(),
    })
    const arbPlace = fc.record({
      jour: fc.integer({ min: 0, max: 6 }),
      // Jusqu'à 20 h : des soirs qui finissent tard, des matins tôt le
      // lendemain, donc des paires du repos quotidien d'un jour à l'autre.
      debutH: fc.integer({ min: 5, max: 20 }),
      dureeH: fc.integer({ min: 3, max: 9 }),
      effectif: fc.integer({ min: 1, max: 2 }),
      decalages: fc.subarray([-3, -2, -1, 1, 2, 3, 6], { maxLength: 3 }),
    })
    let reduites = 0
    let optimaux = 0
    fc.assert(
      fc.property(
        // Peu de monde pour beaucoup de places : enfreindre une règle
        // rapporterait, une contrainte oubliée se verrait.
        fc.array(arbSalarie, { minLength: 1, maxLength: 2 }),
        fc.array(arbPlace, { minLength: 2, maxLength: 10 }),
        fc.subarray(range(12), { maxLength: 3 }),
        fc.integer({ min: 0, max: 1000 }),
        (gens, places, epingles, graine) => {
          const salaries = gens.map((g, i) =>
            receptionniste(`s${i}`, g.contratH, {
              joursTravaillesMaxSemaine: 6,
              joursPreferesSemaine: 5,
              indisponibilites: new Set(g.absents),
              reposHebdoMin: g.reposHebdo ? 35 * H : 0,
              finServicePrecedent: g.bords ? -2 * H : null,
              debutServiceSuivant: g.bords
                ? 7 * MINUTES_PAR_JOUR + 6 * H
                : null,
            }),
          )
          const creneaux = places.flatMap((c, i) =>
            place(i, c.jour, c.debutH, c.dureeH, c.effectif, c.decalages),
          )
          // Quelques épinglés (parfois deux le même jour : la paire reste).
          const imposees = new Set<string>()
          for (const k of epingles) {
            const c = creneaux.at(k)
            if (k < creneaux.length && c)
              imposees.add(cle(salaries[k % salaries.length].id, c.id))
          }
          const p = probleme({ salaries, creneaux, imposees, graine })
          const avec = construire(p)
          const sans = construire(p, { reduire: false })
          if (avec.modele.contraintes.length < sans.modele.contraintes.length)
            reduites++
          expect(avec.modele.impossible).toBe(sans.modele.impossible)
          if (avec.modele.impossible || avec.x.size === 0) return
          const ra = resoudre(avec.modele.lp())
          const rs = resoudre(sans.modele.lp())
          expect(ra.Status).toBe(rs.Status)
          // Deux épinglés sur une place d'une seule personne : la couverture
          // (Σ <= effectif + facultatif) rend le modèle impossible, avec ou
          // sans réduction. Rien d'autre à comparer.
          if (rs.Status === 'Infeasible' && imposees.size > 0) return
          expect(ra.Status).toBe('Optimal')
          optimaux++
          expect(ra.ObjectiveValue).toBeCloseTo(rs.ObjectiveValue, 6)
          // Les épinglés sont des faits, gardés même hors la loi : le
          // vérificateur ne juge que les semaines sans épinglé.
          if (imposees.size === 0) {
            expect(
              violations(p, affectations(avec, ra)).filter(
                (v) => v.nature === 'loi',
              ),
            ).toEqual([])
          }
        },
      ),
      { numRuns: 40, seed: 20261030 },
    )
    // La propriété n'est pas vide : la réduction a bien servi.
    expect(reduites).toBeGreaterThan(20)
    expect(optimaux).toBeGreaterThan(30)
  }, 120_000)

  /*
   * Le test « même texte LP » ne couvre ni la présence ni les consignes
   * (relecture adverse du 2026-10-30). Ici, des semaines AVEC créneaux
   * comptés au matin et au soir, consignes (au moins, au plus) et
   * remplaçants : (a) la réduction garde le même optimum ; (b) les trous
   * rendus par le générateur sont ceux que l'oracle (`verificateur.trous`,
   * écrit sans rien reprendre du générateur) recompte sur la solution ;
   * (c) aucune règle de la loi enfreinte.
   */
  it('présence, consignes et remplaçants : même optimum, trous du générateur = trous de l’oracle', () => {
    const arbSalarie = fc.record({
      contratH: fc.integer({ min: 0, max: 39 }),
      absents: fc.subarray([0, 1, 2, 3, 4, 5, 6], { maxLength: 2 }),
    })
    const arbPlace = fc.record({
      jour: fc.integer({ min: 0, max: 2 }),
      debutH: fc.integer({ min: 5, max: 18 }),
      dureeH: fc.integer({ min: 3, max: 9 }),
      effectif: fc.integer({ min: 0, max: 2 }),
      decalages: fc.subarray([-2, -1, 1, 2], { maxLength: 2 }),
    })
    const arbConsigne = fc.record({
      jour: fc.integer({ min: 0, max: 2 }),
      periode: fc.constantFrom('matin' as const, 'soir' as const),
      minimum: fc.integer({ min: 0, max: 2 }),
      maximum: fc.option(fc.integer({ min: 1, max: 2 }), { nil: null }),
    })
    let avecTrous = 0
    fc.assert(
      fc.property(
        fc.array(arbSalarie, { minLength: 1, maxLength: 3 }),
        fc.array(arbPlace, { minLength: 2, maxLength: 7 }),
        fc.array(arbConsigne, { maxLength: 3 }),
        fc.integer({ min: 0, max: 1000 }),
        (gens, places, consignes, graine) => {
          const salaries = gens.map((g, i) =>
            receptionniste(`s${i}`, g.contratH, {
              joursTravaillesMaxSemaine: 6,
              joursPreferesSemaine: 5,
              indisponibilites: new Set(g.absents),
            }),
          )
          const creneaux = places
            .flatMap((c, i) =>
              place(i, c.jour, c.debutH, c.dureeH, c.effectif, c.decalages),
            )
            .map((c) => ({
              ...c,
              presence:
                (c.debut % MINUTES_PAR_JOUR) / H < 12
                  ? ['matin' as const]
                  : ['soir' as const],
            }))
          const p = probleme({
            salaries,
            creneaux,
            consignes: consignes.filter(
              (k) => k.maximum === null || k.maximum >= k.minimum,
            ),
            graine,
          })
          const avec = construire(p)
          const sans = construire(p, { reduire: false })
          if (avec.modele.impossible || avec.x.size === 0) return
          const ra = resoudre(avec.modele.lp())
          const rs = resoudre(sans.modele.lp())
          expect(ra.Status).toBe('Optimal')
          expect(rs.Status).toBe('Optimal')
          expect(ra.ObjectiveValue).toBeCloseTo(rs.ObjectiveValue, 6)
          const r = gen(p)
          expect(r.statut).toBe('optimal')
          if (r.trous.length) avecTrous++
          expect(r.trous).toEqual(trousVerifies(p, r.affectations))
          expect(
            violations(p, r.affectations).filter((v) => v.nature === 'loi'),
          ).toEqual([])
        },
      ),
      { numRuns: 40, seed: 20261030 },
    )
    // La propriété voit des trous, pas seulement des semaines sans.
    expect(avecTrous).toBeGreaterThan(5)
  }, 120_000)

  it('une semaine chargée de remplaçants : paires et triplets réduits', () => {
    const salaries = range(4).map((i) =>
      receptionniste(`s${i}`, 35, {
        joursTravaillesMaxSemaine: 6,
        reposHebdoMin: 35 * H,
        finServicePrecedent: -2 * H,
        debutServiceSuivant: 7 * MINUTES_PAR_JOUR + 6 * H,
      }),
    )
    const creneaux = range(7).flatMap((j) => [
      ...place(2 * j, j, 7, 7, 1, [-1, 1, 2]),
      ...place(2 * j + 1, j, 15, 8, 1, [-2, -1, 1]),
    ])
    // La réduction seule : le rythme 5 et 2 strict ajoute des contraintes
    // de jours, pas de paires (même preuve).
    const p = probleme({ salaries, creneaux, regles: SANS_RYTHME_STRICT })
    const avec = construire(p)
    const sans = construire(p, { reduire: false })
    expect(avec.modele.contraintes.length).toBeLessThan(
      sans.modele.contraintes.length / 2,
    )
    const ra = resoudre(avec.modele.lp())
    const rs = resoudre(sans.modele.lp())
    expect(ra.ObjectiveValue).toBeCloseTo(rs.ObjectiveValue, 6)
    expect(
      violations(p, affectations(avec, ra)).filter((v) => v.nature === 'loi'),
    ).toEqual([])
  })
})
