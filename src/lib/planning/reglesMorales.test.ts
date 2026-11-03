import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  coefsHeuresPlus,
  coutPlaceVide,
  generer,
  pireCoutRemplir,
  pireMoral,
  PART_FIXE_DEPANNAGE,
  POIDS_ECOLE_ABORDS,
  POIDS_MOMENT_ARRIERE,
  POIDS_MOMENT_EN_TROP,
  POIDS_NUIT_AFFILEE,
  POIDS_REPOS_COURT,
  POIDS_REPRISE_APRES_NUIT,
  POIDS_RETOUR_WEEKEND,
  POIDS_SIXIEME_JOUR,
  POIDS_SOUS_CONTRAT,
  POIDS_WEEKEND_LIBRE,
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
import { MINUTES_PAR_JOUR } from '#/lib/planning/temps.ts'
import { REGLES_MORALES, violations } from '#/lib/planning/verificateur.ts'

/*
 * Règles morales du PRD (`plan/planning-bonnes-pratiques/PRD.md`, partie 4,
 * décisions prises par l'assistant le 2026-11-02). Pour chacune : un cas où
 * le calcul l'évite (une autre solution existe, aussi bonne pour la loi, les
 * places et les contrats), et un cas où il ne peut pas faire autrement :
 * l'entorse a lieu (une place passe avant) et le vérificateur la dit, en
 * alerte d'organisation.
 */

const H = 60
let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})
const graines = [0, 1, 7, 42]

