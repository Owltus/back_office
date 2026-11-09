import fc from 'fast-check'
import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  generer,
  PLACES_PAR_TRANSITION,
  PLACES_REPOS_SEUL,
  PLACES_TRANSITION_MAX,
  prixFauteRythme,
  prixOrdre,
  prixTransition,
} from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import {
  creneau as creneauModele,
  probleme,
  salarieSolveur,
} from '#/lib/planning/modele.ts'
import type {
  AffectationSolveur,
  Creneau,
  Probleme,
  SalarieSolveur,
} from '#/lib/planning/modele.ts'
import { desequilibres } from '#/lib/planning/presence.ts'
import type { PresenceOut } from '#/lib/planning/presence.ts'
import {
  estReposSeul,
  estReposTropLong,
  estTransition,
  fautesRythme,
  genreMotif,
  motifsInterdits,
  reposSeulsDans,
  transitionsDans,
} from '#/lib/planning/rythmeStrict.ts'
import type { EtatRythme } from '#/lib/planning/rythmeStrict.ts'
import { preparerGeneration } from '#/lib/planning/semaine.ts'
import type { SemaineOut } from '#/lib/planning/semaine.ts'
import { apprentieCfa } from '#/lib/planning/test/apprentieCfa.ts'
import { hotelMercredi } from '#/lib/planning/test/hotelMercredi.ts'
import { PlanningMemoire } from '#/lib/planning/test/planningMemoire.ts'
import { MINUTES_PAR_JOUR } from '#/lib/planning/temps.ts'
import {
  moraleQuiBloque,
  REGLE_TRANSITION,
  violations,
} from '#/lib/planning/verificateur.ts'
import { phraseDesequilibre } from '#/components/planning/attention.ts'

/*
 * ORDRE DE DÉCISION du 2026-11-09 (décisions de l'utilisateur : « oui, mais
 * vraiment si utile ; tous les membres du personnel doivent pouvoir faire
 * toutes leurs heures quoi qu'il arrive ; les repos de quatre jours, c'est
 * non ; quatre personnes le soir alors que personne le matin, c'est non »).
 * Accepté et refusé, pour la TRANSITION (changement de jours de repos), les
 * 4 repos, les prix de l'ordre, l'ÉQUILIBRE entre les moments, et le cas du
 * mercredi (données fictives).
 */

const H = 60
let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

const suite = (texte: string) => [...texte] as EtatRythme[]

describe('la définition', () => {
  it('transition : seulement un bloc de 4 jours entre deux repos', () => {
    const t = (texte: string) =>
      fautesRythme(suite(texte)).map((f) => estTransition(f))
    expect(t('rrTTTTrr')).toEqual([true])
    // Refusé : 3 repos (plus jamais une transition, 2026-11-09), un repos
    // seul, un bloc de 3.
    expect(t('TTTTTrrrTTTTT')).toEqual([false])
    expect(t('TTTTTrTTTT')).toEqual([false])
    expect(t('rrTTTrr')).toEqual([false])
  })
  it('3 repos ou plus : trop long ; 2 non', () => {
    const long = (texte: string) =>
      fautesRythme(suite(texte)).map((f) => estReposTropLong(f))
    expect(long('TrrrT')).toEqual([true])
    expect(long('TrrrrT')).toEqual([true])
    expect(long('TrrT')).toEqual([])
    // Contre un jour neutre : aucune faute du tout.
    expect(long('TrrrnT')).toEqual([])
  })
  it('repos seul : un repos entre deux blocs', () => {
    const seul = (texte: string) =>
      fautesRythme(suite(texte)).map((f) => estReposSeul(f))
    expect(seul('TTTTTrTTTTT')).toEqual([true])
    expect(seul('TTTTTrrTTTTT')).toEqual([])
    expect(reposSeulsDans(suite('TTTTTrTTTTrrTTTTTrr'))).toBe(1)
  })
  it('le genre de chaque motif interdit du calcul', () => {
    const g = (texte: string) => genreMotif([...texte] as Array<'T' | 'r'>)
    expect(g('TTTTTT')).toBe('six')
    expect(g('TrrrT')).toBe('dur')
    expect(g('TrrrrrrT')).toBe('dur')
    expect(g('rTTTTr')).toBe('transition')
    expect(g('TrT')).toBe('urgence')
    expect(g('rTTTr')).toBe('fort')
    expect(g('rTr')).toBe('fort')
    // Chaque motif a son genre, et la même règle que `fautesRythme`.
    for (const m of motifsInterdits(21)) {
      const f = fautesRythme(m)
      if (genreMotif(m) === 'six') continue
      expect(f).toHaveLength(1)
      expect(estTransition(f[0])).toBe(genreMotif(m) === 'transition')
      expect(estReposTropLong(f[0])).toBe(genreMotif(m) === 'dur')
      expect(estReposSeul(f[0])).toBe(genreMotif(m) === 'urgence')
    }
  })
  it('les transitions déjà faites, comptées sur le passé connu', () => {
    expect(transitionsDans(suite('TTTTTrrTTTTTrrTTTTTrrTTTTTrr'))).toBe(0)
    expect(transitionsDans(suite('TTTTTrrTTTTrrTTTTTrrTTTTTrr'))).toBe(1)
    // Un bord inconnu : rien n'est compté.
    expect(transitionsDans(suite('uuuuuuuuuuuuuuuuuuuuuuurrr'))).toBe(0)
  })
})

