import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BilanOut, SemaineOut, ShiftOut } from '#/lib/planning/semaine.ts'
import type { Horaire, Motif, Salarie } from '#/lib/planning/types.ts'

/*
 * Aides pures de la vue semaine : statut d'un jour libre, indices de dépôt,
 * colonne Heures, compteurs, et les écritures composées (poser un horaire)
 * contre un service simulé.
 */

const service = vi.hoisted(() => ({
  ajouterShift: vi.fn(() => Promise.resolve()),
  modifierShift: vi.fn(() => Promise.resolve()),
  poserAbsences: vi.fn(() => Promise.resolve()),
}))
vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/lib/planning/service.ts', () => service)

const {
  compteurs,
  reposAValider,
  reposProposesParJour,
  validationRepos,
  indiceDe,
  poserHoraire,
  reposDe,
  statutDuJour,
  titreHeures,
  trous,
} = await import('#/components/planning/semaine/edition.ts')

const bilan = (b: Partial<BilanOut> = {}): BilanOut => ({
  salarie_id: 1,
  minutes: 0,
  minutes_contrat: 39 * 60,
  minutes_max: 48 * 60,
  jours: 0,
  alertes: [],
  absences: {},
  absences_semaine_type: [],
  repos_fixes: [],
  hors_contrat: [],
  repos_deduits: [],
  repos_proposes: [],
  ...b,
})

const salarie = (s: Partial<Salarie> = {}): Salarie => ({
  id: 1,
  prenom: 'Léa',
  nom: 'Martin',
  groupe_id: null,
  type_contrat: 'cdi',
  heures_hebdo: 39,
  forfait_jours: false,
  mineur: false,
  competences: [{ poste_id: 10, niveau: 'titulaire' }],
  semaine_type: [],
  shifts_autorises: [],
  date_entree: null,
  date_sortie: null,
  actif: true,
  suite_de: null,
  ...s,
})

const MATIN: Horaire = {
  id: 5,
  nom: 'Matin',
  debut: '07:00',
  fin: '15:45',
  couleur: '#ff0000',
  pause: 45,
  periode: null,
}

const shift = (s: Partial<ShiftOut> = {}): ShiftOut => ({
  id: 1,
  salarie_id: 1,
  poste_id: 10,
  jour: 0,
  type_shift_id: 5,
  debut: '07:00',
  fin: '15:45',
  duree: 480,
  pause: 45,
  etoile: false,
  epinglee: true,
  besoin_id: null,
  code_demande: null,
  role: 'titulaire',
  alertes: [],
  ...s,
})

const MOTIFS: Motif[] = [
  {
    id: 1,
    code: 'CP',
    nom: 'Congés',
    couleur: '#00ff00',
    decompte: true,
    nature: 'absence',
  },
  {
    id: 2,
    code: 'EC',
    nom: 'École',
    couleur: '#0000ff',
    decompte: true,
    nature: 'ecole',
  },
]

beforeEach(() => {
  for (const f of Object.values(service)) f.mockClear()
})

describe('statutDuJour', () => {
  it('repos posé à une date : montré comme un repos, retirable (2026-10-31)', () => {
    const repos: Motif = {
      id: 9,
      code: 'R',
      nom: 'Repos',
      couleur: '#64748b',
      decompte: false,
      nature: 'repos',
    }
    expect(
      statutDuJour(bilan({ absences: { 1: 9 } }), 1, [...MOTIFS, repos]),
    ).toMatchObject({
      nom: 'Repos',
      genre: 'absence',
      reposPose: true,
      fixe: false,
    })
  })
  it('congé en trop dans la semaine : un des 2 repos, en proposition (2026-11-02)', () => {
    const b = bilan({ absences: { 5: 1, 6: 1 }, repos_deduits: [5] })
    expect(statutDuJour(b, 5, MOTIFS)).toMatchObject({
      nom: 'Repos',
      genre: 'repos',
      proposition: true,
    })
    expect(validationRepos(b, 5, MOTIFS)).toEqual({
      valide: false,
      deduit: true,
    })
    expect(statutDuJour(b, 6, MOTIFS)).toMatchObject({ nom: 'Congés' })
  })
  it('hors contrat avant tout, fixe', () => {
    const s = statutDuJour(
      bilan({ hors_contrat: [2], absences: { 2: 1 } }),
      2,
      MOTIFS,
    )
    expect(s).toMatchObject({ genre: 'hors', fixe: true })
  })
  it('absence ou école, fixe si semaine type', () => {
    expect(
      statutDuJour(bilan({ absences: { 1: 1 } }), 1, MOTIFS),
    ).toMatchObject({
      nom: 'Congés',
      genre: 'absence',
      fixe: false,
    })
    expect(
      statutDuJour(
        bilan({ absences: { 1: 2 }, absences_semaine_type: [1] }),
        1,
        MOTIFS,
      ),
    ).toMatchObject({ genre: 'ecole', fixe: true })
  })
  it('repos seulement s’il est officiel : la semaine type (2026-11-03)', () => {
    expect(statutDuJour(bilan(), 3, MOTIFS)).toBeNull()
    // Refusé : un repos deviné sur un jour vide ; la case reste vide.
    expect(statutDuJour(bilan({ repos_deduits: [3] }), 3, MOTIFS)).toBeNull()
    expect(statutDuJour(bilan({ repos_fixes: [3] }), 3, MOTIFS)).toMatchObject({
      genre: 'repos',
      fixe: true,
    })
  })
})

