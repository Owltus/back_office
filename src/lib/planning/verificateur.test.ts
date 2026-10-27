import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import { generer } from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import { creneau, probleme, salarieSolveur } from '#/lib/planning/modele.ts'
import type {
  AffectationSolveur,
  Creneau,
  SalarieSolveur,
} from '#/lib/planning/modele.ts'
import {
  alerteBesoin,
  plafondJour,
  presenceMaxPoste,
  resume,
  versSolveur,
} from '#/lib/planning/regles.ts'
import type { Fiche } from '#/lib/planning/regles.ts'
import {
  manquants,
  raisonsBlocage,
  violations,
  violationsSalarie,
} from '#/lib/planning/verificateur.ts'
import type { Violation } from '#/lib/planning/verificateur.ts'

/*
 * Port de `backend/tests/test_verificateur.py` (prototype) : le vérificateur
 * (oracle des tests) et la traduction des règles, testés à leurs bornes.
 * Chaque valeur attendue vient de docs/regles-hcr.md : 11 h pile acceptée,
 * 10 h 59 refusée. Les valeurs sont celles du prototype, jamais recopiées
 * d'une sortie du code TypeScript.
 */

const H = 60
const J = 24 * 60

let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

/** Créneau du jour `jour`, de `debut` à `fin` minutes après minuit. */
function cr(
  id: string,
  jour: number,
  debut: number,
  fin: number,
  poste = 'rec',
  kw: Partial<Creneau> = {},
): Creneau {
  return creneau({
    id,
    poste,
    debut: jour * J + debut,
    fin: jour * J + fin,
    ...kw,
  })
}

const jourDe9a17 = (jour: number) => cr(`j${jour}`, jour, 9 * H, 17 * H)

/** Un salarié sans autre limite que celles qu'on lui donne. */
function sal(id = 'a', kw: Partial<SalarieSolveur> = {}): SalarieSolveur {
  return salarieSolveur({
    id,
    postes: new Set(['rec']),
    minutesHebdoContrat: 0,
    minutesHebdoMax: 70 * H,
    minutesJourMax: 12 * H,
    joursTravaillesMaxSemaine: 6,
    reposQuotidienMin: 11 * H,
    ...kw,
  })
}

const controle = (s: SalarieSolveur, creneaux: Creneau[], nbJours = 7) =>
  violationsSalarie(s, creneaux, nbJours)
const regles = (s: SalarieSolveur, creneaux: Creneau[], nbJours = 7) =>
  controle(s, creneaux, nbJours).map((v) => v.regle)
const messages = (
  s: SalarieSolveur,
  creneaux: Creneau[],
  regle: string,
  nbJours = 7,
) =>
  controle(s, creneaux, nbJours)
    .filter((v) => v.regle === regle)
    .map((v) => v.message)

const aff = (salarieId: string, creneauId: string): AffectationSolveur => ({
  salarieId,
  creneauId,
  court: false,
})

const range = (a: number, b?: number) => {
  const [debut, fin] = b === undefined ? [0, a] : [a, b]
  return Array.from({ length: fin - debut }, (_, i) => debut + i)
}

