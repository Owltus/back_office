import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import { generer } from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import {
  confirmeSur,
  creneau,
  ensemble,
  morceaux,
  probleme,
  salarieSolveur,
} from '#/lib/planning/modele.ts'
import type {
  ConsigneSolveur,
  Creneau,
  Probleme,
  SalarieSolveur,
} from '#/lib/planning/modele.ts'
import { raisonClaire } from '#/lib/planning/raisonsPlaces.ts'
import { REGLES_PAR_DEFAUT } from '#/lib/planning/reglesEtablissement.ts'
import { verifierReglages } from '#/lib/planning/coherence.ts'
import { versSolveur } from '#/lib/planning/regles.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import { PlanningMemoire } from '#/lib/planning/test/planningMemoire.ts'
import { sansAccompagne } from '#/lib/planning/test/reglesTest.ts'
import { accompagnement } from '#/lib/planning/zones.ts'
import {
  accompagnesSeuls,
  raisonsBlocage,
  raisonsBlocageAccueil,
  soutiensSeuls,
  violations,
} from '#/lib/planning/verificateur.ts'

/*
 * Jamais sans un salarié confirmé (décision de l'utilisateur du 2026-11-09 :
 * « imagine un hôtel où tout le personnel sur le poste sont des apprentis,
 * pas ouf niveau responsabilité. Donc toujours avec un CDI ou CDD hôtelier
 * normal, et pareil pour les stagiaires »). Une personne dont le contrat a
 * la case (`accompagne`), quel que soit son niveau, n'est sur un créneau que
 * si, à TOUT MOMENT de ce créneau, une personne confirmée (autonome, contrat
 * sans la case) est sur le même poste (`morceaux` : la définition du soutien
 * jamais seul, étendue à toute la durée). Accepté et refusé, pour le calcul (places et accueil), le
 * vérificateur, les raisons d'une place. « Le même poste » : la ZONE du
 * poste quand il en a une, sinon le poste (décision du même jour : « peu
 * importe sur le poste, mais il faut du monde », `accompagnement`).
 * Données fictives.
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
    postes: new Set(['rec', 'club']),
    minutesHebdoContrat: 0,
    minutesHebdoMax: 48 * H,
    minutesJourMax: 12 * H,
    joursTravaillesMaxSemaine: 6,
    reposQuotidienMin: 11 * H,
    ...kw,
  })
/** Un apprenti TITULAIRE (autonome) : la case le retient quand même. */
const apprenti = (id: string, kw: Partial<SalarieSolveur> = {}) =>
  sal(id, { accompagne: true, ...kw })

/** Une place de `poste`, le lundi, de `debutH` à `finH`. */
const place = (
  id: string,
  poste: string,
  debutH: number,
  finH: number,
  kw: Partial<Creneau> = {},
): Creneau =>
  creneau({
    id,
    poste,
    debut: debutH * H,
    fin: finH * H,
    effectif: 1,
    jourPlanning: 0,
    ...kw,
  })
/** Un candidat de l'accueil (le chiffre du moment décide). */
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

const qui = (r: ReturnType<typeof gen>) =>
  r.affectations.map((a) => `${a.salarieId}@${a.creneauId}`).sort()

