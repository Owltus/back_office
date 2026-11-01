import fc from 'fast-check'
import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import { generer } from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import { creneau, probleme, salarieSolveur } from '#/lib/planning/modele.ts'
import type {
  ConsigneSolveur,
  Creneau,
  SalarieSolveur,
} from '#/lib/planning/modele.ts'
import {
  bilanPresence,
  ecartConsigne,
  libelleConsigne,
  periodeLibre,
  periodePresence,
  periodeShift,
  sommeBesoinsPresence,
} from '#/lib/planning/presence.ts'
import type { Horaire, Periode } from '#/lib/planning/types.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import { codeTest } from '#/lib/planning/test/codesTest.ts'
import { PlanningMemoire } from '#/lib/planning/test/planningMemoire.ts'
import { MINUTES_PAR_JOUR } from '#/lib/planning/temps.ts'

/*
 * Consignes de présence du matin et du soir (demande utilisateur du
 * 2026-10-27). Oracle : le nombre de personnes autonomes posées ce jour-là
 * sur un créneau qui compte, recompté ici à partir des affectations.
 */

const H = 60
let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

function personne(
  id: string,
  contratH: number,
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

/** Un créneau facultatif de 8 h le lundi, qui compte dans `presence`. */
const place = (
  id: string,
  debutH: number,
  presence: 'matin' | 'soir' | null,
  kw: Partial<Creneau> = {},
): Creneau =>
  creneau({
    id,
    poste: 'reception',
    debut: debutH * H,
    fin: (debutH + 8) * H,
    effectif: 0,
    facultatif: 4,
    presence: presence ? [presence] : [],
    ...kw,
  })

const lundi = (
  periode: 'matin' | 'soir',
  minimum: number,
  maximum: number | null,
): ConsigneSolveur => ({ jour: 0, periode, minimum, maximum })

const compte = (
  r: ReturnType<typeof generer>,
  creneaux: string[],
  sauf: string[] = [],
) =>
  r.affectations.filter(
    (a) => creneaux.includes(a.creneauId) && !sauf.includes(a.salarieId),
  ).length

describe('fonctions pures', () => {
  it('période d’un horaire libre', () => {
    expect(periodeLibre('07:00')).toBe('matin')
    expect(periodeLibre('12:00')).toBe('matin')
    expect(periodeLibre('12:30')).toBe('soir')
    expect(periodeLibre('17:00')).toBe('soir')
    expect(periodeLibre('23:00')).toBe('nuit')
    expect(periodeLibre('00:00')).toBe('nuit')
    expect(periodeLibre('05:00')).toBe('matin')
  })

  it('matin et soir : seulement sur un poste qui compte', () => {
    const oui = { presence: true }
    const non = { presence: false }
    // Acceptés.
    expect(periodePresence(oui, { periode: 'matin' }, '15:00')).toBe('matin')
    expect(periodePresence(oui, { periode: 'soir' }, '07:00')).toBe('soir')
    expect(periodePresence(oui, undefined, '13:00')).toBe('soir')
    expect(periodePresence(oui, undefined, '07:00', true)).toBe('matin')
    // Refusés : poste hors présence (même avec un code de nuit sur le
    // poste), poste inconnu, code sans famille.
    expect(periodePresence(non, { periode: 'matin' }, '07:00')).toBeNull()
    expect(periodePresence(non, { periode: 'soir' }, '15:00', true)).toBeNull()
    expect(periodePresence(non, undefined, '07:00', true)).toBeNull()
    expect(periodePresence(undefined, undefined, '07:00')).toBeNull()
    expect(periodePresence(oui, { periode: null }, '08:00')).toBeNull()
    expect(periodePresence(oui, { periode: null }, '23:00', true)).toBeNull()
  })

  it('middle : jamais compté (D11)', () => {
    const oui = { presence: true }
    expect(periodePresence(oui, { periode: 'middle' }, '11:00')).toBeNull()
    expect(periodePresence(oui, { periode: 'middle' }, '13:00')).toBeNull()
    expect(
      periodePresence(oui, { periode: 'middle' }, '23:00', true),
    ).toBeNull()
    // Contrôle : le même début sans code compte.
    expect(periodePresence(oui, undefined, '11:00')).toBe('matin')
  })

  it('un horaire court compte avec son moment (plus de « court », 2026-10-31)', () => {
    // Oracle : décision utilisateur, un court se range d'après son début
    // (07:00-10:00 au matin, 19:00-22:00 au soir) et compte comme tel.
    const oui = { presence: true }
    expect(periodePresence(oui, { periode: 'matin' }, '07:00')).toBe('matin')
    expect(periodePresence(oui, { periode: 'soir' }, '19:00')).toBe('soir')
    expect(
      periodePresence({ presence: false }, { periode: 'matin' }, '07:00'),
    ).toBeNull()
  })

  it('nuit : sur un poste qui a un code de nuit, coché ou non (D15)', () => {
    const oui = { presence: true }
    const non = { presence: false }
    // Acceptés : code de nuit ou horaire libre de nuit, nuitComptee.
    expect(periodePresence(non, { periode: 'nuit' }, '23:00', true)).toBe(
      'nuit',
    )
    expect(periodePresence(oui, { periode: 'nuit' }, '21:00', true)).toBe(
      'nuit',
    )
    expect(periodePresence(non, undefined, '23:00', true)).toBe('nuit')
    expect(periodePresence(undefined, undefined, '02:00', true)).toBe('nuit')
    // Refusés : sans nuitComptee (défaut compris).
    expect(periodePresence(oui, { periode: 'nuit' }, '23:00')).toBeNull()
    expect(periodePresence(oui, { periode: 'nuit' }, '23:00', false)).toBeNull()
    expect(periodePresence(oui, undefined, '23:00')).toBeNull()
    expect(periodePresence(non, undefined, '23:00', false)).toBeNull()
  })

  it('propriété : un middle ne compte jamais, quelle que soit l’heure', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        fc.boolean(),
        fc.boolean(),
        (h, m, presence, nuitComptee) => {
          const debut = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
          expect(
            periodePresence(
              { presence },
              { periode: 'middle' },
              debut,
              nuitComptee,
            ),
          ).toBeNull()
        },
      ),
    )
  })

  it('periodeShift garde son ancienne règle (équité)', () => {
    expect(periodeShift({ periode: 'middle' }, '11:00')).toBe('matin')
    expect(periodeShift({ periode: 'middle' }, '13:00')).toBe('soir')
    expect(periodeShift({ periode: 'nuit' }, '23:00')).toBeNull()
    expect(periodeShift(undefined, '23:00')).toBeNull()
  })

  it('somme des besoins : même règle, nuit seulement si le poste en a', () => {
    // Poste 1 : Réception (présence) ; poste 2 : Veille (code de nuit).
    const postes = new Map([
      [1, { presence: true }],
      [2, { presence: false }],
    ])
    const horaires = new Map<number, { periode: Periode | null }>([
      [10, { periode: 'matin' }],
      [11, { periode: 'middle' }],
      [12, { periode: 'nuit' }],
    ])
    const besoin = (
      poste_id: number,
      horaire_id: number | null,
      debut: string,
      effectif: number,
    ) => ({ poste_id, jour: 0, horaire_id, debut, effectif })
    const besoins = [
      besoin(1, 10, '07:00', 2),
      besoin(1, 11, '11:00', 1), // middle : exclu
      besoin(2, 12, '23:00', 1),
      besoin(1, null, '23:00', 3), // libre de nuit sur un poste sans nuit
      besoin(1, 10, '07:00', 0), // effectif nul : ignoré
    ]
    // Sans l'argument : la nuit ne compte pas (appelants d'avant).
    expect(sommeBesoinsPresence(besoins, postes, horaires)).toEqual(
      new Map([['0:matin', 2]]),
    )
    expect(
      sommeBesoinsPresence(besoins, postes, horaires, new Set([2])),
    ).toEqual(
      new Map([
        ['0:matin', 2],
        ['0:nuit', 1],
      ]),
    )
  })

  it('bilan : un shift de nuit présent compte dans la consigne de nuit', () => {
    const b = bilanPresence(
      [{ id: 1, jour: 0, periode: 'nuit', minimum: 1, maximum: 1 }],
      [{ jour: 0, periode: 'nuit' }],
    )
    expect(b.map((x) => [x.periode, x.compte, x.ecart])).toEqual([
      ['nuit', 1, 0],
    ])
  })

  it('écart à une consigne', () => {
    expect(ecartConsigne(1, 3, 4)).toBe(-2)
    expect(ecartConsigne(3, 3, 4)).toBe(0)
    expect(ecartConsigne(4, 3, 4)).toBe(0)
    expect(ecartConsigne(6, 3, 4)).toBe(2)
    expect(ecartConsigne(9, 3, null)).toBe(0)
  })

  it('libellé d’une consigne', () => {
    expect(libelleConsigne(2, 2)).toBe('2')
    expect(libelleConsigne(3, 4)).toBe('3 ou 4')
    expect(libelleConsigne(3, 5)).toBe('3 à 5')
    expect(libelleConsigne(2, null)).toBe('au moins 2')
  })

  it('bilan d’une semaine : trié par jour, matin avant soir', () => {
    const b = bilanPresence(
      [
        { id: 1, jour: 1, periode: 'soir', minimum: 2, maximum: 2 },
        { id: 2, jour: 1, periode: 'matin', minimum: 3, maximum: 4 },
        { id: 3, jour: 0, periode: 'matin', minimum: 2, maximum: 2 },
      ],
      [
        { jour: 0, periode: 'matin' },
        { jour: 0, periode: 'matin' },
        { jour: 0, periode: 'matin' },
        { jour: 1, periode: 'matin' },
        { jour: 1, periode: 'soir' },
        { jour: 1, periode: 'soir' },
      ],
    )
    expect(b.map((x) => [x.jour, x.periode, x.compte, x.ecart])).toEqual([
      [0, 'matin', 3, 1],
      [1, 'matin', 1, -2],
      [1, 'soir', 2, 0],
    ])
  })
})