describe('les prix de l’ordre', () => {
  it('place < transition < repos seul < une heure due < une faute < 3 repos', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -5e7, max: 5e7 }), { minLength: 1 }),
        fc.integer({ min: 0, max: 48 * H }),
        fc.integer({ min: 0, max: 12 }),
        (couts, minutes, rang) => {
          const p = prixOrdre(couts, minutes)
          const place = Math.max(1, ...couts.map(Math.abs))
          expect(p.place).toBe(place)
          // Une transition : plus qu'une place, sous deux ; la suivante un
          // peu plus, jamais au-dessus du repos seul.
          expect(p.transition).toBeGreaterThan(place)
          expect(p.transition).toBeLessThan(2 * place + 1)
          expect(prixTransition(p, 0)).toBe(p.transition)
          expect(prixTransition(p, rang + 1)).toBeGreaterThanOrEqual(
            prixTransition(p, rang),
          )
          expect(prixTransition(p, rang)).toBeLessThan(p.urgence)
          // Un repos seul : plus que toute transition, sous une heure due.
          expect(60 * p.minuteDue).toBeGreaterThan(p.urgence + place)
          // Un bloc court vaut plus que la semaine du plus gros contrat.
          expect(p.fort).toBeGreaterThan(p.minuteDue * minutes)
          expect(p.fort).toBeGreaterThanOrEqual(prixFauteRythme([place]))
          expect(p.dur).toBeGreaterThan(p.fort)
        },
      ),
    )
    expect(PLACES_PAR_TRANSITION).toBeGreaterThan(1)
    expect(PLACES_PAR_TRANSITION).toBeLessThan(2)
    expect(PLACES_REPOS_SEUL).toBeGreaterThan(PLACES_TRANSITION_MAX)
  })
})

// ------------------------------------------------------------ le calcul

const cr = (jour: number, kw: Partial<Creneau> = {}): Creneau =>
  creneauModele({
    id: `j${jour}`,
    poste: 'r',
    debut: jour * MINUTES_PAR_JOUR + 8 * H,
    fin: jour * MINUTES_PAR_JOUR + 15 * H,
    effectif: 1,
    ...kw,
  })

const personne = (kw: Partial<SalarieSolveur> = {}): SalarieSolveur =>
  salarieSolveur({
    id: 'a',
    postes: new Set(['r']),
    minutesHebdoContrat: 35 * H,
    minutesHebdoMax: 48 * H,
    minutesJourMax: 10 * H,
    joursTravaillesMaxSemaine: 6,
    joursPreferesSemaine: 5,
    reposQuotidienMin: 11 * H,
    ...kw,
  })

const resoudre = (
  s: SalarieSolveur,
  jours: number[],
  kw: Partial<Probleme> = {},
) => {
  const p = probleme({
    salaries: [s],
    creneaux: jours.map((j) => cr(j)),
    graine: 1,
    ...kw,
  })
  return { p, r: generer(p, highs) }
}
const tenus = (r: { affectations: AffectationSolveur[] }) =>
  r.affectations.map((a) => Number(a.creneauId.slice(1))).sort((a, b) => a - b)