describe('R-REPOS-QUOTIDIEN et chevauchement', () => {
  it('repos quotidien : 11 h pile accepté, 10 h 59 refusé', () => {
    const a = cr('a', 0, 9 * H, 17 * H)
    expect(regles(sal(), [a, cr('b', 1, 4 * H, 12 * H)])).toEqual([])
    expect(
      messages(sal(), [a, cr('b', 1, 4 * H - 1, 12 * H)], 'R-REPOS-QUOTIDIEN'),
    ).toEqual(['seulement 10 h 59 de repos entre deux services (minimum 11 h)'])
  })

  it('deux services bout à bout ne se chevauchent pas', () => {
    const a = cr('a', 0, 7 * H, 12 * H)
    const pile = regles(sal(), [a, cr('b', 0, 12 * H, 14 * H)])
    expect(pile).not.toContain('CHEVAUCHEMENT')
    expect(pile).toContain('R-REPOS-QUOTIDIEN')
    expect(regles(sal(), [a, cr('b', 0, 12 * H - 1, 14 * H)])).toContain(
      'CHEVAUCHEMENT',
    )
  })

  it('repos depuis la semaine précédente', () => {
    const lundi = cr('a', 0, 6 * H, 14 * H)
    expect(regles(sal('a', { finServicePrecedent: -5 * H }), [lundi])).toEqual(
      [],
    )
    expect(
      messages(
        sal('a', { finServicePrecedent: -5 * H + 1 }),
        [lundi],
        'R-REPOS-QUOTIDIEN',
      ),
    ).toEqual([
      'seulement 10 h 59 de repos depuis son dernier service de la semaine précédente (minimum 11 h)',
    ])
    expect(
      messages(
        sal('a', { finServicePrecedent: 7 * H }),
        [lundi],
        'R-REPOS-QUOTIDIEN',
      ),
    ).toEqual([
      'seulement 0 h de repos depuis son dernier service de la semaine précédente (minimum 11 h)',
    ])
  })

  it('repos avant la semaine suivante', () => {
    const dimanche = cr('a', 6, 12 * H, 20 * H)
    const suivant = 7 * J + 7 * H
    expect(
      regles(sal('a', { debutServiceSuivant: suivant }), [dimanche]),
    ).toEqual([])
    expect(
      messages(
        sal('a', { debutServiceSuivant: suivant - 1 }),
        [dimanche],
        'R-REPOS-QUOTIDIEN',
      ),
    ).toEqual([
      'seulement 10 h 59 de repos avant son premier service de la semaine suivante (minimum 11 h)',
    ])
    expect(
      messages(
        sal('a', { debutServiceSuivant: 6 * J }),
        [dimanche],
        'R-REPOS-QUOTIDIEN',
      ),
    ).toEqual([
      'seulement 0 h de repos avant son premier service de la semaine suivante (minimum 11 h)',
    ])
  })

  it('un seul service par jour', () => {
    const matin = cr('m', 0, 6 * H, 8 * H)
    const soir = cr('s', 0, 20 * H, 22 * H)
    expect(regles(sal('a', { reposQuotidienMin: 0 }), [matin, soir])).toContain(
      'UN-SERVICE-PAR-JOUR',
    )
    expect(regles(sal('a', { reposQuotidienMin: 0 }), [matin])).toEqual([])
  })

  it('horaire imposé seulement le jour prévu', () => {
    const s = sal('a', { shiftImpose: [[0, 'M']] })
    expect(
      regles(s, [cr('a', 0, 7 * H, 15 * H, 'rec', { typeShift: 'M' })]),
    ).toEqual([])
    expect(
      regles(s, [cr('a', 1, 15 * H, 23 * H, 'rec', { typeShift: 'S' })]),
    ).toEqual([])
    expect(
      regles(s, [cr('a', 0, 15 * H, 23 * H, 'rec', { typeShift: 'S' })]),
    ).toEqual(['HORAIRE-PERSO'])
  })
})

