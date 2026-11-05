import fc from 'fast-check'
import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  nuitDeLaVeille,
  plageAccueil,
  POSTE_ACCUEIL,
  trousAccueilDuJour,
} from '#/lib/planning/cycles.ts'
import type { PresencePoste } from '#/lib/planning/cycles.ts'
import {
  construire,
  coutDepannage,
  coutExtra,
  coutManqueMinimum,
  coutSurplus,
  generer,
  PART_FIXE_DEPANNAGE,
  partMoraleExtra,
  pireMoral,
  POIDS_SIXIEME_JOUR,
  POIDS_SOUS_CONTRAT,
  POIDS_SUR_CONTRAT,
} from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import {
  creneau,
  duree,
  jourDe,
  probleme,
  role,
  salarieSolveur,
  travail,
} from '#/lib/planning/modele.ts'
import type {
  ConsigneSolveur,
  Creneau,
  Probleme,
  SalarieSolveur,
} from '#/lib/planning/modele.ts'
import { accueilActif, momentsAccueil } from '#/lib/planning/presence.ts'
import { codesPermis } from '#/lib/planning/eligibilite.ts'
import {
  analyser,
  POSTE_ID_ACCUEIL,
  preparerGeneration,
} from '#/lib/planning/semaine.ts'
import type { DonneesSemaine } from '#/lib/planning/semaine.ts'
import {
  chiffreHotelAccueil,
  hotelAccueil,
} from '#/lib/planning/test/hotelAccueil.ts'
import { PlanningMemoire } from '#/lib/planning/test/planningMemoire.ts'
import {
  presenceParCycle,
  ouverturesManquees,
  relevesManquantes,
  soutiensSeuls,
  transmissions,
  violations,
} from '#/lib/planning/verificateur.ts'

/*
 * Tableau de l'accueil (plan planning-accueil-2026-11-01, étape 3) : le
 * moteur place EXACTEMENT le chiffre de chaque moment sur les postes de
 * l'accueil (D1-D3), un middle au matin et au soir (D11), les soutiens
 * comptés et accompagnés (D5), titulaire < dépannage < extra < vide (D7), le
 * surplus en dernier recours pour des heures dues (D8), la nuit sur la
 * Veille seule (D10), les trous sur l'accueil entier (D15). Chaque règle a
 * son cas accepté et son cas refusé. Données fictives seulement.
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
const extra = (id: string, kw: Partial<SalarieSolveur> = {}) =>
  sal(id, {
    postesOccasionnels: new Set(['rec', 'club']),
    placementManuel: true,
    contratIndicatif: true,
    ...kw,
  })
const apprenti = (id: string, postes = ['rec', 'club']) =>
  sal(id, { postes: new Set(), postesSoutien: new Set(postes) })

/** Un candidat de l'accueil : `jour`, heures (décimales), moments. */
const cand = (
  id: string,
  poste: string,
  jour: number,
  debutH: number,
  finH: number,
  presence: Creneau['presence'],
  kw: Partial<Creneau> = {},
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
    ...kw,
  })
const matin = (id: string, poste = 'rec', jour = 0) =>
  cand(id, poste, jour, 7, 15, ['matin'])
const soir = (id: string, poste = 'rec', jour = 0) =>
  cand(id, poste, jour, 15, 23, ['soir'])
const middle = (id: string, poste = 'rec', jour = 0) =>
  cand(id, poste, jour, 11, 19, ['matin', 'soir'])
const chiffre = (
  jour: number,
  periode: ConsigneSolveur['periode'],
  n: number,
  maximum: number | null = n,
): ConsigneSolveur => ({ jour, periode, minimum: n, maximum })

const qui = (r: ReturnType<typeof gen>) =>
  r.affectations.map((a) => `${a.salarieId}@${a.creneauId}`).sort()
const ecarts = (p: Probleme, r: ReturnType<typeof gen>) =>
  presenceParCycle(p, r.affectations).map((x) => x.ecart)

// ------------------------------------------------------------- moments

describe('moments du tableau (presence.ts)', () => {
  const rec = { presence: true, categorie: 'reception' as const }
  const veille = { presence: false, categorie: 'veille_nuit' as const }
  const aPart = { presence: false, categorie: 'autre' as const }
  it('un middle ne compte ni au matin ni au soir (2026-11-05, révise D11)', () => {
    // Oracle : décision d'une responsable du 2026-11-04 (« les middles sont
    // des shifts en option, un coup de main ») et banc des semaines faites
    // à la main : compté deux fois, le middle remplaçait un vrai soir et
    // laissait une personne seule à 21 h (69 jours sur 126, 21 à la main).
    expect(momentsAccueil(rec, { periode: 'middle' }, '11:00')).toEqual([])
    expect(momentsAccueil(rec, { periode: 'matin' }, '07:00')).toEqual([
      'matin',
    ])
    // Refusé : un horaire sans moment ne compte nulle part.
    expect(momentsAccueil(rec, { periode: null }, '09:00')).toEqual([])
  })
  it('un horaire libre se lit par ses heures, comme un horaire (2026-11-05)', () => {
    // 10:00-18:45 sans horaire : un middle, il ne compte nulle part (avant,
    // l'heure de début seule le comptait au matin).
    expect(momentsAccueil(rec, undefined, '10:00', true, '18:45')).toEqual([])
    expect(momentsAccueil(rec, undefined, '07:00', true, '12:00')).toEqual([
      'matin',
    ])
    expect(momentsAccueil(rec, undefined, '14:30', true, '23:15')).toEqual([
      'soir',
    ])
    // 21:30-07:00 sur la Veille : une nuit (seuil de 21 h, comme un horaire).
    expect(momentsAccueil(veille, undefined, '21:30', true, '07:00')).toEqual([
      'nuit',
    ])
    // Sans fin connue : l'heure de début, comme avant.
    expect(momentsAccueil(rec, undefined, '10:00')).toEqual(['matin'])
  })
  it('la nuit : la Veille seule (D10)', () => {
    expect(momentsAccueil(veille, { periode: 'nuit' }, '23:00')).toEqual([
      'nuit',
    ])
    // Refusé : une nuit sur la Réception, un matin sur la Veille, un poste à
    // part, ou un tableau qui n'est pas en service.
    expect(momentsAccueil(rec, { periode: 'nuit' }, '23:00')).toEqual([])
    expect(momentsAccueil(veille, { periode: 'matin' }, '07:00')).toEqual([])
    expect(momentsAccueil(aPart, { periode: 'matin' }, '07:00')).toEqual([])
    expect(momentsAccueil(veille, { periode: 'nuit' }, '23:00', false)).toEqual(
      [],
    )
  })
})

