import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import { generer } from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import {
  creneau,
  jourDe,
  probleme,
  salarieSolveur,
} from '#/lib/planning/modele.ts'
import type {
  Probleme,
  SalarieSolveur,
  Suivante,
  SuivantePersonne,
} from '#/lib/planning/modele.ts'
import { preparerGeneration } from '#/lib/planning/semaine.ts'
import type { DonneesSemaine } from '#/lib/planning/semaine.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import { ajouterJours, MINUTES_PAR_JOUR } from '#/lib/planning/temps.ts'
import type { Affectation } from '#/lib/planning/types.ts'
import { SANS_RYTHME_STRICT } from '#/lib/planning/test/reglesTest.ts'

/*
 * Horizon glissant (2026-11-04, décision utilisateur) : la semaine suivante
 * est esquissée dans le calcul. Cas du planning de décembre : une personne
 * qui travaille du mardi au dimanche alors que la semaine d'après doit lui
 * rendre son week-end (aucun depuis 3 semaines) se retrouve, la semaine
 * d'après, avec un lundi forcé sans travail en plus de son week-end : une
 * semaine de 4 jours. Oracle : la règle elle-même, recomptée sur la
 * solution (jours d'affilée en fin de semaine, week-end travaillé).
 */

const H = 60
const J = MINUTES_PAR_JOUR

let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

const personne = (id: string, kw: Partial<SalarieSolveur> = {}) =>
  salarieSolveur({
    id,
    postes: new Set(['r']),
    minutesHebdoContrat: 40 * H,
    minutesHebdoMax: 48 * H,
    minutesJourMax: 10 * H,
    joursTravaillesMaxSemaine: 6,
    joursPreferesSemaine: 5,
    reposQuotidienMin: 11 * H,
    ...kw,
  })

/** Une place de 8 h chaque jour, et une seconde le samedi et le dimanche. */
const places = () => [
  ...[0, 1, 2, 3, 4, 5, 6].map((j) =>
    creneau({
      id: `m${j}`,
      poste: 'r',
      debut: j * J + 7 * H,
      fin: j * J + 15 * H,
    }),
  ),
  ...[5, 6].map((j) =>
    creneau({
      id: `s${j}`,
      poste: 'r',
      debut: j * J + 14 * H,
      fin: j * J + 22 * H,
    }),
  ),
]

const esquisse = (kw: Partial<SuivantePersonne> = {}): SuivantePersonne => ({
  fixes: new Map(),
  horsSite: new Set(),
  postesGardes: new Map(),
  nonLibres: new Set(),
  nonLibresIci: new Set(),
  attendus: 5,
  weekendLibreAvant: false,
  ...kw,
})

/** Juste assez de places pour trois personnes à 5 jours : un matin et un
 * soir chaque jour, et une place de plus le mercredi. */
const quinze = () => [
  ...places(),
  ...[0, 1, 2, 3, 4].map((j) =>
    creneau({
      id: `s${j}`,
      poste: 'r',
      debut: j * J + 14 * H,
      fin: j * J + 22 * H,
    }),
  ),
  creneau({ id: 'w2', poste: 'r', debut: 2 * J + 9 * H, fin: 2 * J + 17 * H }),
]

/** A aime travailler du mardi au dimanche (jours habituels) ; B et C font
 * le reste. Sans horizon, A prend ses 5 jours habituels. */
function cas(suivante?: Suivante): Probleme {
  return probleme({
    salaries: [
      personne('A', { travailFixe: new Set([2, 3, 4, 5, 6]) }),
      personne('B'),
      personne('C'),
    ],
    creneaux: quinze(),
    ...(suivante ? { suivante } : {}),
    // L'horizon seul : le rythme 5 et 2 strict a son essai à part
    // (`rythmeStrict.test.ts`).
    regles: SANS_RYTHME_STRICT,
  })
}

