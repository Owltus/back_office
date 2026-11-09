import fc from 'fast-check'
import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  generer,
  PLACES_PAR_TRANSITION,
  prixFauteRythme,
  prixOrdre,
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
  estReposTropLong,
  estTransition,
  fautesRythme,
  genreMotif,
  motifsInterdits,
  transitionsDans,
} from '#/lib/planning/rythmeStrict.ts'
import type { EtatRythme } from '#/lib/planning/rythmeStrict.ts'
import { preparerGeneration } from '#/lib/planning/semaine.ts'
import type { SemaineOut } from '#/lib/planning/semaine.ts'
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
  it('transition : 3 repos entre deux blocs, ou un bloc de 4 jours entre deux repos', () => {
    const t = (texte: string) =>
      fautesRythme(suite(texte)).map((f) => estTransition(f))
    expect(t('TTTTTrrrTTTTT')).toEqual([true])
    expect(t('rrTTTTrr')).toEqual([true])
    // Refusé : un repos seul, un bloc de 3, 4 repos.
    expect(t('TTTTTrTTTT')).toEqual([false])
    expect(t('rrTTTrr')).toEqual([false])
    expect(t('TTTTTrrrrTTTTT')).toEqual([false])
  })
  it('4 repos ou plus : trop long ; 3 non', () => {
    const long = (texte: string) =>
      fautesRythme(suite(texte)).map((f) => estReposTropLong(f))
    expect(long('TrrrrT')).toEqual([true])
    expect(long('TrrrrrT')).toEqual([true])
    expect(long('TrrrT')).toEqual([false])
    // Contre un jour neutre : aucune faute du tout.
    expect(long('TrrrrnT')).toEqual([])
  })
  it('le genre de chaque motif interdit du calcul', () => {
    const g = (texte: string) => genreMotif([...texte] as Array<'T' | 'r'>)
    expect(g('TTTTTT')).toBe('six')
    expect(g('TrrrrT')).toBe('dur')
    expect(g('TrrrrrrT')).toBe('dur')
    expect(g('TrrrT')).toBe('transition')
    expect(g('rTTTTr')).toBe('transition')
    expect(g('TrT')).toBe('fort')
    expect(g('rTTTr')).toBe('fort')
    expect(g('rTr')).toBe('fort')
    // Chaque motif a son genre, et la même règle que `fautesRythme`.
    for (const m of motifsInterdits(21)) {
      const f = fautesRythme(m)
      if (genreMotif(m) === 'six') continue
      expect(f).toHaveLength(1)
      expect(estTransition(f[0])).toBe(genreMotif(m) === 'transition')
      expect(estReposTropLong(f[0])).toBe(genreMotif(m) === 'dur')
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
  it('place < transition < deux places < une heure due < une faute < 4 repos', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -5e7, max: 5e7 }), { minLength: 1 }),
        fc.integer({ min: 0, max: 48 * H }),
        (couts, minutes) => {
          const p = prixOrdre(couts, minutes)
          const place = Math.max(1, ...couts.map(Math.abs))
          expect(p.place).toBe(place)
          expect(p.transition).toBeGreaterThan(place)
          expect(p.transition).toBeLessThan(2 * place + 1)
          // Une heure due vaut plus qu'une transition et une place.
          expect(60 * p.minuteDue).toBeGreaterThan(p.transition + place)
          // Une faute vaut plus que la semaine du plus gros contrat.
          expect(p.fort).toBeGreaterThan(p.minuteDue * minutes)
          expect(p.fort).toBeGreaterThanOrEqual(prixFauteRythme([place]))
          expect(p.dur).toBeGreaterThan(p.fort)
        },
      ),
    )
    expect(PLACES_PAR_TRANSITION).toBeGreaterThan(1)
    expect(PLACES_PAR_TRANSITION).toBeLessThan(2)
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
  it('accepté : une transition (3 repos) quand elle donne les places et les heures', () => {
    // La semaine d'avant finit par 5 jours : lundi et mardi en repos ;
    // rien le mercredi, donc 3 repos avant de reprendre le jeudi.
    const s = personne({ etatsAvant: 'rrTTTTT', joursSemainePrecedente: 5 })
    const { p, r } = resoudre(s, [3, 4, 5, 6])
    expect(tenus(r)).toEqual([3, 4, 5, 6])
    const dits = violations(p, r.affectations).filter(
      (v) => v.regle === REGLE_TRANSITION,
    )
    expect(dits.map((v) => v.message)).toEqual([
      'changement de jours de repos : 3 jours de repos du lundi au mercredi',
    ])
    // Dite, jamais bloquante.
    expect(dits.some(moraleQuiBloque)).toBe(false)
    expect(
      violations(p, r.affectations).some((v) => v.regle === 'RYTHME-5-2'),
    ).toBe(false)
  })
  it('refusé : une seconde transition sur 4 semaines', () => {
    const s = personne({
      etatsAvant: 'rrTTTTT',
      joursSemainePrecedente: 5,
      transitionsRecentes: 1,
    })
    expect(tenus(resoudre(s, [3, 4, 5, 6]).r)).toEqual([])
  })
  it('refusé : jamais 4 repos entre deux blocs, même pour les heures dues', () => {
    // 2 repos à la fin de la semaine d'avant, possible du vendredi au
    // dimanche seulement : 6 repos avant de reprendre. Rien.
    const s = personne({ etatsAvant: 'TTTTTrr', joursSemainePrecedente: 5 })
    expect(tenus(resoudre(s, [4, 5, 6]).r)).toEqual([])
    // Accepté : 2 repos, puis 5 jours.
    expect(tenus(resoudre(s, [0, 1, 2, 3, 4]).r)).toEqual([0, 1, 2, 3, 4])
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
  it('les heures dues avant les places : 4 jours de travail plutôt que 3 repos', () => {
    // 39 h (4 × 8 h + 7 h) : la transition qui garde 5 jours dans la
    // semaine passe devant celle qui en retire un.
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
