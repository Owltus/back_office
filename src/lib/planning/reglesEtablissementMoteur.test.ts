import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  contratEtoile,
  estVersionEtoile,
  versionsEtoile,
} from '#/lib/planning/etoile.ts'
import { generer, zonesPassation } from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import { creneau, probleme, salarieSolveur } from '#/lib/planning/modele.ts'
import type {
  ConsigneSolveur,
  Creneau,
  Probleme,
  SalarieSolveur,
} from '#/lib/planning/modele.ts'
import { momentPropose } from '#/lib/planning/moment.ts'
import { lusAvec } from '#/lib/planning/test/momentsTest.ts'
import {
  droitAuRattrapage,
  journeesDuCalcul,
  rythmeHumain,
  versSolveur,
} from '#/lib/planning/regles.ts'
import type { Fiche } from '#/lib/planning/regles.ts'
import { REGLES_PAR_DEFAUT } from '#/lib/planning/reglesEtablissement.ts'
import type { RegleEtablissement } from '#/lib/planning/reglesEtablissement.ts'
import { MINUTES_PAR_JOUR } from '#/lib/planning/temps.ts'
import {
  equipesDesynchro,
  JOUR_ISOLE_A_EVITER,
  JOUR_ISOLE_INTERDIT,
  moraleQuiBloque,
  transmissions,
  violations,
} from '#/lib/planning/verificateur.ts'
import { SANS_RYTHME_STRICT } from '#/lib/planning/test/reglesTest.ts'

/*
 * Étape 4 du plan `planning-moteur-configurable-2026-11-05` : le moteur lit
 * les règles de l'établissement (`Probleme.regles`). Pour chaque règle
 * réglable, un cas ACCEPTÉ et un cas REFUSÉ selon le réglage, et une règle
 * désactivée disparaît des DEUX côtés : le calcul ne la paie plus, le
 * vérificateur ne la dit plus. Données fictives.
 */

const H = 60
const J = MINUTES_PAR_JOUR
let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

type Patch = {
  [K in keyof RegleEtablissement]?: Partial<RegleEtablissement[K]>
}
/** Les défauts, une partie changée. */
/** La zone de l'hôtel, NON tenue en continu : sans la passation fixe entre
 * les équipes (continuité, nuit, relève, équipe du soir ; 2026-11-06). */
const SANS_CONTINU: RegleEtablissement = {
  ...REGLES_PAR_DEFAUT,
  zones: [{ id: '1', nom: 'Accueil', continue: false }],
}

// Chaque règle seule : sans le rythme 5 et 2 strict (2026-11-09), qui a ses
// propres essais (`rythmeStrict.test.ts`), sauf à le régler dans le patch.
const regles = (patch: Patch): RegleEtablissement => {
  const base = SANS_RYTHME_STRICT
  const r = { ...base } as Record<string, unknown>
  for (const [k, v] of Object.entries(patch))
    r[k] = {
      ...(base as unknown as Record<string, object>)[k],
      ...v,
    }
  return r as unknown as RegleEtablissement
}

const cr = (
  id: string,
  jour: number,
  debutH: number,
  finH: number,
  kw: Partial<Creneau> = {},
): Creneau =>
  creneau({
    id,
    poste: 'r',
    debut: jour * J + debutH * H,
    fin: jour * J + finH * H,
    effectif: 1,
    jourPlanning: jour,
    ...kw,
  })
const personne = (
  contratH: number,
  kw: Partial<SalarieSolveur> = {},
): SalarieSolveur =>
  salarieSolveur({
    id: 'a',
    postes: new Set(['r']),
    minutesHebdoContrat: contratH * H,
    minutesHebdoMax: 48 * H,
    minutesJourMax: 12 * H,
    joursTravaillesMaxSemaine: 6,
    joursPreferesSemaine: 5,
    reposQuotidienMin: 11 * H,
    ...kw,
  })
const tenus = (r: ReturnType<typeof generer>) =>
  r.affectations.map((a) => a.creneauId).sort()
const tout = (cs: Creneau[]) =>
  cs.map((c) => ({ salarieId: 'a', creneauId: c.id }))
const alertes = (p: Probleme, cs: Creneau[], regle: string) =>
  violations(p, tout(cs)).filter((v) => v.regle === regle)
