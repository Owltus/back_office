import { describe, expect, it } from 'vitest'

import { grouperHoraires, trierHoraires } from '#/lib/planning/affichage.ts'
import type { Periode } from '#/lib/planning/types.ts'

/*
 * Rangement des codes dans les menus et le volet (demande utilisateur du
 * 2026-10-28). Oracle : l'ordre de la journée, écrit à la main.
 */

const h = (
  code: string,
  periode: Periode | null,
  debut: string,
  fin: string,
) => ({
  code,
  periode,
  debut,
  fin,
})

const CODES = [
  h('SR', null, '12:00', '20:45'),
  h('S4', 'soir', '14:30', '23:15'),
  h('M21', 'court', '07:00', '10:00'),
  h('N67', 'nuit', '00:00', '07:00'),
  h('M9', 'middle', '11:00', '19:45'),
  h('M10', 'matin', '07:00', '17:45'),
  h('N3', 'nuit', '23:00', '07:00'),
  h('M3', 'matin', '07:00', '15:45'),
  h('S11', 'court', '19:00', '22:00'),
  h('M6', 'matin', '08:00', '16:45'),
  h('S7', 'soir', '15:15', '00:00'),
]

describe('rangement des codes horaires', () => {
  it('par famille, puis du plus tôt au plus tard, puis du plus court au plus long', () => {
    expect(trierHoraires(CODES).map((x) => x.code)).toEqual([
      'M3',
      'M10',
      'M6',
      'M9',
      'S4',
      'S7',
      'N3',
      'N67',
      'M21',
      'S11',
      'SR',
    ])
  })

  it('regroupe par famille, sans famille vide', () => {
    expect(
      grouperHoraires(CODES).map((g) => [g.libelle, g.horaires.length]),
    ).toEqual([
      ['Matin', 3],
      ['Middle', 1],
      ['Soir', 2],
      ['Nuit', 2],
      ['Court', 2],
      ['À part', 1],
    ])
    expect(
      grouperHoraires(CODES.filter((x) => x.periode === 'soir')),
    ).toHaveLength(1)
  })
})