describe('générateur', () => {
  it('le minimum fait venir du monde que rien d’autre n’appelle', () => {
    // Contrats à 0 h : sans consigne, personne ne vient (refusé).
    const staff = ['a', 'b', 'c'].map((id) => personne(id, 0))
    const creneaux = [place('m', 7, 'matin')]
    const sans = generer(probleme({ salaries: staff, creneaux }), highs)
    expect(compte(sans, ['m'])).toBe(0)
    const avec = generer(
      probleme({
        salaries: staff,
        creneaux,
        consignes: [lundi('matin', 2, 2)],
      }),
      highs,
    )
    expect(compte(avec, ['m'])).toBe(2)
  })

  it('le chiffre exact envoie le surplus sur l’autre période', () => {
    // Trois personnes à 8 h dues, le même lundi : il en faut 1 le matin. Le
    // chiffre est EXACT depuis le 2026-11-01 (D3) : « minimum 0, maximum 1 »
    // ne se dit plus, c'est « 1 » (le minimum fait foi).
    const staff = ['a', 'b', 'c'].map((id) => personne(id, 8))
    const creneaux = [place('m', 7, 'matin'), place('s', 14, 'soir')]
    const r = generer(
      probleme({
        salaries: staff,
        creneaux,
        consignes: [lundi('matin', 1, 1)],
        nbJours: 1,
      }),
      highs,
    )
    expect(compte(r, ['m'])).toBe(1)
    expect(compte(r, ['s'])).toBe(2)
  })

  it('les heures dues passent avant le chiffre (D8, dernier recours)', () => {
    // Deux personnes à 8 h, un seul créneau, il en faut 1 : les deux
    // viennent, rien d'autre ne leur donne leurs heures (D8 du 2026-11-01).
    const staff = ['a', 'b'].map((id) => personne(id, 8))
    const r = generer(
      probleme({
        salaries: staff,
        creneaux: [place('m', 7, 'matin')],
        consignes: [lundi('matin', 1, 1)],
        nbJours: 1,
      }),
      highs,
    )
    expect(compte(r, ['m'])).toBe(2)
  })

  it('un soutien compte dans le chiffre, jamais seul (D5)', () => {
    // Révisé le 2026-11-01 (D5 : « les apprentis et stagiaires COMPTENT
    // dans le chiffre, jamais seuls ») : avant, il ne comptait pas.
    const apprenti = personne('apprenti', 0, {
      postes: new Set(),
      postesSoutien: new Set(['reception']),
    })
    const titulaire = personne('titulaire', 0)
    const deux = generer(
      probleme({
        salaries: [apprenti, titulaire],
        creneaux: [place('m', 7, 'matin', { soutien: 1 })],
        consignes: [lundi('matin', 2, 2)],
        nbJours: 1,
      }),
      highs,
    )
    // Accepté : l'apprenti et le titulaire font les 2.
    expect(compte(deux, ['m'])).toBe(2)
    expect(compte(deux, ['m'], ['titulaire'])).toBe(1)
    // Refusé : seul, l'apprenti ne vient pas (il manque 1).
    const seul = generer(
      probleme({
        salaries: [apprenti],
        creneaux: [place('m', 7, 'matin', { soutien: 1 })],
        consignes: [lundi('matin', 1, 1)],
        nbJours: 1,
      }),
      highs,
    )
    expect(compte(seul, ['m'])).toBe(0)
  })

  it('un créneau hors présence ne compte pas', () => {
    const staff = ['a', 'b'].map((id) => personne(id, 0))
    const r = generer(
      probleme({
        salaries: staff,
        creneaux: [place('m', 7, null), place('s', 14, 'soir')],
        consignes: [lundi('matin', 2, null)],
        nbJours: 1,
      }),
      highs,
    )
    expect(compte(r, ['m', 's'])).toBe(0)
  })

  it('une consigne d’un autre jour ne touche pas le lundi', () => {
    const staff = ['a', 'b'].map((id) => personne(id, 0))
    const r = generer(
      probleme({
        salaries: staff,
        creneaux: [
          place('m', 7, 'matin'),
          place('m2', 7 + 24, 'matin', {
            debut: MINUTES_PAR_JOUR + 7 * H,
            fin: MINUTES_PAR_JOUR + 15 * H,
          }),
        ],
        consignes: [{ jour: 1, periode: 'matin', minimum: 1, maximum: 1 }],
        nbJours: 2,
      }),
      highs,
    )
    expect(compte(r, ['m'])).toBe(0)
    expect(compte(r, ['m2'])).toBe(1)
  })
})