describe('le calcul', () => {
  it('pas de plafond de transitions : déjà 4 sur 4 semaines, la suivante se fait pour les heures', () => {
    // Un seul repos le dimanche d'avant, le CFA la semaine d'après, un
    // repos seul déjà fait : un bloc de 4 (transition) plutôt qu'aucun
    // jour, même avec 4 transitions déjà faites.
    const s = personne({
      etatsAvant: 'rTTTTTr',
      joursSemainePrecedente: 5,
      etatsApres: 'TTTTTrr',
      reposSeulsRecents: 1,
      transitionsRecentes: 4,
    })
    const { p, r } = resoudre(s, [0, 1, 2, 3, 4, 5, 6])
    expect(tenus(r)).toEqual([1, 2, 3, 4])
    const dits = violations(p, r.affectations).filter(
      (v) => v.regle === REGLE_TRANSITION,
    )
    expect(dits.map((v) => v.message)).toEqual([
      'changement de jours de repos : 4 jours de travail du mardi au vendredi',
    ])
    expect(dits.some(moraleQuiBloque)).toBe(false)
  })
  it('refusé : la transition qui ne sert à rien (aucune place de plus)', () => {
    // Repos du mardi et du mercredi (semaine d'avant : lundi travaillé, puis
    // jeudi au dimanche) ; une place chaque jour. Garder le rythme donne 5
    // places ; décaler les repos aussi : aucune transition.
    const s = personne({
      etatsAvant: 'TrrTTTT',
      joursSemainePrecedente: 5,
      serieAvant: 4,
    })
    const { p, r } = resoudre(s, [0, 1, 2, 3, 4, 5, 6])
    expect(tenus(r)).toEqual([0, 3, 4, 5, 6])
    expect(
      violations(p, r.affectations).some((v) => v.regle === REGLE_TRANSITION),
    ).toBe(false)
  })
  it('les heures dues passent avant : 39 h en 5 jours, rythme gardé', () => {
    const s = personne({
      minutesHebdoContrat: 39 * H,
      journeePleine: 8 * H,
      etatsAvant: 'TrrTTTT',
      joursSemainePrecedente: 5,
      serieAvant: 4,
    })
    const jours = [0, 1, 2, 3, 4, 5, 6]
    const creneaux = jours.flatMap((j) => [
      cr(j, {
        id: `j${j}`,
        debut: j * MINUTES_PAR_JOUR + 7 * H,
        fin: j * MINUTES_PAR_JOUR + 15 * H,
      }),
    ])
    const p = probleme({ salaries: [s], creneaux, graine: 1 })
    const r = generer(p, highs)
    const minutes = r.affectations.reduce((t, a) => {
      const c = creneaux.find((x) => x.id === a.creneauId)!
      return t + c.fin - c.debut
    }, 0)
    expect(minutes).toBeGreaterThanOrEqual(5 * 8 * H)
  })
})

// ----------------------------------- l'apprentie avant son CFA (fictif)

describe('repos mercredi-jeudi, CFA le lundi 14 (fictif)', () => {
  it('jamais 3 repos ; au plus un repos seul ; 7 h perdues au plus, et pourquoi', () => {
    const { referentiel, absences, avant } = apprentieCfa()
    const m = new PlanningMemoire(referentiel, absences, '2026-11-09', highs)
    m.avecHistorique = true
    for (const a of avant) m.semaines.set(a.lundi, [...m.shifts(a.lundi), a])
    const semaines = ['2026-11-30', '2026-12-07', '2026-12-14'].map((lundi) =>
      m.generer(lundi, {
        graine: 1,
        horizon: { suivanteRecalculee: lundi !== '2026-12-14' },
      }),
    )
    const alertes = semaines.flatMap((s) =>
      s.bilan.flatMap((b) => b.alertes.map((a) => ({ s, a }))),
    )
    // Jamais 3 repos de suite.
    expect(
      alertes.filter(({ a }) => /\d+ jours de repos/.test(a.message)),
    ).toEqual([])
    // Au plus un repos seul sur ces semaines.
    expect(
      new Set(
        alertes
          .filter(({ a }) => a.regle === 'RYTHME-REPOS-SEUL')
          .map(({ s, a }) => `${s.lundi}|${a.message}`),
      ).size,
    ).toBeLessThanOrEqual(1)
    // Les heures : la suite « mercredi-jeudi » jusqu'au samedi-dimanche
    // d'avant le CFA demande deux repos seuls pour ne rien perdre (vérifié
    // à la main sur toutes les suites possibles) ; avec un seul, une
    // journée (7 h) se perd. C'est le plus petit manque permis.
    const manque = semaines
      .slice(0, 2)
      .reduce(
        (t, s) =>
          t + Math.max(0, s.bilan[0].minutes_contrat - s.bilan[0].minutes),
        0,
      )
    expect(manque).toBeLessThanOrEqual(7 * H)
  }, 120_000)
})

