import { describe, expect, it } from 'vitest'

import {
  jourFige,
  messageErreur,
  MSG_JOUR_PASSE,
} from '#/lib/planning/erreurs.ts'

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

describe('jour passé figé (décision du 2026-11-18)', () => {
  // Oracle : la règle de la base (private.planning_garde_passe) recopiée à la
  // main : un jour avant aujourd'hui est figé, sauf pour la gestion.
  it("un jour passé est figé pour l'écriture", () => {
    expect(jourFige('2026-11-17', '2026-11-18', false)).toBe(true)
  })
  it("aujourd'hui et les jours suivants restent ouverts", () => {
    expect(jourFige('2026-11-18', '2026-11-18', false)).toBe(false)
    expect(jourFige('2026-11-19', '2026-11-18', false)).toBe(false)
  })
  it('la gestion corrige un jour passé', () => {
    expect(jourFige('2026-11-17', '2026-11-18', true)).toBe(false)
  })
  it('le message est celui de la base, sans tiret cadratin', () => {
    expect(MSG_JOUR_PASSE).toContain('On ne touche pas au passé')
    expect(MSG_JOUR_PASSE).not.toMatch(/[—«»]/)
  })
})
