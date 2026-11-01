import { describe, expect, it } from 'vitest'

import { messageErreur } from '#/lib/planning/erreurs.ts'

describe('doublon refusé par la base (23505)', () => {
  // Oracle : le nom de la contrainte, tel que Postgres l'écrit dans le
  // message, dit quelle règle est refusée (audit RH du 2026-11-01).
  const doublon = (message: string) => ({ code: '23505', message })
  it('un horaire aux mêmes heures', () => {
    expect(
      messageErreur(
        doublon(
          'duplicate key value violates unique constraint "planning_horaires_heures_unique"',
        ),
        'Enregistrement impossible',
      ),
    ).toBe(
      'Enregistrement impossible : un horaire aux mêmes heures existe déjà.',
    )
  })
  it('un second shift le même jour', () => {
    expect(
      messageErreur(
        doublon(
          'duplicate key value violates unique constraint "planning_affectations_un_par_jour"',
        ),
        'Enregistrement impossible',
      ),
    ).toBe(
      'Enregistrement impossible : cette personne a déjà un shift ce jour-là, un seul par jour.',
    )
  })
  it('un autre doublon ne parle pas d’une personne', () => {
    expect(
      messageErreur(
        doublon('unique constraint "autre"'),
        'Enregistrement impossible',
      ),
    ).toBe('Enregistrement impossible : cet élément existe déjà.')
  })
})