describe('un seul choix Accueil, poste fermé (U1, U3 du 2026-11-01)', () => {
  const base = { presence: false, categorie: 'autre' as const }
  it('la nuit vient du réglage du poste, pas de sa catégorie', () => {
    const nuit = { ...base, accueil_nuit: true }
    expect(momentsAccueil(nuit, { periode: 'nuit' }, '23:00')).toEqual(['nuit'])
    // Refusé : catégorie Veille de nuit mais réglé « Non ».
    const veilleNon = {
      ...base,
      categorie: 'veille_nuit' as const,
      accueil_nuit: false,
    }
    expect(momentsAccueil(veilleNon, { periode: 'nuit' }, '23:00')).toEqual([])
  })
  it('un poste fermé ne compte nulle part et n’a aucun horaire permis', () => {
    const ferme = {
      presence: true,
      categorie: 'reception' as const,
      ferme: true,
    }
    expect(momentsAccueil(ferme, { periode: 'matin' }, '07:00')).toEqual([])
    expect(accueilActif([ferme])).toBe(false)
    expect(accueilActif([{ ...ferme, ferme: false }])).toBe(true)
    const r = codesPermis({
      personne: { shifts_autorises: [], semaine_type: [], mineur: false },
      poste: { horaires_autorises: [], ferme: true },
      jour: 0,
      horaires: [{ id: 1, debut: '07:00', fin: '15:00' }],
    })
    expect([r.codes, r.texte]).toEqual([[], 'Poste fermé'])
    const ouvert = codesPermis({
      personne: { shifts_autorises: [], semaine_type: [], mineur: false },
      poste: { horaires_autorises: [], ferme: false },
      jour: 0,
      horaires: [{ id: 1, debut: '07:00', fin: '15:00' }],
    })
    expect(ouvert.codes).toHaveLength(1)
  })
})

// --------------------------------------------------------- chiffre exact

describe('le chiffre est exact (D1-D3)', () => {
  const quatre = ['a', 'b', 'c', 'd'].map((id) => sal(id))
  const creneaux = [matin('rm'), matin('cm', 'club'), soir('rs')]

  it('accepté : 2 le matin, ni plus ni moins, sur l’un ou l’autre poste', () => {
    const p = probleme({
      salaries: quatre,
      creneaux,
      consignes: [chiffre(0, 'matin', 2)],
      nbJours: 1,
    })
    const r = gen(p)
    expect(r.affectations.length).toBe(2)
    expect(r.affectations.every((a) => a.creneauId !== 'rs')).toBe(true)
    expect(ecarts(p, r)).toEqual([0])
  })

  it('refusé : chiffre 0, ou aucun chiffre, personne ne vient', () => {
    for (const consignes of [[chiffre(0, 'matin', 0)], []]) {
      const r = gen(
        probleme({ salaries: quatre, creneaux, consignes, nbJours: 1 }),
      )
      expect(r.affectations).toEqual([])
    }
  })

  it('le minimum fait foi si le maximum diffère (D9)', () => {
    const p = probleme({
      salaries: quatre,
      creneaux,
      consignes: [chiffre(0, 'matin', 2, 3)],
      nbJours: 1,
    })
    expect(gen(p).affectations.length).toBe(2)
  })

  it('l’app répartit selon les compétences (D2)', () => {
    const p = probleme({
      salaries: [
        sal('r', { postes: new Set(['rec']) }),
        sal('c', { postes: new Set(['club']) }),
      ],
      creneaux,
      consignes: [chiffre(0, 'matin', 2)],
      nbJours: 1,
    })
    expect(qui(gen(p))).toEqual(['c@cm', 'r@rm'])
  })
})

// --------------------------------------------------------------- middle

// Le MÉCANISME d'un créneau qui compte dans deux moments (D11) reste dans
// le générateur ; depuis le 2026-11-05, `momentsAccueil` ne range plus
// aucun horaire dans deux moments (un middle ne compte nulle part).
describe('un créneau qui compte dans deux moments (mécanisme de D11)', () => {
  it('accepté : une seule personne en middle tient le matin et le soir', () => {
    const p = probleme({
      salaries: [sal('a')],
      creneaux: [middle('mi')],
      consignes: [chiffre(0, 'matin', 1), chiffre(0, 'soir', 1)],
      nbJours: 1,
    })
    const r = gen(p)
    expect(qui(r)).toEqual(['a@mi'])
    expect(ecarts(p, r)).toEqual([0, 0])
  })

  it('refusé : un middle en plus d’un matin, c’est un matin de trop', () => {
    // Deux personnes, 1 le matin et 1 le soir : jamais middle + matin (2 le
    // matin), ni deux middles.
    const p = probleme({
      salaries: [sal('a'), sal('b')],
      creneaux: [matin('m'), soir('s'), middle('mi')],
      consignes: [chiffre(0, 'matin', 1), chiffre(0, 'soir', 1)],
      nbJours: 1,
    })
    const r = gen(p)
    expect(ecarts(p, r)).toEqual([0, 0])
  })
})

// -------------------------------------------------------------- soutien

describe('un soutien compte, jamais seul (D5)', () => {
  it('accepté : un titulaire et un apprenti font les 2', () => {
    const p = probleme({
      salaries: [sal('t'), apprenti('app')],
      creneaux: [matin('rm')],
      consignes: [chiffre(0, 'matin', 2)],
      nbJours: 1,
    })
    const r = gen(p)
    expect(qui(r)).toEqual(['app@rm', 't@rm'])
    expect(ecarts(p, r)).toEqual([0])
  })

  it('refusé : seul, l’apprenti ne vient pas', () => {
    const p = probleme({
      salaries: [apprenti('app')],
      creneaux: [matin('rm')],
      consignes: [chiffre(0, 'matin', 1)],
      nbJours: 1,
    })
    const r = gen(p)
    expect(r.affectations).toEqual([])
    expect(ecarts(p, r)).toEqual([-1])
  })

  it('refusé : accompagné sur le MÊME poste, pas sur l’autre', () => {
    // Le titulaire ne tient que la Réception, l'apprenti que le Club.
    const p = probleme({
      salaries: [
        sal('t', { postes: new Set(['rec']) }),
        apprenti('app', ['club']),
      ],
      creneaux: [matin('rm'), matin('cm', 'club')],
      consignes: [chiffre(0, 'matin', 2)],
      nbJours: 1,
    })
    const r = gen(p)
    expect(qui(r)).toEqual(['t@rm'])
    expect(soutiensSeuls(p, r.affectations)).toEqual([])
  })

  it('refusé : accompagné par un shift qui CHEVAUCHE le sien', () => {
    // Le titulaire ne peut faire que le matin (fiche), l'apprenti que le
    // soir : ils ne se croisent pas.
    const p = probleme({
      salaries: [
        sal('t', { shiftsAutorises: new Set(['M']) }),
        sal('app', {
          postes: new Set(),
          postesSoutien: new Set(['rec']),
          shiftsAutorises: new Set(['S']),
        }),
      ],
      creneaux: [
        { ...matin('rm'), typeShift: 'M' },
        { ...soir('rs'), typeShift: 'S' },
      ],
      consignes: [chiffre(0, 'matin', 1), chiffre(0, 'soir', 1)],
      nbJours: 1,
    })
    const r = gen(p)
    expect(qui(r)).toEqual(['t@rm'])
  })
})

