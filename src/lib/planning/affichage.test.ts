import { describe, expect, it } from 'vitest'
import {
  libelleHoraire,
  listeEt,
  messageGeneration,
  momentPropose,
  nomHoraire,
  nomsCourts,
  parGroupe,
  resumeEquite,
} from '#/lib/planning/affichage.ts'
import type { SemaineOut } from '#/lib/planning/semaine.ts'
import type { Poste, Salarie } from '#/lib/planning/types.ts'

describe('messageGeneration', () => {
  it('résumé des shifts proposés, avant les places restées vides', () => {
    expect(messageGeneration(0, 'Planning', 12)).toBe(
      'Planning complet généré. 12 shifts proposés.',
    )
    expect(messageGeneration(2, 'Mois', 1)).toBe(
      'Mois généré. 1 shift proposé. 2 places restent à pourvoir.',
    )
    expect(messageGeneration(1, 'Planning', 0)).toBe(
      'Planning généré. Aucun shift proposé. 1 place reste à pourvoir.',
    )
  })

  it('complet seulement sans place à pourvoir', () => {
    expect(messageGeneration(0)).toBe('Planning complet généré.')
    expect(messageGeneration(0, 'Mois')).toBe('Mois complet généré.')
  })

  it('jamais complet quand une place reste, accord du nombre', () => {
    expect(messageGeneration(1)).toBe(
      'Planning généré. 1 place reste à pourvoir.',
    )
    expect(messageGeneration(3, 'Mois')).toBe(
      'Mois généré. 3 places restent à pourvoir.',
    )
    expect(messageGeneration(3)).not.toMatch(/complet/)
  })
})

describe('parGroupe', () => {
  it('range les personnes sans groupe sous « Sans groupe »', () => {
    const r = parGroupe([{ groupe_id: null }, { groupe_id: 9 }], [])
    expect(r).toEqual([
      {
        id: 0,
        nom: 'Sans groupe',
        membres: [{ groupe_id: null }, { groupe_id: 9 }],
      },
    ])
  })
})

describe('resumeEquite', () => {
  const sal = (id: number, poste: number, kw: Partial<Salarie> = {}) =>
    ({
      id,
      type_contrat: 'cdi',
      forfait_jours: false,
      competences: [{ poste_id: poste, niveau: 'titulaire' }],
      ...kw,
    }) as Salarie
  const postes = [
    { id: 1, nom: 'Réception' },
    { id: 2, nom: 'Club' },
    { id: 3, nom: 'Veille de nuit' },
  ] as Poste[]
  const shift = (salarie_id: number, jour: number) => ({ salarie_id, jour })
  const semaine = (...a: Array<{ salarie_id: number; jour: number }>) =>
    ({ affectations: a }) as unknown as Pick<SemaineOut, 'affectations'>

  it('compte les week-ends par personne et par poste principal', () => {
    const salaries = [sal(1, 1), sal(2, 1), sal(3, 2), sal(4, 2), sal(5, 3)]
    const semaines = [
      // Samedi ET dimanche : un seul week-end.
      semaine(
        shift(1, 5),
        shift(1, 6),
        shift(2, 0),
        shift(3, 6),
        shift(4, 5),
        shift(5, 6),
      ),
      semaine(shift(1, 6), shift(2, 1), shift(3, 5), shift(4, 6)),
    ]
    expect(resumeEquite(semaines, salaries, postes)).toBe(
      'Week-ends travaillés par personne : Réception de 0 à 2, Club 2 chacun.',
    )
  })

  it('ignore extras, forfaits jours, absents de la période et postes à une personne', () => {
    const salaries = [
      sal(1, 1),
      sal(2, 1, { type_contrat: 'extra' }),
      sal(3, 1, { forfait_jours: true }),
      sal(4, 1),
    ]
    const semaines = [semaine(shift(1, 5), shift(2, 0), shift(3, 6))]
    expect(resumeEquite(semaines, salaries, postes)).toBe('')
  })
})

describe('nomsCourts', () => {
  const p = (id: number, prenom: string, nom: string) => ({ id, prenom, nom })
  it('le prénom seul, sauf quand il est partagé', () => {
    const n = nomsCourts([
      p(1, 'Léa', 'Bernard'),
      p(2, 'léa ', 'Martin'),
      p(3, 'Paul', 'Durand'),
    ])
    expect([...n.values()]).toEqual(['Léa B.', 'léa M.', 'Paul'])
  })
  it("l'initiale ne suffit pas : le nom entier", () => {
    const n = nomsCourts([
      p(1, 'Léa', 'Bernard'),
      p(2, 'Léa', 'Blanc'),
      p(3, 'Léa', 'Martin'),
    ])
    expect([...n.values()]).toEqual(['Léa Bernard', 'Léa Blanc', 'Léa M.'])
  })
  it('sans nom : le prénom', () => {
    expect(nomsCourts([p(1, 'Léa', ''), p(2, 'Léa', 'Roy')]).get(1)).toBe('Léa')
  })
})