describe('qui est confirmé, et quand on est ensemble', () => {
  it('confirmé : autonome sur le poste, contrat sans la case', () => {
    expect(confirmeSur(sal('t'), 'rec')).toBe(true)
    expect(
      confirmeSur(sal('d', { postesOccasionnels: new Set(['rec']) }), 'rec'),
    ).toBe(true)
    // Refusé : un apprenti titulaire, un soutien, un autre poste.
    expect(confirmeSur(apprenti('a'), 'rec')).toBe(false)
    expect(
      confirmeSur(
        sal('s', { postes: new Set(), postesSoutien: new Set(['rec']) }),
        'rec',
      ),
    ).toBe(false)
    expect(confirmeSur(sal('t', { postes: new Set(['club']) }), 'rec')).toBe(
      false,
    )
  })
  it('ensemble : même poste ET des heures qui se chevauchent', () => {
    const a = place('a', 'rec', 8, 15)
    expect(ensemble(a, place('b', 'rec', 14, 22))).toBe(true)
    expect(ensemble(a, place('b', 'rec', 15, 22))).toBe(false)
    expect(ensemble(a, place('b', 'club', 8, 15))).toBe(false)
  })
  it('morceaux : le créneau coupé aux bornes des autres, chacun avec ceux qui le couvrent', () => {
    const a = place('a', 'rec', 8, 16)
    const t1 = place('t1', 'rec', 7, 12)
    const t2 = place('t2', 'rec', 11, 20)
    const club = place('c', 'club', 8, 16)
    const m = morceaux(a, [t1, t2, club])
    expect(
      m.map((o) => [o.debut / H, o.fin / H, o.par.map((d) => d.id)]),
    ).toEqual([
      [8, 11, ['t1']],
      [11, 12, ['t1', 't2']],
      [12, 16, ['t2']],
    ])
    // Un trou de 12 h à 14 h : un morceau sans personne.
    const trou = morceaux(a, [t1, place('t3', 'rec', 14, 20)])
    expect(
      trou.filter((o) => !o.par.length).map((o) => [o.debut / H, o.fin / H]),
    ).toEqual([[12, 14]])
    // Personne autour : un seul morceau, vide.
    expect(morceaux(a, [club])).toEqual([
      { debut: 8 * H, fin: 16 * H, par: [] },
    ])
  })
  it('la case vient du type de contrat : apprenti et stagiaire à l’hôtel', () => {
    const f = (typeContrat: string) =>
      versSolveur({
        id: 'x',
        typeContrat,
        minutesHebdo: 35 * H,
        postes: new Set(['rec']),
      })
    expect(f('apprenti').accompagne).toBe(true)
    expect(f('stagiaire').accompagne).toBe(true)
    expect(f('cdi').accompagne).toBe(false)
    expect(f('cdd').accompagne).toBe(false)
    // Case décochée dans les règles : plus retenu.
    const sans = versSolveur({
      id: 'x',
      typeContrat: 'apprenti',
      minutesHebdo: 35 * H,
      postes: new Set(['rec']),
      regles: {
        ...REGLES_PAR_DEFAUT,
        modeles: {
          ...REGLES_PAR_DEFAUT.modeles,
          apprenti: {
            ...REGLES_PAR_DEFAUT.modeles.apprenti,
            accompagne: false,
          },
        },
      },
    })
    expect(sans.accompagne).toBe(false)
  })
})