describe('jours travaillés, semaines', () => {
  it('six jours acceptés, sept refusés', () => {
    const six = range(6).map(jourDe9a17)
    expect(regles(sal(), six)).toEqual([])
    const v = controle(sal(), [...six, jourDe9a17(6)]).filter(
      (x) => x.regle === 'R-SIX-JOURS-MAX',
    )
    expect(v.map((x) => x.message)).toEqual(['7 jours travaillés, maximum 6'])
    expect(v[0].creneaux).toEqual(range(7).map((j) => `j${j}`))
  })

  it('cinquième jour sans alerte, sixième avec', () => {
    const s = sal('a', { joursPreferesSemaine: 5 })
    expect(regles(s, range(5).map(jourDe9a17))).toEqual([])
    expect(regles(s, range(6).map(jourDe9a17))).toEqual(['SIXIEME-JOUR'])
  })

  it('chaque semaine civile compte à part', () => {
    const jours = [...range(6), ...range(7, 14), ...range(14, 20)]
    const v = controle(sal(), jours.map(jourDe9a17), 21)
    expect(v.map((x) => [x.regle, x.message])).toEqual([
      ['R-SIX-JOURS-MAX', '7 jours travaillés, maximum 6'],
    ])
    expect(v[0].creneaux).toEqual(range(7, 14).map((j) => `j${j}`))
  })

  it('une semaine entamée est contrôlée', () => {
    const s = sal('a', { minutesHebdoMax: 7 * H })
    expect(regles(s, [jourDe9a17(7)], 8)).toEqual(['R-SEMAINE-MAX'])
  })

  it('48 h pile acceptées, 48 h 01 refusées', () => {
    const s = sal('a', { minutesHebdoMax: 48 * H })
    const six = range(6).map(jourDe9a17)
    expect(regles(s, six)).toEqual([])
    const plus = [...six.slice(0, -1), cr('j5', 5, 9 * H, 17 * H + 1)]
    expect(messages(s, plus, 'R-SEMAINE-MAX')).toEqual([
      '48 h 01 dans la semaine, maximum 48 h',
    ])
  })

  it('trois jours de repos sur deux semaines', () => {
    const s = sal('a', { reposDeuxSemaines: 3, joursSemaineSuivante: 5 })
    const six = range(6).map(jourDe9a17)
    expect(regles(s, six)).toEqual([])
    expect(
      messages({ ...s, joursSemaineSuivante: 6 }, six, 'R-REPOS-HEBDO-HCR'),
    ).toEqual([
      '12 jours travaillés sur deux semaines (avec la semaine suivante) : au moins 3 jours de repos',
    ])
    const avant = sal('a', { reposDeuxSemaines: 3, joursSemainePrecedente: 6 })
    expect(messages(avant, six, 'R-REPOS-HEBDO-HCR')).toEqual([
      '12 jours travaillés sur deux semaines (avec la semaine précédente) : au moins 3 jours de repos',
    ])
  })

  it('la semaine suivante est comparée à la dernière semaine seulement', () => {
    const s = sal('a', { reposDeuxSemaines: 3, joursSemaineSuivante: 7 })
    const jours = [...range(6), 7].map(jourDe9a17)
    expect(regles(s, jours, 8)).not.toContain('R-REPOS-HEBDO-HCR')
  })

  it('repos hebdomadaire de 35 h pile', () => {
    const s = sal('a', { reposHebdoMin: 35 * H })
    const autour = [0, 1, 2, 5, 6].map(jourDe9a17)
    expect(regles(s, [...autour, cr('v', 4, 4 * H, 12 * H)])).toEqual([])
    expect(
      messages(
        s,
        [...autour, cr('v', 4, 4 * H - 1, 12 * H)],
        'R-REPOS-HEBDO-35H',
      ),
    ).toEqual(['pas de repos de 35 h consécutives dans la semaine'])
  })

  it('mineur : deux jours de repos qui se suivent', () => {
    const s = sal('a', { reposConsecutifs: true })
    expect(regles(s, range(5).map(jourDe9a17))).toEqual([])
    expect(regles(s, [0, 1, 3, 5].map(jourDe9a17))).toEqual([
      'R-REPOS-HEBDO-MINEUR',
    ])
  })
})

describe('entre deux fiches d’une même personne', () => {
  function deuxFiches(debutB: number): Violation[] {
    const a = sal('a', { personne: 'p' })
    const b = sal('b', { personne: 'p' })
    const c1 = cr('c1', 0, 9 * H, 17 * H)
    const c2 = creneau({
      id: 'c2',
      poste: 'rec',
      debut: debutB,
      fin: debutB + 4 * H,
    })
    const p = probleme({ salaries: [a, b], creneaux: [c1, c2] })
    return violations(p, [aff('a', 'c1'), aff('b', 'c2')])
  }

  it('repos entre deux contrats : 11 h pile', () => {
    expect(deuxFiches(J + 4 * H)).toEqual([])
    const v = deuxFiches(J + 4 * H - 1)
    expect(v.map((x) => [x.salarieId, x.regle, x.message])).toEqual([
      [
        'b',
        'R-REPOS-QUOTIDIEN',
        'seulement 10 h 59 de repos après un service de son autre contrat (minimum 11 h)',
      ],
    ])
  })

  it('chevauchement entre deux contrats', () => {
    expect(deuxFiches(17 * H).map((x) => x.regle)).toEqual([
      'R-REPOS-QUOTIDIEN',
    ])
    expect(deuxFiches(17 * H - 1).map((x) => x.regle)).toEqual([
      'CHEVAUCHEMENT',
    ])
  })
})