// Le dimanche d'avant connu libre.
const dimancheLibre = { joursSemainePrecedente: 5, serieAvant: 0 }

describe('deux repos de suite (repos.deuxReposDeSuite)', () => {
  // 40 h en 5 jours au plus, une place chaque jour, jours habituels qui
  // séparent les repos (lundi et jeudi), samedi et dimanche d'avant
  // travaillés (le lundi ne fait pas la paire, pas de dimanche seul).
  const semaine = [0, 1, 2, 3, 4, 5, 6].map((j) => cr(`j${j}`, j, 9, 17))
  const resoudre = (R: RegleEtablissement) =>
    generer(
      probleme({
        creneaux: semaine,
        salaries: [
          personne(40, {
            joursTravaillesMaxSemaine: 5,
            travailFixe: new Set([1, 2, 4, 5, 6]),
            joursSemainePrecedente: 5,
            serieAvant: 2,
          }),
        ],
        graine: 1,
        regles: R,
      }),
      highs,
    )
  const libres = (r: ReturnType<typeof generer>) =>
    semaine.map((c) => c.id).filter((id) => !tenus(r).includes(id))

  it('obligatoire et souhaitée : les repos se suivent', () => {
    for (const force of ['obligatoire', 'souhaite'] as const) {
      const l = libres(resoudre(regles({ repos: { deuxReposDeSuite: force } })))
      expect(l).toHaveLength(2)
      expect(Number(l[1].slice(1)) - Number(l[0].slice(1))).toBe(1)
    }
  })
  it('aucune règle : les jours habituels passent, repos séparés', () => {
    const l = libres(
      resoudre(regles({ repos: { deuxReposDeSuite: 'aucune' } })),
    )
    expect(l).toEqual(['j0', 'j3'])
  })
  it('vérificateur : bloque si obligatoire, conseil si souhaitée, rien sinon', () => {
    const cs = semaine.filter((c) => !['j1', 'j3'].includes(c.id))
    const dit = (force: RegleEtablissement['repos']['deuxReposDeSuite']) =>
      alertes(
        probleme({
          salaries: [personne(40)],
          creneaux: cs,
          regles: regles({ repos: { deuxReposDeSuite: force } }),
        }),
        cs,
        'REPOS-SEPARES',
      )
    expect(dit('obligatoire').map(moraleQuiBloque)).toEqual([true])
    expect(dit('souhaite').map(moraleQuiBloque)).toEqual([false])
    expect(dit('aucune')).toEqual([])
  })
})

describe('jour isolé (repos.jourIsole) et rythme humain (repos.rythmeContratMin)', () => {
  const jours = (...js: number[]) => js.map((j) => cr(`j${j}`, j, 8, 15))
  const resoudre = (h: number, R: RegleEtablissement) =>
    tenus(
      generer(
        probleme({
          salaries: [personne(h, dimancheLibre)],
          creneaux: jours(0, 2),
          graine: 1,
          regles: R,
        }),
        highs,
      ),
    )
  it('interdit : un 35 h ne vient pas un lundi et un mercredi seuls', () => {
    expect(resoudre(35, REGLES_PAR_DEFAUT)).toEqual([])
  })
  it('à éviter ou aucune règle : il vient', () => {
    expect(resoudre(35, regles({ repos: { jourIsole: 'a_eviter' } }))).toEqual([
      'j0',
      'j2',
    ])
    expect(resoudre(35, regles({ repos: { jourIsole: 'aucune' } }))).toEqual([
      'j0',
      'j2',
    ])
  })
  it('rythme humain dès 30 h : un 32 h ne vient plus seul non plus', () => {
    expect(resoudre(32, REGLES_PAR_DEFAUT)).toEqual(['j0', 'j2'])
    const R = regles({ repos: { rythmeContratMin: 30 * H } })
    expect(resoudre(32, R)).toEqual([])
    const x = { contratIndicatif: false, placementManuel: false }
    expect(rythmeHumain({ ...x, minutesHebdoContrat: 32 * H }, R)).toBe(true)
    expect(rythmeHumain({ ...x, minutesHebdoContrat: 32 * H })).toBe(false)
  })
  it('vérificateur : interdit, à éviter, ou rien', () => {
    const cs = jours(0, 2, 3, 4)
    const message = (R: RegleEtablissement) =>
      alertes(
        probleme({
          salaries: [personne(35, dimancheLibre)],
          creneaux: cs,
          regles: R,
        }),
        cs,
        'JOUR-ISOLE',
      ).map((v) => v.message)
    expect(message(REGLES_PAR_DEFAUT)).toEqual([JOUR_ISOLE_INTERDIT])
    expect(message(regles({ repos: { jourIsole: 'a_eviter' } }))).toEqual([
      JOUR_ISOLE_A_EVITER,
    ])
    expect(message(regles({ repos: { jourIsole: 'aucune' } }))).toEqual([])
  })
})

