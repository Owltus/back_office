import { describe, expect, it } from 'vitest'

import { COULEURS_HORAIRE } from '#/lib/planning/cycles.ts'
import {
  EXTRA,
  deplacementHoraire,
  estExtra,
  groupeHoraire,
} from '#/lib/planning/deplacementHoraire.ts'
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
      extra: false,
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

  it('moins de 6 h de travail : dans Extra, sauf posé dans un moment', () => {
    const court = {
      ...middle,
      debut: '07:00',
      fin: '12:45',
      pause: 0,
      periode: 'matin',
    }
    expect(groupeHoraire(court)).toBe(EXTRA)
    expect(groupeHoraire(middle)).toBe('middle')
    // Posé dans son propre moment : il quitte Extra, donc marqué.
    const ch = deplacementHoraire(court, 'matin')
    expect(ch?.moment_force).toBe(true)
    // Sorti d'Extra : la couleur du matin, plus le violet.
    expect(ch?.couleur).toBe(COULEURS_HORAIRE.matin)
    expect(groupeHoraire({ ...court, ...ch })).toBe('matin')
    // Reposé dans Extra : il revient au calcul.
    const retour = deplacementHoraire({ ...court, ...ch }, EXTRA)
    expect(retour).toMatchObject({ periode: 'matin', moment_force: false })
    expect(deplacementHoraire(court, EXTRA)).toBeNull()
  })

  it('6 h de travail ou plus : dans Extra seulement posé à la main', () => {
    expect(estExtra({ debut: '07:00', fin: '13:00', pause: 0 })).toBe(false)
    expect(estExtra({ debut: '07:00', fin: '12:59', pause: 0 })).toBe(true)
    const six = {
      debut: '07:00',
      fin: '13:00',
      pause: 0,
      periode: 'matin' as const,
    }
    expect(groupeHoraire(six)).toBe('matin')
    // Posé dans Extra (retours de la RH du 2026-11-12) : marqué, il y reste.
    const ch = deplacementHoraire(six, EXTRA)
    expect(ch).toMatchObject({
      periode: 'matin',
      moment_force: false,
      extra: true,
    })
    const range = { ...six, ...ch }
    expect(groupeHoraire(range)).toBe(EXTRA)
    // La couleur suit le tableau (2026-11-12) : violet dans Extra.
    expect(ch?.couleur).toBe(COULEURS_HORAIRE.court)
    expect(deplacementHoraire(range, EXTRA)).toBeNull()
    // Reposé dans son moment : la marque part.
    const retour = deplacementHoraire(range, 'matin')
    expect(retour).toMatchObject({ moment_force: false, extra: false })
    expect(groupeHoraire({ ...range, ...retour })).toBe('matin')
    // Reposé dans un autre moment : marqué comme tout déplacement.
    expect(deplacementHoraire(range, 'middle')).toMatchObject({
      periode: 'middle',
      moment_force: true,
      extra: false,
    })
  })

  it('un moment inconnu rangé à la main retombe sur le calcul', () => {
    expect(
      momentDeLHoraire({ ...middle, periode: 'inconnu', moment_force: true }),
    ).toBe('middle')
  })
})
