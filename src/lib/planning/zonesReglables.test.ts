/*
 * Les zones de l'établissement (2026-11-06, lot 2, A5) : une seconde zone
 * « Room service », tenue en continu, a son tableau, ses trous, sa relève
 * et sa passation (règles fixes du 2026-11-06), sans rien mélanger avec
 * l'Accueil. Un poste qui tient le
 * jour ET la nuit compte aux deux. Données fictives.
 */

import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  generer,
  zonesPassation,
  zonesReleve,
} from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import { creneau, probleme, salarieSolveur } from '#/lib/planning/modele.ts'
import type {
  ConsigneSolveur,
  Creneau,
  Probleme,
  SalarieSolveur,
} from '#/lib/planning/modele.ts'
import {
  lireRegles,
  REGLES_PAR_DEFAUT,
} from '#/lib/planning/reglesEtablissement.ts'
import type { Zone } from '#/lib/planning/types.ts'
import {
  presenceParCycle,
  transmissions,
  trousAccueil,
  violationsAccueil,
} from '#/lib/planning/verificateur.ts'
import {
  posteIdZone,
  vuesZones,
  zoneDuPosteId,
  zonesEnService,
} from '#/lib/planning/zones.ts'

const H = 60

let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

const ZONES: Zone[] = [
  {
    id: 1,
    nom: 'Accueil',
    ordre: 0,
    continue: true,
  },
  {
    id: 2,
    nom: 'Room service',
    ordre: 1,
    continue: true,
  },
]
const R = lireRegles({ zones: ZONES })

const sal = (id: string, postes: string[]): SalarieSolveur =>
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
  zone: string,
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
    zone,
  })
const chiffre = (
  zone: string,
  periode: string,
  n: number,
): ConsigneSolveur => ({ zone, jour: 0, periode, minimum: n, maximum: n })

// L'accueil : matin 7-15, soir 15-23, nuit 23-7. Room service : matin
// 7-14, soir 17-23 (un trou de 14 h à 17 h s'il n'y a qu'eux).
const creneaux = [
  cand('am', 'rec', '1', 7, 15, ['matin']),
  cand('as', 'rec', '1', 14.5, 23, ['soir']),
  cand('an', 'veille', '1', 23, 31, ['nuit']),
  cand('rm', 'rs', '2', 7, 14, ['matin']),
  cand('rs', 'rs', '2', 17, 23, ['soir']),
]
const consignes = [
  chiffre('1', 'matin', 1),
  chiffre('1', 'soir', 1),
  chiffre('1', 'nuit', 1),
  chiffre('2', 'matin', 1),
  chiffre('2', 'soir', 1),
]
const pb = (): Probleme =>
  probleme({
    salaries: [
      sal('a', ['rec']),
      sal('b', ['rec']),
      sal('v', ['veille']),
      sal('r', ['rs']),
      sal('s', ['rs']),
    ],
    creneaux,
    nbJours: 1,
    consignes,
    releveMinutes: 30,
    regles: R,
  })

