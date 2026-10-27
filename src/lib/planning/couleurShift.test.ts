import { describe, expect, it } from 'vitest'

import { couleurShift } from '#/lib/planning/affichage.ts'

describe('couleur d’un shift', () => {
  const matin = { couleur: '#facc15' }
  const hotelier = { couleur: '#3b82f6', presence: true }
  const technique = { couleur: '#dc2626', presence: false }

  it('hôtelier : la couleur du code', () => {
    expect(couleurShift(matin, hotelier, '#000')).toBe('#facc15')
  })
  it('poste hors présence (direction, technique…) : la couleur du poste', () => {
    expect(couleurShift(matin, technique, '#000')).toBe('#dc2626')
  })
  it('sans code ni poste : la couleur par défaut', () => {
    expect(couleurShift(undefined, hotelier, '#000')).toBe('#000')
    expect(couleurShift(undefined, undefined, '#000')).toBe('#000')
  })
})