describe('couverture, soutien, raisons', () => {
  it('le sureffectif annonce le compte', () => {
    const c = cr('c', 0, 7 * H, 15 * H, 'rec', { effectif: 1, facultatif: 1 })
    const gens = ['a', 'b', 'c'].map((i) => sal(i))
    const affs = ['a', 'b', 'c'].map((i) => aff(i, 'c'))
    const v = violations(probleme({ salaries: gens, creneaux: [c] }), affs)
    expect(v.map((x) => [x.regle, x.message])).toEqual([['SUREFFECTIF', '3/2']])
  })

  it('les manquants ne comptent pas le soutien', () => {
    const c = cr('c', 0, 7 * H, 15 * H, 'rec', { effectif: 2 })
    const titulaire = sal('t')
    const apprentie = sal('s', {
      postes: new Set(),
      postesSoutien: new Set(['rec']),
    })
    const p = probleme({ salaries: [titulaire, apprentie], creneaux: [c] })
    expect(manquants(p, [aff('t', 'c'), aff('s', 'c')])).toEqual(
      new Map([['c', 1]]),
    )
    expect(manquants(p, [])).toEqual(new Map([['c', 2]]))
  })

  function soutienAvec(d: Creneau): string[] {
    const apprentie = sal('s', {
      postes: new Set(),
      postesSoutien: new Set(['rec']),
    })
    const titulaire = sal('t', { postes: new Set(['rec', 'club']) })
    const c = cr('c', 0, 9 * H, 17 * H)
    const p = probleme({ salaries: [apprentie, titulaire], creneaux: [c, d] })
    return violations(p, [aff('s', 'c'), aff('t', d.id)])
      .map((v) => v.regle)
      .filter((r) => r === 'SOUTIEN-SEUL')
  }

  it('un soutien est accompagné seulement sur le même poste en même temps', () => {
    expect(soutienAvec(cr('d', 0, 8 * H, 12 * H))).toEqual([])
    expect(soutienAvec(cr('d', 0, 9 * H, 17 * H, 'club'))).toEqual([
      'SOUTIEN-SEUL',
    ])
    expect(soutienAvec(cr('d', 0, 17 * H, 20 * H))).toEqual(['SOUTIEN-SEUL'])
    expect(soutienAvec(cr('d', 0, 6 * H, 9 * H))).toEqual(['SOUTIEN-SEUL'])
  })

  it('raisons de blocage : « extra » seulement s’il est libre', () => {
    const c = cr('c', 0, 7 * H, 15 * H)
    const libre = sal('l')
    const extra = sal('e', { placementManuel: true })
    const absent = sal('x', {
      placementManuel: true,
      indisponibilites: new Set([0]),
    })
    const raisons = raisonsBlocage(
      probleme({ salaries: [libre, extra, absent], creneaux: [c] }),
      [],
      'c',
    )
    expect(raisons.get('l')).toEqual([])
    expect(raisons.get('e')!.map((v) => v.regle)).toEqual(['EXTRA'])
    expect(raisons.get('x')!.map((v) => v.regle)).toEqual(['ABSENCE'])
  })
})

