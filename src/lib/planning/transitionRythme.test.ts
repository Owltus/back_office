import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  construire,
  generer,
  PLACE_EN_MINUTES,
  POIDS_BLOC,
  POIDS_FAUTE_DURE,
  POIDS_FAUTE_FORTE,
  POIDS_MINUTE_DUE,
  POIDS_PASSATION,
  POIDS_PLACE,
  POIDS_REPOS_SEUL,
  POIDS_SEMAINE_SUIVANTE,
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
 * ORDRE DE DÉCISION du 2026-11-10 (principe de l'utilisateur : « un moteur
 * de logique… sans comportement étrange émergent… pas du cas par cas »).
 * Accepté et refusé, pour DÉPLACER DES REPOS (repos seul, bloc de 4), les
 * 3 repos, les prix de l'ordre, l'ÉQUILIBRE entre les moments, et le cas du
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
    expect(g('rTTTTr')).toBe('bloc')
    expect(g('TrT')).toBe('reposSeul')
    // Un bloc de 1 à 3 jours n'est pas un outil : au-dessus des heures.
    expect(g('rTTTr')).toBe('fort')
    expect(g('rTr')).toBe('fort')
    // Chaque motif a son genre, et la même règle que `fautesRythme`.
    for (const m of motifsInterdits(21)) {
      const f = fautesRythme(m)
      if (genreMotif(m) === 'six') continue
      expect(f).toHaveLength(1)
      expect(estTransition(f[0])).toBe(genreMotif(m) === 'bloc')
      expect(estReposTropLong(f[0])).toBe(genreMotif(m) === 'dur')
      expect(estReposSeul(f[0])).toBe(genreMotif(m) === 'reposSeul')
    }
  })
  it('les transitions déjà faites, comptées sur le passé connu', () => {
    expect(transitionsDans(suite('TTTTTrrTTTTTrrTTTTTrrTTTTTrr'))).toBe(0)
    expect(transitionsDans(suite('TTTTTrrTTTTrrTTTTTrrTTTTTrr'))).toBe(1)
    // Un bord inconnu : rien n'est compté.
    expect(transitionsDans(suite('uuuuuuuuuuuuuuuuuuuuuuurrr'))).toBe(0)
  })
})