describe('le calcul : une place à part', () => {
  it('refusé : seul, l’apprenti titulaire ne vient pas, la place reste vide', () => {
    const p = probleme({
      salaries: [apprenti('a')],
      creneaux: [place('p', 'rec', 8, 15)],
      nbJours: 1,
    })
    const r = gen(p)
    expect(r.statut).not.toBe('inconnu')
    expect(r.affectations).toEqual([])
    // Raison en clair : la règle de l'hôtel.
    const raisons = raisonsBlocage(p, r.affectations, 'p').get('a')!
    expect(raisons.map((v) => v.regle)).toEqual(['ACCOMPAGNE-SEUL'])
    expect(raisonClaire('ACCOMPAGNE-SEUL', raisons[0].message, 1).phrase).toBe(
      'Aucun salarié confirmé sur ce poste à ces heures',
    )
  })
  it('refusé : quel que soit leur nombre, deux apprentis ne se suffisent pas', () => {
    const p = probleme({
      salaries: [apprenti('a'), apprenti('b')],
      creneaux: [place('p', 'rec', 8, 15, { effectif: 2 })],
      nbJours: 1,
    })
    expect(gen(p).affectations).toEqual([])
  })
  it('accepté : avec un salarié confirmé là pendant tout son shift, sur une autre place', () => {
    const p = probleme({
      salaries: [sal('t', { postes: new Set(['rec']) }), apprenti('a')],
      creneaux: [place('p1', 'rec', 7, 16), place('p2', 'rec', 8, 15)],
      nbJours: 1,
    })
    const r = gen(p)
    expect(qui(r)).toEqual(['a@p2', 't@p1'])
    expect(violations(p, r.affectations)).toEqual([])
  })
  it('accepté : deux salariés confirmés qui se relaient le couvrent', () => {
    const p = probleme({
      salaries: [
        sal('t1', { postes: new Set(['rec']) }),
        sal('t2', { postes: new Set(['rec']) }),
        apprenti('a', { postes: new Set(['rec']) }),
      ],
      creneaux: [
        place('m', 'rec', 6, 13),
        place('s', 'rec', 13, 21),
        place('x', 'rec', 9, 17),
      ],
      nbJours: 1,
    })
    // t1 et t2 sont identiques : l'un ou l'autre ouvre (égalité).
    expect([
      ['a@x', 't1@m', 't2@s'],
      ['a@x', 't1@s', 't2@m'],
    ]).toContainEqual(qui(gen(p)))
  })
  it('refusé : croisé une partie seulement, l’apprenti finirait seul', () => {
    // Le salarié confirmé part à 15 h, l'apprenti finirait à 19 h : il ne
    // vient pas (un chevauchement suffit au soutien, pas ici).
    const p = probleme({
      salaries: [sal('t', { postes: new Set(['rec']) }), apprenti('a')],
      creneaux: [place('p1', 'rec', 7, 15), place('p2', 'rec', 11, 19)],
      nbJours: 1,
    })
    expect(gen(p).affectations.filter((x) => x.salarieId === 'a')).toEqual([])
    const raisons = raisonsBlocage(
      p,
      [{ salarieId: 't', creneauId: 'p1' }],
      'p2',
    ).get('a')!
    expect(raisons.map((v) => v.regle)).toEqual(['ACCOMPAGNE-SEUL'])
    // Posé à la main : dit, avec la durée seule.
    const dits = accompagnesSeuls(p, [
      { salarieId: 't', creneauId: 'p1' },
      { salarieId: 'a', creneauId: 'p2' },
    ])
    expect(dits.map((v) => v.message)).toEqual([
      'jamais sans un salarié confirmé : seul sur ce poste pendant 4 h',
    ])
  })
  it('refusé : couvert le matin par un salarié confirmé, seul l’après-midi', () => {
    // Un seul salarié confirmé, deux places qui se suivent : quelle que soit
    // celle qu'il prend, l'apprenti de 8 h à 16 h serait seul une partie du
    // temps. Chaque morceau compte, pas seulement le premier.
    const p = probleme({
      salaries: [sal('t', { postes: new Set(['rec']) }), apprenti('a')],
      creneaux: [
        place('p1', 'rec', 7, 12),
        place('p2', 'rec', 12, 20),
        place('x', 'rec', 8, 16),
      ],
      nbJours: 1,
    })
    const r = gen(p)
    expect(r.affectations.filter((x) => x.salarieId === 'a')).toEqual([])
    expect(accompagnesSeuls(p, r.affectations)).toEqual([])
  })
  it('accepté : un dépannage est confirmé aussi', () => {
    const p = probleme({
      salaries: [
        sal('d', {
          postes: new Set(['rec']),
          postesOccasionnels: new Set(['rec']),
        }),
        apprenti('a'),
      ],
      creneaux: [place('p1', 'rec', 7, 16), place('p2', 'rec', 8, 15)],
      nbJours: 1,
    })
    expect(
      gen(p)
        .affectations.map((a) => a.salarieId)
        .sort(),
    ).toEqual(['a', 'd'])
  })
  it('refusé : le salarié confirmé est sur un autre poste, ou à d’autres heures', () => {
    const autrePoste = probleme({
      salaries: [sal('t', { postes: new Set(['club']) }), apprenti('a')],
      creneaux: [place('p1', 'club', 7, 16), place('p2', 'rec', 8, 15)],
      nbJours: 1,
    })
    const sans = (q: Probleme) =>
      gen(q).affectations.filter((a) => a.salarieId === 'a')
    expect(qui(gen(autrePoste))).toEqual(['t@p1'])
    expect(sans(autrePoste)).toEqual([])
    const autresHeures = probleme({
      salaries: [sal('t', { postes: new Set(['rec']) }), apprenti('a')],
      creneaux: [place('p1', 'rec', 6, 11), place('p2', 'rec', 11, 19)],
      nbJours: 1,
    })
    expect(sans(autresHeures)).toEqual([])
  })
  it('refusé : un salarié en soutien n’est pas confirmé', () => {
    const p = probleme({
      salaries: [
        sal('s', { postes: new Set(), postesSoutien: new Set(['rec']) }),
        apprenti('a'),
      ],
      creneaux: [place('p', 'rec', 8, 15, { soutien: 1 })],
      nbJours: 1,
    })
    // Le soutien a l'apprenti (autonome) pour lui : la règle du soutien
    // tiendrait ; l'apprenti, lui, n'a personne de confirmé.
    expect(gen(p).affectations).toEqual([])
  })
  it('case décochée : l’apprenti titulaire tient la place seul, comme avant', () => {
    const p = probleme({
      salaries: [apprenti('a', { accompagne: false })],
      creneaux: [place('p', 'rec', 8, 15)],
      nbJours: 1,
    })
    expect(qui(gen(p))).toEqual(['a@p'])
  })
})