describe('R-ECOLE-JOURS : un jour d’école est un jour travaillé', () => {
  const ECOLE = new Set(range(5))
  const apprentie = (kw: Partial<SalarieSolveur> = {}) =>
    sal('a', {
      joursHorsSite: ECOLE,
      indisponibilites: ECOLE,
      joursPreferesSemaine: 5,
      ...kw,
    })

  it('l’école compte dans les six jours', () => {
    const samedi = jourDe9a17(5)
    const dimanche = jourDe9a17(6)
    expect(regles(apprentie(), [samedi])).toEqual(['SIXIEME-JOUR'])
    expect(
      messages(apprentie(), [samedi, dimanche], 'R-SIX-JOURS-MAX'),
    ).toEqual(['7 jours travaillés, maximum 6'])
    const conges = sal('a', {
      indisponibilites: ECOLE,
      joursPreferesSemaine: 5,
    })
    expect(regles(conges, [samedi, dimanche])).toEqual([])
  })

  it('l’école n’est pas un jour de repos hebdomadaire', () => {
    const dimanche = jourDe9a17(6)
    const six = sal('a', {
      joursHorsSite: new Set(range(6)),
      indisponibilites: new Set(range(6)),
      reposHebdoMin: 35 * H,
    })
    expect(regles(six, [dimanche])).toContain('R-REPOS-HEBDO-35H')
    expect(
      regles(apprentie({ reposHebdoMin: 35 * H }), [dimanche]),
    ).not.toContain('R-REPOS-HEBDO-35H')
  })

  it('l’école compte sur deux semaines', () => {
    const s = apprentie({ reposDeuxSemaines: 3, joursSemainePrecedente: 6 })
    expect(regles(s, [])).toEqual([])
    expect(regles(s, [jourDe9a17(5)])).toContain('R-REPOS-HEBDO-HCR')
  })

  function weekEnd(s: SalarieSolveur): Set<string> {
    const creneaux = [cr('sam', 5, 9 * H, 17 * H), cr('dim', 6, 9 * H, 17 * H)]
    const r = generer(probleme({ salaries: [s], creneaux }), highs)
    return new Set(r.affectations.map((a) => a.creneauId))
  }

  it('le moteur ne fait pas travailler 7 jours avec l’école', () => {
    const contrat = { minutesHebdoContrat: 16 * H, joursPreferesSemaine: 6 }
    expect(weekEnd(sal('a', { indisponibilites: ECOLE, ...contrat }))).toEqual(
      new Set(['sam', 'dim']),
    )
    expect(
      weekEnd(
        sal('a', { indisponibilites: ECOLE, joursHorsSite: ECOLE, ...contrat }),
      ).size,
    ).toBe(1)
  })

  it('le moteur garde 3 repos sur deux semaines avec l’école', () => {
    const contrat = {
      minutesHebdoContrat: 16 * H,
      reposDeuxSemaines: 3,
      joursSemainePrecedente: 6,
      joursPreferesSemaine: 6,
    }
    expect(
      weekEnd(sal('a', { indisponibilites: ECOLE, ...contrat })).size,
    ).toBe(2)
    expect(
      weekEnd(
        sal('a', { indisponibilites: ECOLE, joursHorsSite: ECOLE, ...contrat }),
      ),
    ).toEqual(new Set())
  })

  it('le moteur ne prend pas un jour d’école pour le repos de 35 h', () => {
    const six = new Set(range(6))
    const contrat = {
      minutesHebdoContrat: 16 * H,
      reposHebdoMin: 35 * H,
      joursPreferesSemaine: 7,
    }
    expect(weekEnd(sal('a', { indisponibilites: six, ...contrat }))).toEqual(
      new Set(['dim']),
    )
    expect(
      weekEnd(
        sal('a', { indisponibilites: six, joursHorsSite: six, ...contrat }),
      ),
    ).toEqual(new Set())
  })
})