describe('jours d’affilée (repos.joursAffilesConseilles, joursAffilesMax)', () => {
  const cinq = [0, 1, 2, 3, 4].map((j) => cr(`j${j}`, j, 8, 15))
  const fiche = personne(35, {
    ...dimancheLibre,
    joursSemaineSuivante: 5,
    serieApres: 0,
  })
  it('5 au plus : le 35 h fait ses 5 jours ; 4 au plus : il en fait 4', () => {
    const n = (R: RegleEtablissement) =>
      generer(
        probleme({ salaries: [fiche], creneaux: cinq, graine: 1, regles: R }),
        highs,
      ).affectations.length
    expect(n(REGLES_PAR_DEFAUT)).toBe(5)
    expect(n(regles({ repos: { joursAffilesConseilles: 4 } }))).toBe(4)
  })
  it('vérificateur : 5 jours d’affilée dits seulement au plafond de 4', () => {
    const dit = (R: RegleEtablissement) =>
      alertes(
        probleme({ salaries: [fiche], creneaux: cinq, regles: R }),
        cinq,
        'JOURS-AFFILES',
      )
    expect(dit(REGLES_PAR_DEFAUT)).toEqual([])
    expect(dit(regles({ repos: { joursAffilesConseilles: 4 } }))).toHaveLength(
      1,
    )
  })
})

describe('règles morales lues dans les règles (vérificateur)', () => {
  const dit = (cs: Creneau[], regle: string, R: RegleEtablissement, kw = {}) =>
    alertes(
      probleme({ salaries: [personne(35, kw)], creneaux: cs, regles: R }),
      cs,
      regle,
    )
  it('repos conseillé (repos.reposConfort) : 11 h 30 entre deux services', () => {
    const cs = [cr('s', 0, 14, 22.5), cr('m', 1, 10, 17)]
    expect(dit(cs, 'REPOS-COURT', REGLES_PAR_DEFAUT)).toHaveLength(1)
    expect(
      dit(cs, 'REPOS-COURT', regles({ repos: { reposConfort: 11 * H } })),
    ).toEqual([])
  })
  it('changements de moment (repos.changementsMomentMax)', () => {
    const cs = [
      cr('a', 0, 7, 15, { moment: 'matin' }),
      cr('b', 1, 14, 22, { moment: 'soir' }),
      cr('c', 2, 14, 22, { moment: 'soir' }),
      cr('d', 3, 23, 31, { moment: 'nuit' }),
    ]
    const n = (R: RegleEtablissement) =>
      dit(cs, 'MOMENTS', R).filter((v) => v.message.includes('changements'))
    expect(n(REGLES_PAR_DEFAUT)).toHaveLength(1)
    expect(n(regles({ repos: { changementsMomentMax: 2 } }))).toEqual([])
  })
  it('retour en arrière (repos.momentArriereJours) : soir puis matin 2 jours après', () => {
    const cs = [
      cr('a', 0, 14, 22, { moment: 'soir' }),
      cr('b', 2, 7, 15, { moment: 'matin' }),
    ]
    const n = (R: RegleEtablissement) =>
      dit(cs, 'MOMENTS', R).filter((v) => v.message.includes('revient'))
    expect(n(REGLES_PAR_DEFAUT)).toHaveLength(1)
    expect(n(regles({ repos: { momentArriereJours: 1 } }))).toEqual([])
  })
  it('nuits d’affilée (repos.nuitsAffileesMax) et reprise (repos.reposApresNuits)', () => {
    const nuits = [0, 1, 2, 3, 4, 5].map((j) =>
      cr(`n${j}`, j, 23, 31, { moment: 'nuit' }),
    )
    const longues = (R: RegleEtablissement) =>
      dit(nuits, 'NUITS', R).filter((v) => v.message.includes('affilée'))
    expect(longues(REGLES_PAR_DEFAUT)).toHaveLength(1)
    expect(longues(regles({ repos: { nuitsAffileesMax: 6 } }))).toEqual([])
    const reprise = [
      cr('n0', 0, 23, 31, { moment: 'nuit' }),
      cr('j2', 2, 9, 17, { moment: 'matin' }),
    ]
    const n = (R: RegleEtablissement) =>
      dit(reprise, 'NUITS', R).filter((v) => v.message.includes('reprend'))
    expect(n(REGLES_PAR_DEFAUT)).toHaveLength(1)
    expect(n(regles({ repos: { reposApresNuits: 1 } }))).toEqual([])
  })
  it('heures en plus (heures.semainesEnPlusAlerte)', () => {
    const cs = [0, 1, 2, 3, 4].map((j) => cr(`j${j}`, j, 8, 16))
    const kw = {
      equiteAvant: { weekends: 0, soirs: 0, matinsTot: 0, semainesEnPlus: 2 },
    }
    expect(dit(cs, 'HEURES-PLUS', REGLES_PAR_DEFAUT, kw)).toHaveLength(1)
    expect(
      dit(
        cs,
        'HEURES-PLUS',
        regles({ heures: { semainesEnPlusAlerte: 4 } }),
        kw,
      ),
    ).toEqual([])
  })
})