function cr(
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

const resoudre = (p: Probleme): Resultat => generer(p, highs)
/** Les créneaux tenus par `id`. */
const de = (r: Resultat, id: string) =>
  r.affectations
    .filter((a) => a.salarieId === id)
    .map((a) => a.creneauId)
    .sort()
const alertes = (p: Probleme, r: Resultat, regle: string) =>
  violations(p, r.affectations).filter((v) => v.regle === regle)
/** Rien d'autre que des règles morales : jamais la loi. */
const loi = (p: Probleme, r: Resultat) =>
  violations(p, r.affectations).filter((v) => !REGLES_MORALES.has(v.regle))

describe('les poids moraux : sous les places et les heures dues, au-dessus du dépannage', () => {
  it('Q1 : chaque règle seule coûte moins que les heures dues d’un shift de 4 h', () => {
    for (const w of [
      POIDS_REPOS_COURT,
      POIDS_WEEKEND_LIBRE,
      POIDS_MOMENT_EN_TROP,
      POIDS_MOMENT_ARRIERE,
      POIDS_NUIT_AFFILEE,
      POIDS_REPRISE_APRES_NUIT,
      POIDS_RETOUR_WEEKEND,
      POIDS_ECOLE_ABORDS,
    ]) {
      expect(w).toBeLessThan(POIDS_SOUS_CONTRAT * 4 * H)
      expect(w).toBeGreaterThan(PART_FIXE_DEPANNAGE)
    }
    // Personne ne fait un 6e jour pour le week-end d'un autre.
    expect(POIDS_WEEKEND_LIBRE).toBeLessThan(POIDS_SIXIEME_JOUR)
  })

  it('une place vide coûte plus que toutes les règles morales ensemble', () => {
    for (const moment of ['matin', 'soir', 'nuit'] as const) {
      const c = cr('c', 0, 7, 15, { moment })
      expect(pireCoutRemplir(c, 0)).toBeGreaterThan(pireMoral(c))
      expect(coutPlaceVide(c, 0)).toBeGreaterThan(pireCoutRemplir(c, 0))
    }
    expect(pireMoral(cr('n', 0, 23, 31, { moment: 'nuit' }))).toBeGreaterThan(
      pireMoral(cr('j', 0, 7, 15, { moment: 'matin' })),
    )
  })
})

describe('règle 3 : 13 h entre deux services', () => {
  // Lundi matin 7-15 et soir 14-22, mardi matin 9-17 (11 h après le soir :
  // légal) et soir 14-22. Deux personnes à 16 h : chacune lundi et mardi.
  const places = [
    cr('lmatin', 0, 7, 15),
    cr('lsoir', 0, 14, 22),
    cr('mmatin', 1, 9, 17),
    cr('msoir', 1, 14, 22),
  ]
  it('évité : personne n’enchaîne le soir et le matin à 11 h', () => {
    for (const graine of graines) {
      const p = probleme({
        salaries: [personne('a', 16), personne('b', 16)],
        creneaux: places,
        graine,
      })
      const r = resoudre(p)
      expect(r.manques).toEqual([])
      for (const id of ['a', 'b'])
        expect(
          de(r, id).includes('lsoir') && de(r, id).includes('mmatin'),
        ).toBe(false)
      expect(alertes(p, r, 'REPOS-COURT')).toEqual([])
    }
  })
  it('seule possible : la place est tenue, et l’alerte le dit', () => {
    const p = probleme({
      salaries: [personne('a', 16)],
      creneaux: places.slice(1, 3),
    })
    const r = resoudre(p)
    expect(de(r, 'a')).toEqual(['lsoir', 'mmatin'])
    expect(loi(p, r)).toEqual([])
    expect(alertes(p, r, 'REPOS-COURT').map((v) => v.message)).toEqual([
      'seulement 11 h de repos entre deux services (13 h conseillées)',
    ])
  })
  it('vérificateur : 13 h pile, pas d’alerte ; depuis la semaine d’avant', () => {
    const s = personne('a', 8)
    const p = probleme({
      salaries: [s],
      creneaux: [cr('x', 0, 22, 30), cr('y', 1, 19, 23)],
    })
    expect(
      alertes(p, { ...rien, affectations: aff('a', 'x', 'y') }, 'REPOS-COURT'),
    ).toEqual([])
    const avant = probleme({
      salaries: [personne('a', 8, { finServicePrecedent: -5 * H })],
      creneaux: [cr('m', 0, 7, 15)],
    })
    expect(
      alertes(avant, { ...rien, affectations: aff('a', 'm') }, 'REPOS-COURT'),
    ).toHaveLength(1)
  })
})

const rien: Resultat = {
  statut: 'optimal',
  affectations: [],
  manques: [],
  ecartTotalMinutes: 0,
}
const aff = (salarieId: string, ...ids: string[]) =>
  ids.map((creneauId) => ({ salarieId, creneauId }))

describe('règle 4 : un week-end libre sur 4 semaines', () => {
  const places = [
    cr('mer', 2, 9, 17),
    cr('jeu', 3, 9, 17),
    cr('sam', 5, 9, 17),
    cr('dim', 6, 9, 17),
  ]
  it('évité : qui n’a pas eu de week-end libre ne travaille pas celui-ci', () => {
    for (const graine of graines) {
      const p = probleme({
        salaries: [
          // Ses jours habituels sont le samedi et le dimanche (confort) :
          // le week-end libre passe devant.
          personne('a', 16, {
            weekendLibreAvant: false,
            travailFixe: new Set([5, 6]),
          }),
          personne('b', 16, { weekendLibreAvant: true }),
        ],
        creneaux: places,
        graine,
      })
      const r = resoudre(p)
      expect(r.manques).toEqual([])
      expect(de(r, 'a')).toEqual(['jeu', 'mer'])
      expect(alertes(p, r, 'WEEKEND-LIBRE')).toEqual([])
    }
  })
  it('seule possible : elle travaille, et l’alerte le dit', () => {
    const p = probleme({
      salaries: [
        personne('a', 16, { weekendLibreAvant: false }),
        personne('b', 16, { indisponibilites: new Set([5, 6]) }),
      ],
      creneaux: places,
    })
    const r = resoudre(p)
    expect(r.manques).toEqual([])
    expect(de(r, 'a')).toEqual(['dim', 'sam'])
    expect(alertes(p, r, 'WEEKEND-LIBRE').map((v) => v.message)).toEqual([
      'aucun week-end complet libre depuis 4 semaines',
    ])
  })
})

describe('règle 6 : une semaine stable', () => {
  const m = (id: string, j: number) => cr(id, j, 7, 15, { moment: 'matin' })
  const s = (id: string, j: number) => cr(id, j, 14, 22, { moment: 'soir' })
  const places = [
    m('m0', 0),
    s('s0', 0),
    m('m2', 2),
    s('s2', 2),
    m('m4', 4),
    s('s4', 4),
  ]
  it('évité : chacun garde son moment, jamais du soir au matin', () => {
    for (const graine of graines) {
      const p = probleme({
        salaries: [personne('a', 24), personne('b', 24)],
        creneaux: places,
        graine,
      })
      const r = resoudre(p)
      expect(r.manques).toEqual([])
      expect(alertes(p, r, 'MOMENTS')).toEqual([])
    }
  })
  it('seule possible : du soir au matin, et l’alerte le dit', () => {
    const p = probleme({
      salaries: [personne('a', 16)],
      creneaux: [s('s0', 0), m('m2', 2)],
    })
    const r = resoudre(p)
    expect(de(r, 'a')).toEqual(['m2', 's0'])
    expect(alertes(p, r, 'MOMENTS').map((v) => v.message)).toEqual([
      'revient du soir au matin 2 jours après (plutôt du matin vers le soir)',
    ])
  })
  it('évité : pas de second changement quand un autre horaire suffit', () => {
    // Ses heures dues demandent trois shifts : mardi, le matin plutôt que
    // le middle (lundi matin, mercredi soir : un seul changement).
    const ouvert = { effectif: 0, facultatif: 1 }
    for (const graine of graines) {
      const p = probleme({
        salaries: [personne('a', 24)],
        creneaux: [
          m('m0', 0),
          cr('i1', 1, 7, 15, { moment: 'middle', ...ouvert }),
          cr('m1', 1, 7, 15, { moment: 'matin', ...ouvert }),
          s('s2', 2),
        ],
        graine,
      })
      const r = resoudre(p)
      expect(de(r, 'a')).toEqual(['m0', 'm1', 's2'])
    }
  })
  it('vérificateur : matin, soir, matin, soir = 3 changements', () => {
    const p = probleme({
      salaries: [personne('a', 32)],
      creneaux: [m('a0', 0), s('a1', 1), m('a2', 2), s('a3', 3)],
    })
    const r = { ...rien, affectations: aff('a', 'a0', 'a1', 'a2', 'a3') }
    expect(alertes(p, r, 'MOMENTS').map((v) => v.message)).toContain(
      '3 changements de moment dans la semaine (1 au plus conseillé)',
    )
    const stable = { ...rien, affectations: aff('a', 'a0', 'a1') }
    expect(alertes(p, stable, 'MOMENTS')).toEqual([])
  })
})

describe('règle 7 : les nuits avec mesure', () => {
  const nuit = (id: string, j: number) => cr(id, j, 23, 31, { moment: 'nuit' })
  it('évité : pas de jour moins de 2 jours après une nuit', () => {
    for (const graine of graines) {
      const p = probleme({
        salaries: [
          personne('a', 16, { postes: new Set(['r', 'n']) }),
          personne('b', 8),
        ],
        creneaux: [
          { ...nuit('n0', 0), poste: 'n' },
          cr('mer', 2, 9, 17),
          cr('ven', 4, 9, 17),
        ],
        graine,
      })
      const r = resoudre(p)
      expect(r.manques).toEqual([])
      expect(de(r, 'a')).toEqual(['n0', 'ven'])
      expect(alertes(p, r, 'NUITS')).toEqual([])
    }
  })
  it('seule possible : reprise de jour, et l’alerte le dit', () => {
    const p = probleme({
      salaries: [personne('a', 16)],
      creneaux: [nuit('n0', 0), cr('mer', 2, 9, 17)],
    })
    const r = resoudre(p)
    expect(de(r, 'a')).toEqual(['mer', 'n0'])
    expect(alertes(p, r, 'NUITS').map((v) => v.message)).toEqual([
      'reprend de jour moins de 2 jours après une nuit (2 jours de repos conseillés)',
    ])
  })
  it('évité : la série de la semaine d’avant ne dépasse pas 5 nuits', () => {
    // Trois nuits à la fin de la semaine d'avant ; ses jours habituels
    // (lundi à mercredi) en feraient six d'affilée.
    for (const graine of graines) {
      const p = probleme({
        salaries: [
          personne('a', 24, {
            nuitsAvant: new Set([-3, -2, -1]),
            travailFixe: new Set([0, 1, 2]),
          }),
          personne('b', 16),
        ],
        creneaux: [0, 1, 2, 4, 5].map((j) => nuit(`n${j}`, j)),
        graine,
      })
      const r = resoudre(p)
      expect(r.manques).toEqual([])
      expect(de(r, 'a')).not.toEqual(['n0', 'n1', 'n2'])
      expect(alertes(p, r, 'NUITS')).toEqual([])
    }
  })
  it('six nuits d’affilée pour ses heures dues : faites, et dites', () => {
    // Q1 : les heures dues passent avant la règle morale.
    const p = probleme({
      salaries: [personne('a', 48, { minutesHebdoMax: 48 * H })],
      creneaux: [0, 1, 2, 3, 4, 5].map((j) => nuit(`n${j}`, j)),
    })
    const r = resoudre(p)
    expect(de(r, 'a')).toHaveLength(6)
    expect(alertes(p, r, 'NUITS').map((v) => v.message)).toEqual([
      "6 nuits d'affilée (au plus 5 conseillées)",
    ])
  })
  it('la semaine d’avant compte', () => {
    const p = probleme({
      salaries: [personne('a', 8, { nuitsAvant: new Set([-1]) })],
      creneaux: [cr('lun', 0, 15, 22)],
    })
    const r = { ...rien, affectations: aff('a', 'lun') }
    expect(alertes(p, r, 'NUITS')).toHaveLength(1)
    const loin = probleme({
      salaries: [personne('a', 8, { nuitsAvant: new Set([-3]) })],
      creneaux: [cr('lun', 0, 15, 22)],
    })
    expect(alertes(loin, r, 'NUITS')).toEqual([])
  })
})

describe('règle 8 : les mêmes repos d’une semaine à l’autre', () => {
  const places = [0, 1, 2, 3, 4].map((j) => cr(`j${j}`, j, 9, 17))
  it('évité : son lundi de repos reste libre', () => {
    for (const graine of graines) {
      const p = probleme({
        salaries: [
          personne('a', 32, { reposAvant: new Set([0]) }),
          personne('b', 8),
        ],
        creneaux: places,
        graine,
      })
      const r = resoudre(p)
      expect(r.manques).toEqual([])
      expect(de(r, 'b')).toEqual(['j0'])
    }
  })
  it('seule possible : il travaille ce lundi, et l’alerte le dit', () => {
    const p = probleme({
      salaries: [
        personne('a', 32, { reposAvant: new Set([0]) }),
        personne('b', 8, { indisponibilites: new Set([0]) }),
      ],
      creneaux: places,
    })
    const r = resoudre(p)
    expect(de(r, 'a')).toContain('j0')
    expect(alertes(p, r, 'MEMES-REPOS')).toHaveLength(1)
  })
  // Banc du 2026-11-03 : la règle 8 rendait un repos en semaine « collant »,
  // et la personne ne retrouvait plus ses week-ends. Passer ses repos au
  // samedi et au dimanche ne lui coûte rien.
  const semaineWe = [
    cr('mar', 1, 9, 17),
    cr('jeu', 3, 9, 17),
    cr('sam', 5, 9, 17),
    cr('dim', 6, 9, 17),
  ]
  const groupeWe = (weekends: number) => ({
    groupeEquite: 'r',
    equiteAvant: { weekends, soirs: 0, matinsTot: 0 },
  })
  it('neutre pour le week-end : le partage des week-ends passe', () => {
    // a (repos le mardi la semaine d'avant) a fait 3 week-ends, b aucun :
    // a travaille mardi et jeudi, b prend le week-end.
    for (const graine of graines) {
      const p = probleme({
        salaries: [
          personne('a', 16, {
            reposAvant: new Set([1]),
            weekendTravailleAvant: true,
            ...groupeWe(3),
          }),
          personne('b', 16, groupeWe(0)),
        ],
        creneaux: semaineWe,
        graine,
      })
      const r = resoudre(p)
      expect(r.manques).toEqual([])
      expect(de(r, 'a')).toEqual(['jeu', 'mar'])
      expect(alertes(p, r, 'MEMES-REPOS')).toEqual([])
    }
  })
  it('vérificateur : repos repris sans week-end libre, une alerte', () => {
    const p = probleme({
      salaries: [
        personne('a', 16, {
          reposAvant: new Set([1]),
          weekendTravailleAvant: true,
        }),
      ],
      creneaux: semaineWe,
    })
    expect(
      alertes(
        p,
        { ...rien, affectations: aff('a', 'mar', 'sam') },
        'MEMES-REPOS',
      ),
    ).toHaveLength(1)
    expect(
      alertes(
        p,
        { ...rien, affectations: aff('a', 'mar', 'jeu') },
        'MEMES-REPOS',
      ),
    ).toEqual([])
  })
})

describe('règle 12 : les heures en plus se partagent', () => {
  const groupe = (minutesEnPlus: number, semainesEnPlus = 0) => ({
    groupeEquite: 'r',
    equiteAvant: {
      weekends: 0,
      soirs: 0,
      matinsTot: 0,
      minutesEnPlus,
      semainesEnPlus,
    },
  })
  const places = [cr('l', 0, 9, 17), cr('m', 1, 9, 17), cr('j', 3, 9, 17)]
  it('évité : la personne qui en a déjà fait ne prend pas le shift en plus', () => {
    for (const graine of graines) {
      const p = probleme({
        salaries: [
          personne('a', 8, groupe(10 * H)),
          personne('b', 8, groupe(0)),
        ],
        creneaux: places,
        graine,
      })
      const r = resoudre(p)
      expect(r.manques).toEqual([])
      expect(de(r, 'a')).toHaveLength(1)
      expect(de(r, 'b')).toHaveLength(2)
    }
  })
  it('coefficient : rien pour le moins chargé, plafonné', () => {
    const p = probleme({
      salaries: [personne('a', 8, groupe(50 * H)), personne('b', 8, groupe(0))],
      creneaux: [],
    })
    const c = coefsHeuresPlus(p)
    expect(c.get('b')).toBeUndefined()
    expect(c.get('a')).toBe(30)
  })
  it('vérificateur : au-delà 3 semaines sur 4, une alerte', () => {
    const p = probleme({
      salaries: [personne('a', 8, groupe(10 * H, 2))],
      creneaux: places,
    })
    const r = { ...rien, affectations: aff('a', 'l', 'm') }
    expect(alertes(p, r, 'HEURES-PLUS')).toHaveLength(1)
    const p1 = probleme({
      salaries: [personne('a', 8, groupe(10 * H, 1))],
      creneaux: places,
    })
    expect(alertes(p1, r, 'HEURES-PLUS')).toEqual([])
  })
})

describe('règle 13 : un retour de congé en douceur', () => {
  it('évité : la reprise ne tombe pas un samedi', () => {
    for (const graine of graines) {
      const p = probleme({
        salaries: [personne('a', 8, { retourConge: 2 }), personne('b', 8)],
        creneaux: [cr('mer', 2, 9, 17), cr('sam', 5, 9, 17)],
        graine,
      })
      const r = resoudre(p)
      expect(de(r, 'a')).toEqual(['mer'])
      expect(alertes(p, r, 'RETOUR-CONGE')).toEqual([])
    }
  })
  it('seule possible : reprise un samedi, et l’alerte le dit', () => {
    const p = probleme({
      salaries: [
        personne('a', 8, { retourConge: 2 }),
        personne('b', 8, { indisponibilites: new Set([5]) }),
      ],
      creneaux: [cr('mer', 2, 9, 17), cr('sam', 5, 9, 17)],
    })
    const r = resoudre(p)
    expect(de(r, 'a')).toEqual(['sam'])
    expect(alertes(p, r, 'RETOUR-CONGE').map((v) => v.message)).toEqual([
      'reprend un week-end après son congé',
    ])
  })
  it('vérificateur : 6 jours la semaine du retour', () => {
    const jours = [0, 1, 2, 3, 4, 5].map((j) => cr(`j${j}`, j, 9, 17))
    const p = probleme({
      salaries: [personne('a', 48, { retourConge: 0 })],
      creneaux: jours,
    })
    const r = { ...rien, affectations: aff('a', ...jours.map((c) => c.id)) }
    expect(alertes(p, r, 'RETOUR-CONGE').map((v) => v.message)).toContain(
      '6 jours travaillés la semaine du retour de congé',
    )
  })
})

describe('règle 14 : protéger l’école des apprentis', () => {
  // École le mardi : lundi pas après 21 h, mercredi pas avant 8 h.
  const ecole = {
    joursHorsSite: new Set([1]),
    indisponibilites: new Set([1]),
    finAvantEcole: new Map([[0, 21 * H]]),
    debutApresEcole: new Map([[2, 2 * MINUTES_PAR_JOUR + 8 * H]]),
  }
  it('évité : l’apprenti prend le matin la veille de l’école', () => {
    for (const graine of graines) {
      const p = probleme({
        salaries: [personne('a', 8, ecole), personne('b', 8)],
        creneaux: [cr('tot', 0, 7, 15), cr('tard', 0, 14, 22)],
        graine,
      })
      const r = resoudre(p)
      expect(de(r, 'a')).toEqual(['tot'])
    }
  })
  it('seule possible : le soir, et l’alerte le dit', () => {
    const p = probleme({
      salaries: [personne('a', 8, ecole)],
      creneaux: [cr('tard', 0, 14, 22), cr('mer', 2, 7, 15)],
    })
    const r = resoudre(p)
    expect(de(r, 'a')).toEqual(['mer', 'tard'])
    expect(alertes(p, r, 'ECOLE-ABORDS').map((v) => v.message)).toEqual([
      "finit après 21 h la veille d'un jour d'école",
      "commence avant 8 h le lendemain d'un jour d'école",
    ])
  })
})

describe('règle 9 : jamais un jour de travail isolé', () => {
  // Une place chaque jour. a (24 h, 3 jours) est absent le mardi et le
  // jeudi, et a pour habitude le mercredi et le vendredi : le mercredi
  // serait un jour seul entre deux absences.
  const places = [0, 1, 2, 3, 4, 5, 6].map((j) => cr(`j${j}`, j, 9, 17))
  it('évité : pas de jour seul entre deux absences, l’habitude passe après', () => {
    for (const graine of graines) {
      const p = probleme({
        salaries: [
          personne('a', 24, {
            travailFixe: new Set([2, 4]),
            indisponibilites: new Set([1, 3]),
          }),
          personne('b', 24),
          personne('c', 8),
        ],
        creneaux: places,
        graine,
      })
      const r = resoudre(p)
      expect(r.manques).toEqual([])
      expect(de(r, 'a')).toHaveLength(3)
      expect(de(r, 'a')).not.toContain('j2')
      expect(
        alertes(p, r, 'JOUR-ISOLE').filter((v) => v.salarieId === 'a'),
      ).toEqual([])
    }
  })
  it('seule possible : le jour seul est tenu, et l’alerte le dit', () => {
    // b ne vient que le mardi et le jeudi : a tient lundi, mercredi, vendredi.
    const p = probleme({
      salaries: [
        personne('a', 24, { indisponibilites: new Set([1, 3, 5, 6]) }),
        personne('b', 16, { indisponibilites: new Set([0, 2, 4, 5, 6]) }),
      ],
      creneaux: places.slice(0, 5),
    })
    const r = resoudre(p)
    expect(de(r, 'a')).toEqual(['j0', 'j2', 'j4'])
    expect(
      alertes(p, r, 'JOUR-ISOLE').filter((v) => v.salarieId === 'a'),
    ).toHaveLength(2)
  })
})

describe('règle 1 : deux repos qui se suivent dans la semaine', () => {
  const semaine = (libres: number[]) =>
    [0, 1, 2, 3, 4, 5, 6]
      .filter((j) => !libres.includes(j))
      .map((j) => cr(`j${j}`, j, 9, 17))
  const controle = (libres: number[], kw: Partial<SalarieSolveur> = {}) => {
    const c = semaine(libres)
    const p = probleme({ salaries: [personne('a', 40, kw)], creneaux: c })
    return alertes(
      p,
      { ...rien, affectations: aff('a', ...c.map((x) => x.id)) },
      'REPOS-SEPARES',
    )
  }
  it('séparés : une alerte ; collés : rien', () => {
    expect(controle([1, 3])).toHaveLength(1)
    expect(controle([1, 2])).toEqual([])
  })
  it('dimanche libre la semaine d’avant puis lundi et jeudi : séparés', () => {
    // Relecture du 2026-11-03 : le dimanche d'avant ne fait pas la paire.
    const avant = { joursSemainePrecedente: 5, serieAvant: 0 }
    expect(controle([0, 3], avant)).toHaveLength(1)
    expect(
      controle([0, 3], { joursSemainePrecedente: 6, serieAvant: 1 }),
    ).toHaveLength(1)
    // Semaine d'avant inconnue : rien n'excuse non plus un lundi libre.
    expect(controle([0, 3], { joursSemainePrecedente: null })).toHaveLength(1)
    expect(controle([0, 1], avant)).toEqual([])
  })
  it('évité : dimanche d’avant libre, les deux repos se collent quand même', () => {
    // 40 h en 5 jours au plus, une place chaque jour, jours habituels mardi,
    // mercredi, vendredi, samedi et dimanche : lundi et jeudi seraient
    // permis par les habitudes, mais séparés.
    for (const graine of graines) {
      const p = probleme({
        creneaux: [0, 1, 2, 3, 4, 5, 6].map((j) => cr(`j${j}`, j, 9, 17)),
        salaries: [
          personne('a', 40, {
            joursTravaillesMaxSemaine: 5,
            travailFixe: new Set([1, 2, 4, 5, 6]),
            joursSemainePrecedente: 5,
            serieAvant: 0,
          }),
        ],
        graine,
      })
      const r = resoudre(p)
      const pris = de(r, 'a').map((id) => Number(id.slice(1)))
      const libres = [0, 1, 2, 3, 4, 5, 6].filter((j) => !pris.includes(j))
      expect(libres).toHaveLength(2)
      expect(libres[1] - libres[0]).toBe(1)
      expect(alertes(p, r, 'REPOS-SEPARES')).toEqual([])
    }
  })
})
