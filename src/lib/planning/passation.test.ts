import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  construire,
  generer,
  POIDS_PASSATION,
  POIDS_PLACE,
  zonesPassation,
} from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import { creneau, probleme, salarieSolveur } from '#/lib/planning/modele.ts'
import type {
  ConsigneSolveur,
  Creneau,
  Probleme,
  SalarieSolveur,
} from '#/lib/planning/modele.ts'
import { transmissions } from '#/lib/planning/verificateur.ts'

/*
 * Passation avec le veilleur (décision utilisateur du 2026-11-04 : « le
 * shift finit à 23 h pour le soir et celui de la nuit commence à 23 h ; il
 * faut que la passation soit nickel »). Le soir, le veilleur arrive avant
 * que le dernier du soir parte ; le matin, le premier du matin arrive avant
 * que le veilleur parte. Oracle : `transmissions` (verificateur.ts), écrit
 * sans rien du générateur. Données fictives.
 */

const H = 60
const J = 24 * H

let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})
const gen = (p: Probleme) => generer(p, highs)

const sal = (id: string, kw: Partial<SalarieSolveur> = {}): SalarieSolveur =>
  salarieSolveur({
    id,
    postes: new Set(['rec']),
    minutesHebdoContrat: 0,
    minutesHebdoMax: 48 * H,
    minutesJourMax: 12 * H,
    joursTravaillesMaxSemaine: 6,
    reposQuotidienMin: 11 * H,
    ...kw,
  })
const cand = (
  id: string,
  poste: string,
  jour: number,
  debutH: number,
  finH: number,
  presence: Creneau['presence'],
): Creneau =>
  creneau({
    id,
    poste,
    debut: jour * J + debutH * H,
    fin: jour * J + finH * H,
    effectif: 0,
    jourPlanning: jour,
    presence,
    accueil: true,
  })
const chiffre = (
  jour: number,
  periode: ConsigneSolveur['periode'],
  n: number,
): ConsigneSolveur => ({ jour, periode, minimum: n, maximum: n })
const qui = (r: ReturnType<typeof gen>) =>
  r.affectations.map((a) => `${a.salarieId}@${a.creneauId}`).sort()

const salaries = [sal('a'), sal('b'), sal('v', { postes: new Set(['veille']) })]
const nuit = cand('n0', 'veille', 0, 23, 31, ['nuit'])

describe('passation du soir au veilleur', () => {
  // Le soir qui finit à 23:00 est plus long d'une heure : sans la règle, le
  // calcul gardait le plus court (un quart d'heure de trou, 1 500, contre
  // une heure de plus, 3 000).
  const consignes = [chiffre(0, 'soir', 1), chiffre(0, 'nuit', 1)]

  it('accepté : il prend le soir qui finit à l’arrivée du veilleur', () => {
    const p = probleme({
      salaries,
      creneaux: [
        cand('s2245', 'rec', 0, 14, 22.75, ['soir']),
        cand('s2300', 'rec', 0, 13.25, 23, ['soir']),
        nuit,
      ],
      consignes,
      nbJours: 1,
    })
    const r = gen(p)
    expect(qui(r)).toContain('v@n0')
    expect(qui(r).some((x) => x.endsWith('@s2300'))).toBe(true)
    expect(r.passationsManquantes).toEqual([])
    expect(transmissions(p, r.affectations, [])[0].soirNuit).toBe('ok')
  })

  it('refusé : aucun soir ne va jusqu’à 23:00, le veilleur vient quand même et c’est dit', () => {
    const p = probleme({
      salaries,
      creneaux: [cand('s2245', 'rec', 0, 14, 22.75, ['soir']), nuit],
      consignes,
      nbJours: 1,
    })
    const r = gen(p)
    expect(qui(r)).toContain('v@n0')
    expect(r.passationsManquantes).toEqual([{ jour: 0, cote: 'arrivee' }])
    expect(transmissions(p, r.affectations, [])[0].soirNuit).toBe('manque')
  })
})

describe('passation du veilleur au matin', () => {
  const consignes = [chiffre(0, 'nuit', 1), chiffre(1, 'matin', 1)]

  it('accepté : le matin arrive au départ du veilleur, même un peu plus long', () => {
    const p = probleme({
      salaries,
      creneaux: [
        nuit,
        cand('m0730', 'rec', 1, 7.5, 15.5, ['matin']),
        cand('m0700', 'rec', 1, 7, 16.5, ['matin']),
      ],
      consignes,
      nbJours: 2,
    })
    const r = gen(p)
    expect(qui(r).some((x) => x.endsWith('@m0700'))).toBe(true)
    expect(r.passationsManquantes).toEqual([])
    expect(transmissions(p, r.affectations, [])[1].nuitMatin).toBe('ok')
  })

  it('refusé : le seul matin arrive après son départ', () => {
    const p = probleme({
      salaries,
      creneaux: [nuit, cand('m0730', 'rec', 1, 7.5, 15.5, ['matin'])],
      consignes,
      nbJours: 2,
    })
    const r = gen(p)
    expect(r.passationsManquantes).toEqual([{ jour: 0, cote: 'depart' }])
    expect(transmissions(p, r.affectations, [])[1].nuitMatin).toBe('manque')
  })

  it('le dernier jour : le matin d’après est dans la semaine suivante, rien n’est cherché', () => {
    const p = probleme({
      salaries,
      creneaux: [cand('s', 'rec', 0, 15, 23, ['soir']), nuit],
      consignes: [chiffre(0, 'soir', 1), chiffre(0, 'nuit', 1)],
      nbJours: 1,
    })
    expect(zonesPassation(p).map((z) => z.cote)).toEqual(['arrivee'])
  })

  it('le lundi matin : la passation se fait avec le veilleur du dimanche d’avant', () => {
    const creneaux = [
      cand('m0700', 'rec', 0, 7, 16.5, ['matin']),
      cand('m0730', 'rec', 0, 7.5, 15.5, ['matin']),
    ]
    const consignes = [chiffre(0, 'matin', 1)]
    const veille = [{ debut: -60, fin: 7 * H }]
    // Accepté : le veilleur part à 07:00, le matin de 07:00 est choisi.
    const p = probleme({
      salaries,
      creneaux,
      consignes,
      veilleDuLundi: veille,
      nbJours: 1,
    })
    const r = gen(p)
    expect(qui(r).some((x) => x.endsWith('@m0700'))).toBe(true)
    expect(r.passationsManquantes).toEqual([])
    expect(transmissions(p, r.affectations, [], veille)[0].nuitMatin).toBe('ok')
    // Refusé : sans la nuit d'avant, rien n'est cherché (le plus court).
    const sans = gen(probleme({ salaries, creneaux, consignes, nbJours: 1 }))
    expect(qui(sans).some((x) => x.endsWith('@m0730'))).toBe(true)
  })
})