describe('passation avec le veilleur (fixe depuis le 2026-11-06)', () => {
  const cand = (
    id: string,
    poste: string,
    debutH: number,
    finH: number,
    presence: Creneau['presence'],
  ) =>
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
  const sal = (id: string, poste: string) =>
    salarieSolveur({
      id,
      postes: new Set([poste]),
      minutesHebdoContrat: 0,
      minutesHebdoMax: 48 * H,
      minutesJourMax: 12 * H,
      joursTravaillesMaxSemaine: 6,
      reposQuotidienMin: 11 * H,
    })
  const chiffre = (periode: ConsigneSolveur['periode']): ConsigneSolveur => ({
    jour: 0,
    periode,
    minimum: 1,
    maximum: 1,
  })
  // Le soir qui finit à l'arrivée du veilleur est plus long d'une heure.
  const p = (R: RegleEtablissement) =>
    probleme({
      salaries: [sal('a', 'rec'), sal('v', 'veille')],
      creneaux: [
        cand('s2245', 'rec', 14, 22.75, ['soir']),
        cand('s2300', 'rec', 13.25, 23, ['soir']),
        cand('n0', 'veille', 23, 31, ['nuit']),
      ],
      consignes: [chiffre('soir'), chiffre('nuit')],
      nbJours: 1,
      regles: R,
    })
  const soir = (R: RegleEtablissement) =>
    generer(p(R), highs)
      .affectations.map((a) => a.creneauId)
      .find((id) => id.startsWith('s'))
  it('zone tenue en continu : le soir attend le veilleur ; sinon le plus court', () => {
    expect(soir(REGLES_PAR_DEFAUT)).toBe('s2300')
    expect(zonesPassation(p(REGLES_PAR_DEFAUT)).length).toBeGreaterThan(0)
    // Une zone qui n'est pas tenue en continu n'a ni passation ni continuité.
    expect(soir(SANS_CONTINU)).toBe('s2245')
    expect(zonesPassation(p(SANS_CONTINU))).toEqual([])
  })
  it('vérificateur : jugée dans une zone tenue en continu seulement', () => {
    const aff = [
      { salarieId: 'a', creneauId: 's2245' },
      { salarieId: 'v', creneauId: 'n0' },
    ]
    expect(transmissions(p(REGLES_PAR_DEFAUT), aff, [])[0].soirNuit).toBe(
      'manque',
    )
    expect(transmissions(p(SANS_CONTINU), aff, [])).toEqual([])
  })
})