// -------------------------------------------------------- ordre D7

describe('titulaire < dépannage < vide, jamais un extra (D7, 2026-11-03)', () => {
  const tit = sal('tit')
  const dep = sal('dep', { postesOccasionnels: new Set(['rec', 'club']) })
  const ext = extra('ext')
  const p = (salaries: SalarieSolveur[], graine = 0) =>
    probleme({
      salaries,
      creneaux: [matin('rm')],
      consignes: [chiffre(0, 'matin', 1)],
      nbJours: 1,
      graine,
    })
  it('chaque palier passe devant le suivant', () => {
    // Quel que soit le hasard (une égalité se départagerait au bruit).
    for (let graine = 0; graine < 12; graine++) {
      expect(qui(gen(p([dep, tit], graine)))).toEqual(['tit@rm'])
      expect(qui(gen(p([ext, dep], graine)))).toEqual(['dep@rm'])
    }
    expect(qui(gen(p([ext, dep, tit])))).toEqual(['tit@rm'])
    // Refusé (décision utilisateur du 2026-11-03) : un extra seul ne vient
    // pas, la case reste vide (on l'appelle avant de le poser à la main).
    const avecExtra = p([ext])
    expect(qui(gen(avecExtra))).toEqual([])
    expect(ecarts(avecExtra, gen(avecExtra))).toEqual([-1])
    // Accepté : posé à la main, il est gardé.
    const pose = probleme({
      ...p([ext]),
      imposees: new Set(['ext|rm']),
    })
    expect(qui(gen(pose))).toEqual(['ext@rm'])
  })

  it('refusé : un extra n’est jamais placé hors de l’accueil', () => {
    const besoin = creneau({
      id: 'b1',
      poste: 'rec',
      debut: 7 * H,
      fin: 15 * H,
      effectif: 1,
    })
    const r = gen(probleme({ salaries: [ext], creneaux: [besoin], nbJours: 1 }))
    expect(r.affectations).toEqual([])
    expect(r.manques).toEqual([{ creneauId: 'b1', manquant: 1 }])
  })

  it('les paliers en chiffres', () => {
    const c = cand('c', 'rec', 0, 7, 15.75, ['matin'], { pause: 45 })
    // Un extra coûte plus qu'un dépannage qui ferait le shift en heures en
    // plus ET en 6e jour.
    expect(coutExtra(c)).toBeGreaterThan(
      coutDepannage(c) + POIDS_SUR_CONTRAT * duree(c) + POIDS_SIXIEME_JOUR,
    )
    // La place vide coûte plus que tout, extra compris.
    expect(coutManqueMinimum([c], coutSurplus([c]))).toBeGreaterThan(
      coutExtra(c) + coutSurplus([c]),
    )
    // Décision utilisateur du 2026-11-03 : un extra coûte aussi plus que
    // tout ce qu'il épargnerait à un salarié en règles morales, équité et
    // confort. Il ne sert qu'à une place qui resterait vide.
    expect(partMoraleExtra(c)).toBeGreaterThan(pireMoral(c))
    expect(coutExtra(c)).toBeGreaterThan(
      coutDepannage(c) +
        POIDS_SUR_CONTRAT * duree(c) +
        POIDS_SIXIEME_JOUR +
        partMoraleExtra(c),
    )
  })

  it('refusé : un extra n’est jamais pris pour libérer un week-end', () => {
    // Deux salariés sans week-end libre depuis 4 semaines, 16 h chacun ; le
    // samedi et le dimanche demandent une personne, la semaine est libre.
    // Un extra le week-end les libérerait tous les deux : jamais.
    const libres = [0, 1, 2, 3, 4].map((j) => chiffre(j, 'matin', 0, null))
    for (let graine = 0; graine < 4; graine++) {
      const p = probleme({
        salaries: [
          sal('a', { minutesHebdoContrat: 16 * H, weekendLibreAvant: false }),
          sal('b', { minutesHebdoContrat: 16 * H, weekendLibreAvant: false }),
          extra('ext'),
        ],
        creneaux: [0, 1, 2, 3, 4, 5, 6].map((j) => matin(`m${j}`, 'rec', j)),
        consignes: [...libres, chiffre(5, 'matin', 1), chiffre(6, 'matin', 1)],
        nbJours: 7,
        graine,
      })
      const r = gen(p)
      expect(r.affectations.some((a) => a.salarieId === 'ext')).toBe(false)
      expect(ecarts(p, r).slice(-2)).toEqual([0, 0])
    }
    // Refusé aussi quand personne d'autre ne peut venir le samedi : la
    // case reste vide (2026-11-03).
    const seul = probleme({
      salaries: [
        sal('a', {
          minutesHebdoContrat: 8 * H,
          weekendLibreAvant: false,
          indisponibilites: new Set([5]),
        }),
        extra('ext'),
      ],
      creneaux: [5, 6].map((j) => matin(`m${j}`, 'rec', j)),
      consignes: [chiffre(5, 'matin', 1), chiffre(6, 'matin', 1)],
      nbJours: 7,
    })
    expect(qui(gen(seul))).toEqual(['a@m6'])
  })
})

// --------------------------------------------------------------- D8

