import { describe, expect, it } from 'vitest'

import { COULEURS_HORAIRE, couleurHoraire } from '#/lib/planning/cycles.ts'
import { momentPropose } from '#/lib/planning/moment.ts'

/*
 * Oracle : décision utilisateur du 2026-11-11, « violet pour les shifts
 * assez courts, orange en middle, bleu la nuit, vert le soir ; retire le
 * rose et place-le dans la bonne couleur ». Horaires réels de l'hôtel.
 */
const couleur = (debut: string, fin: string, pause = 45) =>
  couleurHoraire({
    debut,
    fin,
    pause,
    periode: momentPropose({ debut, fin, pause }),
  })

describe('couleur d’un horaire', () => {
  it('la nuit en bleu', () => {
    expect(couleur('23:00', '07:00', 0)).toBe(COULEURS_HORAIRE.nuit)
    expect(couleur('00:00', '07:00', 0)).toBe(COULEURS_HORAIRE.nuit)
  })
  it('un horaire court en violet, quel que soit son moment', () => {
    expect(couleur('07:00', '12:45')).toBe(COULEURS_HORAIRE.court)
    expect(couleur('17:00', '22:00')).toBe(COULEURS_HORAIRE.court)
    expect(couleur('19:00', '22:00', 0)).toBe(COULEURS_HORAIRE.court)
  })
  it('sinon la couleur du moment', () => {
    expect(couleur('07:00', '15:45')).toBe(COULEURS_HORAIRE.matin)
    expect(couleur('08:00', '18:00')).toBe(COULEURS_HORAIRE.matin)
    expect(couleur('11:00', '19:45')).toBe(COULEURS_HORAIRE.middle)
    expect(couleur('14:30', '23:15')).toBe(COULEURS_HORAIRE.soir)
  })
  it('l’ancien rose (12:00-20:45) passe à l’orange du middle', () => {
    expect(couleur('12:00', '20:45')).toBe(COULEURS_HORAIRE.middle)
  })
})