describe('équipe du soir ensemble (fixe : 30 min, 2026-11-06)', () => {
  it('arrivées du soir à 45 min : dites ; à 30 min : non', () => {
    const c = (id: string, d: number, f: number) =>
      creneau({
        id,
        poste: 'rec',
        debut: d * H,
        fin: f * H,
        effectif: 0,
        jourPlanning: 0,
        presence: ['soir'],
        accueil: true,
      })
    const s = (id: string) =>
      salarieSolveur({
        id,
        postes: new Set(['rec']),
        minutesHebdoContrat: 0,
        minutesHebdoMax: 48 * H,
        minutesJourMax: 12 * H,
        joursTravaillesMaxSemaine: 6,
        reposQuotidienMin: 11 * H,
      })
    const aff = [
      { salarieId: 'a', creneauId: 'x' },
      { salarieId: 'b', creneauId: 'y' },
    ]
    const dit = (R: RegleEtablissement, ecartH = 0.75) =>
      equipesDesynchro(
        probleme({
          salaries: [s('a'), s('b')],
          creneaux: [c('x', 14, 22), c('y', 14 + ecartH, 22)],
          nbJours: 1,
          regles: R,
        }),
        aff,
      ).filter((e) => e.arrivees)
    expect(dit(REGLES_PAR_DEFAUT)).toHaveLength(1)
    expect(dit(REGLES_PAR_DEFAUT, 0.5)).toEqual([])
    // Zone non tenue en continu : rien à dire.
    expect(dit(SANS_CONTINU)).toEqual([])
  })
})

describe('limites des moments (moments)', () => {
  it('21:30 est une nuit à 21 h, un soir si la nuit commence à 22 h', () => {
    const h = { debut: '21:30', fin: '23:59', pause: 0 }
    expect(momentPropose(h)).toBe('nuit')
    expect(momentPropose(h, lusAvec({ nuit: { debut_de: 22 * H } }))).toBe(
      'soir',
    )
  })
})

describe('contrats et modèles de contrat', () => {
  const fiche = (kw: Partial<Fiche>): Fiche => ({
    id: 'a',
    postes: new Set(['r']),
    typeContrat: 'cdi',
    minutesHebdo: 35 * H,
    ...kw,
  })
  it('journées imposées : 37 h sans règle, puis 37 h en 7 h 30', () => {
    expect(journeesDuCalcul(fiche({ minutesHebdo: 37 * H }))).toBeNull()
    const R = regles({
      contrats: {
        journees: [
          ...REGLES_PAR_DEFAUT.contrats.journees,
          { minutesHebdo: 37 * H, durees: [7.5 * H], courtesMax: 0 },
        ],
      },
    })
    expect([
      ...(journeesDuCalcul(fiche({ minutesHebdo: 37 * H, regles: R })) ?? []),
    ]).toEqual([7.5 * H])
    // Le 35 h et le 39 h gardent leurs journées.
    expect([...(journeesDuCalcul(fiche({ regles: R })) ?? [])]).toEqual([7 * H])
  })
  it('un extra placé par le calcul si son modèle le dit', () => {
    expect(versSolveur(fiche({ typeContrat: 'extra' })).placementManuel).toBe(
      true,
    )
    const R = regles({
      modeles: {
        extra: { ...REGLES_PAR_DEFAUT.modeles.extra, placementManuel: false },
      },
    })
    expect(
      versSolveur(fiche({ typeContrat: 'extra', regles: R })).placementManuel,
    ).toBe(false)
  })
  it('rattrapage des jours fériés selon le modèle', () => {
    const x = { type_contrat: 'stagiaire' as const, date_entree: '2020-01-01' }
    expect(droitAuRattrapage(x, '2026-11-11')).toBe(false)
    const R = regles({
      modeles: {
        stagiaire: {
          ...REGLES_PAR_DEFAUT.modeles.stagiaire,
          ferieRattrape: true,
          feriesJourMeme: false,
        },
      },
    })
    expect(droitAuRattrapage(x, '2026-11-11', R)).toBe(true)
  })
  it('journée étoile : selon le modèle et la journée pleine', () => {
    const s = {
      heures_hebdo: 39,
      forfait_jours: false,
      type_contrat: 'cdd' as const,
    }
    expect(contratEtoile(s)).toBe(true)
    const R = regles({
      modeles: {
        cdd: { ...REGLES_PAR_DEFAUT.modeles.cdd, journeeEtoile: false },
      },
    })
    expect(contratEtoile(s, R)).toBe(false)
    const huit = { id: 1, debut: '07:00', fin: '15:45', pause: 45 }
    const sept = { id: 2, debut: '07:00', fin: '14:45', pause: 45 }
    expect(estVersionEtoile(sept, huit)).toBe(true)
    // Journée pleine de 9 h : l'horaire de 8 h n'a plus de version étoile.
    const neuf = regles({ contrats: { journeePleine: 9 * H } })
    expect(versionsEtoile(huit, [sept], neuf)).toEqual([])
  })
})