describe('le calcul : l’accueil (candidats et chiffre du moment)', () => {
  it('refusé : le matin à 1, l’apprenti seul ne vient pas', () => {
    const p = probleme({
      salaries: [apprenti('a')],
      creneaux: [cand('m', 'rec', 7, 15, ['matin'])],
      consignes: [chiffre('matin', 1)],
      nbJours: 1,
    })
    expect(gen(p).affectations).toEqual([])
    const raisons = raisonsBlocageAccueil(p, [], ['m']).get('a')!
    expect(raisons.map((v) => v.regle)).toEqual(['ACCOMPAGNE-SEUL'])
    // La raison nomme la zone (son nom, lu dans les règles).
    expect(raisons[0].message).toBe(
      'jamais sans un salarié confirmé : aucun n’est dans la zone Accueil à ces heures',
    )
    expect(raisonClaire('ACCOMPAGNE-SEUL', raisons[0].message, 1).phrase).toBe(
      'Aucun salarié confirmé dans la zone Accueil à ces heures',
    )
  })
  it('accepté : le matin à 2, un CDI et l’apprenti', () => {
    const p = probleme({
      salaries: [sal('t'), apprenti('a')],
      creneaux: [cand('m', 'rec', 7, 15, ['matin'])],
      consignes: [chiffre('matin', 2)],
      nbJours: 1,
    })
    const r = gen(p)
    expect(qui(r)).toEqual(['a@m', 't@m'])
    expect(accompagnesSeuls(p, r.affectations)).toEqual([])
    expect(soutiensSeuls(p, r.affectations)).toEqual([])
  })
  it('accepté : le CDI au Club, l’apprenti à la Réception (même zone)', () => {
    const p = probleme({
      salaries: [
        sal('t', { postes: new Set(['club']) }),
        apprenti('a', { postes: new Set(['rec']) }),
      ],
      creneaux: [
        cand('mr', 'rec', 7, 15, ['matin']),
        cand('mc', 'club', 7, 15, ['matin']),
      ],
      consignes: [chiffre('matin', 2)],
      nbJours: 1,
    })
    // « Peu importe sur le poste, mais il faut du monde » : la zone.
    const r = gen(p)
    expect(qui(r)).toEqual(['a@mr', 't@mc'])
    expect(accompagnesSeuls(p, r.affectations)).toEqual([])
  })
  it('refusé : un apprenti et un stagiaire seuls dans la zone', () => {
    const p = probleme({
      salaries: [
        apprenti('a', { postes: new Set(['rec']) }),
        apprenti('st', { postes: new Set(['club']) }),
      ],
      creneaux: [
        cand('mr', 'rec', 7, 15, ['matin']),
        cand('mc', 'club', 7, 15, ['matin']),
      ],
      consignes: [chiffre('matin', 2)],
      nbJours: 1,
    })
    expect(gen(p).affectations).toEqual([])
    // Posés à la main : chacun est dit, la zone nommée.
    const dits = accompagnesSeuls(p, [
      { salarieId: 'a', creneauId: 'mr' },
      { salarieId: 'st', creneauId: 'mc' },
    ])
    expect(dits.map((v) => v.message)).toEqual([
      'jamais sans un salarié confirmé : seul dans la zone Accueil tout le shift',
      'jamais sans un salarié confirmé : seul dans la zone Accueil tout le shift',
    ])
  })
  it('refusé : le salarié confirmé du matin part avant la fin du middle', () => {
    const p = probleme({
      salaries: [sal('t', { postes: new Set(['rec']) }), apprenti('a')],
      creneaux: [
        cand('m', 'rec', 7, 15, ['matin']),
        cand('mi', 'rec', 11, 19, []),
      ],
      consignes: [chiffre('matin', 1)],
      nbJours: 1,
    })
    expect(qui(gen(p))).toEqual(['t@m'])
  })
})

