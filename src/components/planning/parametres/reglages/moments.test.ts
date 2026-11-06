import { describe, expect, it } from 'vitest'

import {
  changementsDeMoment,
  deplacerMoment,
  differenceMoments,
  erreursMoments,
  idPourNom,
  momentsDepuis,
  nouveauMoment,
  raisonGarde,
} from '#/components/planning/parametres/reglages/moments.ts'
import { MOMENTS_PAR_DEFAUT } from '#/lib/planning/moment.ts'
import { momentsAvec } from '#/lib/planning/test/momentsTest.ts'
import type { Horaire, Reglages } from '#/lib/planning/types.ts'

const vide = { reglages: {} as Reglages }
const horaire = (id: number, debut: string, fin: string): Horaire =>
  ({ id, debut, fin, pause: 0, periode: null }) as unknown as Horaire

describe('moments de l’établissement (section Moments de Besoins)', () => {
  it('sans ligne en base : ceux de l’hôtel, sans erreur', () => {
    expect(momentsDepuis(vide).map((m) => m.id)).toEqual([
      'matin',
      'middle',
      'soir',
      'nuit',
    ])
    expect(erreursMoments(momentsDepuis(vide))).toEqual([])
  })

  it('aperçu : seuls les horaires qui changent de moment', () => {
    const avant = momentsDepuis(vide)
    const horaires = [
      horaire(1, '21:30', '07:00'),
      horaire(2, '07:00', '15:45'),
      horaire(3, '14:30', '23:15'),
    ]
    // La nuit commence à 22 h : 21:30 devient un soir.
    const apres = momentsAvec({ nuit: { debut_de: 22 * 60 } })
    expect(
      changementsDeMoment(horaires, avant, apres).map((c) => [
        c.horaire.id,
        c.avant,
        c.apres,
      ]),
    ).toEqual([[1, 'nuit', 'soir']])
    expect(changementsDeMoment(horaires, avant, avant)).toEqual([])
  })

  it('un moment « Midi » créé reçoit ses horaires', () => {
    const avant = momentsDepuis(vide)
    const midi = {
      ...nouveauMoment('Midi', avant),
      debut_de: 10 * 60,
      debut_a: 13 * 60,
      priorite: 0,
      compte_dans_tableau: true,
    }
    expect(midi.id).toBe('midi')
    const apres = [...avant, midi]
    const horaires = [
      horaire(1, '11:00', '15:00'),
      horaire(2, '07:00', '15:00'),
    ]
    expect(
      changementsDeMoment(horaires, avant, apres).map((c) => [
        c.horaire.id,
        c.apres,
      ]),
    ).toEqual([[1, 'midi']])
    expect(differenceMoments(avant, apres)).toEqual({
      ecrire: [midi],
      retirer: [],
    })
  })

  it('ranger, nommer, retirer', () => {
    const l = momentsDepuis(vide)
    expect(
      deplacerMoment(l, 'soir', -1)
        .sort((a, b) => a.ordre - b.ordre)
        .map((m) => m.id),
    ).toEqual(['matin', 'soir', 'middle', 'nuit'])
    expect(idPourNom('Après-midi', ['matin'])).toBe('apres-midi')
    expect(idPourNom('Matin', ['matin'])).toBe('matin-2')
    // Un moment qui a des horaires ou des chiffres reste.
    const horaires = [horaire(1, '07:00', '15:00')]
    expect(raisonGarde('matin', horaires, l, [])).toBe(
      'Des horaires sont rangés dans ce moment.',
    )
    expect(raisonGarde('soir', [], l, [{ periode: 'soir' }])).toBe(
      'Il a des chiffres au tableau.',
    )
    expect(raisonGarde('middle', horaires, l, [])).toBeNull()
    expect(differenceMoments(l, l.slice(0, 3)).retirer).toEqual(['nuit'])
  })

  it('refusé : deux moments du même nom, une heure hors de la journée', () => {
    const l = [...MOMENTS_PAR_DEFAUT]
    expect(
      erreursMoments([...l, { ...l[0], id: 'autre', nom: 'matin' }]),
    ).toContain('Deux moments ne portent pas le même nom.')
    expect(erreursMoments([{ ...l[0], debut_a: 1500 }])).toContain(
      'Une heure va de 00:00 à 24:00.',
    )
    expect(erreursMoments([])).toContain('Il faut au moins un moment.')
  })
})
