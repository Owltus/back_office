import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'
import { phraseEquipe } from '#/components/planning/attention.ts'
import { generer } from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import { creneau, probleme, salarieSolveur } from '#/lib/planning/modele.ts'
import type {
  AffectationSolveur,
  ConsigneSolveur,
  Creneau,
  Probleme,
  SalarieSolveur,
} from '#/lib/planning/modele.ts'
import { equipesDesynchro } from '#/lib/planning/verificateur.ts'

/*
 * Règle 17 du PRD (demande utilisateur du 2026-11-03 : « éviter d'avoir des
 * hôteliers seuls le soir ; qu'ils restent ensemble le maximum possible, à
 * trente minutes près ; synchro comme le matin ; un changement de shift
 * parfait »). Oracle : à l'accueil, les arrivées du soir et les départs du
 * soir à 30 min près, chaque personne du soir qui croise une personne du
 * matin le temps de la relève. Données fictives seulement.
 */

const H = 60

let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

const sal = (id: string, postes = ['rec', 'club']): SalarieSolveur =>
  salarieSolveur({
    id,
    postes: new Set(postes),
    minutesHebdoContrat: 0,
    minutesHebdoMax: 48 * H,
    minutesJourMax: 12 * H,
    joursTravaillesMaxSemaine: 6,
    reposQuotidienMin: 11 * H,
  })

const cand = (
  id: string,
  poste: string,
  debutH: number,
  finH: number,
  presence: Creneau['presence'],
): Creneau =>
  creneau({
    id,
    poste,
    debut: debutH * H,
    fin: finH * H,
    effectif: 0,
    jourPlanning: 0,
    presence,
    accueil: true,
  })

const chiffre = (
  periode: ConsigneSolveur['periode'],
  n: number,
): ConsigneSolveur => ({ jour: 0, periode, minimum: n, maximum: n })

const salaries = [sal('a'), sal('b'), sal('c')]
const consignes = [chiffre('matin', 1), chiffre('soir', 2)]
const pb = (creneaux: Creneau[], graine = 1): Probleme =>
  probleme({
    salaries,
    creneaux,
    consignes,
    nbJours: 1,
    releveMinutes: 30,
    graine,
  })
const soirs = (r: { affectations: AffectationSolveur[] }, p: Probleme) =>
  r.affectations
    .map((a) => p.creneaux.find((c) => c.id === a.creneauId)!)
    .filter((c) => c.presence[0] === 'soir')
    .map((c) => c.id)
    .sort()

const matin = cand('m', 'rec', 7, 15.75, ['matin'])

describe('règle 17 : arrivées du soir ensemble', () => {
  // Deux soirs à 14:30 (un par poste) et un à 16:15 : le moteur prend les
  // deux de 14:30, quelle que soit la graine.
  const creneaux = [
    matin,
    cand('s1', 'rec', 14.5, 23.25, ['soir']),
    cand('s2', 'club', 14.5, 23.25, ['soir']),
    cand('s3', 'club', 16.25, 23.75, ['soir']),
    cand('s4', 'rec', 16.25, 23.75, ['soir']),
  ]

  it('accepté : le moteur fait arriver le soir ensemble', () => {
    for (let graine = 1; graine <= 6; graine++) {
      const p = pb(creneaux, graine)
      const r = generer(p, highs)
      const pris = soirs(r, p)
      expect(pris).toHaveLength(2)
      expect(
        pris.every((id) => ['s1', 's2'].includes(id)) ||
          pris.every((id) => ['s3', 's4'].includes(id)),
      ).toBe(true)
      expect(
        equipesDesynchro(p, r.affectations).filter((e) => e.arrivees),
      ).toEqual([])
    }
  })

  it('refusé : 14:30 et 16:15 ensemble, l’alerte le dit', () => {
    const p = pb(creneaux)
    const e = equipesDesynchro(p, [
      { salarieId: 'a', creneauId: 'm' },
      { salarieId: 'b', creneauId: 's1' },
      { salarieId: 'c', creneauId: 's3' },
    ])
    expect(e).toEqual([
      {
        jour: 0,
        moment: 'soir',
        arrivees: { debut: 14.5 * H, fin: 16.25 * H },
        departs: null,
        // 16:15 ne croise pas le matin parti à 15:45, mais aucun horaire du
        // matin ne le permettait : pas de relève reprochée.
        sansReleve: 0,
      },
    ])
  })

  it('accepté : 30 min d’écart, pas d’alerte ; une personne seule non plus', () => {
    const p = pb([
      matin,
      cand('s1', 'rec', 14.5, 23.25, ['soir']),
      cand('s5', 'club', 15, 23.25, ['soir']),
    ])
    expect(
      equipesDesynchro(p, [
        { salarieId: 'a', creneauId: 'm' },
        { salarieId: 'b', creneauId: 's1' },
        { salarieId: 'c', creneauId: 's5' },
      ]),
    ).toEqual([])
    expect(
      equipesDesynchro(p, [
        { salarieId: 'a', creneauId: 'm' },
        { salarieId: 'b', creneauId: 's1' },
      ]),
    ).toEqual([])
  })
})