// --------------------------------------------------------- l'équilibre

const pr = (
  jour: number,
  periode: string,
  compte: number,
  minimum: number,
  maximum: number | null = minimum,
  zone = '1',
): PresenceOut => ({
  zone,
  jour,
  periode,
  compte,
  minimum,
  maximum,
  ecart: 0,
})

describe('l’équilibre entre les moments', () => {
  it('refusé : 0 le matin, 4 le soir le même jour, dans la même zone', () => {
    const d = desequilibres([
      pr(2, 'matin', 0, 3),
      pr(2, 'soir', 4, 2),
      pr(2, 'nuit', 1, 1),
    ])
    expect(d).toEqual([
      {
        zone: '1',
        jour: 2,
        moments: [
          { periode: 'matin', compte: 0 },
          { periode: 'soir', compte: 4 },
          { periode: 'nuit', compte: 1 },
        ],
      },
    ])
    expect(phraseDesequilibre(d[0], 'mercredi 9', 'Accueil')).toBe(
      "Mercredi 9 : 0 le matin, 4 le soir, 1 la nuit à l'Accueil",
    )
  })
  it('accepté : un manque sans monde en trop ; du monde en trop sans manque ; deux zones', () => {
    expect(desequilibres([pr(2, 'matin', 1, 3), pr(2, 'soir', 2, 2)])).toEqual(
      [],
    )
    expect(desequilibres([pr(2, 'matin', 3, 3), pr(2, 'soir', 4, 2)])).toEqual(
      [],
    )
    // Au plus 3 : 3 le soir n'est pas en trop.
    expect(
      desequilibres([pr(2, 'matin', 1, 2), pr(2, 'soir', 3, 2, 3)]),
    ).toEqual([])
    expect(
      desequilibres([
        pr(2, 'matin', 0, 3, 3, '1'),
        pr(2, 'soir', 4, 2, 2, '2'),
      ]),
    ).toEqual([])
    // Deux jours différents non plus.
    expect(desequilibres([pr(2, 'matin', 0, 3), pr(3, 'soir', 4, 2)])).toEqual(
      [],
    )
  })
})

describe('l’équilibre dans le calcul', () => {
  it('le jour du monde en trop : celui où aucun autre moment ne manque', () => {
    // b tient le soir du lundi et du mardi ; a doit un shift du soir, en
    // trop l'un ou l'autre jour. Le lundi matin manque (personne ne tient
    // son poste) : a vient le mardi, à chaque graine.
    const soir = (id: string, jour: number) =>
      creneauModele({
        id,
        poste: 'r',
        debut: jour * MINUTES_PAR_JOUR + 15 * H,
        fin: jour * MINUTES_PAR_JOUR + 22 * H,
        effectif: 0,
        facultatif: 2,
        presence: ['soir'],
      })
    const creneaux = [
      creneauModele({
        id: 'mlun',
        poste: 'z',
        debut: 7 * H,
        fin: 14 * H,
        effectif: 0,
        facultatif: 1,
        presence: ['matin'],
      }),
      soir('slun', 0),
      soir('smar', 1),
    ]
    const a = personne({
      id: 'a',
      minutesHebdoContrat: 7 * H,
      joursTravaillesMaxSemaine: 1,
      joursPreferesSemaine: 1,
    })
    const b = personne({ id: 'b', minutesHebdoContrat: 0 })
    const consignes = [
      { jour: 0, periode: 'matin', minimum: 1, maximum: 1 },
      { jour: 0, periode: 'soir', minimum: 1, maximum: 1 },
      { jour: 1, periode: 'soir', minimum: 1, maximum: 1 },
    ]
    for (const graine of [1, 2, 3, 4, 5, 6]) {
      const r = generer(
        probleme({
          salaries: [a, b],
          creneaux,
          consignes,
          imposees: new Set(['b|slun', 'b|smar']),
          graine,
        }),
        highs,
      )
      expect(
        r.affectations
          .filter((x) => x.salarieId === 'a')
          .map((x) => x.creneauId),
      ).toEqual(['smar'])
    }
  })
})

