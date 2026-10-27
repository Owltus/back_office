import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BilanOut, SemaineOut, ShiftOut } from '#/lib/planning/semaine.ts'
import type { Horaire, Motif, Salarie } from '#/lib/planning/types.ts'

/*
 * Aides pures de la vue semaine : statut d'un jour libre, indices de dépôt,
 * colonne Heures, compteurs, et les écritures composées (poser un horaire,
 * journée étoile) contre un service simulé.
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
  etoileProposee,
  indiceDe,
  poserHoraire,
  statutDuJour,
  titreHeures,
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
  code: 'M',
  nom: 'Matin',
  debut: '07:00',
  fin: '15:45',
  couleur: '#ff0000',
  pause: 45,
  raccourci: 60,
  raccourci_debut: 0,
  periode: null,
  code_rouge: false,
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
  court: false,
  epinglee: true,
  besoin_id: null,
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
  it('hors contrat avant tout, fixe', () => {
    const s = statutDuJour(
      bilan({ hors_contrat: [2], absences: { 2: 1 } }),
      2,
      true,
      MOTIFS,
    )
    expect(s).toMatchObject({ genre: 'hors', fixe: true })
  })
  it('absence ou école, fixe si semaine type', () => {
    expect(
      statutDuJour(bilan({ absences: { 1: 1 } }), 1, false, MOTIFS),
    ).toMatchObject({
      nom: 'Congés',
      genre: 'absence',
      fixe: false,
    })
    expect(
      statutDuJour(
        bilan({ absences: { 1: 2 }, absences_semaine_type: [1] }),
        1,
        false,
        MOTIFS,
      ),
    ).toMatchObject({ genre: 'ecole', fixe: true })
  })
  it('repos seulement si la personne est organisée (ou repos fixe)', () => {
    expect(statutDuJour(bilan(), 3, false, MOTIFS)).toBeNull()
    expect(statutDuJour(bilan(), 3, true, MOTIFS)).toMatchObject({
      genre: 'repos',
      fixe: false,
    })
    expect(
      statutDuJour(bilan({ repos_fixes: [3] }), 3, false, MOTIFS),
    ).toMatchObject({
      genre: 'repos',
      fixe: true,
    })
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
    ).toBe('depannage')
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
    const hors = statutDuJour(bilan({ hors_contrat: [1] }), 1, false, MOTIFS)
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
  it('un shift : change le code, retire la journée étoile', async () => {
    await poserHoraire('2026-11-02', o, shift({ id: 7 }), null, MATIN, 10)()
    expect(service.modifierShift).toHaveBeenCalledWith(7, {
      horaire_id: 5,
      debut: '07:00',
      fin: '15:45',
      court: false,
      pause: 45,
    })
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

describe('etoileProposee', () => {
  it('unique dans la semaine : l’ancienne journée courte est retirée', async () => {
    const semaine = {
      affectations: [
        shift({ id: 1, jour: 0 }),
        shift({ id: 2, jour: 3, court: true }),
      ],
    } as SemaineOut
    const e = etoileProposee(semaine, salarie(), [MATIN], {
      salarie_id: 1,
      jour: 0,
    })
    expect(e?.active).toBe(false)
    await e?.basculer()
    expect(service.modifierShift).toHaveBeenNthCalledWith(1, 2, {
      court: false,
      debut: '07:00',
      fin: '15:45',
    })
    expect(service.modifierShift).toHaveBeenNthCalledWith(2, 1, {
      court: true,
      debut: '07:00',
      fin: '14:45',
    })
  })
  it('rien à 35 h ni au forfait', () => {
    const semaine = { affectations: [shift()] } as SemaineOut
    expect(
      etoileProposee(semaine, salarie({ heures_hebdo: 35 }), [MATIN], {
        salarie_id: 1,
        jour: 0,
      }),
    ).toBeUndefined()
    expect(
      etoileProposee(semaine, salarie({ forfait_jours: true }), [MATIN], {
        salarie_id: 1,
        jour: 0,
      }),
    ).toBeUndefined()
  })
})
