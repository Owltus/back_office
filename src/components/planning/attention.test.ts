import { describe, expect, it } from 'vitest'

import {
  joursDesPlaces,
  nombreInfractions,
  pointsAttention,
  porteeMois,
  porteeSemaine,
  regrouperPlaces,
  resumePoints,
} from '#/components/planning/attention.ts'
import type { SemaineOut } from '#/lib/planning/semaine.ts'
import type { Poste, Salarie } from '#/lib/planning/types.ts'

/*
 * Points d'attention (demande utilisateur du 2026-10-28). Oracles écrits à
 * la main : ce que le panneau doit dire pour une semaine fabriquée.
 */

const salarie = (
  id: number,
  prenom: string,
  type_contrat = 'cdi',
  niveau = 'titulaire',
) =>
  ({
    id,
    prenom,
    type_contrat,
    competences: [{ poste_id: 9, niveau }],
  }) as unknown as Salarie
const SALARIES = [
  // Paul en dépannage, placé AVANT Zoé dans le référentiel : l'ordre des
  // personnes (D13) ne suit pas le référentiel.
  salarie(1, 'Léa'),
  salarie(2, 'Paul', 'cdi', 'occasionnel'),
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
        {
          salarie_id: 4,
          messages: ['extra disponible : à appeler et poser à la main'],
          regles: ['EXTRA'],
        },
        {
          salarie_id: 1,
          messages: ["c'est un de ses jours de repos fixes"],
          regles: ['REPOS-FIXE'],
        },
        {
          salarie_id: 2,
          messages: ["c'est un de ses jours de repos fixes"],
          regles: ['REPOS-FIXE'],
        },
        { salarie_id: 3, messages: [], regles: [] },
        {
          salarie_id: 5,
          messages: ['extra disponible : à appeler et poser à la main'],
          regles: ['EXTRA'],
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
      { message: 'disponible ce jour-là', noms: ['Zoé'] },
    ])
    // D13 : titulaires, puis dépannage, puis extras ; chacun avec sa raison
    // en clair, et qui peut prendre la place.
    expect(
      dimanche.personnes.map((x) => [
        x.nom,
        x.role,
        x.raisons.map((r) => r.phrase),
        x.possible,
      ]),
    ).toEqual([
      ['Léa', 'titulaire', ['En repos fixe ce jour-là'], false],
      ['Zoé', 'titulaire', ['Libre ce jour-là'], true],
      ['Paul', 'occasionnel', ['En repos fixe ce jour-là'], false],
      ['Max', 'extra', ['Extra libre'], true],
      ['Ana', 'extra', ['Extra libre'], true],
    ])
    expect(dimanche.personnes[0].raisons[0].issue).toEqual({
      genre: 'lien',
      lien: { page: '/planning/equipe', cible: 'salarie-1.semaine' },
      action: 'Semaine type',
    })
    expect([dimanche.jour, dimanche.posteId, dimanche.horaireId]).toEqual([
      6,
      9,
      null,
    ])
    expect(p.presence).toHaveLength(1)
    expect(p.infractions.map((x) => x.messages[0].texte)).toEqual([
      'repos de 11 h non tenu',
    ])
    expect(p.aRegarder.map((x) => x.messages[0].texte)).toEqual([
      'il manque 7 h',
    ])
    // Le total compte exactement ce qui est listé : 2 + 1 + 1 + 1.
    expect(p.total).toBe(5)
  })

  it('résumé en une phrase', () => {
    expect(
      resumePoints(pointsAttention([semaine('2026-11-02')], SALARIES, POSTES)),
    ).toBe('Tout est en ordre.')
    expect(resumePoints(pointsAttention([SEM], SALARIES, POSTES))).toBe(
      '5 points : 1 infraction, 2 shifts à pourvoir, 1 consigne de présence, 1 à regarder.',
    )
  })
})

describe('portée : un écran ne montre que ce qui le concerne', () => {
  // SEM = semaine du 26 octobre : places vides le lundi 26 et le dimanche
  // 1er novembre, présence du lundi 26, deux alertes de la semaine.
  it('mois de novembre : le dimanche 1er seulement, pas les alertes d’octobre', () => {
    const p = pointsAttention([SEM], SALARIES, POSTES, porteeMois('2026-11'))
    expect(p.aPourvoir.map((j) => j.date)).toEqual(['2026-11-01'])
    expect(p.presence).toEqual([])
    // Semaine du jeudi 29 octobre : ses alertes sont d'octobre (Johanna).
    expect(p.infractions).toEqual([])
    expect(p.aRegarder).toEqual([])
    expect(p.total).toBe(1)
  })

  it('mois d’octobre : ses jours et les alertes de la semaine', () => {
    expect(
      pointsAttention([SEM], SALARIES, POSTES, porteeMois('2026-10')).total,
    ).toBe(4)
    // À partir du 27 : le lundi 26 passé disparaît, les alertes restent.
    const p = pointsAttention(
      [SEM],
      SALARIES,
      POSTES,
      porteeMois('2026-10', '2026-10-27'),
    )
    expect(p.aPourvoir).toEqual([])
    expect(p.presence).toEqual([])
    expect(p.total).toBe(2)
  })

  it('semaine : à partir d’aujourd’hui', () => {
    const p = pointsAttention(
      [SEM],
      SALARIES,
      POSTES,
      porteeSemaine('2026-10-27'),
    )
    expect(p.aPourvoir.map((j) => j.date)).toEqual(['2026-11-01'])
    expect(p.total).toBe(3)
    // Une semaine entièrement passée : rien.
    expect(
      pointsAttention([SEM], SALARIES, POSTES, porteeSemaine('2026-11-02'))
        .total,
    ).toBe(0)
  })

  it('bouclier HCR : les semaines du mois, passé compris', () => {
    expect(
      nombreInfractions(
        pointsAttention([SEM], SALARIES, POSTES, porteeMois('2026-10')),
      ),
    ).toBe(1)
    expect(
      nombreInfractions(
        pointsAttention([SEM], SALARIES, POSTES, porteeMois('2026-11')),
      ),
    ).toBe(0)
  })
})

