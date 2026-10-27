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
} from '#/lib/planning/presence.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
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
    presence,
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

  it('seul un poste qui compte, à une période matin ou soir, compte', () => {
    const oui = { presence: true }
    const non = { presence: false }
    expect(periodePresence(oui, { periode: 'matin' }, '15:00')).toBe('matin')
    expect(periodePresence(oui, { periode: 'soir' }, '07:00')).toBe('soir')
    expect(periodePresence(oui, { periode: 'nuit' }, '23:00')).toBeNull()
    expect(periodePresence(oui, { periode: null }, '08:00')).toBeNull()
    expect(periodePresence(oui, undefined, '13:00')).toBe('soir')
    expect(periodePresence(non, { periode: 'matin' }, '07:00')).toBeNull()
    expect(periodePresence(undefined, undefined, '07:00')).toBeNull()
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

  it('le maximum envoie le surplus sur l’autre période', () => {
    // Trois personnes à 8 h dues, le même lundi : matin plafonné à 1.
    const staff = ['a', 'b', 'c'].map((id) => personne(id, 8))
    const creneaux = [place('m', 7, 'matin'), place('s', 14, 'soir')]
    const r = generer(
      probleme({
        salaries: staff,
        creneaux,
        consignes: [lundi('matin', 0, 1)],
        nbJours: 1,
      }),
      highs,
    )
    expect(compte(r, ['m'])).toBe(1)
    expect(compte(r, ['s'])).toBe(2)
  })

  it('les heures dues passent avant le plafond', () => {
    // Deux personnes à 8 h, un seul créneau, plafond à 1 : les deux viennent.
    const staff = ['a', 'b'].map((id) => personne(id, 8))
    const r = generer(
      probleme({
        salaries: staff,
        creneaux: [place('m', 7, 'matin')],
        consignes: [lundi('matin', 0, 1)],
        nbJours: 1,
      }),
      highs,
    )
    expect(compte(r, ['m'])).toBe(2)
  })

  it('un profil soutien ne compte pas dans la consigne', () => {
    const apprenti = personne('apprenti', 0, {
      postes: new Set(),
      postesSoutien: new Set(['reception']),
    })
    const titulaire = personne('titulaire', 0)
    const r = generer(
      probleme({
        salaries: [apprenti, titulaire],
        creneaux: [place('m', 7, 'matin', { soutien: 1 })],
        consignes: [lundi('matin', 1, null)],
        nbJours: 1,
      }),
      highs,
    )
    expect(compte(r, ['m'], ['apprenti'])).toBe(1)
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
  it('la génération suit la consigne et l’analyse la recompte', () => {
    const { referentiel, absences } = hotelDemo('2026-11-02')
    for (const p of referentiel.postes)
      p.presence = p.nom === 'Réception' || p.nom === 'Club'
    for (const h of referentiel.horaires)
      h.periode = h.code === 'AM' ? 'soir' : h.code === 'N' ? 'nuit' : 'matin'
    referentiel.consignes = [
      { id: 1, jour: 5, periode: 'matin', minimum: 3, maximum: 3 },
      { id: 2, jour: 0, periode: 'soir', minimum: 2, maximum: 2 },
    ]
    const p = new PlanningMemoire(referentiel, absences, '2026-09-01', highs)
    const sem = p.generer('2026-11-02')
    expect(sem.stats.infractions).toBe(0)
    // Oracle : recompte à la main depuis les shifts rendus.
    const postes = new Set(
      referentiel.postes.filter((x) => x.presence).map((x) => x.id),
    )
    const code = new Map(referentiel.horaires.map((h) => [h.id, h.code]))
    const recompte = (jour: number, soir: boolean) =>
      sem.affectations.filter(
        (a) =>
          a.jour === jour &&
          postes.has(a.poste_id) &&
          a.role !== 'soutien' &&
          (code.get(a.type_shift_id ?? -1) === 'AM') === soir &&
          code.get(a.type_shift_id ?? -1) !== 'N',
      ).length
    expect(sem.presence).toEqual([
      {
        jour: 0,
        periode: 'soir',
        compte: recompte(0, true),
        minimum: 2,
        maximum: 2,
        ecart: 0,
      },
      {
        jour: 5,
        periode: 'matin',
        compte: recompte(5, false),
        minimum: 3,
        maximum: 3,
        ecart: 0,
      },
    ])
    expect(recompte(5, false)).toBe(3)
  })
})