describe('une seconde zone, Room service', () => {
  it('chaque zone a sa vue : ses créneaux, ses chiffres, sa relève', () => {
    const v = vuesZones(pb())
    expect(v.map((x) => x.zone.nom)).toEqual(['Accueil', 'Room service'])
    expect(v[1].p.creneaux.map((c) => c.id)).toEqual(['rm', 'rs'])
    expect(v[1].p.consignes).toHaveLength(2)
    // Relève fixe (2026-11-06) : la même dans toute zone tenue en continu,
    // aucune dans une zone qui ne l'est pas.
    expect(v[0].p.releveMinutes).toBe(30)
    expect(v[1].p.releveMinutes).toBe(30)
    const sansContinu = probleme({
      ...pb(),
      regles: lireRegles({
        zones: ZONES.map((z) => (z.id === 2 ? { ...z, continue: false } : z)),
      }),
    })
    expect(vuesZones(sansContinu)[1].p.releveMinutes).toBe(0)
  })

  it('relève et passation : celles de l’Accueil seulement', () => {
    const p = pb()
    // Room service : son matin (7-14) et son soir (17-23) ne se croisent
    // jamais, et elle n'a pas de nuit : rien pour elle.
    expect(zonesReleve(p)).toHaveLength(1)
    expect(zonesPassation(p).map((z) => [z.zone, z.cote])).toEqual([
      ['1', 'arrivee'],
    ])
  })

  it('ses trous sont les siens, indépendants de l’Accueil', () => {
    const p = pb()
    // Tout le monde placé : l'accueil est tenu, Room service a son trou de
    // 14 h à 17 h (rien entre son matin et son soir).
    const tous = creneaux.map((c) => ({
      salarieId: { am: 'a', as: 'b', an: 'v', rm: 'r', rs: 's' }[
        c.id
      ] as string,
      creneauId: c.id,
    }))
    const t = trousAccueil(p, tous)
    expect(t.map((x) => [x.poste, x.debut / H, x.fin / H])).toEqual([
      ['accueil:2', 14, 17],
    ])
    // Une zone qui n'est pas tenue en continu n'a pas de trou.
    const sansContinu = probleme({
      ...p,
      regles: lireRegles({
        zones: ZONES.map((z) => (z.id === 2 ? { ...z, continue: false } : z)),
      }),
    })
    expect(trousAccueil(sansContinu, tous)).toEqual([])
  })

  it('le calcul pourvoit chaque zone à son chiffre', () => {
    const r = generer(pb(), highs)
    const places = r.affectations.map((a) => a.creneauId).sort()
    expect(places).toEqual(['am', 'an', 'as', 'rm', 'rs'])
    expect(r.manques).toEqual([])
  })

  it('identifiants de zone dans les sorties : 0 l’Accueil, -1 Room service', () => {
    expect(posteIdZone(R.zones, '1')).toBe(0)
    expect(Object.is(posteIdZone(R.zones, '1'), -0)).toBe(false)
    expect(posteIdZone(R.zones, '2')).toBe(-1)
    expect(zoneDuPosteId(R.zones, -1)?.nom).toBe('Room service')
    expect(zoneDuPosteId(R.zones, 4)).toBeNull()
    expect([
      ...zonesEnService([{ zone_id: 2 }, { zone_id: 1, ferme: true }]),
    ]).toEqual(['2'])
  })

  it('sans zone en base : l’accueil aux réglages généraux', () => {
    expect(REGLES_PAR_DEFAUT.zones).toHaveLength(1)
    expect(REGLES_PAR_DEFAUT.zones[0]).toEqual({
      id: '1',
      nom: 'Accueil',
      continue: true,
    })
  })
})

describe('relecture du 2026-11-06 : le vérificateur compte zone par zone', () => {
  const seulAccueil = [
    { salarieId: 'a', creneauId: 'am' },
    { salarieId: 'b', creneauId: 'as' },
  ]

  it('le matin de Room service ne compte pas celui de l’Accueil', () => {
    const x = presenceParCycle(pb(), seulAccueil)
    // Dans l'ordre des chiffres : Accueil matin, soir, nuit, puis Room service.
    expect(x.map((e) => e.compte)).toEqual([1, 1, 0, 0, 0])
    expect(x[3].ecart).toBe(-1)
  })

  it('« 2 à 3 » : trois personnes ne sont pas de trop', () => {
    const p = probleme({
      ...pb(),
      salaries: [...pb().salaries, sal('c', ['rec'])],
      creneaux: [...creneaux, cand('am2', 'rec', '1', 7, 15, ['matin'])],
      consignes: [
        { zone: '1', jour: 0, periode: 'matin', minimum: 1, maximum: 2 },
      ],
    })
    const deux = [
      { salarieId: 'a', creneauId: 'am' },
      { salarieId: 'c', creneauId: 'am2' },
    ]
    expect(presenceParCycle(p, deux)[0].ecart).toBe(0)
    expect(
      violationsAccueil(p, deux).filter((v) => v.regle === 'ACCUEIL-SURPLUS'),
    ).toEqual([])
  })

  it('les transmissions regardent toutes les zones tenues en continu', () => {
    const tous = creneaux.map((c) => ({
      salarieId: { am: 'a', as: 'b', an: 'v', rm: 'r', rs: 's' }[
        c.id
      ] as string,
      creneauId: c.id,
    }))
    // L'accueil passe la main (matin 7-15, soir 14 h 30) ; Room service non
    // (matin 7-14, soir 17 h) : le lien du jour manque.
    expect(transmissions(pb(), tous, [])[0].matinSoir).toBe('manque')
    // Accepté : la seconde zone qui n'est pas tenue en continu ne compte pas.
    const sansContinu = probleme({
      ...pb(),
      regles: lireRegles({
        zones: ZONES.map((z) => (z.id === 2 ? { ...z, continue: false } : z)),
      }),
    })
    expect(transmissions(sansContinu, tous, [])[0].matinSoir).toBe('ok')
  })
})