describe('une semaine de l’hôtel d’essai', () => {
  it('la génération suit le tableau de l’accueil et l’analyse le recompte', () => {
    // Révisé le 2026-11-01 (plan planning-accueil) : l'accueil (Réception,
    // Club, Veille de nuit) n'a plus de besoins, seul le tableau compte. Les
    // chiffres reprennent les anciens besoins de l'hôtel d'essai (matin 2,
    // soir 2, nuit 1 ; le middle était un renfort facultatif), avec 3 le
    // samedi matin.
    const { referentiel, absences } = hotelDemo('2026-11-02')
    for (const p of referentiel.postes)
      p.presence = p.nom === 'Réception' || p.nom === 'Club'
    const moment: Record<string, Horaire['periode']> = {
      M: 'matin',
      MI: 'middle',
      AM: 'soir',
      N: 'nuit',
    }
    for (const h of referentiel.horaires)
      h.periode = moment[codeTest(h) ?? ''] ?? null
    let n = 0
    referentiel.consignes = [0, 1, 2, 3, 4, 5, 6].flatMap((jour) =>
      (['matin', 'soir', 'nuit'] as const).map((periode) => {
        const chiffre =
          periode === 'nuit' ? 1 : jour === 5 && periode === 'matin' ? 3 : 2
        return { id: ++n, jour, periode, minimum: chiffre, maximum: chiffre }
      }),
    )
    const p = new PlanningMemoire(referentiel, absences, '2026-09-01', highs)
    const sem = p.generer('2026-11-02')
    expect(sem.stats.infractions).toBe(0)
    // Oracle : recompte à la main depuis les shifts rendus (D5 : soutiens
    // compris ; D11 : un middle compte au matin et au soir ; D10 : la nuit
    // sur la Veille seule).
    const postes = new Set(
      referentiel.postes.filter((x) => x.presence).map((x) => x.id),
    )
    const veille = referentiel.postes.find((x) => x.categorie === 'veille_nuit')
    const code = new Map(referentiel.horaires.map((h) => [h.id, codeTest(h)]))
    const recompte = (jour: number, periode: 'matin' | 'soir' | 'nuit') =>
      sem.affectations.filter((a) => {
        if (a.jour !== jour) return false
        const c = code.get(a.type_shift_id ?? -1)
        if (periode === 'nuit') return a.poste_id === veille?.id && c === 'N'
        if (!postes.has(a.poste_id)) return false
        return periode === 'matin'
          ? c === 'M' || c === 'MI'
          : c === 'AM' || c === 'MI'
      }).length
    for (const x of sem.presence) {
      expect(x.compte).toBe(recompte(x.jour, x.periode))
      // Le chiffre exact : jamais de manque ici (assez de monde).
      expect(x.ecart).toBeGreaterThanOrEqual(0)
    }
    // Au moins le chiffre ; une personne en plus est permise pour que la
    // journée tienne jusqu'à l'arrivée du veilleur (2026-11-01), jamais un trou.
    expect(recompte(5, 'matin')).toBeGreaterThanOrEqual(3)
    expect(sem.trous).toEqual([])
  }, 60_000)
})