describe('traduction des règles (regles.ts)', () => {
  const fiche = (kw: Partial<Fiche> = {}): Fiche => ({
    id: 'x',
    postes: new Set(['1']),
    typeContrat: 'cdi',
    minutesHebdo: 35 * H,
    ...kw,
  })
  const textes = (f: Fiche) =>
    Object.fromEntries(resume(f).map((l) => [l.regle, l.texte])) as Record<
      string,
      string
    >

  it('durée maximale d’un service par catégorie', () => {
    const attendu = {
      reception: 12 * H,
      veille_nuit: 12 * H,
      cuisine: 11 * H,
      administratif_hors_site: 10 * H,
      autre: 11 * H + 30,
    }
    expect(
      Object.fromEntries(
        Object.keys(attendu).map((k) => [k, presenceMaxPoste(k)]),
      ),
    ).toEqual(attendu)
    expect(presenceMaxPoste('inconnue')).toBeNull()
  })

  it('l’alerte d’un besoin annonce le maximum en heures', () => {
    expect(alerteBesoin('autre', 11 * H + 30)).toBeNull()
    expect(alerteBesoin('autre', 11 * H + 31)).toBe(
      "dépasse la durée maximale d'un service pour cette catégorie (11 h 30, R-JOUR-MAX)",
    )
    expect(alerteBesoin('inconnue', 99 * H)).toBeNull()
  })

  it('forfait jours : 13 h d’amplitude et heures indicatives', () => {
    expect(plafondJour(fiche({ forfaitJours: true }))).toBe(13 * H)
    const s = versSolveur(fiche({ forfaitJours: true }))
    expect(s.minutesHebdoMax).toBe(5 * 13 * H)
    expect(s.contratIndicatif).toBe(true)
    expect(s.placementManuel).toBe(false)
    expect(s.jourMaxPoste).toBe(false)
    const extra = versSolveur(fiche({ typeContrat: 'extra' }))
    expect(extra.contratIndicatif && extra.placementManuel).toBe(true)
    expect(versSolveur(fiche()).contratIndicatif).toBe(false)
  })

  it('une seule journée courte au-delà de 35 h', () => {
    const s = versSolveur(fiche({ minutesHebdo: 39 * H }))
    expect([s.journeesCourtesMax, s.journeePleine]).toEqual([1, 8 * H])
    expect(
      versSolveur(fiche({ minutesHebdo: 35 * H })).journeesCourtesMax,
    ).toBeNull()
  })

  it('heures complémentaires : un tiers et sous 35 h', () => {
    expect(versSolveur(fiche({ minutesHebdo: 24 * H })).minutesHebdoMax).toBe(
      32 * H,
    )
    expect(versSolveur(fiche({ minutesHebdo: 30 * H })).minutesHebdoMax).toBe(
      35 * H - 1,
    )
  })

  it('le résumé en clair', () => {
    const t = textes(fiche({ minutesHebdo: 39 * H }))
    expect(t['CONTRAT']).toBe('Objectif : 39 h par semaine')
    expect(t['R-SEMAINE-MAX']).toBe('Au plus 48 h par semaine')
    expect(t['R-REPOS-QUOTIDIEN']).toBe(
      'Au moins 11 h de repos entre deux services',
    )
    expect(t['R-REPOS-HEBDO-35H']).toBe(
      "Au moins 35 h de repos d'affilée par semaine",
    )
    expect(textes(fiche({ minutesHebdo: 30 * H }))['R-SEMAINE-MAX']).toBe(
      'Au plus 34 h 59 par semaine',
    )
  })

  it('résumé : temps partiel seulement sous 35 h hors forfait', () => {
    expect(textes(fiche({ minutesHebdo: 35 * H - 1 }))).toHaveProperty([
      'R-TP-HEURES-COMPL',
    ])
    expect(textes(fiche({ minutesHebdo: 35 * H }))).not.toHaveProperty([
      'R-TP-HEURES-COMPL',
    ])
    expect(textes(fiche({ minutesHebdo: 39 * H }))).not.toHaveProperty([
      'R-TP-HEURES-COMPL',
    ])
    expect(
      textes(fiche({ minutesHebdo: 20 * H, forfaitJours: true })),
    ).not.toHaveProperty(['R-TP-HEURES-COMPL'])
  })

  it('résumé : stagiaire seulement pour un stagiaire', () => {
    expect(textes(fiche({ typeContrat: 'stagiaire' }))).toHaveProperty([
      'R-STAGE-TEMPS',
    ])
    expect(textes(fiche())).not.toHaveProperty(['R-STAGE-TEMPS'])
  })

  it('les jours d’école sont transmis au moteur', () => {
    const s = versSolveur(
      fiche({ joursEcole: new Set([0, 1]), indisponibilites: new Set([4]) }),
    )
    expect(s.joursHorsSite).toEqual(new Set([0, 1]))
    expect(s.indisponibilites).toEqual(new Set([0, 1, 4]))
  })
})
