import fc from 'fast-check'
import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import { generer } from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import {
  creneau as creneauModele,
  jourDe,
  probleme,
  salarieSolveur,
} from '#/lib/planning/modele.ts'
import type {
  AffectationSolveur,
  Creneau,
  Probleme,
  SalarieSolveur,
  SuivantePersonne,
} from '#/lib/planning/modele.ts'
import { REGLES_PAR_DEFAUT } from '#/lib/planning/reglesEtablissement.ts'
import {
  fautesRythme,
  messageFaute,
  motifsInterdits,
  rythmeStrictDe,
  suiteRythme,
} from '#/lib/planning/rythmeStrict.ts'
import type { EtatRythme } from '#/lib/planning/rythmeStrict.ts'
import { SANS_RYTHME_STRICT } from '#/lib/planning/test/reglesTest.ts'
import { MINUTES_PAR_JOUR } from '#/lib/planning/temps.ts'
import {
  moraleQuiBloque,
  raisonsBlocage,
  violations,
} from '#/lib/planning/verificateur.ts'

/*
 * Rythme 5 jours puis 2 jours, strict (décision de l'utilisateur du
 * 2026-11-09 : « les repos, il faut qu'ils soient absolument sur 2 jours
 * d'affilée, donc c'est normal que pour la semaine de travail ce soit le cas
 * aussi »). Accepté et refusé, pour la définition, le calcul, le
 * vérificateur et l'horizon glissant.
 */

const H = 60
let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

const suite = (texte: string) => [...texte] as EtatRythme[]
const genres = (texte: string) => fautesRythme(suite(texte)).map((f) => f.genre)