describe('règle 17 : personne seule à la fin du soir', () => {
  // a et b ne tiennent que la Réception (le matin, puis le soir jusqu'à
  // minuit), c le Club : jusqu'à minuit, ou jusqu'à 23:15, plus court donc
  // moins cher sans la règle.
  const equipe = [sal('a', ['rec']), sal('b', ['rec']), sal('c', ['club'])]
  const creneaux = [
    matin,
    cand('d1', 'rec', 15, 24, ['soir']),
    cand('d2', 'club', 15, 24, ['soir']),
    cand('d3', 'club', 15, 23.25, ['soir']),
  ]

  it('accepté : le moteur fait partir le soir ensemble', () => {
    for (let graine = 1; graine <= 6; graine++) {
      const p = { ...pb(creneaux, graine), salaries: equipe }
      const r = generer(p, highs)
      expect(soirs(r, p)).toEqual(['d1', 'd2'])
      expect(equipesDesynchro(p, r.affectations)).toEqual([])
    }
  })

  it('refusé : l’un part à 23:15, l’autre à minuit', () => {
    const p = pb(creneaux)
    expect(
      equipesDesynchro(p, [
        { salarieId: 'a', creneauId: 'm' },
        { salarieId: 'b', creneauId: 'd1' },
        { salarieId: 'c', creneauId: 'd3' },
      ]),
    ).toEqual([
      {
        jour: 0,
        moment: 'soir',
        arrivees: null,
        departs: { debut: 23.25 * H, fin: 24 * H },
        sansReleve: 0,
      },
    ])
  })
})

describe('règle 17 : la relève de chacun', () => {
  // Le matin part à 15:45. 15:00 et 15:15 le croisent (45 et 30 min), 15:30
  // non (15 min). Un matin long (jusqu'à 17:45) croiserait 15:30, mais
  // coûte deux heures de plus : la relève se cherche, elle est possible.
  // 15:30 est le soir le plus court : sans la règle, le moteur le prend.
  const creneaux = [
    matin,
    cand('m2', 'club', 7, 17.75, ['matin']),
    cand('r1', 'rec', 15, 23.5, ['soir']),
    cand('r2', 'club', 15.25, 23.5, ['soir']),
    cand('r3', 'club', 15.5, 23.5, ['soir']),
  ]

  it('accepté : chaque personne du soir croise le matin', () => {
    for (let graine = 1; graine <= 6; graine++) {
      const p = pb(creneaux, graine)
      const r = generer(p, highs)
      const pris = soirs(r, p)
      expect(pris).toHaveLength(2)
      expect(pris.every((id) => id !== 'r3')).toBe(true)
      expect(equipesDesynchro(p, r.affectations)).toEqual([])
    }
  })

  it('refusé : celle de 15:30 arrive sans relève', () => {
    const p = pb(creneaux)
    expect(
      equipesDesynchro(p, [
        { salarieId: 'a', creneauId: 'm' },
        { salarieId: 'b', creneauId: 'r1' },
        { salarieId: 'c', creneauId: 'r3' },
      ]),
    ).toEqual([
      {
        jour: 0,
        moment: 'soir',
        arrivees: null,
        departs: null,
        sansReleve: 1,
      },
    ])
  })

  it('refusé : sans relève réglée, rien n’est dit', () => {
    const p = { ...pb(creneaux), releveMinutes: 0 }
    expect(
      equipesDesynchro(p, [
        { salarieId: 'a', creneauId: 'm' },
        { salarieId: 'b', creneauId: 'r1' },
        { salarieId: 'c', creneauId: 'r3' },
      ]),
    ).toEqual([])
  })
})

describe('règle 17 : le matin et la place vide', () => {
  it('le matin étalé est signalé (le moteur s’en remet à l’ouverture)', () => {
    const p = probleme({
      salaries,
      creneaux: [
        cand('m1', 'rec', 7, 15, ['matin']),
        cand('m2', 'club', 9, 17, ['matin']),
      ],
      consignes: [chiffre('matin', 2)],
      nbJours: 1,
    })
    expect(
      equipesDesynchro(p, [
        { salarieId: 'a', creneauId: 'm1' },
        { salarieId: 'b', creneauId: 'm2' },
      ]),
    ).toEqual([
      {
        jour: 0,
        moment: 'matin',
        arrivees: { debut: 7 * H, fin: 9 * H },
        departs: null,
        sansReleve: 0,
      },
    ])
  })

  it('jamais une place vide pour la règle : 14:30 et 16:15 plutôt qu’un manque', () => {
    // b ne tient que la Réception (14:30), c que le Club (16:15) : le soir
    // demande deux personnes, il les aura, étalées.
    const p = probleme({
      salaries: [sal('a'), sal('b', ['rec']), sal('c', ['club'])],
      creneaux: [
        matin,
        cand('s1', 'rec', 14.5, 23.25, ['soir']),
        cand('s3', 'club', 16.25, 23.75, ['soir']),
      ],
      consignes,
      nbJours: 1,
      releveMinutes: 30,
    })
    const r = generer(p, highs)
    expect(soirs(r, p)).toEqual(['s1', 's3'])
    expect(r.manques).toEqual([])
  })
})

describe('règle 17 : la phrase à l’écran', () => {
  it('dit ce qui ne va pas, en clair', () => {
    expect(
      phraseEquipe(
        {
          jour: 3,
          moment: 'soir',
          arrivees: { debut: '14:30', fin: '16:15' },
          departs: { debut: '23:15', fin: '00:00' },
          sans_releve: 1,
        },
        'jeudi 5',
      ),
    ).toBe(
      'Soir jeudi 5 : arrivées étalées de 14 h 30 à 16 h 15, départs étalés de 23 h 15 à 0 h, une personne arrive sans relève',
    )
    expect(
      phraseEquipe(
        {
          jour: 0,
          moment: 'matin',
          arrivees: { debut: '07:00', fin: '09:00' },
          departs: null,
          sans_releve: 0,
        },
        'lundi 2',
      ),
    ).toBe('Matin lundi 2 : arrivées étalées de 7 h à 9 h')
  })
})