describe('les niveaux de l’ordre', () => {
  it('chaque faute à son niveau, dans l’ordre de décision', () => {
    // Une personne au rythme 5 et 2, une place chaque jour, deux paliers
    // (le lundi d'un poste non indispensable) et deux moments du lundi.
    const a = personne({
      postes: new Set(['r', 'z']),
      etatsAvant: 'rTTTTTr',
      joursSemainePrecedente: 5,
    })
    const { modele, sousContrat } = construire(
      probleme({
        salaries: [a],
        creneaux: [
          ...[0, 1, 2, 3, 4, 5, 6].map((j) => cr(j, { presence: ['matin'] })),
          cr(0, { id: 'z0', poste: 'z', presence: ['soir'] }),
        ],
        consignes: [
          { jour: 0, periode: 'matin', minimum: 1, maximum: 1 },
          { jour: 0, periode: 'soir', minimum: 1, maximum: 1 },
        ],
        graine: 1,
      }),
    )
    const noms = modele.niveaux().map(([nom]) => nom)
    // Toujours dans cet ordre ; le confort, toujours le dernier.
    const ordre = ['rythme', 'essentiel', 'deplacements', 'equilibre']
    expect(noms.filter((n) => ordre.includes(n))).toEqual(
      ordre.filter((n) => noms.includes(n)),
    )
    expect(noms.at(-1)).toBe('confort')
    expect(noms).toContain('rythme')
    expect(noms).toContain('deplacements')
    // Les heures dues : au niveau essentiel.
    const essentiel = modele.niveaux().find(([n]) => n === 'essentiel')![1]
    expect(essentiel.get(sousContrat[0][1])).toBe(POIDS_MINUTE_DUE)
  })
  it('les poids dans un niveau', () => {
    // Rythme : 3 repos valent plus que deux blocs courts.
    expect(POIDS_FAUTE_DURE).toBeGreaterThan(2 * POIDS_FAUTE_FORTE)
    // Essentiel : une heure due passe devant une place, une demi-heure non ;
    // une passation est une place un peu plus chère.
    expect(60 * POIDS_MINUTE_DUE).toBeGreaterThan(POIDS_PLACE)
    expect(30 * POIDS_MINUTE_DUE).toBeLessThan(POIDS_PLACE)
    expect(POIDS_PLACE).toBe(PLACE_EN_MINUTES * POIDS_MINUTE_DUE)
    expect(POIDS_PASSATION).toBeGreaterThan(POIDS_PLACE)
    // Déplacements : le repos seul un peu plus cher que le bloc de 4, mais
    // moins que deux blocs.
    expect(POIDS_REPOS_SEUL).toBeGreaterThan(POIDS_BLOC)
    expect(2 * POIDS_BLOC).toBeGreaterThan(POIDS_REPOS_SEUL)
    // La semaine suivante : sous une place de cette semaine.
    expect(POIDS_SEMAINE_SUIVANTE).toBeLessThan(POIDS_PLACE)
    // Tous entiers : la borne d'un niveau est exacte (`borneNiveau`).
    for (const w of [
      POIDS_FAUTE_DURE,
      POIDS_FAUTE_FORTE,
      POIDS_MINUTE_DUE,
      POIDS_PLACE,
      POIDS_PASSATION,
      POIDS_REPOS_SEUL,
      POIDS_BLOC,
      POIDS_SEMAINE_SUIVANTE,
    ])
      expect(Number.isInteger(w)).toBe(true)
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
  it('aucun plafond : un repos seul pour les heures, dit sans bloquer', () => {
    // Un seul repos le dimanche d'avant, le CFA la semaine d'après : 5
    // jours, et un repos seul le dimanche avant le CFA (aucune heure
    // perdue), quel que soit le passé : plus de fenêtre de 4 semaines.
    const s = personne({
      etatsAvant: 'rTTTTTr',
      joursSemainePrecedente: 5,
      etatsApres: 'TTTTTrr',
    })
    const { p, r } = resoudre(s, [0, 1, 2, 3, 4, 5, 6])
    expect(tenus(r)).toEqual([1, 2, 3, 4, 5])
    const dits = violations(p, r.affectations).filter(
      (v) => v.regle === 'RYTHME-REPOS-SEUL',
    )
    expect(dits.map((v) => v.message)).toEqual([
      'changement de jours de repos : repos seul le dimanche',
    ])
    expect(dits.some(moraleQuiBloque)).toBe(false)
  })
  it('un bloc de 4 qui ne perd aucune heure de la semaine passe devant un repos seul', () => {
    // Repos vendredi-samedi d'avant, dimanche travaillé ; aucune place le
    // jeudi. Les repos avancent d'un jour (jeudi-vendredi) : un bloc de 4
    // du dimanche au mercredi, 5 jours dans la semaine.
    const s = personne({
      etatsAvant: 'TTTTrrT',
      joursSemainePrecedente: 5,
      serieAvant: 1,
      journeesCalcul: new Set([7 * H]),
    })
    const { p, r } = resoudre(s, [0, 1, 2, 4, 5, 6])
    expect(tenus(r)).toEqual([0, 1, 2, 5, 6])
    const regles = violations(p, r.affectations).map((v) => v.regle)
    expect(regles).toContain(REGLE_TRANSITION)
    expect(regles).not.toContain('RYTHME-REPOS-SEUL')
  })
  it('refusé : la transition qui ne sert à rien (aucune place de plus)', () => {
    // Repos du mardi et du mercredi (semaine d'avant : lundi travaillé, puis
    // jeudi au dimanche) ; une place chaque jour. Un repos seul le mardi
    // tient une place de plus (une place passe avant un déplacement de
    // repos, 2026-11-11) ; un bloc de 4 n'en tiendrait aucune : jamais.
    const s = personne({
      etatsAvant: 'TrrTTTT',
      joursSemainePrecedente: 5,
      serieAvant: 4,
    })
    const { p, r } = resoudre(s, [0, 1, 2, 3, 4, 5, 6])
    expect(tenus(r)).toEqual([0, 2, 3, 4, 5, 6])
    const regles = violations(p, r.affectations).map((v) => v.regle)
    expect(regles).not.toContain(REGLE_TRANSITION)
    expect(regles.filter((x) => x === 'RYTHME-REPOS-SEUL')).toHaveLength(1)
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

// ------------------------------- relecture adverse du 2026-11-10 (fictif)

describe('relecture adverse : des comportements qui ne doivent plus revenir', () => {
  const sept = [0, 1, 2, 3, 4, 5, 6]
  const semaineDe = (r: { affectations: AffectationSolveur[] }, id = 'a') => {
    const d = Array(7).fill('r')
    for (const a of r.affectations)
      if (a.salarieId === id) d[Number(a.creneauId.slice(1))] = 'T'
    return d.join('')
  }
  it('une suite de repos ouverte sur la semaine inconnue coûte comme 3 repos : jamais une semaine vide', () => {
    // Lundi et mardi tenus par une autre ; la semaine d'après inconnue.
    // Avant : rrrrrrr (35 h perdues, 5 places vides), la suite de repos
    // ne se fermait pas dans l'horizon et ne coûtait rien.
    for (const etatsApres of [null, 'uuuuuuu']) {
      const a = personne({
        etatsAvant: 'TTTTTrr',
        joursSemainePrecedente: 5,
        journeesCalcul: new Set([7 * H]),
        etatsApres,
      })
      const b = personne({ id: 'b', minutesHebdoContrat: 14 * H })
      const p = probleme({
        salaries: [a, b],
        creneaux: sept.map((j) => cr(j)),
        imposees: new Set(['b|j0', 'b|j1']),
        graine: 1,
      })
      expect(semaineDe(generer(p, highs))).toBe('rrTTTTT')
    }
  })
  it('jamais un repos seul pour des places d’un palier plus bas, ni pour une place qu’il ne peut pas tenir', () => {
    // Le lundi d'un poste non indispensable compte dans deux minimums ; une
    // place indispensable d'une heure, ailleurs, que personne ne tient.
    const z = (j: number, kw: Partial<Creneau> = {}) =>
      cr(j, { id: `z${j}`, poste: 'z', indispensable: false, ...kw })
    const a = personne({
      postes: new Set(['r', 'z']),
      etatsAvant: 'rTTTTTr',
      joursSemainePrecedente: 5,
      journeesCalcul: new Set([7 * H]),
    })
    const p = probleme({
      salaries: [a],
      creneaux: [
        ...[1, 2, 3, 4].map((j) => cr(j, { indispensable: true })),
        z(0, { presence: ['matin', 'soir'] }),
        z(5),
        cr(3, {
          id: 'q3',
          poste: 'q',
          debut: 3 * MINUTES_PAR_JOUR + 20 * H,
          fin: 3 * MINUTES_PAR_JOUR + 21 * H,
          indispensable: true,
        }),
      ],
      consignes: [
        { jour: 0, periode: 'matin', minimum: 1, maximum: 1 },
        { jour: 0, periode: 'soir', minimum: 1, maximum: 1 },
      ],
      graine: 1,
    })
    const r = generer(p, highs)
    expect(r.affectations.map((x) => x.creneauId)).not.toContain('z0')
    expect(violations(p, r.affectations).map((v) => v.regle)).not.toContain(
      'RYTHME-REPOS-SEUL',
    )
  })
  it('à prix égal, deux blocs de 4 plutôt qu’un bloc de 3, quelle que soit la graine', () => {
    for (const graine of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const a = personne({
        etatsAvant: 'TTTTTrr',
        joursSemainePrecedente: 5,
        etatsApres: 'TTTrrTT',
        journeesCalcul: new Set([7 * H]),
      })
      const p = probleme({
        salaries: [a],
        creneaux: sept.map((j) => cr(j)),
        graine,
      })
      expect([graine, semaineDe(generer(p, highs))]).toEqual([
        graine,
        'TTTTrrT',
      ])
    }
  })
})

describe('repos mercredi-jeudi, CFA le lundi 14 (fictif)', () => {
  it('toutes les heures avant le CFA : jamais 3 repos, le moins de repos seuls possible', () => {
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
    // Au plus deux repos seuls (la suite « mercredi-jeudi » jusqu'au
    // samedi-dimanche d'avant le CFA en demande deux pour ne rien perdre,
    // vérifié à la main sur toutes les suites possibles).
    expect(
      new Set(
        alertes
          .filter(({ a }) => a.regle === 'RYTHME-REPOS-SEUL')
          .map(({ s, a }) => `${s.lundi}|${a.message}`),
      ).size,
    ).toBeLessThanOrEqual(2)
    // Aucune heure perdue.
    for (const s of semaines.slice(0, 2))
      expect([s.lundi, s.bilan[0].minutes]).toEqual([
        s.lundi,
        s.bilan[0].minutes_contrat,
      ])
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
   * glissant), les 4 semaines d'avant lues. */
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
    // Les repos déplacés (bloc de 4 ou repos seul) : UN seul dans l'équipe
    // (celui qui libère le mercredi, le moins cher : un bloc de 4 qui ne
    // perd aucune heure), jamais deux pour la même personne : aucun
    // aller-retour.
    const deplaces = new Map<number, Set<string>>()
    for (const { s, b, a } of toutes)
      if (a.regle === REGLE_TRANSITION || a.regle === 'RYTHME-REPOS-SEUL')
        deplaces.set(
          b.salarie_id,
          (deplaces.get(b.salarie_id) ?? new Set()).add(
            `${s.lundi}|${a.message}`,
          ),
        )
    expect(deplaces.size).toBe(1)
    for (const v of deplaces.values()) expect(v.size).toBeLessThanOrEqual(1)
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