describe('continuité entre équipes (D8, fixe depuis le 2026-11-06)', () => {
  // Matin 07-15 et soir 15:30-23 : une demi-heure sans personne. Seule
  // une personne sans heures dues (0 h) peut la tenir, sur un renfort
  // 11-19 : des heures en plus.
  const creneaux = [
    cr('m', 0, 7, 15, { presence: ['matin'] }),
    cr('s', 0, 15.5, 23, { presence: ['soir'] }),
    cr('r', 0, 11, 19, { effectif: 0, facultatif: 1 }),
  ]
  const salaries = [
    personne(35, { id: 'a' }),
    personne(35, { id: 'b' }),
    personne(0, { id: 'c' }),
  ]
  const resoudre = (R: RegleEtablissement) => {
    const p = probleme({ salaries, creneaux, graine: 1, regles: R })
    return generer(p, highs)
  }
  it('plus de préférence : un poste hors zone la tient aussi, quelle que soit la zone', () => {
    // Ces créneaux sont d'un poste hors zone (ses besoins) : la continuité
    // y est obligatoire, la zone de l'accueil n'y change rien.
    const r = resoudre(SANS_CONTINU)
    expect(r.affectations.some((a) => a.creneauId === 'r')).toBe(true)
    expect(r.trous).toEqual([])
  })
  it('obligatoire : quelqu’un la tient, même en heures en plus, sans vider une place', () => {
    const r = resoudre(REGLES_PAR_DEFAUT)
    expect(r.affectations.some((a) => a.creneauId === 'r')).toBe(true)
    expect(r.manques).toEqual([])
    expect(r.trous).toEqual([])
  })
  it('jamais dur : sans personne pour la tenir, le trou reste (D3)', () => {
    const p = probleme({
      salaries: salaries.slice(0, 2),
      creneaux,
      graine: 1,
      regles: REGLES_PAR_DEFAUT,
    })
    const r = generer(p, highs)
    expect(r.statut).toBe('optimal')
    expect(r.trous).toHaveLength(1)
  })
})

describe('D9 : apprenti ou stagiaire selon son niveau sur le poste', () => {
  // Une seule place, un seul candidat : l’apprenti (ou le stagiaire).
  const fiche = (kw: Partial<Fiche>): Fiche => ({
    id: 'x',
    typeContrat: 'apprenti',
    minutesHebdo: 35 * H,
    postes: new Set<string>(),
    ...kw,
  })
  const seul = (f: Fiche) => {
    const c = [cr('j0', 0, 8, 15, { soutien: 1 })]
    const p = probleme({ salaries: [versSolveur(f)], creneaux: c, graine: 1 })
    return { p, r: generer(p, highs) }
  }
  it('titulaire ou en dépannage : autonome, il tient la place seul', () => {
    for (const f of [
      fiche({ postes: new Set(['r']) }),
      fiche({ postes: new Set(['r']), postesOccasionnels: new Set(['r']) }),
      fiche({ typeContrat: 'stagiaire', postes: new Set(['r']) }),
    ]) {
      const { p, r } = seul(f)
      expect(r.affectations.map((a) => a.creneauId)).toEqual(['j0'])
      expect(
        violations(p, r.affectations).filter((v) => v.regle === 'SOUTIEN-SEUL'),
      ).toEqual([])
    }
  })
  it('en soutien : jamais seul, ni par le calcul ni posé à la main', () => {
    const { p, r } = seul(fiche({ postesSoutien: new Set(['r']) }))
    expect(r.affectations).toEqual([])
    expect(
      violations(p, [{ salarieId: 'x', creneauId: 'j0' }]).map((v) => v.regle),
    ).toContain('SOUTIEN-SEUL')
  })
})