const joursDe = (r: ReturnType<typeof generer>, p: Probleme, id: string) =>
  new Set(
    r.affectations
      .filter((a) => a.salarieId === id)
      .map((a) => jourDe(p.creneaux.find((c) => c.id === a.creneauId)!)),
  )

/** Jours travaillés d'affilée qui finissent le dimanche. */
const finDeSemaine = (jours: Set<number>) => {
  let n = 0
  for (let j = 6; j >= 0 && jours.has(j); j--) n++
  return n
}

describe('horizon glissant', () => {
  it('sans horizon : A finit la semaine sur 5 jours d’affilée, week-end compris', () => {
    const p = cas()
    const a = joursDe(generer(p, highs), p, 'A')
    expect([...a].sort()).toEqual([2, 3, 4, 5, 6])
    // La semaine d'après devra lui rendre son week-end : du lundi au
    // vendredi, ce serait 10 jours d'affilée. Impasse.
    expect(finDeSemaine(a) + 5).toBeGreaterThan(6)
  })

  it('avec horizon : la semaine laisse à la suivante 5 jours possibles et un week-end', () => {
    const p = cas({ personnes: new Map([['A', esquisse()]]), groupes: [] })
    const r = generer(p, highs)
    const a = joursDe(r, p, 'A')
    expect(a.size).toBe(5)
    const weekend = a.has(5) || a.has(6)
    // Soit son week-end est libre maintenant, soit la semaine d'après peut
    // le lui rendre en travaillant du lundi au vendredi (6 jours au plus).
    expect(!weekend || finDeSemaine(a) + 5 <= 6).toBe(true)
    // Rien de laissé vide pour autant.
    expect(r.manques.reduce((t, m) => t + m.manquant, 0)).toBe(0)
  })

  it('refusé : la règle ne joue pas quand un week-end libre est récent', () => {
    const p = cas({
      personnes: new Map([['A', esquisse({ weekendLibreAvant: true })]]),
      groupes: [],
    })
    const a = joursDe(generer(p, highs), p, 'A')
    expect([...a].sort()).toEqual([2, 3, 4, 5, 6])
  })

  it('un week-end de maladie la semaine d’après n’est pas un week-end libre', () => {
    // Samedi et dimanche d'après en maladie : le seul week-end libre
    // possible est celui-ci.
    const p = cas({
      personnes: new Map([
        [
          'A',
          esquisse({
            fixes: new Map([
              [5, 0],
              [6, 0],
            ]),
            nonLibres: new Set([5, 6]),
            attendus: 3,
          }),
        ],
      ]),
      groupes: [],
    })
    const a = joursDe(generer(p, highs), p, 'A')
    expect(a.has(5) || a.has(6)).toBe(false)
    // Refusé : un congé payé ces jours-là, lui, libère le week-end d'après.
    const q = cas({
      personnes: new Map([
        [
          'A',
          esquisse({
            fixes: new Map([
              [5, 0],
              [6, 0],
            ]),
            attendus: 3,
          }),
        ],
      ]),
      groupes: [],
    })
    expect([...joursDe(generer(q, highs), q, 'A')].sort()).toEqual([
      2, 3, 4, 5, 6,
    ])
  })

  it('les places de la semaine écrite passent avant l’esquisse', () => {
    // Seule A peut tenir le samedi et le dimanche : elle les tient, même si
    // l'esquisse y perd un week-end libre.
    const p = probleme({
      salaries: [
        personne('A'),
        personne('B', { indisponibilites: new Set([5, 6]) }),
      ],
      creneaux: places().filter((c) => c.id.startsWith('m')),
      suivante: { personnes: new Map([['A', esquisse()]]), groupes: [] },
    })
    const r = generer(p, highs)
    const a = joursDe(r, p, 'A')
    expect(a.has(5) && a.has(6)).toBe(true)
    expect(r.manques.reduce((t, m) => t + m.manquant, 0)).toBe(0)
  })

  it('la semaine suivante garde du monde : pas tous en week-end libre à la fois', () => {
    // A et B travaillent tous les deux le week-end ; la semaine d'après en
    // demande un par jour. Les deux ne peuvent pas être libres ensemble là :
    // l'un des deux a son week-end libre MAINTENANT. Contrats de 30 h : pas
    // de rythme de 5 jours, qui passe avant le week-end libre (les heures
    // et la semaine complète d'abord, 2026-11-04).
    const p = probleme({
      salaries: [
        personne('A', { minutesHebdoContrat: 30 * H }),
        personne('B', { minutesHebdoContrat: 30 * H }),
        personne('C', { minutesHebdoContrat: 24 * H }),
      ],
      creneaux: places(),
      suivante: {
        personnes: new Map([
          ['A', esquisse()],
          ['B', esquisse()],
        ]),
        groupes: [
          {
            membres: new Set(['A', 'B']),
            postes: new Set(['r']),
            besoins: [1, 1, 1, 1, 1, 2, 2],
          },
        ],
      },
    })
    const r = generer(p, highs)
    const libres = ['A', 'B'].filter((id) => {
      const j = joursDe(r, p, id)
      return !j.has(5) && !j.has(6)
    })
    expect(libres.length).toBeGreaterThanOrEqual(1)
  })

  it('à temps plein, la semaine complète passe avant le week-end libre (2026-11-04)', () => {
    // Le même cas à 40 h : les heures et le rythme de 5 jours d'abord
    // (décision utilisateur : des heures payées doivent être faites).
    const p = probleme({
      salaries: [
        personne('A'),
        personne('B'),
        personne('C', { minutesHebdoContrat: 24 * H }),
      ],
      creneaux: places(),
      suivante: {
        personnes: new Map([
          ['A', esquisse()],
          ['B', esquisse()],
        ]),
        groupes: [
          {
            membres: new Set(['A', 'B']),
            postes: new Set(['r']),
            besoins: [1, 1, 1, 1, 1, 2, 2],
          },
        ],
      },
    })
    const r = generer(p, highs)
    // Les 9 places vont à A et B (C, à 24 h, n'a pas de rythme) : B fait
    // ses 5 jours, A 4. Libérer le week-end de l'un coûterait 3 jours à
    // l'autre (rythme de 5 jours, au-dessus du week-end libre).
    const jours = ['A', 'B'].map((id) => joursDe(r, p, id))
    expect(jours.map((j) => j.size).sort()).toEqual([4, 5])
    expect(jours.every((j) => j.has(5) || j.has(6))).toBe(true)
  })
})