describe('la zone du poste (décision de l’utilisateur du 2026-11-09)', () => {
  const zp = (
    id: string,
    poste: string,
    d: number,
    f: number,
    zone: string | null,
  ) => place(id, poste, d, f, { zone })
  it('le groupe : la zone si le poste en a une, sinon le poste', () => {
    const p = probleme({ salaries: [], creneaux: [], nbJours: 1 })
    const { groupe, lieu } = accompagnement(p)
    expect(groupe(zp('a', 'rec', 8, 15, '1'))).toBe(
      groupe(zp('b', 'club', 8, 15, '1')),
    )
    expect(groupe(zp('a', 'rec', 8, 15, '1'))).not.toBe(
      groupe(zp('b', 'club', 8, 15, '2')),
    )
    expect(groupe(zp('a', 'rec', 8, 15, null))).not.toBe(
      groupe(zp('b', 'club', 8, 15, null)),
    )
    expect(groupe(zp('a', 'rec', 8, 15, null))).toBe(
      groupe(zp('b', 'rec', 9, 16, null)),
    )
    expect(lieu(zp('a', 'rec', 8, 15, '1'))).toBe('dans la zone Accueil')
    expect(lieu(zp('a', 'rec', 8, 15, null))).toBe('sur ce poste')
    // `ensemble` et `morceaux` suivent le groupe donné.
    expect(
      ensemble(zp('a', 'rec', 8, 15, '1'), zp('b', 'club', 9, 16, '1'), groupe),
    ).toBe(true)
    expect(
      ensemble(zp('a', 'rec', 8, 15, '1'), zp('b', 'club', 9, 16, '1')),
    ).toBe(false)
  })
  it('accepté : places de deux postes de la même zone', () => {
    const p = probleme({
      salaries: [sal('t', { postes: new Set(['club']) }), apprenti('a')],
      creneaux: [zp('p1', 'club', 7, 16, '1'), zp('p2', 'rec', 8, 15, '1')],
      nbJours: 1,
    })
    const r = gen(p)
    expect(qui(r)).toEqual(['a@p2', 't@p1'])
    expect(violations(p, r.affectations)).toEqual([])
    // Raison d'une place : le salarié confirmé du Club suffit.
    expect(
      raisonsBlocage(p, [{ salarieId: 't', creneauId: 'p1' }], 'p2')
        .get('a')
        ?.map((v) => v.regle) ?? [],
    ).not.toContain('ACCOMPAGNE-SEUL')
  })
  it('refusé : un poste sans zone garde la règle par poste', () => {
    for (const zones of [
      ['1', null],
      [null, '1'],
      [null, null],
      ['1', '2'],
    ] as const) {
      const p = probleme({
        salaries: [sal('t', { postes: new Set(['club']) }), apprenti('a')],
        creneaux: [
          zp('p1', 'club', 7, 16, zones[0]),
          zp('p2', 'rec', 8, 15, zones[1]),
        ],
        nbJours: 1,
      })
      expect(qui(gen(p))).toEqual(['t@p1'])
      expect(
        raisonsBlocage(p, [{ salarieId: 't', creneauId: 'p1' }], 'p2')
          .get('a')!
          .map((v) => v.regle),
      ).toEqual(['ACCOMPAGNE-SEUL'])
    }
  })
  it('refusé : dans la zone, mais pas pendant tout le shift', () => {
    const p = probleme({
      salaries: [sal('t', { postes: new Set(['club']) }), apprenti('a')],
      creneaux: [zp('p1', 'club', 7, 13, '1'), zp('p2', 'rec', 8, 15, '1')],
      nbJours: 1,
    })
    expect(qui(gen(p))).toEqual(['t@p1'])
    expect(
      accompagnesSeuls(p, [
        { salarieId: 't', creneauId: 'p1' },
        { salarieId: 'a', creneauId: 'p2' },
      ]).map((v) => v.message),
    ).toEqual([
      'jamais sans un salarié confirmé : seul dans la zone Accueil pendant 2 h',
    ])
  })
  it('le niveau de l’autre se lit sur le poste qu’il tient', () => {
    // Le CDI tient le Club en soutien : pas confirmé, même dans la zone.
    const p = probleme({
      salaries: [
        sal('t', { postes: new Set(), postesSoutien: new Set(['club']) }),
        apprenti('a', { postes: new Set(['rec']) }),
      ],
      creneaux: [zp('p1', 'club', 7, 16, '1'), zp('p2', 'rec', 8, 15, '1')],
      nbJours: 1,
    })
    expect(
      accompagnesSeuls(p, [
        { salarieId: 't', creneauId: 'p1' },
        { salarieId: 'a', creneauId: 'p2' },
      ]).map((v) => v.regle),
    ).toEqual(['ACCOMPAGNE-SEUL'])
  })
})