// ---------------------------------------------- le cas du mercredi (fictif)

describe('le cas du mercredi', () => {
  /** Trois semaines de décembre, comme « Compléter le mois » (horizon
   * glissant), les 4 semaines d'avant lues (transitions déjà faites). */
  const decembre = () => {
    const { referentiel, avant } = hotelMercredi()
    const m = new PlanningMemoire(referentiel, [], '2026-11-09', highs)
    m.avecHistorique = true
    for (const a of avant) m.semaines.set(a.lundi, [...m.shifts(a.lundi), a])
    const semaines = ['2026-12-07', '2026-12-14', '2026-12-21'].map((lundi) =>
      m.generer(lundi, {
        graine: 1,
        horizon: { suivanteRecalculee: lundi !== '2026-12-21' },
      }),
    )
    return Object.assign(semaines, { m })
  }
  const alertes = (semaines: SemaineOut[]) =>
    semaines.flatMap((s) =>
      s.bilan.flatMap((b) => b.alertes.map((a) => ({ s, b, a }))),
    )
  const matin = (s: SemaineOut, jour: number) =>
    s.presence.find((x) => x.jour === jour && x.periode === 'matin')?.compte

  it('une transition, puis des matins tenus, et personne sous ses heures', () => {
    const semaines = decembre()
    const toutes = alertes(semaines)
    // Les transitions faites, lues dans le passé à la dernière semaine
    // (`transitionsRecentes`) : UNE parmi les trois du matin (celle qui
    // libère le mercredi), jamais deux pour la même personne.
    const lu = preparerGeneration(semaines.m.donnees('2026-12-21'), {
      aujourdhui: '2026-11-09',
    }).probleme.salaries
    const faites = new Map(lu.map((s) => [s.id, s.transitionsRecentes ?? 0]))
    expect(['1', '2', '3'].map((id) => faites.get(id))).toContainEqual(1)
    expect(
      ['1', '2', '3'].filter((id) => (faites.get(id) ?? 0) > 0),
    ).toHaveLength(1)
    for (const n of faites.values()) expect(n).toBeLessThanOrEqual(1)
    // Dite, jamais bloquante, quand ses jours sont dans une semaine
    // calculée.
    expect(
      toutes
        .filter(({ a }) => a.regle === REGLE_TRANSITION)
        .some(({ a }) => moraleQuiBloque(a)),
    ).toBe(false)
    // Ni 4 repos, ni infraction.
    expect(semaines.every((s) => s.stats.infractions === 0)).toBe(true)
    expect(
      toutes.filter(
        ({ a }) =>
          a.regle === 'RYTHME-5-2' && /\d+ jours de repos/.test(a.message),
      ),
    ).toEqual([])
    // Chaque mercredi matin tenu, et aucun déséquilibre, dès la première
    // semaine.
    for (const s of semaines) {
      expect([s.lundi, matin(s, 2)]).toEqual([s.lundi, 2])
      expect(s.desequilibres).toEqual([])
    }
    // Personne sous ses heures.
    for (const s of semaines)
      for (const b of s.bilan)
        expect([s.lundi, b.salarie_id, b.minutes]).toEqual([
          s.lundi,
          b.salarie_id,
          Math.max(b.minutes, b.minutes_contrat),
        ])
  }, 120_000)
})