describe('le surplus : en dernier recours pour des heures dues (D8)', () => {
  // Un shift de 7 h de travail, sans pause.
  const sept = (id: string, jour = 0) => cand(id, 'rec', jour, 7, 14, ['matin'])

  it('refusé : personne ne vient en plus pour son jour habituel', () => {
    const p = probleme({
      salaries: [sal('a'), sal('b', { travailFixe: new Set([0]) })],
      creneaux: [sept('m')],
      consignes: [chiffre(0, 'matin', 1)],
      nbJours: 1,
    })
    const r = gen(p)
    expect(r.affectations.length).toBe(1)
    expect(ecarts(p, r)).toEqual([0])
  })

  it('accepté : il manque ses heures et aucun autre jour ne les donne', () => {
    const p = probleme({
      salaries: [
        sal('a', { minutesHebdoContrat: 7 * H }),
        sal('b', { minutesHebdoContrat: 7 * H }),
      ],
      creneaux: [sept('m')],
      consignes: [chiffre(0, 'matin', 1)],
      nbJours: 1,
    })
    const r = gen(p)
    expect(r.affectations.length).toBe(2)
    expect(ecarts(p, r)).toEqual([1])
  })

  it('refusé : la nuit, jamais un deuxième veilleur, même pour ses heures (2026-11-03)', () => {
    const veilleur = (id: string) =>
      sal(id, { minutesHebdoContrat: 8 * H, postes: new Set(['veille']) })
    const nuit = (id: string) => cand(id, 'veille', 0, 23, 31, ['nuit'])
    const p = probleme({
      salaries: [veilleur('a'), veilleur('b')],
      creneaux: [nuit('n')],
      consignes: [chiffre(0, 'nuit', 1)],
      nbJours: 1,
    })
    const r = gen(p)
    expect(r.affectations.length).toBe(1)
    expect(ecarts(p, r)).toEqual([0])
    // Accepté : deux veilleurs posés à la main (formation) sont gardés, et
    // le calcul n'en ajoute pas un troisième.
    const pose = probleme({
      salaries: [veilleur('a'), veilleur('b'), veilleur('c')],
      creneaux: [nuit('n'), nuit('a1'), nuit('a2')],
      consignes: [chiffre(0, 'nuit', 1)],
      imposees: new Set(['b|a1', 'c|a2']),
      nbJours: 1,
    })
    expect(qui(gen(pose))).toEqual(['b@a1', 'c@a2'])
  })

  it('accepté : même un shift court, dans un moment où d’autres sont longs (plafond)', () => {
    // Le surplus du matin suit le plus long candidat (10 h) mais reste
    // PLAFONNÉ sous les heures dues du plus court (2 h) : la personne à qui
    // il manque ces 2 h vient quand même, sur le court.
    const p = probleme({
      salaries: [
        sal('a', { minutesHebdoContrat: 2 * H, postes: new Set(['rec']) }),
        sal('b', { minutesHebdoContrat: 2 * H, postes: new Set(['rec']) }),
      ],
      creneaux: [
        cand('long', 'rec', 0, 7, 17, ['matin']),
        cand('court', 'rec', 0, 7, 9, ['matin']),
      ],
      consignes: [chiffre(0, 'matin', 1)],
      nbJours: 1,
    })
    const r = gen(p)
    expect(qui(r)).toEqual(['a@court', 'b@court'])
  })

  it('refusé : un autre jour peut les lui donner, il y va', () => {
    const p = probleme({
      salaries: [
        sal('a', { minutesHebdoContrat: 7 * H }),
        sal('b', { minutesHebdoContrat: 7 * H }),
      ],
      creneaux: [sept('m0', 0), sept('m1', 1)],
      consignes: [chiffre(0, 'matin', 1), chiffre(1, 'matin', 1)],
      nbJours: 2,
    })
    const r = gen(p)
    expect(r.affectations.length).toBe(2)
    expect(ecarts(p, r)).toEqual([0, 0])
  })

  it('refusé : un extra ne vient jamais en plus', () => {
    const p = probleme({
      salaries: [sal('t'), extra('e')],
      creneaux: [sept('m')],
      consignes: [chiffre(0, 'matin', 1)],
      nbJours: 1,
    })
    expect(qui(gen(p))).toEqual(['t@m'])
  })

  it('les paliers en chiffres', () => {
    const c = cand('c', 'rec', 0, 7, 15.75, ['matin'], { pause: 45 })
    const mi = cand('mi', 'rec', 0, 11, 19.75, ['matin', 'soir'], { pause: 45 })
    // Plus que tout le confort, un 6e jour et les heures en plus du shift.
    expect(coutSurplus([c])).toBeGreaterThan(
      PART_FIXE_DEPANNAGE + POIDS_SIXIEME_JOUR + POIDS_SUR_CONTRAT * duree(c),
    )
    // Moins que les heures dues d'un shift, dépannage et confort payés ; un
    // middle en plus l'est deux fois.
    for (const x of [c, mi])
      expect(x.presence.length * coutSurplus([x])).toBeLessThan(
        POIDS_SOUS_CONTRAT * travail(x) -
          coutDepannage(x) -
          PART_FIXE_DEPANNAGE,
      )
    // Un shift posé (fait) ne pèse pas dans le calcul.
    expect(coutSurplus([{ ...c, ferme: true }])).toBe(0)
  })
})

// --------------------------------------------------------------- trous