describe('soutien jamais seul : pendant tout le shift, dans la zone (2026-11-09)', () => {
  /** En soutien sur la Réception et le Club, des heures à faire. */
  const soutien = (id: string, kw: Partial<SalarieSolveur> = {}) =>
    sal(id, {
      postes: new Set(),
      postesSoutien: new Set(['rec', 'club']),
      minutesHebdoContrat: 7 * H,
      ...kw,
    })
  it('accepté : un titulaire là pendant tout son shift', () => {
    const p = probleme({
      salaries: [sal('t', { postes: new Set(['rec']) }), soutien('s')],
      creneaux: [cand('m', 'rec', 7, 15, ['matin'])],
      consignes: [chiffre('matin', 2)],
      nbJours: 1,
    })
    const r = gen(p)
    expect(qui(r)).toEqual(['s@m', 't@m'])
    expect(soutiensSeuls(p, r.affectations)).toEqual([])
  })
  it('refusé : un soutien qui ne croise le titulaire qu’une heure', () => {
    // Le titulaire ne peut faire que 7 h - 9 h (fin de contrat) : le
    // soutien de 8 h à 15 h serait seul six heures. Un chevauchement
    // suffisait avant le 2026-11-09.
    const p = probleme({
      salaries: [
        sal('t', { postes: new Set(['rec']), contratFin: 9 * H }),
        soutien('s', { contratDebut: 8 * H }),
      ],
      creneaux: [
        cand('m1', 'rec', 7, 9, ['matin']),
        cand('m2', 'rec', 8, 15, ['matin']),
      ],
      consignes: [chiffre('matin', 2)],
      nbJours: 1,
    })
    expect(qui(gen(p))).toEqual(['t@m1'])
    const dits = soutiensSeuls(p, [
      { salarieId: 't', creneauId: 'm1' },
      { salarieId: 's', creneauId: 'm2' },
    ])
    expect(dits.map((v) => v.message)).toEqual([
      'en soutien sur ce poste : ne peut pas être seul, personne d’autonome dans la zone Accueil pendant 6 h',
    ])
  })
  it('refusé : deux soutiens ensemble ne s’accompagnent pas', () => {
    const p = probleme({
      salaries: [soutien('s1'), soutien('s2')],
      creneaux: [cand('m', 'rec', 7, 15, ['matin'])],
      consignes: [chiffre('matin', 2)],
      nbJours: 1,
    })
    expect(gen(p).affectations).toEqual([])
    expect(
      soutiensSeuls(p, [
        { salarieId: 's1', creneauId: 'm' },
        { salarieId: 's2', creneauId: 'm' },
      ]).map((v) => v.salarieId),
    ).toEqual(['s1', 's2'])
  })
  it('accepté : en soutien à la Réception, le titulaire au Club (même zone)', () => {
    const p = probleme({
      salaries: [sal('t', { postes: new Set(['club']) }), soutien('s')],
      creneaux: [
        cand('mr', 'rec', 7, 15, ['matin']),
        cand('mc', 'club', 7, 15, ['matin']),
      ],
      consignes: [chiffre('matin', 2)],
      nbJours: 1,
    })
    const r = gen(p)
    expect(r.affectations.map((a) => a.salarieId).sort()).toEqual(['s', 't'])
    expect(soutiensSeuls(p, r.affectations)).toEqual([])
  })
  it('poste sans zone : le poste seul', () => {
    const essai = (zone: string | null) =>
      probleme({
        salaries: [sal('t', { postes: new Set(['club']) }), soutien('s')],
        creneaux: [
          place('p1', 'club', 7, 16, { zone }),
          place('p2', 'rec', 8, 15, { zone, effectif: 0, soutien: 1 }),
        ],
        nbJours: 1,
      })
    // Même zone : accompagné.
    const z = essai('1')
    expect(qui(gen(z))).toEqual(['s@p2', 't@p1'])
    // Sans zone : la Réception n'a personne d'autonome, il ne vient pas.
    const sans = essai(null)
    expect(qui(gen(sans))).toEqual(['t@p1'])
    expect(
      soutiensSeuls(sans, [
        { salarieId: 't', creneauId: 'p1' },
        { salarieId: 's', creneauId: 'p2' },
      ]).map((v) => v.regle),
    ).toEqual(['SOUTIEN-SEUL'])
  })
  it('besoin : un remplaçant d’une autre heure sur la même place ne suffit plus', () => {
    // Avant : « sur la même place » suffisait, même à d'autres heures.
    // Désormais : à tout moment du shift du soutien.
    const p = probleme({
      salaries: [sal('t', { postes: new Set(['rec']) }), soutien('s')],
      creneaux: [
        place('b', 'rec', 14, 22, { soutien: 1 }),
        place('r', 'rec', 7, 15, { place: 'b', effectif: 0 }),
      ],
      nbJours: 1,
    })
    const r = gen(p)
    expect(soutiensSeuls(p, r.affectations)).toEqual([])
  })
})

describe('l’hôtel fictif, semaine entière', () => {
  it('la case cochée : aucun apprenti ni stagiaire seul, aucune infraction ; décochée : un apprenti titulaire tient une place seul', () => {
    const LUNDI = '2026-11-02'
    const avec = hotelDemo(LUNDI)
    const semaine = (referentiel: typeof avec.referentiel) =>
      new PlanningMemoire(
        referentiel,
        avec.absences,
        '2026-10-27',
        highs,
      ).generer(LUNDI, { graine: 1 })
    const s = semaine(avec.referentiel)
    expect(s.stats.infractions).toBe(0)
    const seuls = s.bilan.flatMap((b) =>
      b.alertes.filter((a) => a.regle === 'ACCOMPAGNE-SEUL'),
    )
    expect(seuls).toEqual([])
    // Sans la règle, la même semaine en a (le prototype le permettait).
    const sans = semaine(sansAccompagne(avec.referentiel))
    expect(sans.stats.pourvues).toBeGreaterThan(s.stats.pourvues)
  }, 60_000)
})