describe('une présence, pas un compte de personnes (comme l’oracle)', () => {
  const deux = [...salaries, sal('v2', { postes: new Set(['veille']) })]

  it('deux veilleurs sur la même nuit : un seul relais suffit', () => {
    const p = probleme({
      salaries: deux,
      creneaux: [cand('s2300', 'rec', 0, 15, 23, ['soir']), nuit],
      consignes: [chiffre(0, 'soir', 1), chiffre(0, 'nuit', 2)],
      nbJours: 1,
    })
    const r = gen(p)
    expect(qui(r).filter((x) => x.endsWith('@n0')).length).toBe(2)
    expect(r.passationsManquantes).toEqual([])
    expect(transmissions(p, r.affectations, [])[0].soirNuit).toBe('ok')
  })

  it('deux veilleurs sans soir jusqu’à leur arrivée : les deux viennent quand même', () => {
    const p = probleme({
      salaries: deux,
      creneaux: [cand('s2200', 'rec', 0, 14, 22, ['soir']), nuit],
      consignes: [chiffre(0, 'soir', 1), chiffre(0, 'nuit', 2)],
      nbJours: 1,
    })
    const r = gen(p)
    expect(qui(r).filter((x) => x.endsWith('@n0')).length).toBe(2)
    expect(r.passationsManquantes).toEqual([{ jour: 0, cote: 'arrivee' }])
  })

  it('deux nuits à des heures différentes : la plus tôt fait foi', () => {
    // Le soir finit à 22:30 : le veilleur de 22:00 est relayé, celui de
    // 23:00 arrive après lui. L'oracle dit ok, le calcul aussi.
    // Chaque veilleur a sa nuit (deux postes) : les deux sont tenues.
    const p = probleme({
      salaries: [...salaries, sal('v2', { postes: new Set(['veille2']) })],
      creneaux: [
        cand('s2230', 'rec', 0, 14.5, 22.5, ['soir']),
        cand('n22', 'veille2', 0, 22, 30, ['nuit']),
        nuit,
      ],
      consignes: [chiffre(0, 'soir', 1), chiffre(0, 'nuit', 2)],
      nbJours: 1,
    })
    const r = gen(p)
    expect(qui(r)).toEqual(expect.arrayContaining(['v@n0', 'v2@n22']))
    expect(r.passationsManquantes).toEqual([])
    expect(transmissions(p, r.affectations, [])[0].soirNuit).toBe('ok')
  })

  it('un soir non demandé n’est pas ajouté pour la passation', () => {
    const p = probleme({
      salaries,
      creneaux: [cand('s', 'rec', 0, 15, 23, ['soir']), nuit],
      consignes: [chiffre(0, 'nuit', 1)],
      nbJours: 1,
    })
    const r = gen(p)
    expect(qui(r)).toEqual(['v@n0'])
    expect(r.passationsManquantes).toEqual([])
  })
})

describe('le rang de la passation', () => {
  it('une place, un peu plus chère ; la nuit sans veilleur vaut plus que ses deux passations', () => {
    // Une passation manquée est une place (niveau essentiel, avec les
    // heures dues), un peu plus chère qu'une autre.
    expect(POIDS_PASSATION).toBeGreaterThan(POIDS_PLACE)
    // Un veilleur ajouté peut manquer ses deux passations : la nuit sans
    // veilleur coûte plus, sinon elle resterait vide pour les éviter.
    const { modele, minimums, passations } = construire(
      probleme({
        salaries,
        creneaux: [cand('s', 'rec', 0, 15, 23, ['soir']), nuit],
        consignes: [chiffre(0, 'soir', 1), chiffre(0, 'nuit', 1)],
        nbJours: 1,
      }),
    )
    const essentiel = new Map(
      modele.niveaux().find(([nom]) => nom === 'essentiel')![1],
    )
    expect(passations.length).toBeGreaterThan(0)
    for (const { v } of passations)
      expect(essentiel.get(v)).toBe(POIDS_PASSATION)
    const manqueNuit = minimums.find((x) => x.consigne === 1)!.v
    expect(essentiel.get(manqueNuit)).toBeGreaterThan(2 * POIDS_PASSATION)
    expect(essentiel.get(minimums.find((x) => x.consigne === 0)!.v)).toBe(
      POIDS_PLACE,
    )
  })
})