describe('trous sur l’accueil entier (D15)', () => {
  it('plage : du début le plus tard des matins à la fin la plus tôt des soirs', () => {
    const cs = [
      cand('a', 'rec', 0, 6.5, 15, ['matin']),
      cand('b', 'club', 0, 8, 16, ['matin']),
      cand('c', 'rec', 0, 11, 19, ['matin', 'soir']),
      cand('d', 'rec', 0, 15, 23, ['soir']),
      cand('e', 'club', 0, 14, 22.75, ['soir']),
    ]
    const tous = new Set(['matin', 'soir'] as const)
    expect(plageAccueil(cs, tous)).toEqual({ debut: 8 * H, fin: 22.75 * H })
    // Le matin seul : la plage du matin.
    expect(plageAccueil(cs, new Set(['matin'] as const))).toEqual({
      debut: 8 * H,
      fin: 15 * H,
    })
    // Refusé : rien de demandé (la nuit ne compte pas), pas de plage.
    expect(plageAccueil(cs, new Set())).toBeNull()
    expect(plageAccueil(cs, new Set(['nuit'] as const))).toBeNull()
  })

  it('Réception et Club ensemble ; le moteur choisit l’horaire qui ferme le trou', () => {
    const consignes = [chiffre(0, 'matin', 1), chiffre(0, 'soir', 1)]
    const salaries = [sal('a'), sal('b')]
    // Seuls un matin à la Réception et un soir de 16 h au Club : un trou.
    const avecTrou = gen(
      probleme({
        salaries,
        creneaux: [matin('rm'), cand('cs', 'club', 0, 16, 23, ['soir'])],
        consignes,
        nbJours: 1,
      }),
    )
    expect(avecTrou.trous).toEqual([
      { poste: POSTE_ACCUEIL, jour: 0, debut: 15 * H, fin: 16 * H },
    ])
    // Avec un soir de 15 h au Club : pris, plus de trou (la plage va de 7 h,
    // seul matin, à 23 h, le soir le plus tôt fini).
    const sansTrou = gen(
      probleme({
        salaries,
        creneaux: [
          matin('rm'),
          cand('cs', 'club', 0, 16, 23, ['soir']),
          cand('cs2', 'club', 0, 15, 23, ['soir']),
        ],
        consignes,
        nbJours: 1,
      }),
    )
    expect(sansTrou.trous).toEqual([])
    expect(qui(sansTrou)).toContain('b@cs2')
  })

  /*
   * Propriété : des semaines tirées au hasard (candidats, chiffres,
   * personnes, soutiens, extras) ; (a) la réduction des
   * paires garde le même optimum ; (b) les trous du générateur sont ceux que
   * l'oracle (`trousAccueilDuJour`, cycles.ts) recompte sur la solution ;
   * (c) aucune règle de la loi enfreinte, aucun soutien seul ; (d) le compte
   * de chaque moment = chiffre + surplus - manque, et sans personne à qui il
   * manque des heures, jamais au-delà du chiffre.
   */
  it('propriété : générateur = oracle, réduction sans effet, loi tenue', () => {
    const arbCand = fc.record({
      poste: fc.constantFrom('rec', 'club'),
      jour: fc.integer({ min: 0, max: 2 }),
      debutQ: fc.integer({ min: 24, max: 72 }), // 6 h à 18 h
      dureeQ: fc.integer({ min: 16, max: 36 }), // 4 h à 9 h
    })
    const arbSal = fc.record({
      genre: fc.constantFrom('tit', 'tit', 'dep', 'ext', 'app'),
      contratH: fc.constantFrom(0, 0, 7, 14),
      absent: fc.option(fc.integer({ min: 0, max: 2 }), { nil: null }),
    })
    const arbChiffre = fc.record({
      jour: fc.integer({ min: 0, max: 2 }),
      periode: fc.constantFrom('matin' as const, 'soir' as const),
      n: fc.integer({ min: 0, max: 2 }),
    })
    let avecTrous = 0
    fc.assert(
      fc.property(
        fc.array(arbCand, { minLength: 2, maxLength: 8 }),
        fc.array(arbSal, { minLength: 1, maxLength: 4 }),
        fc.uniqueArray(arbChiffre, {
          maxLength: 4,
          selector: (k) => `${k.jour}|${k.periode}`,
        }),
        fc.integer({ min: 0, max: 1000 }),
        (cs, gens, chiffres, graine) => {
          const creneaux = cs.map((c, i) => {
            const debut = c.debutQ * 15
            const presence: Creneau['presence'] =
              debut < 11 * H
                ? ['matin']
                : debut < 13 * H
                  ? ['matin', 'soir']
                  : ['soir']
            return creneau({
              id: `p${i}`,
              poste: c.poste,
              debut: c.jour * J + debut,
              fin: c.jour * J + debut + c.dureeQ * 15,
              effectif: 0,
              jourPlanning: c.jour,
              presence,
              accueil: true,
            })
          })
          const salaries = gens.map((g, i) => {
            const kw: Partial<SalarieSolveur> = {
              minutesHebdoContrat: g.contratH * H,
              indisponibilites: new Set(g.absent === null ? [] : [g.absent]),
            }
            if (g.genre === 'dep')
              return sal(`s${i}`, {
                ...kw,
                postesOccasionnels: new Set(['rec', 'club']),
              })
            if (g.genre === 'ext') return extra(`s${i}`, kw)
            if (g.genre === 'app')
              return sal(`s${i}`, {
                ...kw,
                postes: new Set(),
                postesSoutien: new Set(['rec', 'club']),
              })
            return sal(`s${i}`, kw)
          })
          const p = probleme({
            salaries,
            creneaux,
            consignes: chiffres.map((k) => chiffre(k.jour, k.periode, k.n)),
            graine,
            nbJours: 3,
          })
          const avec = construire(p)
          const sans = construire(p, { reduire: false })
          if (avec.modele.impossible || avec.x.size === 0) return
          const ra = highs.solve(avec.modele.lp(), {
            mip_rel_gap: 0,
            output_flag: false,
          })
          const rs = highs.solve(sans.modele.lp(), {
            mip_rel_gap: 0,
            output_flag: false,
          })
          expect(ra.Status).toBe('Optimal')
          expect(rs.Status).toBe('Optimal')
          expect(ra.ObjectiveValue).toBeCloseTo(rs.ObjectiveValue as number, 3)
          const r = gen(p)
          expect(r.statut).toBe('optimal')
          // (b) l'oracle sur la solution.
          const parId = new Map(creneaux.map((c) => [c.id, c]))
          const parSal = new Map(salaries.map((s) => [s.id, s]))
          const presences: PresencePoste[] = r.affectations.map((a) => {
            const c = parId.get(a.creneauId) as Creneau
            return {
              debut: c.debut,
              fin: c.fin,
              autonome:
                role(parSal.get(a.salarieId) as SalarieSolveur, c.poste) !==
                'soutien',
            }
          })
          const attendus = [0, 1, 2].flatMap((jour) => {
            const demandes = new Set(
              p.consignes
                .filter((k) => k.jour === jour && k.minimum > 0)
                .map((k) => k.periode),
            )
            return trousAccueilDuJour(
              creneaux.filter((c) => jourDe(c) === jour),
              demandes,
              presences,
            ).map((t) => ({ poste: POSTE_ACCUEIL, jour, ...t }))
          })
          if (attendus.length) avecTrous++
          expect(r.trous).toEqual(attendus)
          // (c) la loi, le soutien.
          expect(
            violations(p, r.affectations).filter((v) => v.nature === 'loi'),
          ).toEqual([])
          expect(soutiensSeuls(p, r.affectations)).toEqual([])
          // (d) personne à qui il manque des heures : jamais de surplus.
          if (salaries.every((s) => s.minutesHebdoContrat === 0))
            for (const x of presenceParCycle(p, r.affectations))
              expect(x.ecart).toBeLessThanOrEqual(0)
        },
      ),
      { numRuns: 60, seed: 20261101 },
    )
    // La propriété voit des trous, pas seulement des semaines sans.
    expect(avecTrous).toBeGreaterThan(5)
  }, 180_000)
})

// ------------------------------------------------- assemblage (semaine.ts)

