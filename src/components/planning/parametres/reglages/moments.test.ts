import { describe, expect, it } from 'vitest'

import {
  changementsDeMoment,
  erreursMoments,
  limites,
  momentsDepuis,
} from '#/components/planning/parametres/reglages/moments.ts'
import { REGLES_PAR_DEFAUT } from '#/lib/planning/reglesEtablissement.ts'
import type { Horaire, Reglages } from '#/lib/planning/types.ts'

const vide = { reglages: { releve_minutes: 30 } as Reglages }
const horaire = (id: number, debut: string, fin: string): Horaire =>
  ({ id, debut, fin, pause: 0, periode: null }) as unknown as Horaire

describe('limites des moments (page Horaires)', () => {
  it('lues puis relues : celles du moteur', () => {
    expect(limites(momentsDepuis(vide))).toEqual(REGLES_PAR_DEFAUT.moments)
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
    const apres = { ...avant, nuit_debut: 22 * 60 }
    expect(
      changementsDeMoment(horaires, avant, apres).map((c) => [
        c.horaire.id,
        c.avant,
        c.apres,
      ]),
    ).toEqual([[1, 'nuit', 'soir']])
    expect(changementsDeMoment(horaires, avant, avant)).toEqual([])
  })

  it('refusé : une nuit qui finirait après avoir commencé', () => {
    const s = momentsDepuis(vide)
    expect(erreursMoments({ ...s, nuit_fin: 22 * 60 })).toContain(
      'La nuit finit le matin, avant de recommencer le soir.',
    )
    expect(erreursMoments({ ...s, nuit_debut: 1500 })).toContain(
      'Une heure va de 00:00 à 23:59.',
    )
  })
})
