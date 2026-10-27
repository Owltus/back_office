import { describe, expect, it } from 'vitest'

import {
  aVenir,
  aVenirDansLeMois,
  pointsAttention,
  resumePoints,
} from '#/components/planning/attention.ts'
import type { SemaineOut } from '#/lib/planning/semaine.ts'
import type { Poste, Salarie } from '#/lib/planning/types.ts'

/*
 * Points d'attention (demande utilisateur du 2026-10-28). Oracles écrits à
 * la main : ce que le panneau doit dire pour une semaine fabriquée.
 */

const salarie = (id: number, prenom: string, type_contrat = 'cdi') =>
  ({ id, prenom, type_contrat }) as unknown as Salarie
const SALARIES = [
  salarie(1, 'Léa'),
  salarie(2, 'Paul'),
  salarie(3, 'Zoé'),
  salarie(4, 'Max', 'extra'),
  salarie(5, 'Ana', 'extra'),
]
const POSTES = [{ id: 9, nom: 'Réception', couleur: '#000' }] as Poste[]

const semaine = (lundi: string, extra: Partial<SemaineOut> = {}) =>
  ({
    lundi,
    a_pourvoir: [],
    presence: [],
    bilan: [],
    ...extra,
  }) as unknown as SemaineOut

const SEM = semaine('2026-10-26', {
  a_pourvoir: [
    {
      besoin_id: 1,
      poste_id: 9,
      jour: 6, // dimanche 1er novembre
      type_shift_id: null,
      debut: '14:30',
      fin: '23:15',
      duree: 480,
      manquant: 1,
      raisons: [
        { salarie_id: 1, messages: ["c'est un de ses jours de repos fixes"] },
        { salarie_id: 2, messages: ["c'est un de ses jours de repos fixes"] },
        { salarie_id: 3, messages: [] },
        {
          salarie_id: 4,
          messages: ['extra disponible : à appeler et poser à la main'],
        },
        {
          salarie_id: 5,
          messages: ['extra disponible : à appeler et poser à la main'],
        },
      ],
    },
    {
      besoin_id: 2,
      poste_id: 9,
      jour: 0, // lundi 26 octobre
      type_shift_id: null,
      debut: '07:00',
      fin: '15:45',
      duree: 480,
      manquant: 1,
      raisons: [],
    },
  ],
  presence: [
    { jour: 0, periode: 'matin', compte: 0, minimum: 2, maximum: 2, ecart: -2 },
    { jour: 1, periode: 'soir', compte: 2, minimum: 2, maximum: 2, ecart: 0 },
  ],
  bilan: [
    {
      salarie_id: 1,
      alertes: [
        { regle: 'R-REPOS', message: 'repos de 11 h non tenu', nature: 'loi' },
        { regle: 'HEURES', message: 'il manque 7 h', nature: 'organisation' },
      ],
    },
  ] as unknown as SemaineOut['bilan'],
})

describe('points d’attention', () => {
  it('raisons regroupées, extras sur une ligne, jours triés', () => {
    const p = pointsAttention([SEM], SALARIES, POSTES)
    expect(p.aPourvoir.map((j) => j.date)).toEqual(['2026-10-26', '2026-11-01'])
    const dimanche = p.aPourvoir[1].shifts[0]
    expect(dimanche.extras).toEqual(['Max', 'Ana'])
    expect(dimanche.raisons).toEqual([
      {
        message: "c'est un de ses jours de repos fixes",
        noms: ['Léa', 'Paul'],
      },
      { message: 'disponible, au détriment de ses heures', noms: ['Zoé'] },
    ])
    expect(p.presence).toHaveLength(1)
    expect(p.infractions.map((x) => x.messages[0].texte)).toEqual([
      'repos de 11 h non tenu',
    ])
    expect(p.aVerifier.map((x) => x.messages[0].texte)).toEqual([
      'il manque 7 h',
    ])
    // Le total compte exactement ce qui est listé : 2 + 1 + 1 + 1.
    expect(p.total).toBe(5)
  })

  it('vue mois : seulement les jours du mois', () => {
    const p = pointsAttention([SEM], SALARIES, POSTES, (d) =>
      d.startsWith('2026-11'),
    )
    expect(p.aPourvoir.map((j) => j.date)).toEqual(['2026-11-01'])
    expect(p.presence).toEqual([])
    // Les alertes d'une semaine à cheval restent : elles n'ont pas de jour.
    expect(p.total).toBe(3)
  })

  it('résumé en une phrase', () => {
    expect(
      resumePoints(pointsAttention([semaine('2026-11-02')], SALARIES, POSTES)),
    ).toBe('Tout est en ordre.')
    expect(resumePoints(pointsAttention([SEM], SALARIES, POSTES))).toBe(
      '5 points : 1 infraction, 2 shifts à pourvoir, 1 consigne de présence, 1 à vérifier.',
    )
  })
})

describe('jours retenus', () => {
  it('semaine : à partir d’aujourd’hui', () => {
    const garder = aVenir('2026-10-27')
    expect(garder('2026-10-26')).toBe(false)
    expect(garder('2026-10-27')).toBe(true)
  })

  it('mois : une semaine est au mois de son jeudi, jours passés exclus', () => {
    const novembre = aVenirDansLeMois('2026-11', '2026-10-27')
    // Semaine du 26 octobre (jeudi 29) : en octobre, même son dimanche 1er.
    expect(novembre('2026-11-01')).toBe(false)
    expect(novembre('2026-11-02')).toBe(true)
    // Semaine du 30 novembre (jeudi 3 décembre) : en décembre.
    expect(novembre('2026-11-30')).toBe(false)
    const octobre = aVenirDansLeMois('2026-10', '2026-10-27')
    expect(octobre('2026-10-26')).toBe(false)
    expect(octobre('2026-11-01')).toBe(true)
    // Les alertes de Johanna (semaine du 26 octobre) ne vont pas en novembre.
    expect(pointsAttention([SEM], SALARIES, POSTES, novembre).total).toBe(0)
  })
})
