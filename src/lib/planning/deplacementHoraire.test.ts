import { describe, expect, it } from 'vitest'

import { COULEURS_HORAIRE } from '#/lib/planning/cycles.ts'
import { deplacementHoraire } from '#/lib/planning/deplacementHoraire.ts'
import { avecMomentCalcule, momentDeLHoraire } from '#/lib/planning/moment.ts'

// 09:00-17:45, pause 45 : 8 h de travail, middle d'après ses heures.
const middle = {
  debut: '09:00',
  fin: '17:45',
  pause: 45,
  periode: 'middle',
  moment_force: false,
}

describe('horaire rangé à la main', () => {
  it('posé dans un autre moment : marqué, couleur et nom suivent', () => {
    const ch = deplacementHoraire(middle, 'matin')
    expect(ch).toEqual({
      periode: 'matin',
      moment_force: true,
      nom: 'Matin de 9 h à 17 h 45',
      couleur: COULEURS_HORAIRE.matin,
    })
  })

  it('remis dans le moment de ses heures : la marque disparaît', () => {
    const range = { ...middle, periode: 'soir', moment_force: true }
    const ch = deplacementHoraire(range, 'middle')
    expect(ch?.moment_force).toBe(false)
    expect(ch?.couleur).toBe(COULEURS_HORAIRE.middle)
  })

  it('déposé dans son propre moment : rien à écrire', () => {
    expect(deplacementHoraire(middle, 'middle')).toBeNull()
  })

  it('posé en nuit : bleu, et compté comme une nuit', () => {
    expect(deplacementHoraire(middle, 'nuit')?.couleur).toBe(
      COULEURS_HORAIRE.nuit,
    )
  })

  it('la lecture garde le moment rangé à la main, et le calcul sinon', () => {
    const range = { ...middle, periode: 'soir', moment_force: true }
    expect(momentDeLHoraire(range)).toBe('soir')
    expect(avecMomentCalcule(range).periode).toBe('soir')
    expect(avecMomentCalcule({ ...range, moment_force: false }).periode).toBe(
      'middle',
    )
  })

  it('un moment inconnu rangé à la main retombe sur le calcul', () => {
    expect(
      momentDeLHoraire({ ...middle, periode: 'inconnu', moment_force: true }),
    ).toBe('middle')
  })
})
