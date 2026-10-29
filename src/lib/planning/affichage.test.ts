import { describe, expect, it } from 'vitest'
import {
  listeEt,
  messageGeneration,
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