describe('repos validés comme les shifts (2026-10-31)', () => {
  const repos: Motif = {
    id: 9,
    code: 'R',
    nom: 'Repos',
    couleur: '#64748b',
    decompte: false,
    nature: 'repos',
  }
  const motifs = [...MOTIFS, repos]
  it('repos obligé (2026-11-04) : Repos avec sa raison, en proposition, à valider', () => {
    const oblige = [{ jour: 3, raison: 'sinon 8 jours de travail' }]
    const b = bilan({ repos_obliges: oblige })
    expect(statutDuJour(b, 3, motifs)).toMatchObject({
      nom: 'Repos',
      proposition: true,
      raison: 'sinon 8 jours de travail',
    })
    expect(validationRepos(b, 3, motifs)).toEqual({
      valide: false,
      deduit: true,
    })
    const semaine = {
      affectations: [],
      bilan: [b],
      verrouillee: false,
    } as unknown as SemaineOut
    expect(reposAValider(semaine)).toEqual([
      { salarie_id: b.salarie_id, jour: 3 },
    ])
    expect(reposProposesParJour(semaine)[3]).toBe(1)
    // Semaine verrouillée : rien de proposé.
    expect(statutDuJour(b, 3, motifs, true)).toBeNull()
    expect(reposAValider({ ...semaine, verrouillee: true })).toEqual([])
    // Déjà posé : le repos garde sa raison, rien à réécrire.
    const pose = bilan({
      repos_obliges: oblige,
      absences: { 3: repos.id },
      repos_proposes: [3],
    })
    expect(statutDuJour(pose, 3, motifs)).toMatchObject({
      reposPose: true,
      raison: 'sinon 8 jours de travail',
    })
    expect(reposAValider({ ...semaine, bilan: [pose] })).toEqual([])
  })
  it('repos fixe : toujours validé, rien à basculer', () => {
    expect(validationRepos(bilan({ repos_fixes: [3] }), 3, motifs)).toBeNull()
    expect(statutDuJour(bilan({ repos_fixes: [3] }), 3, motifs)).toMatchObject({
      proposition: false,
    })
  })
  it('repos déduit sur un congé en trop : une proposition, à écrire pour la valider', () => {
    const conge = bilan({ repos_deduits: [3], absences: { 3: 1 } })
    expect(validationRepos(conge, 3, motifs)).toEqual({
      valide: false,
      deduit: true,
    })
    expect(statutDuJour(conge, 3, motifs)).toMatchObject({ proposition: true })
    // Semaine verrouillée : le planning est réalisé, rien n'est proposé.
    expect(statutDuJour(conge, 3, motifs, true)).toMatchObject({
      proposition: false,
    })
    // Refusé : sur un jour vide, plus rien à valider (2026-11-03).
    expect(validationRepos(bilan({ repos_deduits: [3] }), 3, motifs)).toBeNull()
  })
  it('repos posé : validé ou en proposition', () => {
    expect(validationRepos(bilan({ absences: { 1: 9 } }), 1, motifs)).toEqual({
      valide: true,
      deduit: false,
    })
    expect(
      validationRepos(
        bilan({ absences: { 1: 9 }, repos_proposes: [1] }),
        1,
        motifs,
      ),
    ).toEqual({ valide: false, deduit: false })
    expect(
      statutDuJour(
        bilan({ absences: { 1: 9 }, repos_proposes: [1] }),
        1,
        motifs,
      ),
    ).toMatchObject({ reposPose: true, proposition: true })
  })
  it('ni une absence, ni un repos de la semaine type, ni rien', () => {
    expect(validationRepos(bilan({ absences: { 1: 1 } }), 1, motifs)).toBeNull()
    expect(
      validationRepos(
        bilan({ absences: { 1: 9 }, absences_semaine_type: [1] }),
        1,
        motifs,
      ),
    ).toBeNull()
    expect(validationRepos(bilan(), 1, motifs)).toBeNull()
  })
  it('repos à valider et compteurs : déduits sur un congé, et posés en proposition', () => {
    const semaine = {
      affectations: [shift({ epinglee: false })],
      bilan: [
        // Le 5 est un congé en trop ; le 6, un jour vide (plus rien déduit).
        bilan({ salarie_id: 1, repos_deduits: [5, 6], absences: { 5: 1 } }),
        bilan({
          salarie_id: 2,
          repos_deduits: [6],
          repos_proposes: [2],
          absences: { 2: 9, 6: 1 },
        }),
      ],
      verrouillee: false,
    } as unknown as SemaineOut
    expect(reposAValider(semaine)).toEqual([
      { salarie_id: 1, jour: 5 },
      { salarie_id: 2, jour: 6 },
    ])
    expect(reposAValider(semaine, 6, 2)).toEqual([{ salarie_id: 2, jour: 6 }])
    expect(reposProposesParJour(semaine)).toEqual([0, 0, 1, 0, 0, 1, 1])
    expect(compteurs(semaine)).toMatchObject({ propositions: 4, valides: 0 })
    const verrouillee = { ...semaine, verrouillee: true } as SemaineOut
    expect(reposAValider(verrouillee)).toEqual([])
    expect(reposProposesParJour(verrouillee)).toEqual([0, 0, 0, 0, 0, 0, 0])
  })
})