describe('esquisse de la semaine suivante (préparation)', () => {
  const LUNDI = '2026-11-16'
  const SUIVANT = ajouterJours(LUNDI, 7)
  const demo = hotelDemo(LUNDI)
  const qui = (prenom: string) =>
    demo.referentiel.salaries.find((x) => x.prenom === prenom)!
  const reception = demo.referentiel.postes.find((p) => p.nom === 'Réception')!
  const matin = demo.referentiel.horaires.find((h) => h.debut === '07:00')!
  const shift = (
    salarie: number,
    jour: number,
    epinglee: boolean,
  ): Affectation => ({
    id: 900 + jour + salarie * 10,
    lundi: SUIVANT,
    salarie_id: salarie,
    poste_id: reception.id,
    jour,
    horaire_id: matin.id,
    debut: matin.debut,
    fin: matin.fin,
    epinglee,
    pause: matin.pause,
  })
  const cp = demo.referentiel.motifs.find((m) => m.code === 'CP')!
  const lucas = qui('Lucas').id
  const donnees = (apres: Affectation[]): DonneesSemaine => ({
    lundi: LUNDI,
    referentiel: demo.referentiel,
    absences: [
      ...demo.absences,
      {
        id: 9999,
        salarie_id: lucas,
        jour: ajouterJours(SUIVANT, 3),
        motif_id: cp.id,
      },
    ],
    affectations: [],
    avant: [],
    apres,
    avantAvant: [],
  })
  const esquisse = (apres: Affectation[], suivanteRecalculee: boolean) =>
    preparerGeneration(donnees(apres), {
      aujourdhui: '2026-11-01',
      horizon: { suivanteRecalculee },
    }).probleme.suivante!

  it('jours d’office, impossibles et à choisir', () => {
    const s = esquisse([shift(lucas, 1, true), shift(lucas, 2, false)], true)
    const e = s.personnes.get(String(lucas))!
    // Validé : travaillé ; proposition d'une semaine recalculée : à
    // choisir ; congé : impossible, et décompté des jours attendus.
    expect(e.fixes.get(1)).toBe(1)
    expect(e.fixes.has(2)).toBe(false)
    expect(e.fixes.get(3)).toBe(0)
    expect(e.attendus).toBe(4)
    // Repos fixes de la semaine type : impossibles, et la règle 4 ne joue
    // pas (les repos fixes passent avant).
    const thomas = s.personnes.get(String(qui('Thomas').id))!
    expect(thomas.fixes.get(0)).toBe(0)
    expect(thomas.fixes.get(6)).toBe(0)
    expect(thomas.weekendLibreAvant).toBeNull()
    // École la semaine d'après : travaillée d'office.
    const chloe = s.personnes.get(String(qui('Chloé').id))!
    expect([0, 1, 2, 3, 4].map((j) => chloe.fixes.get(j))).toEqual([
      1, 1, 1, 1, 1,
    ])
    // ... mais pas à l'hôtel : elle ne compte dans aucun groupe ces jours-là.
    expect([...chloe.horsSite].sort()).toEqual([0, 1, 2, 3, 4])
    // Le shift gardé ne compte que pour les groupes de son poste.
    expect(e.postesGardes.get(1)).toBe(String(reception.id))
  })
  it('repos proposé de la semaine d’après : oublié si elle est recalculée', () => {
    const repos = {
      id: 77,
      code: 'R',
      nom: 'Repos',
      couleur: '#000000',
      decompte: false,
      nature: 'repos' as const,
    }
    const avecRepos = (suivanteRecalculee: boolean) => {
      const d = donnees([])
      return preparerGeneration(
        {
          ...d,
          referentiel: {
            ...d.referentiel,
            motifs: [...d.referentiel.motifs, repos],
          },
          absences: [
            ...d.absences,
            {
              id: 9998,
              salarie_id: lucas,
              jour: ajouterJours(SUIVANT, 5),
              motif_id: repos.id,
              epinglee: false,
            },
          ],
        },
        { aujourdhui: '2026-11-01', horizon: { suivanteRecalculee } },
      ).probleme.suivante!.personnes.get(String(lucas))!
    }
    expect(avecRepos(true).fixes.has(5)).toBe(false)
    expect(avecRepos(false).fixes.get(5)).toBe(0)
  })

  it('semaine suivante gardée telle quelle : ses propositions sont des faits', () => {
    const s = esquisse([shift(lucas, 2, false)], false)
    expect(s.personnes.get(String(lucas))!.fixes.get(2)).toBe(1)
  })
  it('les groupes : l’accueil et les postes à part, avec leurs membres', () => {
    const s = esquisse([], true)
    expect(s.groupes.length).toBeGreaterThan(0)
    for (const g of s.groupes) {
      expect(g.besoins).toHaveLength(7)
      expect(g.membres.size).toBeGreaterThan(0)
      for (const id of g.membres) expect(s.personnes.has(id)).toBe(true)
    }
  })
  it('jamais pour la pose des horaires fixes', () => {
    const g = preparerGeneration(donnees([]), {
      aujourdhui: '2026-11-01',
      seulement: new Set([qui('Thomas').id]),
      horizon: { suivanteRecalculee: true },
    })
    expect(g.probleme.suivante).toBeUndefined()
  })
})
