import { describe, expect, it } from 'vitest'

import {
  grouperHoraires,
  libelleHoraire,
  trierHoraires,
} from '#/lib/planning/affichage.ts'
import type { Periode } from '#/lib/planning/types.ts'

/*
 * Rangement des horaires dans les menus et le volet (demande utilisateur du
 * 2026-10-28). Oracle : l'ordre de la journée, écrit à la main, lu par les
 * heures (plus de code depuis le 2026-10-31).
 */

let prochainId = 1
const h = (periode: Periode | null, debut: string, fin: string) => ({
  id: prochainId++,
  periode,
  debut,
  fin,
})

const HORAIRES = [
  h(null, '12:00', '20:45'),
  h('soir', '14:30', '23:15'),
  h('court', '07:00', '10:00'),
  h('nuit', '00:00', '07:00'),
  h('middle', '11:00', '19:45'),
  h('matin', '07:00', '17:45'),
  h('nuit', '23:00', '07:00'),
  h('matin', '07:00', '15:45'),
  h('court', '19:00', '22:00'),
  h('matin', '08:00', '16:45'),
  h('soir', '15:15', '00:00'),
]

describe('rangement des horaires', () => {
  it('par famille, puis du plus tôt au plus tard, puis du plus court au plus long', () => {
    expect(trierHoraires(HORAIRES).map(libelleHoraire)).toEqual([
      '07:00–15:45',
      '07:00–17:45',
      '08:00–16:45',
      '11:00–19:45',
      '14:30–23:15',
      '15:15–00:00',
      '23:00–07:00',
      '00:00–07:00',
      '07:00–10:00',
      '19:00–22:00',
      '12:00–20:45',
    ])
  })

  it('regroupe par famille, sans famille vide', () => {
    expect(
      grouperHoraires(HORAIRES).map((g) => [g.libelle, g.horaires.length]),
    ).toEqual([
      ['Matin', 3],
      ['Middle', 1],
      ['Soir', 2],
      ['Nuit', 2],
      ['Court', 2],
      ['À part', 1],
    ])
    expect(
      grouperHoraires(HORAIRES.filter((x) => x.periode === 'soir')),
    ).toHaveLength(1)
  })
})