describe('assemblage d’une semaine (semaine.ts)', () => {
  const LUNDI = '2026-11-02'
  const donnees = (accueil: boolean): DonneesSemaine => ({
    lundi: LUNDI,
    referentiel: hotelAccueil(accueil),
    absences: [],
    affectations: [],
    avant: [],
    apres: [],
  })
  const ref = hotelAccueil(true)
  const accueilIds = new Set(
    ref.postes
      .filter((p) => p.presence || p.categorie === 'veille_nuit')
      .map((p) => String(p.id)),
  )

  it('les besoins de l’accueil sont ignorés (D13), ceux des postes à part inchangés', () => {
    const avec = preparerGeneration(donnees(true), { aujourdhui: '2026-09-01' })
    const sans = preparerGeneration(donnees(false), {
      aujourdhui: '2026-09-01',
    })
    // Aucun besoin `b…` ni remplaçant `r…` sur l'accueil.
    expect(
      avec.probleme.creneaux.filter(
        (c) => !c.accueil && accueilIds.has(c.poste),
      ),
    ).toEqual([])
    // Des candidats `p…`, seulement sur l'accueil, aucun sur un poste à part.
    const candidats = avec.probleme.creneaux.filter((c) => c.accueil)
    expect(candidats.length).toBeGreaterThan(100)
    expect(candidats.every((c) => accueilIds.has(c.poste))).toBe(true)
    expect(candidats.every((c) => /^p\d-\d+-\d+$/.test(c.id))).toBe(true)
    // Les postes à part : mêmes créneaux qu'avec l'ancien moteur (le matin
    // tôt de l'équité ne regarde que leurs besoins).
    const aPart = (q: Probleme) =>
      q.creneaux.filter((c) => !accueilIds.has(c.poste))
    expect(aPart(avec.probleme)).toEqual(aPart(sans.probleme))
    // Refusé : sans poste coché « présence », pas de tableau, les besoins
    // de l'accueil restent.
    expect(sans.probleme.creneaux.some((c) => c.accueil)).toBe(false)
    expect(sans.probleme.consignes).toEqual([])
  })

  it('la Veille ne propose que ses nuits, la Réception aucune nuit (D10)', () => {
    const g = preparerGeneration(donnees(true), { aujourdhui: '2026-09-01' })
    const veille = String(
      ref.postes.find((p) => p.categorie === 'veille_nuit')?.id,
    )
    for (const c of g.probleme.creneaux.filter((x) => x.accueil)) {
      if (c.poste === veille) expect(c.presence).toEqual(['nuit'])
      else expect(c.presence).not.toContain('nuit')
    }
  })

  it('un middle reste un candidat de l’accueil, sans compter nulle part (2026-11-05)', () => {
    // Oracle : décision du 2026-11-04 (« posé s'il reste des heures ») et
    // relecture adverse du 2026-11-05 : sans candidat, aucun middle n'était
    // plus jamais posé, pas même celui qu'une semaine type fixe.
    const g = preparerGeneration(donnees(true), { aujourdhui: '2026-09-01' })
    const middles = g.probleme.creneaux.filter(
      (c) => c.accueil && c.moment === 'middle',
    )
    expect(middles.length).toBeGreaterThan(0)
    for (const c of middles) expect(c.presence).toEqual([])
    // Refusé : un jour où ni le matin ni le soir n'est demandé, pas de
    // middle non plus.
    const d = donnees(true)
    d.referentiel = {
      ...d.referentiel,
      consignes: d.referentiel.consignes.filter(
        (k) => k.jour !== 2 || k.periode === 'nuit',
      ),
    }
    const sans = preparerGeneration(d, { aujourdhui: '2026-09-01' })
    expect(
      sans.probleme.creneaux.some(
        (c) => c.accueil && c.moment === 'middle' && c.jourPlanning === 2,
      ),
    ).toBe(false)
    expect(
      sans.probleme.creneaux.some(
        (c) => c.accueil && c.moment === 'middle' && c.jourPlanning === 3,
      ),
    ).toBe(true)
  })

  it('une semaine générée : chiffre tenu, aucune infraction, analyse cohérente', () => {
    const p = new PlanningMemoire(ref, [], '2026-09-01', highs)
    const sem = p.generer(LUNDI)
    expect(sem.stats.infractions).toBe(0)
    // Le chiffre de chaque moment : jamais de manque ici (assez de monde) ;
    // un surplus éventuel ne vient que d'heures dues (D8).
    for (const x of sem.presence) {
      expect(x.minimum).toBe(chiffreHotelAccueil(x.jour, x.periode))
      expect(x.maximum).toBe(x.minimum)
      expect(x.ecart).toBeGreaterThanOrEqual(0)
    }
    // Places de l'accueil comptées dans les places du jour.
    const aPart = ref.besoins
      .filter((b) => !accueilIds.has(String(b.poste_id)))
      .reduce((t, b) => t + b.effectif, 0)
    const accueil = sem.presence.reduce((t, x) => t + x.minimum, 0)
    expect(sem.stats.places).toBe(aPart + accueil)
    // Pas de trou de l'accueil d'un poste inventé.
    expect(sem.trous.every((t) => t.poste_id === POSTE_ID_ACCUEIL)).toBe(true)
    // Les shifts de l'accueil ont l'horaire et le poste d'un candidat.
    const analyse = analyser(p.donnees(LUNDI))
    expect(analyse.presence).toEqual(sem.presence)
    // 2026-11-04 : deux repos de suite pour tous laissent des places vides,
    // donc le second temps du calcul (remplaçants) tourne : ~27 s → ~57 s.
  }, 150_000)
})

// ------------------------------------------------- 24 h sur 24 (audit)