describe('À vérifier', () => {
  it('un poste où seuls des apprentis et des stagiaires sont : dit ; avec un salarié confirmé : rien', () => {
    const { referentiel: r } = hotelDemo('2026-11-02')
    const club = r.postes.find((p) => p.nom === 'Club')!.id
    const points = (ref: typeof r) =>
      verifierReglages(ref)
        .map((p) => p.id)
        .filter((id) => id.startsWith('sans-confirme:'))
    expect(points(r)).toEqual([])
    const confirme = (t: string) => t !== 'apprenti' && t !== 'stagiaire'
    const sansConfirme = {
      ...r,
      salaries: r.salaries.map((s) =>
        confirme(s.type_contrat)
          ? {
              ...s,
              competences: s.competences.filter((c) => c.poste_id !== club),
            }
          : s,
      ),
    }
    expect(points(sansConfirme)).toEqual([`sans-confirme:${club}`])
    // La case décochée : plus rien à dire.
    expect(points(sansAccompagne(sansConfirme))).toEqual([])
  })
  it('la zone : un salarié confirmé sur un autre poste de la zone suffit', () => {
    const { referentiel: r } = hotelDemo('2026-11-02')
    const club = r.postes.find((p) => p.nom === 'Club')!.id
    const rec = r.postes.find((p) => p.nom === 'Réception')!.id
    const enZone = {
      ...r,
      postes: r.postes.map((p) =>
        p.id === club || p.id === rec ? { ...p, zone_id: 7 } : p,
      ),
      zones: [{ id: 7, nom: 'Hall', ordre: 0, continue: true }],
    }
    const confirme = (t: string) => t !== 'apprenti' && t !== 'stagiaire'
    const sans = (ref: typeof r, postes: number[]) => ({
      ...ref,
      salaries: ref.salaries.map((s) =>
        confirme(s.type_contrat)
          ? {
              ...s,
              competences: s.competences.filter(
                (c) => !postes.includes(c.poste_id),
              ),
            }
          : s,
      ),
    })
    const points = (ref: typeof r) =>
      verifierReglages(ref).filter((p) => p.id.startsWith('sans-confirme:'))
    // Personne de confirmé au Club, mais à la Réception : la zone suffit.
    expect(points(sans(enZone, [club]))).toEqual([])
    // Personne dans toute la zone : dit, la zone nommée.
    const dits = points(sans(enZone, [club, rec]))
    expect(dits.map((p) => p.id).sort()).toEqual(
      [`sans-confirme:${club}`, `sans-confirme:${rec}`].sort(),
    )
    expect(dits[0].texte).toMatch(/^La zone Hall n’a aucun salarié confirmé/)
  })
})

describe('le vérificateur : un shift posé à la main', () => {
  it('refusé : posé seul, il reste, et il est dit', () => {
    const p = probleme({
      salaries: [apprenti('a')],
      creneaux: [place('p', 'rec', 8, 15)],
      imposees: new Set(['a|p']),
      nbJours: 1,
    })
    const r = gen(p)
    // Jamais sur un shift posé : il reste, le modèle reste possible.
    expect(r.statut).not.toBe('inconnu')
    expect(qui(r)).toEqual(['a@p'])
    const dits = violations(p, r.affectations).filter(
      (v) => v.regle === 'ACCOMPAGNE-SEUL',
    )
    expect(dits).toHaveLength(1)
    expect(dits[0].message).toBe(
      'jamais sans un salarié confirmé : seul sur ce poste tout le shift',
    )
    expect(dits[0].nature).toBe('organisation')
    expect(dits[0].salarieId).toBe('a')
  })
  it('accepté : posé avec un salarié confirmé, rien n’est dit', () => {
    const p = probleme({
      salaries: [sal('t'), apprenti('a')],
      creneaux: [place('p1', 'rec', 14, 23), place('p2', 'rec', 14, 22)],
      nbJours: 1,
    })
    const affs = [
      { salarieId: 't', creneauId: 'p1' },
      { salarieId: 'a', creneauId: 'p2' },
    ]
    expect(accompagnesSeuls(p, affs)).toEqual([])
    // Refusé : sans lui.
    expect(accompagnesSeuls(p, affs.slice(1)).map((v) => v.regle)).toEqual([
      'ACCOMPAGNE-SEUL',
    ])
  })
  it('le jour d’après ne compte pas : chevaucher, c’est à la même heure', () => {
    const p = probleme({
      salaries: [sal('t'), apprenti('a')],
      creneaux: [
        place('p1', 'rec', 7, 15),
        creneau({
          id: 'p2',
          poste: 'rec',
          debut: J + 7 * H,
          fin: J + 15 * H,
          effectif: 1,
        }),
      ],
      nbJours: 2,
    })
    expect(
      accompagnesSeuls(p, [
        { salarieId: 't', creneauId: 'p1' },
        { salarieId: 'a', creneauId: 'p2' },
      ]),
    ).toHaveLength(1)
  })
})