describe('la définition (fautesRythme)', () => {
  it('accepté : 5 jours puis 2 repos, d’une semaine à l’autre', () => {
    expect(genres('TTTTTrrTTTTTrrTTTTTrr')).toEqual([])
    expect(genres('rTTTTTrrTTTTTr')).toEqual([])
  })
  it('refusé : un repos seul, le cas du stagiaire (r TT r TTT)', () => {
    // La semaine d'avant finit par un repos : le lundi fait la paire avec
    // le dimanche, mais le jeudi est seul et le bloc du mardi fait 2 jours.
    const f = fautesRythme(suite('rTTTTTr' + 'rTTrTTT'))
    expect(f.map((x) => x.genre)).toEqual(['travail-court', 'repos-seul'])
    expect(
      messageFaute({ ...f[1], debut: f[1].debut - 7, fin: f[1].fin - 7 }, 7),
    ).toBe('rythme 5 et 2 non tenu : repos seul le jeudi')
    expect(
      messageFaute({ ...f[0], debut: f[0].debut - 7, fin: f[0].fin - 7 }, 7),
    ).toBe(
      'rythme 5 et 2 non tenu : 2 jours de travail du mardi au mercredi (5 attendus)',
    )
  })
  it('refusé : un bloc de 3 ou 4 entre deux repos ; accepté contre un jour neutre ou un bord inconnu', () => {
    expect(genres('rrTTTrr')).toEqual(['travail-court'])
    expect(genres('rrTTTTrr')).toEqual(['travail-court'])
    // École, congé, début ou fin de contrat : neutre.
    expect(genres('rrTTTnn')).toEqual([])
    expect(genres('nnTTTTrr')).toEqual([])
    // Semaine voisine inconnue.
    expect(genres('TTTrr')).toEqual([])
    expect(genres('rrTTTuu')).toEqual([])
  })
  it('refusé : 6 jours de travail, même contre un jour neutre', () => {
    expect(genres('rrTTTTTTrr')).toEqual(['travail-long'])
    expect(genres('nTTTTTTn')).toEqual(['travail-long'])
  })
  it('refusé : 3 repos entre deux blocs ; accepté contre un jour neutre', () => {
    expect(genres('TTTTTrrrTTTTT')).toEqual(['repos-long'])
    expect(genres('TTTTTrrnTTTTT')).toEqual([])
    expect(genres('TTTTTrnrTTTTT')).toEqual([])
    expect(genres('TTTTTrrrnTTTTT')).toEqual([])
  })
  it('une seule règle : les motifs du calcul disent exactement les fautes', () => {
    const etat = fc.constantFrom<EtatRythme>('T', 'r', 'n', 'u')
    fc.assert(
      fc.property(fc.array(etat, { minLength: 1, maxLength: 21 }), (etats) => {
        const motifs = motifsInterdits(etats.length)
        const trouve = motifs.some((m) => {
          for (let a = 0; a + m.length <= etats.length; a++)
            if (m.every((e, i) => etats[a + i] === e)) return true
          return false
        })
        expect(fautesRythme(etats).length > 0).toBe(trouve)
      }),
      { numRuns: 3000, seed: 20261109 },
    )
  })
  it('qui est concerné : 35 h et plus, réglage à oui, sans deux repos fixes', () => {
    const x = {
      contratIndicatif: false,
      placementManuel: false,
      minutesHebdoContrat: 35 * H,
      reposFixes: new Set<number>(),
    }
    expect(rythmeStrictDe(x)).toBe(true)
    expect(rythmeStrictDe({ ...x, minutesHebdoContrat: 30 * H })).toBe(false)
    expect(rythmeStrictDe({ ...x, contratIndicatif: true })).toBe(false)
    expect(rythmeStrictDe({ ...x, reposFixes: new Set([5, 6]) })).toBe(false)
    expect(rythmeStrictDe(x, SANS_RYTHME_STRICT)).toBe(false)
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
  const r = generer(p, highs)
  return { p, r }
}
const tenus = (r: { affectations: AffectationSolveur[] }) =>
  r.affectations.map((a) => Number(a.creneauId.slice(1))).sort((a, b) => a - b)

/** La suite des jours que le vérificateur lit, pour la personne seule. */
const lue = (p: Probleme, affs: AffectationSolveur[]) => {
  const jours = new Set(
    affs.map((a) => jourDe(p.creneaux.find((c) => c.id === a.creneauId)!)),
  )
  return fautesRythme(
    suiteRythme(p.salaries[0], p.nbJours, (d) => jours.has(d)),
  )
}

const SEMAINE = [0, 1, 2, 3, 4, 5, 6]

describe('le calcul', () => {
  it('le stagiaire : après un dimanche de repos, le lundi aussi, puis 5 jours', () => {
    const s = personne({ etatsAvant: 'rTTTTTr', joursSemainePrecedente: 5 })
    const { p, r } = resoudre(s, SEMAINE)
    expect(tenus(r)).toEqual([1, 2, 3, 4, 5])
    expect(lue(p, r.affectations)).toEqual([])
    expect(
      violations(p, r.affectations).filter((v) => v.regle === 'RYTHME-5-2'),
    ).toEqual([])
  })
  it('refusé : la semaine r TT r TTT du stagiaire est dite, et elle bloque', () => {
    const s = personne({ etatsAvant: 'rTTTTTr', joursSemainePrecedente: 5 })
    const p = probleme({ salaries: [s], creneaux: SEMAINE.map((j) => cr(j)) })
    const affs = [1, 2, 4, 5, 6].map((j) => ({
      salarieId: 'a',
      creneauId: `j${j}`,
    }))
    const dits = violations(p, affs).filter((v) => v.regle === 'RYTHME-5-2')
    expect(dits.map((v) => v.message)).toEqual([
      'rythme 5 et 2 non tenu : 2 jours de travail du mardi au mercredi (5 attendus)',
    ])
    expect(dits.every(moraleQuiBloque)).toBe(true)
    // Le repos seul (2026-11-09) : permis en urgence seulement ; pour une
    // place, il bloque.
    const seul = violations(p, affs).filter(
      (v) => v.regle === 'RYTHME-REPOS-SEUL',
    )
    expect(seul.map((v) => v.message)).toEqual([
      'repos seul (manque de personnel) le jeudi',
    ])
    expect(seul.every(moraleQuiBloque)).toBe(true)
    expect(dits.every((v) => v.nature === 'organisation')).toBe(true)
  })
  it('refusé : un bloc de 3 entre deux repos, la place reste vide et le dit', () => {
    // Lundi au mercredi seulement, après deux repos : rien.
    const s = personne({ etatsAvant: 'TTTTTrr', joursSemainePrecedente: 5 })
    const { p, r } = resoudre(s, [0, 1, 2])
    expect(tenus(r)).toEqual([])
    const raisons = raisonsBlocage(p, r.affectations, 'j0').get('a')!
    expect(raisons.map((v) => v.regle)).toContain('RYTHME-5-2')
    // Le même sans le réglage : il vient (le jour seul et les jours
    // d'affilée ne l'empêchent pas).
    const sans = resoudre(s, [0, 1, 2], { regles: SANS_RYTHME_STRICT })
    expect(tenus(sans.r)).toEqual([0, 1, 2])
  })
  it('accepté : un bloc de 3 contre un début ou une fin de contrat', () => {
    const avant = { etatsAvant: 'TTTTTrr', joursSemainePrecedente: 5 }
    // Fin de contrat le mercredi soir.
    const fin = personne({
      ...avant,
      horsContrat: new Set([3, 4, 5, 6]),
      joursNeutres: new Set([3, 4, 5, 6]),
    })
    expect(tenus(resoudre(fin, [0, 1, 2]).r)).toEqual([0, 1, 2])
    // Arrivée le vendredi : 3 jours, semaine d'après inconnue.
    const debut = personne({
      horsContrat: new Set([0, 1, 2, 3]),
      joursNeutres: new Set([0, 1, 2, 3]),
    })
    expect(tenus(resoudre(debut, [4, 5, 6]).r)).toEqual([4, 5, 6])
  })
  it('refusé : 3 repos entre deux blocs quand la reprise est possible ; imposés par les faits : dits ; accepté si le 3e est un congé (du travail)', () => {
    // La semaine d'avant finit par 5 jours : lundi et mardi en repos. Rien
    // le mercredi : jeudi reprendrait après 3 repos (décision de
    // l'utilisateur du 2026-11-09 : « jamais plus de deux jours de repos à
    // la suite »).
    const avant = { etatsAvant: 'rrTTTTT', joursSemainePrecedente: 5 }
    // Un créneau le mercredi : la reprise se fait le mercredi.
    const { p: p3, r: r3 } = resoudre(personne(avant), [2, 3, 4, 5, 6])
    expect(tenus(r3)).toEqual([2, 3, 4, 5, 6])
    expect(lue(p3, r3.affectations)).toEqual([])
    // Aucun créneau du lundi au mercredi : 3 repos imposés par les faits
    // (`fauteScellee`), la personne reprend le jeudi, et c'est dit.
    const { p: p4, r: r4 } = resoudre(personne(avant), [3, 4, 5, 6])
    expect(tenus(r4)).toEqual([3, 4, 5, 6])
    expect(
      violations(p4, r4.affectations)
        .filter((v) => v.regle === 'RYTHME-5-2')
        .map((v) => v.message),
    ).toEqual([
      'rythme 5 et 2 non tenu : 3 jours de repos du lundi au mercredi entre deux blocs de travail (2 attendus)',
    ])
    // Un jour de congé le mercredi compte comme du travail : mercredi et
    // jeudi au dimanche font le bloc de 5 après les 2 repos.
    const conge = personne({
      ...avant,
      indisponibilites: new Set([2]),
      joursNeutres: new Set(),
      joursTravailRythme: new Set([2]),
    })
    expect(tenus(resoudre(conge, [3, 4, 5, 6]).r)).toEqual([3, 4, 5, 6])
  })
  it('jamais sur un jour posé : un shift posé seul reste, sans modèle impossible', () => {
    const s = personne({ etatsAvant: 'TTTTTrr', joursSemainePrecedente: 5 })
    const p = probleme({
      salaries: [s],
      creneaux: SEMAINE.map((j) => cr(j)),
      imposees: new Set(['a|j2']),
      graine: 1,
    })
    const r = generer(p, highs)
    expect(r.statut).not.toBe('inconnu')
    expect(tenus(r)).toContain(2)
    // Le lundi posé seul fait déjà une faute (r T r) : le mardi n'en fait
    // pas une de plus (r TT r), il vient.
    const q = probleme({
      salaries: [s],
      creneaux: [cr(0), cr(1)],
      imposees: new Set(['a|j0']),
      graine: 1,
    })
    expect(tenus(generer(q, highs))).toEqual([0, 1])
  })
  it('un jour posé compte comme du travail : après une semaine d’école, un lundi validé ouvre le bloc de 5 (2026-11-09)', () => {
    // Le cas de l'apprentie : EEEEE RR, puis le lundi validé. Avant, tout
    // motif qui contenait le lundi posé était sauté : « TTT rr TT » ne
    // coûtait rien, et les places du week-end le faisaient choisir (puis
    // 4 repos la semaine d'après, avant la semaine d'école suivante).
    const s = personne({ etatsAvant: 'TTTTTrr', joursSemainePrecedente: 5 })
    const creneaux = SEMAINE.map((j) =>
      cr(j, j === 3 || j === 4 ? { souhaite: true } : {}),
    )
    const p = probleme({
      salaries: [s],
      creneaux,
      imposees: new Set(['a|j0']),
      graine: 1,
    })
    const r = generer(p, highs)
    expect(tenus(r)).toEqual([0, 1, 2, 3, 4])
    expect(lue(p, r.affectations)).toEqual([])
    // Accepté aussi : sans le lundi posé, le même choix.
    const libre = probleme({ salaries: [s], creneaux, graine: 1 })
    expect(tenus(generer(libre, highs))).toEqual([0, 1, 2, 3, 4])
  })
  it('toujours possible : une semaine d’avant qui impose l’impossible coûte, ne bloque pas', () => {
    // 2 jours à la fin de la semaine d'avant : le bloc doit aller au mardi,
    // mais rien n'est possible le mardi. Le modèle reste possible.
    const s = personne({ etatsAvant: 'rrrrrTT', joursSemainePrecedente: 2 })
    const { r } = resoudre(s, [0, 2, 3, 4, 5, 6])
    expect(r.statut).not.toBe('inconnu')
  })
  it('réglage à non : le calcul d’avant', () => {
    const s = personne({ etatsAvant: 'TTTTTrr', joursSemainePrecedente: 5 })
    const R = {
      ...REGLES_PAR_DEFAUT,
      repos: { ...REGLES_PAR_DEFAUT.repos, rythmeStrict: false },
    }
    const avec = resoudre(s, [0, 1, 2, 4, 5], { regles: R })
    const sans = resoudre(s, [0, 1, 2, 4, 5], { regles: SANS_RYTHME_STRICT })
    expect(tenus(avec.r)).toEqual(tenus(sans.r))
    expect(
      violations(avec.p, avec.r.affectations).some(
        (v) => v.regle === 'RYTHME-5-2',
      ),
    ).toBe(false)
  })
})

// ------------------------------------------------------ horizon glissant

const esquisse = (kw: Partial<SuivantePersonne> = {}): SuivantePersonne => ({
  fixes: new Map(),
  horsSite: new Set(),
  postesGardes: new Map(),
  nonLibres: new Set(),
  nonLibresIci: new Set(),
  attendus: 0,
  weekendLibreAvant: null,
  ...kw,
})

describe('horizon glissant', () => {
  it('la semaine suivante esquissée suit la même règle : la semaine écrite ne l’enferme pas', () => {
    // Le lundi d'après est un shift gardé, le mardi d'après impossible : ce
    // lundi ne peut finir qu'un bloc de 5 commencé le jeudi.
    const s = personne()
    const suivante = {
      personnes: new Map([
        [
          'a',
          esquisse({
            fixes: new Map<number, 0 | 1>([
              [0, 1],
              [1, 0],
              [2, 0],
              [3, 0],
              [4, 0],
              [5, 0],
              [6, 0],
            ]),
          }),
        ],
      ]),
      groupes: [],
    }
    const avec = resoudre(s, SEMAINE, { suivante })
    const jours = tenus(avec.r)
    expect(jours.filter((j) => j >= 3)).toEqual([3, 4, 5, 6])
    expect(jours).not.toContain(2)
  })
})