describe('d’un veilleur à l’autre (audit du 2026-11-01)', () => {
  // Oracle : quand la nuit est demandée, la journée de l'accueil est tenue
  // du départ du veilleur de la veille (07:00) à l'arrivée du veilleur du
  // soir (23:00) ; un vide entre les deux est un trou.
  const nuit = (id: string, jour: number) =>
    cand(id, 'veille', jour, 23, 31, ['nuit'])
  const tout = new Set(['matin', 'soir', 'nuit'] as const)

  it('plage : de la fin de la nuit d’avant au début de la nuit du jour', () => {
    const cs = [
      cand('m', 'rec', 1, 7, 15, ['matin']),
      cand('s1', 'club', 1, 14, 22.75, ['soir']),
      cand('s2', 'rec', 1, 15, 23.25, ['soir']),
      nuit('n', 1),
    ]
    const veille = [{ debut: 23 * H, fin: J + 7 * H }]
    expect(plageAccueil(cs, tout, veille)).toEqual({
      debut: J + 7 * H,
      fin: J + 23 * H,
    })
    // Refusé : sans nuit demandée, la plage s'arrête au soir le plus court.
    expect(plageAccueil(cs, new Set(['matin', 'soir'] as const))).toEqual({
      debut: J + 7 * H,
      fin: J + 22.75 * H,
    })
  })

  it('nuit étoile : la journée est tenue jusqu’à minuit (2026-11-01)', () => {
    // Oracle : la nuit étoile est l'horaire de minuit (00:00 à 07:00, écrit
    // 24:00 sur son jour, 2026-11-02), candidat à côté de la nuit de 23:00 ;
    // la journée doit donc tenir jusqu'à 00:00 (l'arrivée la plus tardive).
    const cs = [
      cand('m', 'rec', 6, 7, 15, ['matin']),
      cand('s', 'rec', 6, 14, 22.75, ['soir']),
      nuit('n', 6),
      cand('n7', 'veille', 6, 24, 31, ['nuit']),
    ]
    expect(plageAccueil(cs, tout)?.fin).toBe(6 * J + 24 * H)
    // Refusé : sans l'horaire de minuit, la journée s'arrête à 23:00.
    expect(plageAccueil(cs.slice(0, 3), tout)?.fin).toBe(6 * J + 23 * H)
    // Le matin suivant commence au départ du veilleur, sur ses vraies heures.
    const tot = cand('n3', 'veille', 5, 23, 30, ['nuit'])
    expect(nuitDeLaVeille([tot], jourDe, 6, () => true)).toEqual([
      { debut: 5 * J + 23 * H, fin: 6 * J + 6 * H },
    ])
  })

  it('accepté : la nuit étoile commence à minuit, le soir va jusqu’à minuit', () => {
    const consignes = [
      chiffre(0, 'matin', 1),
      chiffre(0, 'soir', 1),
      chiffre(0, 'nuit', 1),
    ]
    const salaries = [
      sal('a'),
      sal('b'),
      sal('v', { postes: new Set(['veille']) }),
    ]
    const base = [
      matin('rm'),
      cand('cs', 'club', 0, 14, 22.75, ['soir']),
      cand('n0', 'veille', 0, 24, 31, ['nuit']),
    ]
    const r = gen(
      probleme({
        salaries,
        creneaux: [...base, cand('rs', 'rec', 0, 15, 24, ['soir'])],
        consignes,
        nbJours: 1,
      }),
    )
    expect(r.trous).toEqual([])
    expect(qui(r).some((x) => x.endsWith('@rs'))).toBe(true)
    // Refusé : sans soir jusqu'à minuit, de 22:45 à 00:00 personne.
    const sans = gen(
      probleme({ salaries, creneaux: base, consignes, nbJours: 1 }),
    )
    expect(sans.trous).toEqual([
      { poste: POSTE_ACCUEIL, jour: 0, debut: 22.75 * H, fin: 24 * H },
    ])
  })

  it('le lundi, la veille est le dimanche d’avant', () => {
    const cs = [nuit('n6', 6), nuit('n0', 0)]
    const oui = () => true
    expect(nuitDeLaVeille(cs, jourDe, 0, oui)).toEqual([
      { debut: 6 * J + 23 * H - 7 * J, fin: 6 * J + 31 * H - 7 * J },
    ])
    expect(nuitDeLaVeille(cs, jourDe, 1, oui)).toEqual([
      { debut: 23 * H, fin: 31 * H },
    ])
    // Refusé : la nuit de la veille n'est pas demandée.
    expect(nuitDeLaVeille(cs, jourDe, 1, () => false)).toEqual([])
  })

  const consignes = [
    chiffre(0, 'matin', 1),
    chiffre(0, 'soir', 1),
    chiffre(0, 'nuit', 1),
  ]
  const salaries = [
    sal('a'),
    sal('b'),
    sal('v', { postes: new Set(['veille']) }),
  ]
  const base = [
    matin('rm'),
    cand('cs', 'club', 0, 14, 22.75, ['soir']),
    nuit('n', 0),
  ]

  it('accepté : le moteur prend le soir qui va jusqu’au veilleur', () => {
    const r = gen(
      probleme({
        salaries,
        creneaux: [...base, cand('rs', 'rec', 0, 15, 23.25, ['soir'])],
        consignes,
        nbJours: 1,
      }),
    )
    expect(r.trous).toEqual([])
    expect(qui(r)).toContain('v@n')
    expect(qui(r).some((x) => x.endsWith('@rs'))).toBe(true)
  })

  it('refusé : si le soir finit à 22:45, le quart d’heure avant le veilleur est un trou', () => {
    const r = gen(probleme({ salaries, creneaux: base, consignes, nbJours: 1 }))
    expect(r.trous).toEqual([
      { poste: POSTE_ACCUEIL, jour: 0, debut: 22.75 * H, fin: 23 * H },
    ])
  })
})

// ------------------------- rythme, ouverture, relève (2026-11-01, demandes)

describe('rythme de 5 jours (contrat de 35 h ou plus)', () => {
  // Oracle : 39 h se font en 5 jours, pas en 4 jours de 10 h, même si
  // l'accueil a alors une personne en plus.
  const jours = [0, 1, 2, 3, 4, 5, 6]
  const consignes = jours.map((j) => chiffre(j, 'matin', 1))
  const creneaux = jours.flatMap((j) => [
    cand(`c8-${j}`, 'rec', j, 7, 15, ['matin']),
    cand(`c10-${j}`, 'rec', j, 7, 17.75, ['matin']),
  ])
  const nbJoursDe = (r: ReturnType<typeof gen>, id: string) =>
    new Set(
      r.affectations
        .filter((a) => a.salarieId === id)
        .map((a) => creneaux.find((c) => c.id === a.creneauId)!)
        .map(jourDe),
    ).size
  it('accepté : 39 h en 5 jours', () => {
    const r = gen(
      probleme({
        salaries: [
          sal('a', { minutesHebdoContrat: 39 * H }),
          sal('b', { minutesHebdoContrat: 39 * H }),
        ],
        creneaux,
        consignes,
      }),
    )
    expect(nbJoursDe(r, 'a')).toBe(5)
    expect(nbJoursDe(r, 'b')).toBe(5)
  })
  it('refusé : un contrat de moins de 35 h n’a pas ce rythme', () => {
    // Trois matins demandés : rien ne le pousse à 5 jours.
    const r = gen(
      probleme({
        salaries: [sal('a', { minutesHebdoContrat: 30 * H })],
        creneaux,
        consignes: consignes.slice(0, 3),
      }),
    )
    expect(nbJoursDe(r, 'a')).toBeLessThan(5)
  })
})

