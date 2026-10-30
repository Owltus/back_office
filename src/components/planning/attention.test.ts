import { describe, expect, it } from 'vitest'

import {
  heureParlee,
  joursDesPlaces,
  nombreInfractions,
  nommerJours,
  phraseCycle,
  phraseTrou,
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
    nom: `Nom${id}`,
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
      remplacants: [],
      raison_commune: null,
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
      remplacants: [],
      raison_commune: null,
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
      '5 points : 1 infraction, 2 shifts à pourvoir, 1 cycle à compléter, 1 à regarder.',
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
    remplacants: [],
    raison_commune: null,
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

describe('noms : deux personnes au même prénom restent distinctes', () => {
  it("l'initiale du nom s'ajoute, partout dans le panneau", () => {
    const deux = [
      { ...SALARIES[0], nom: 'Bernard' },
      { ...SALARIES[2], id: 3, prenom: 'Léa', nom: 'Martin' },
    ] as Salarie[]
    const p = pointsAttention([SEM], deux, POSTES)
    const noms = p.aPourvoir.flatMap((j) =>
      j.shifts.flatMap((t) => t.personnes.map((x) => x.nom)),
    )
    expect(noms).toContain('Léa B.')
    expect(noms).toContain('Léa M.')
    expect(noms).not.toContain('Léa')
  })
})

describe('personnes par cycle (matin, soir, nuit)', () => {
  const ecart = (jour: number, periode: string, e: number) => ({
    jour,
    periode,
    compte: 2 + e,
    minimum: 2,
    maximum: 2,
    ecart: e,
  })
  const S = semaine('2026-11-02', {
    presence: [
      ecart(1, 'nuit', -1),
      ecart(1, 'soir', 1),
      ecart(1, 'matin', -2),
      ecart(0, 'nuit', 0),
    ],
  } as unknown as Partial<SemaineOut>)

  it('tri du jour : matin, soir, nuit (jamais l’ordre alphabétique)', () => {
    const p = pointsAttention([S], SALARIES, POSTES)
    expect(p.presence.map((e) => e.periode)).toEqual(['matin', 'soir', 'nuit'])
    expect(p.total).toBe(3)
  })

  it('une phrase : il manque, ou de trop, avec le moment et le jour', () => {
    const p = pointsAttention([S], SALARIES, POSTES)
    const jour = nommerJours(p.presence.map((e) => e.date))
    expect(p.presence.map((e) => phraseCycle(e, jour(e.date)))).toEqual([
      'Il manque 2 personnes le matin mardi',
      '1 personne de trop le soir mardi',
      'Il manque 1 personne la nuit mardi',
    ])
  })

  it('jours : le numéro seulement quand les dates sortent d’une semaine', () => {
    expect(nommerJours(['2026-11-03'])('2026-11-03')).toBe('mardi')
    expect(nommerJours(['2026-11-03', '2026-11-10'])('2026-11-10')).toBe(
      'mardi 10',
    )
    expect(nommerJours([])('2026-11-04')).toBe('mercredi')
  })
})

describe('trous entre équipes', () => {
  const trou = (jour: number, debut: string, fin: string, poste_id = 9) => ({
    poste_id,
    jour,
    debut,
    fin,
  })
  // Semaine du 26 octobre : lundi 26 (octobre), dimanche 1er (novembre).
  const S = semaine('2026-10-26', {
    trous: [
      trou(6, '15:00', '16:00'),
      trou(0, '23:00', '00:30'),
      trou(0, '15:00', '15:45'),
    ],
  })

  it('jour par jour, l’ordre de l’analyse dans un jour', () => {
    const p = pointsAttention([S], SALARIES, POSTES)
    expect(p.trous.map((t) => [t.date, t.debut])).toEqual([
      ['2026-10-26', '23:00'],
      ['2026-10-26', '15:00'],
      ['2026-11-01', '15:00'],
    ])
    expect(p.trous[0].poste?.nom).toBe('Réception')
    expect(p.total).toBe(3)
    expect(resumePoints(p)).toBe('3 points : 3 trous entre équipes.')
  })

  it('une phrase par trou : poste, jour, heures', () => {
    const p = pointsAttention([S], SALARIES, POSTES)
    const jour = nommerJours(p.trous.map((t) => t.date))
    expect(p.trous.map((t) => phraseTrou(t, jour(t.date)))).toEqual([
      'Réception lundi : personne de 23 h à 0 h 30',
      'Réception lundi : personne de 15 h à 15 h 45',
      'Réception dimanche : personne de 15 h à 16 h',
    ])
    expect(heureParlee('24:00')).toBe('0 h')
    expect(heureParlee('07:05')).toBe('7 h 05')
  })

  it('portée : un mois ou une semaine ne montre que ses jours', () => {
    const nov = pointsAttention([S], SALARIES, POSTES, porteeMois('2026-11'))
    expect(nov.trous.map((t) => t.date)).toEqual(['2026-11-01'])
    const sem = pointsAttention(
      [S],
      SALARIES,
      POSTES,
      porteeSemaine('2026-10-27'),
    )
    expect(sem.trous.map((t) => t.date)).toEqual(['2026-11-01'])
    expect(resumePoints(sem)).toBe('1 point : 1 trou entre équipes.')
  })

  it('semaine sans le champ (données d’avant) : aucun trou', () => {
    const p = pointsAttention([semaine('2026-11-02')], SALARIES, POSTES)
    expect(p.trous).toEqual([])
  })
})

describe('place que rien ne remplit', () => {
  const bloque = (id: number) => ({
    salarie_id: id,
    messages: ['repos de 11 h non respecté'],
    regles: ['R-REPOS-QUOTIDIEN'],
  })
  const libre = (id: number) => ({ salarie_id: id, messages: [], regles: [] })
  const place = (
    besoin_id: number,
    jour: number,
    raison_commune: string | null,
    remplacants: SemaineOut['a_pourvoir'][number]['remplacants'] = [],
  ) => ({
    besoin_id,
    poste_id: 9,
    jour,
    type_shift_id: 41,
    debut: '07:00',
    fin: '15:00',
    duree: 450,
    manquant: 1,
    raisons: [bloque(1), bloque(3)],
    remplacants,
    raison_commune,
  })
  const HORAIRES = [
    { id: 41, code: 'M3' },
    { id: 42, code: 'M6' },
  ]
  const groupes = (s: SemaineOut) =>
    regrouperPlaces(
      pointsAttention([s], SALARIES, POSTES).aPourvoir.flatMap((j) => j.shifts),
      HORAIRES,
    )

  it('la raison commune en clair, et un groupe à part', () => {
    const g = groupes(
      semaine('2026-11-02', {
        a_pourvoir: [
          place(1, 0, 'R-REPOS-QUOTIDIEN'),
          place(2, 1, 'R-REPOS-QUOTIDIEN'),
          place(3, 2, null),
        ],
      }),
    )
    expect(
      g.map((x) => [
        x.code,
        joursDesPlaces(x.places.map((p) => p.date)),
        x.raisonCommune,
      ]),
    ).toEqual([
      [
        'M3',
        'lundi et mardi',
        "Personne n'a assez de repos avec ses autres shifts.",
      ],
      ['M3', 'mercredi', null],
    ])
  })

  it('règle qui ne bloque pas vraiment (6e jour) : les raisons par personne', () => {
    const [g] = groupes(
      semaine('2026-11-02', { a_pourvoir: [place(1, 0, 'SIXIEME-JOUR')] }),
    )
    expect(g.raisonCommune).toBeNull()
    expect(g.places[0].raisonCommune).toBeNull()
  })

  it('autre code possible : dit, sans les extras ni ceux déjà libres', () => {
    const [g] = groupes(
      semaine('2026-11-02', {
        a_pourvoir: [
          {
            ...place(1, 0, null, [
              {
                type_shift_id: 42,
                raisons: [libre(1), libre(4), bloque(3)],
              },
            ]),
            raisons: [bloque(1), libre(3)],
          },
        ],
      }),
    )
    // Léa (fermée en M3, libre en M6) ; ni Max (extra), ni Zoé (bloquée en
    // M6, et déjà libre en M3).
    expect(g.autresCodes).toEqual([{ code: 'M6', noms: ['Léa'] }])
  })
})