describe('places regroupées (même poste, même code, plusieurs jours)', () => {
  const place = (
    besoin_id: number,
    jour: number,
    type_shift_id: number | null,
    raisons: SemaineOut['a_pourvoir'][number]['raisons'],
    debut = '07:00',
  ) => ({
    besoin_id,
    poste_id: 9,
    jour,
    type_shift_id,
    debut,
    fin: '15:00',
    duree: 450,
    manquant: 1,
    raisons,
  })
  const repos = (id: number) => ({
    salarie_id: id,
    messages: ["c'est un de ses jours de repos fixes"],
    regles: ['REPOS-FIXE'],
  })
  const libre = (id: number) => ({ salarie_id: id, messages: [], regles: [] })
  const S = semaine('2026-11-02', {
    a_pourvoir: [
      place(3, 3, 41, [repos(1), libre(3)]), // jeudi
      place(1, 0, 41, [repos(1), repos(3)]), // lundi
      place(2, 1, 41, [repos(1), libre(3)]), // mardi
      place(4, 1, 42, [libre(1)]), // mardi, autre code
      place(5, 2, null, [], '09:00'), // mercredi, sans code
    ],
  })
  const HORAIRES = [
    { id: 41, code: 'M1' },
    { id: 42, code: 'S2' },
  ]

  it('une ligne par poste et code, jours dans l’ordre', () => {
    const p = pointsAttention([S], SALARIES, POSTES)
    const g = regrouperPlaces(
      p.aPourvoir.flatMap((j) => j.shifts),
      HORAIRES,
    )
    expect(
      g.map((x) => [
        x.poste?.nom,
        x.code,
        joursDesPlaces(x.places.map((y) => y.date)),
      ]),
    ).toEqual([
      ['Réception', 'M1', 'lundi, mardi et jeudi'],
      ['Réception', 'S2', 'mardi'],
      ['Réception', null, 'mercredi'],
    ])
    // Une raison de TOUS les jours n'a pas de jours ; une raison de certains
    // jours les dit. Les places gardent leur détail, pour « Placer ».
    const m1 = g[0]
    expect(
      m1.personnes.map((x) => [
        x.nom,
        x.raisons.map((r) => [r.phrase, r.dates]),
      ]),
    ).toEqual([
      ['Léa', [['En repos fixe ce jour-là', null]]],
      [
        'Zoé',
        [
          ['En repos fixe ce jour-là', ['2026-11-02']],
          ['Libre ce jour-là', ['2026-11-03', '2026-11-05']],
        ],
      ],
    ])
    expect(m1.places.map((x) => x.personnes.some((y) => y.possible))).toEqual([
      false,
      true,
      true,
    ])
  })

  it('dépannage après les titulaires, même si vu le premier', () => {
    // Paul (dépannage) seul le lundi, Léa (titulaire) seule le mardi.
    const T = semaine('2026-11-02', {
      a_pourvoir: [place(1, 0, 41, [repos(2)]), place(2, 1, 41, [repos(1)])],
    })
    const [g] = regrouperPlaces(
      pointsAttention([T], SALARIES, POSTES).aPourvoir.flatMap((j) => j.shifts),
    )
    expect(g.personnes.map((x) => x.nom)).toEqual(['Léa', 'Paul'])
    // Sans référentiel des horaires : pas de code, les heures suffisent.
    expect(g.code).toBeNull()
  })

  it('jours : le nom seul dans une semaine, avec le numéro sinon', () => {
    expect(joursDesPlaces([])).toBe('')
    expect(joursDesPlaces(['2026-11-05', '2026-11-02', '2026-11-02'])).toBe(
      'lundi et jeudi',
    )
    expect(joursDesPlaces(['2026-11-02', '2026-11-09'])).toBe(
      'lundi 2 et lundi 9',
    )
    // Moins de 7 jours, mais à cheval sur deux semaines.
    expect(joursDesPlaces(['2026-11-07', '2026-11-10'])).toBe(
      'samedi 7 et mardi 10',
    )
  })
})