describe('postes indispensables : un seul groupe (2026-11-09)', () => {
  const ind = { indispensable: true }
  it('accepté : un stagiaire seul à la Réception, un salarié confirmé au Club', () => {
    const p = probleme({
      salaries: [apprenti('st'), sal('cdi')],
      creneaux: [
        place('r1', 'rec', 7, 15, ind),
        place('c1', 'club', 7, 15, ind),
      ],
      imposees: new Set(['cdi|c1']),
      graine: 1,
    })
    const r = gen(p)
    expect(qui(r)).toEqual(['cdi@c1', 'st@r1'])
    expect(accompagnesSeuls(p, r.affectations)).toEqual([])
  })
  it('refusé : un apprenti à la Réception et un stagiaire au Club, sans salarié confirmé', () => {
    const p = probleme({
      salaries: [apprenti('ap'), apprenti('st')],
      creneaux: [
        place('r1', 'rec', 7, 15, ind),
        place('c1', 'club', 7, 15, ind),
      ],
      graine: 1,
    })
    expect(qui(gen(p))).toEqual([])
    const posees = [
      { salarieId: 'ap', creneauId: 'r1' },
      { salarieId: 'st', creneauId: 'c1' },
    ]
    const dits = accompagnesSeuls(p, posees)
    expect(dits).toHaveLength(2)
    expect(dits[0].message).toContain('sur les postes indispensables')
    expect(
      raisonClaire('ACCOMPAGNE-SEUL', dits[0].message, 0).phrase,
    ).toContain('sur les postes indispensables')
  })
  it('un poste NON indispensable garde sa règle : le confirmé doit être sur ce poste', () => {
    const p = probleme({
      salaries: [apprenti('st'), sal('cdi')],
      creneaux: [place('t1', 'tech', 7, 15), place('c1', 'club', 7, 15, ind)],
      imposees: new Set(['cdi|c1']),
      graine: 1,
    })
    expect(qui(gen(p))).toEqual(['cdi@c1'])
  })
  it('éparpiller : un apprenti ou stagiaire par matin quand c’est possible, pas deux le même', () => {
    // Deux matins ; le salarié confirmé au Club les deux jours ; deux
    // apprentis qui doivent chacun un shift, possibles les deux jours.
    const matin = (id: string, poste: string, jour: number): Creneau =>
      creneau({
        id,
        poste,
        debut: jour * J + 7 * H,
        fin: jour * J + 15 * H,
        effectif: 0,
        facultatif: 2,
        jourPlanning: jour,
        moment: 'matin',
        indispensable: true,
      })
    const creneaux = [
      matin('c0', 'club', 0),
      matin('c1', 'club', 1),
      matin('r0', 'rec', 0),
      matin('r1', 'rec', 1),
    ]
    const app = (id: string) =>
      apprenti(id, {
        minutesHebdoContrat: 8 * H,
        joursTravaillesMaxSemaine: 1,
        joursPreferesSemaine: 1,
      })
    for (const graine of [1, 2, 3, 4, 5, 6]) {
      const r = gen(
        probleme({
          salaries: [app('a1'), app('a2'), sal('cdi')],
          creneaux,
          imposees: new Set(['cdi|c0', 'cdi|c1']),
          graine,
        }),
      )
      const jours = r.affectations
        .filter((a) => a.salarieId !== 'cdi')
        .map((a) => a.creneauId.slice(1))
        .sort()
      expect([graine, jours]).toEqual([graine, ['0', '1']])
    }
  })
})

describe('apprenti TITULAIRE sur un poste indispensable (rappel du 2026-11-10)', () => {
  const ind = { indispensable: true }
  it('refusé : seul une partie de son shift ; signalé au vérificateur', () => {
    // Le salarié confirmé n'est là que de 7 h à 11 h (au Club) ; l'apprenti,
    // titulaire de la Réception, de 7 h à 15 h : seul de 11 h à 15 h.
    const app = apprenti('ap')
    expect(confirmeSur(app, 'rec')).toBe(false)
    const p = probleme({
      salaries: [app, sal('cdi')],
      creneaux: [
        place('r1', 'rec', 7, 15, ind),
        place('c1', 'club', 7, 11, ind),
      ],
      imposees: new Set(['cdi|c1']),
      graine: 1,
    })
    expect(qui(gen(p))).toEqual(['cdi@c1'])
    const dits = accompagnesSeuls(p, [
      { salarieId: 'cdi', creneauId: 'c1' },
      { salarieId: 'ap', creneauId: 'r1' },
    ])
    expect(dits.map((v) => [v.salarieId, v.message])).toEqual([
      [
        'ap',
        'jamais sans un salarié confirmé : seul sur les postes indispensables pendant 4 h',
      ],
    ])
    // Accepté : le salarié confirmé couvre tout le shift.
    const q = probleme({
      salaries: [app, sal('cdi')],
      creneaux: [
        place('r1', 'rec', 7, 15, ind),
        place('c1', 'club', 7, 15, ind),
      ],
      imposees: new Set(['cdi|c1']),
      graine: 1,
    })
    expect(qui(gen(q))).toEqual(['ap@r1', 'cdi@c1'])
  })
})