describe('listeEt', () => {
  it('le dernier élément après « et »', () => {
    expect(listeEt([])).toBe('')
    expect(listeEt(['Réception'])).toBe('Réception')
    expect(listeEt(['Réception', 'Club'])).toBe('Réception et Club')
    expect(listeEt(['Bar', 'Réception', 'Club'])).toBe('Bar, Réception et Club')
  })
})

describe('horaires sans code (décision utilisateur du 2026-10-31)', () => {
  // Oracle : les 35 horaires de l'hôtel au 2026-10-31 (heures, pause) et
  // le moment qu'ils portaient ; Direction (08:00-18:00) et Supervision
  // (12:00-20:45), sans moment, passent en middle (décision du même jour).
  const REELS: ReadonlyArray<[string, string, number, string]> = [
    ['00:00', '07:00', 0, 'nuit'],
    ['07:00', '10:00', 0, 'court'],
    ['07:00', '11:45', 45, 'court'],
    ['07:00', '12:45', 45, 'court'],
    ['07:00', '14:45', 45, 'matin'],
    ['07:00', '15:45', 45, 'matin'],
    ['07:00', '16:45', 45, 'matin'],
    ['07:00', '17:45', 45, 'matin'],
    ['07:30', '15:15', 45, 'matin'],
    ['07:30', '16:15', 45, 'matin'],
    ['08:00', '13:45', 45, 'court'],
    ['08:00', '16:45', 45, 'matin'],
    ['08:00', '18:00', 15, 'middle'],
    ['09:00', '16:45', 45, 'middle'],
    ['09:00', '17:45', 45, 'middle'],
    ['09:30', '18:15', 45, 'middle'],
    ['10:00', '18:45', 45, 'middle'],
    ['11:00', '19:45', 45, 'middle'],
    ['12:00', '19:45', 45, 'middle'],
    ['12:00', '20:45', 45, 'middle'],
    ['12:00', '22:45', 45, 'soir'],
    ['13:00', '20:45', 45, 'middle'],
    ['13:00', '21:45', 45, 'soir'],
    ['13:00', '22:45', 45, 'soir'],
    ['14:00', '21:45', 45, 'soir'],
    ['14:15', '22:00', 45, 'soir'],
    ['14:30', '22:15', 45, 'soir'],
    ['14:30', '23:15', 45, 'soir'],
    ['14:45', '23:30', 45, 'soir'],
    ['15:00', '22:45', 45, 'soir'],
    ['15:15', '00:00', 45, 'soir'],
    ['16:15', '00:00', 45, 'soir'],
    ['17:00', '22:00', 45, 'court'],
    ['19:00', '22:00', 0, 'court'],
    ['23:00', '07:00', 0, 'nuit'],
  ]
  it.each(REELS)('%s-%s (pause %i) : %s', (debut, fin, pause, moment) => {
    expect(momentPropose({ debut, fin, pause })).toBe(moment)
  })

  it('les horaires demandés le 2026-10-31 tombent dans le bon moment', () => {
    expect(momentPropose({ debut: '08:00', fin: '15:45', pause: 45 })).toBe(
      'matin',
    )
    expect(momentPropose({ debut: '14:00', fin: '22:45', pause: 45 })).toBe(
      'soir',
    )
    expect(momentPropose({ debut: '00:00', fin: '07:00', pause: 0 })).toBe(
      'nuit',
    )
  })

  it('un horaire se lit par ses heures, minuit écrit 00:00', () => {
    expect(libelleHoraire({ debut: '07:00', fin: '15:45' })).toBe('07:00–15:45')
    expect(libelleHoraire({ debut: '16:15', fin: '24:00' })).toBe('16:15–00:00')
  })

  it('le nom en base est écrit par l’app', () => {
    expect(nomHoraire({ debut: '07:00', fin: '15:45', periode: 'matin' })).toBe(
      'Matin de 7 h à 15 h 45',
    )
    expect(nomHoraire({ debut: '00:00', fin: '07:00', periode: 'nuit' })).toBe(
      'Nuit de minuit à 7 h',
    )
    expect(nomHoraire({ debut: '15:15', fin: '24:00', periode: 'soir' })).toBe(
      'Soir de 15 h 15 à minuit',
    )
  })
})