describe('reposDe', () => {
  it('repos de la semaine type seulement ; ni deviné, ni une absence, ni hors contrat', () => {
    expect(reposDe(bilan({ repos_fixes: [3] }), 3)).toEqual({ fixe: true })
    // Refusé : un repos deviné (2026-11-03).
    expect(reposDe(bilan({ repos_deduits: [3] }), 3)).toBeNull()
    expect(
      reposDe(bilan({ repos_fixes: [3], absences: { 3: 1 } }), 3),
    ).toBeNull()
    expect(
      reposDe(bilan({ repos_fixes: [3], hors_contrat: [3] }), 3),
    ).toBeNull()
    expect(reposDe(bilan(), 3)).toBeNull()
    expect(reposDe(undefined, 3)).toBeNull()
  })
})

describe('indiceDe', () => {
  const vol = { type: 'shift' as const, shift: shift({ poste_id: 10 }) }
  it('titulaire = ok, dépannage, non tenu = déconseillé', () => {
    expect(indiceDe(vol, salarie(), 1, bilan(), null)).toBe('ok')
    expect(
      indiceDe(
        vol,
        salarie({ competences: [{ poste_id: 10, niveau: 'occasionnel' }] }),
        1,
        bilan(),
        null,
      ),
    ).toBe('possible')
    expect(indiceDe(vol, salarie({ competences: [] }), 1, bilan(), null)).toBe(
      'deconseille',
    )
  })
  it('absence, repos fixe et hors contrat : déconseillé', () => {
    expect(
      indiceDe(vol, salarie(), 1, bilan({ absences: { 1: 1 } }), null),
    ).toBe('deconseille')
    expect(indiceDe(vol, salarie(), 1, bilan({ repos_fixes: [1] }), null)).toBe(
      'deconseille',
    )
    const hors = statutDuJour(bilan({ hors_contrat: [1] }), 1, MOTIFS)
    expect(indiceDe(vol, salarie(), 1, bilan(), hors)).toBe('deconseille')
  })
  it('un repos ne va pas chez quelqu’un d’autre', () => {
    const repos = {
      nom: 'Repos',
      couleur: '',
      fixe: false,
      repos: true,
      genre: 'repos' as const,
    }
    const v = { type: 'statut' as const, salarie_id: 1, jour: 0, statut: repos }
    expect(indiceDe(v, salarie({ id: 2 }), 3, bilan(), null)).toBe(
      'deconseille',
    )
    expect(indiceDe(v, salarie({ id: 1 }), 3, bilan(), null)).toBe('ok')
    expect(indiceDe(null, salarie(), 3, bilan(), null)).toBeNull()
  })
})