describe('ouverture d’un poste de l’accueil (réglage du poste)', () => {
  // Oracle : à 07:00, quelqu'un sur la Réception, pendant la première heure.
  const consignes = [chiffre(0, 'matin', 2)]
  const ouvertures = [{ poste: 'rec', jour: 0, debut: 7 * H, fin: 8 * H }]
  const salaries = [sal('a'), sal('b')]
  it('accepté : le moteur met quelqu’un à 07:00 sur la Réception', () => {
    const p = probleme({
      salaries,
      creneaux: [
        cand('r7', 'rec', 0, 7, 15, ['matin']),
        cand('r8', 'rec', 0, 8, 16, ['matin']),
        cand('c8', 'club', 0, 8, 16, ['matin']),
      ],
      consignes,
      ouvertures,
      nbJours: 1,
    })
    const r = gen(p)
    expect(r.ouvertures).toEqual([])
    expect(qui(r).some((x) => x.endsWith('@r7'))).toBe(true)
    expect(ouverturesManquees(p, r.affectations)).toEqual([])
  })
  it('refusé : sans horaire de 07:00 à la Réception, l’ouverture manque', () => {
    const p = probleme({
      salaries,
      creneaux: [
        cand('r8', 'rec', 0, 8, 16, ['matin']),
        cand('c7', 'club', 0, 7, 15, ['matin']),
      ],
      consignes,
      ouvertures,
      nbJours: 1,
    })
    const r = gen(p)
    const attendu = [{ poste: 'rec', jour: 0, debut: 7 * H, fin: 8 * H }]
    expect(r.ouvertures).toEqual(attendu)
    expect(ouverturesManquees(p, r.affectations)).toEqual(attendu)
  })
})

describe('relève entre le matin et le soir (réglage, 30 min)', () => {
  // Oracle : une personne du matin et une du soir ensemble 30 min de suite.
  const consignes = [chiffre(0, 'matin', 1), chiffre(0, 'soir', 1)]
  const salaries = [sal('a'), sal('b')]
  it('accepté : le moteur choisit le soir qui arrive avant le départ du matin', () => {
    const p = probleme({
      salaries,
      creneaux: [
        matin('rm'),
        cand('s15', 'rec', 0, 15, 23, ['soir']),
        cand('s1430', 'club', 0, 14.5, 22.5, ['soir']),
      ],
      consignes,
      releveMinutes: 30,
      nbJours: 1,
    })
    const r = gen(p)
    expect(r.relevesManquantes).toEqual([])
    expect(qui(r).some((x) => x.endsWith('@s1430'))).toBe(true)
    expect(relevesManquantes(p, r.affectations)).toEqual([])
  })
  it('refusé : sans relève réglée, rien n’est demandé ; posés sans chevauchement, elle manque', () => {
    const creneaux = [
      matin('rm'),
      cand('s15', 'rec', 0, 15, 23, ['soir']),
      cand('s1430', 'club', 0, 14.5, 22.5, ['soir']),
    ]
    const sans = probleme({ salaries, creneaux, consignes, nbJours: 1 })
    expect(gen(sans).relevesManquantes).toEqual([])
    const avec = probleme({
      salaries,
      creneaux,
      consignes,
      releveMinutes: 30,
      nbJours: 1,
    })
    expect(
      relevesManquantes(avec, [
        { salarieId: 'a', creneauId: 'rm' },
        { salarieId: 'b', creneauId: 's15' },
      ]),
    ).toEqual([0])
  })
})

describe('transmissions entre équipes (points reliés du mois, 2026-11-02)', () => {
  // Oracle : l'équipe suivante arrive avant que la précédente parte.
  const salaries = [
    sal('v0', { postes: new Set(['veille']) }),
    sal('m'),
    sal('s'),
    sal('v1', { postes: new Set(['veille']) }),
    apprenti('ap'),
  ]
  const creneaux = (soirFin: number, matinDebut: number) => [
    cand('n0', 'veille', 0, 23, 31, ['nuit']),
    cand('m1', 'rec', 1, matinDebut, matinDebut + 8, ['matin']),
    cand('s1', 'club', 1, 14.5, soirFin, ['soir']),
    cand('n1', 'veille', 1, 23, 31, ['nuit']),
  ]
  const poses = [
    { salarieId: 'v0', creneauId: 'n0' },
    { salarieId: 'm', creneauId: 'm1' },
    { salarieId: 's', creneauId: 's1' },
    { salarieId: 'v1', creneauId: 'n1' },
  ]
  const jour1 = (
    soirFin: number,
    matinDebut: number,
    sansReleve: number[] = [],
  ) =>
    transmissions(
      probleme({
        salaries,
        creneaux: creneaux(soirFin, matinDebut),
        nbJours: 2,
      }),
      poses,
      sansReleve,
    )[1]

  it('accepté : chaque équipe arrive avant le départ de la précédente', () => {
    expect(jour1(23.25, 7)).toEqual({
      jour: 1,
      nuitMatin: 'ok',
      matinSoir: 'ok',
      soirNuit: 'ok',
    })
  })

  it('refusé : un trou avant le veilleur, un matin qui arrive après son départ', () => {
    expect(jour1(22.5, 8)).toMatchObject({
      nuitMatin: 'manque',
      soirNuit: 'manque',
    })
  })

  it('la relève réglée qui manque coupe le lien matin → soir', () => {
    expect(jour1(23.25, 7, [1]).matinSoir).toBe('manque')
  })

  it('une équipe absente : pas de lien ; le lundi, la nuit d’avant n’est pas lue', () => {
    const r = transmissions(
      probleme({ salaries, creneaux: creneaux(23.25, 7), nbJours: 2 }),
      poses.filter((x) => x.salarieId !== 'v1'),
      [],
    )
    expect(r[1].soirNuit).toBeNull()
    expect(r[0].nuitMatin).toBeNull()
  })

  it('le lundi, la nuit du dimanche d’avant relie les deux semaines (2026-11-03)', () => {
    const p = probleme({
      salaries,
      creneaux: [cand('m0', 'rec', 0, 7, 15, ['matin'])],
      nbJours: 1,
    })
    const lundi = (fin: number) =>
      transmissions(
        p,
        [{ salarieId: 'm', creneauId: 'm0' }],
        [],
        [{ debut: -60, fin }],
      )[0].nuitMatin
    // Accepté : le veilleur part à 7 h, le matin arrive à 7 h.
    expect(lundi(7 * 60)).toBe('ok')
    // Refusé : le veilleur part à 6 h, une heure sans personne.
    expect(lundi(6 * 60)).toBe('manque')
  })

  it('un soutien seul ne fait pas la transmission', () => {
    const r = transmissions(
      probleme({
        salaries,
        creneaux: [
          ...creneaux(22.5, 7),
          cand('sa', 'club', 1, 15, 23.5, ['soir']),
        ],
        nbJours: 2,
      }),
      [...poses, { salarieId: 'ap', creneauId: 'sa' }],
      [],
    )
    expect(r[1].soirNuit).toBe('manque')
  })
})