describe('colonne Heures et compteurs', () => {
  it('titreHeures', () => {
    expect(titreHeures(salarie(), bilan({ minutes: 39 * 60 }))).toBe(
      'Pile les heures du contrat',
    )
    expect(titreHeures(salarie(), bilan({ minutes: 37 * 60 }))).toBe(
      '2h de moins que le contrat',
    )
    expect(titreHeures(salarie(), bilan({ minutes: 50 * 60 }))).toBe(
      'Au-delà du maximum de 48h',
    )
    expect(
      titreHeures(salarie({ forfait_jours: true }), bilan({ jours: 4 })),
    ).toMatch(/4 jours/)
  })
  it('en semaine verrouillée, tout est verrouillé', () => {
    const s = {
      affectations: [shift(), shift({ id: 2, epinglee: false })],
      bilan: [] as BilanOut[],
      verrouillee: false,
    }
    expect(compteurs(s as SemaineOut)).toEqual({
      propositions: 1,
      valides: 1,
      verrouilles: 0,
    })
    expect(compteurs({ ...s, verrouillee: true } as SemaineOut)).toEqual({
      propositions: 0,
      valides: 0,
      verrouilles: 2,
    })
  })
})

describe('poserHoraire', () => {
  const o = { salarie_id: 1, jour: 2 }
  it("un shift : change l'horaire (une journée étoile en est un autre)", async () => {
    await poserHoraire('2026-11-02', o, shift({ id: 7 }), null, MATIN, 10)()
    expect(service.modifierShift).toHaveBeenCalledWith(7, {
      horaire_id: 5,
      debut: '07:00',
      fin: '15:45',
      pause: 45,
    })
  })
  it('un code d’une autre rubrique : le poste change avec le code', async () => {
    const s = shift({ id: 7 })
    await poserHoraire('2026-11-02', o, s, null, MATIN, s.poste_id + 1)()
    expect(service.modifierShift).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ horaire_id: 5, poste_id: s.poste_id + 1 }),
    )
  })
  it('une absence non fixe : retirée, puis le shift posé', async () => {
    await poserHoraire('2026-11-02', o, undefined, { fixe: false }, MATIN, 10)()
    expect(service.poserAbsences).toHaveBeenCalledWith(1, ['2026-11-04'], null)
    expect(service.ajouterShift).toHaveBeenCalledWith(
      '2026-11-02',
      expect.objectContaining({
        salarie_id: 1,
        jour: 2,
        poste_id: 10,
        epinglee: true,
      }),
    )
  })
  it('le shift refusé : l’absence retirée est remise, avec son motif', async () => {
    const refus = Object.assign(new Error('refus'), { code: '23505' })
    service.ajouterShift.mockImplementationOnce(() => Promise.reject(refus))
    await expect(
      poserHoraire(
        '2026-11-02',
        o,
        undefined,
        { fixe: false, motif_id: 3 },
        MATIN,
        10,
      )(),
    ).rejects.toBe(refus)
    expect(service.poserAbsences).toHaveBeenNthCalledWith(
      1,
      1,
      ['2026-11-04'],
      null,
    )
    expect(service.poserAbsences).toHaveBeenNthCalledWith(
      2,
      1,
      ['2026-11-04'],
      3,
    )
  })
  it('une absence fixe ne se retire pas d’ici', async () => {
    await poserHoraire('2026-11-02', o, undefined, { fixe: true }, MATIN, 10)()
    expect(service.poserAbsences).not.toHaveBeenCalled()
    expect(service.ajouterShift).toHaveBeenCalledTimes(1)
  })
})

describe('poserHoraire : horaire de minuit', () => {
  it("commence à 24:00 sur son jour : c'est la nuit vers le lendemain", async () => {
    const NUIT_ETOILE: Horaire = {
      ...MATIN,
      id: 9,
      debut: '00:00',
      fin: '07:00',
      pause: 0,
      periode: 'nuit',
    }
    await poserHoraire(
      '2026-11-02',
      { salarie_id: 1, jour: 2 },
      shift({ id: 7 }),
      null,
      NUIT_ETOILE,
      10,
    )()
    expect(service.modifierShift).toHaveBeenCalledWith(7, {
      horaire_id: 9,
      debut: '24:00',
      fin: '07:00',
      pause: 0,
    })
  })
})

describe('trous : places à pourvoir à partir d’aujourd’hui (2026-11-03)', () => {
  const s = {
    lundi: '2026-11-02',
    a_pourvoir: [
      { jour: 0, manquant: 2 },
      { jour: 1, manquant: 1 },
    ],
  } as unknown as SemaineOut
  it('accepté : un jour passé ne compte pas comme une place à pourvoir', () => {
    expect(trous(s, '2026-11-03')).toBe(1)
  })
  it('refusé : sans aujourd’hui ou le lundi même, tout compte', () => {
    expect(trous(s)).toBe(3)
    expect(trous(s, '2026-11-02')).toBe(3)
  })
})
