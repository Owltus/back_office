import { describe, expect, it } from 'vitest'

import { reglerChamp } from '#/components/planning/parametres/reglages/besoins.ts'

/*
 * Oracle : les règles des compteurs de l'écran d'avant le 2026-10-31,
 * gardées par la refonte (« ne change pas le modèle ») — un nouveau besoin
 * ouvre une place d'apprenti ; plus personne nécessaire ni en plus, plus
 * d'apprenti ; le minimum monte, le plafond suit ; le plafond descend, le
 * minimum suit.
 */

describe('reglerChamp', () => {
  it('un nouveau besoin n’ouvre plus de place d’apprenti (2026-11-01)', () => {
    // Oracle : en production, cette place ouverte d'office donnait « personne
    // n'a le niveau Soutien » sur cinq postes sans apprenti.
    expect(
      reglerChamp({ effectif: 0, soutien: 0, renfort: 0 }, 'effectif', 1),
    ).toEqual({ effectif: 1, soutien: 0, renfort: 0 })
  })
  it('un besoin existant garde ses places d’apprenti', () => {
    expect(
      reglerChamp({ effectif: 1, soutien: 0, renfort: 0 }, 'effectif', 2),
    ).toEqual({ effectif: 2, soutien: 0, renfort: 0 })
  })
  it('plus personne à côté : plus d’apprenti', () => {
    expect(
      reglerChamp({ effectif: 1, soutien: 1, renfort: 0 }, 'effectif', 0),
    ).toEqual({ effectif: 0, soutien: 0, renfort: 0 })
    expect(
      reglerChamp({ effectif: 0, soutien: 1, renfort: 1 }, 'renfort', 0),
    ).toEqual({ effectif: 0, soutien: 0, renfort: 0 })
  })
  it('une place en plus suffit à garder l’apprenti', () => {
    expect(
      reglerChamp({ effectif: 1, soutien: 1, renfort: 1 }, 'effectif', 0),
    ).toEqual({ effectif: 0, soutien: 1, renfort: 1 })
  })
  it('jamais d’apprenti sans personne à côté', () => {
    expect(
      reglerChamp({ effectif: 0, soutien: 0, renfort: 0 }, 'soutien', 1),
    ).toEqual({ effectif: 0, soutien: 0, renfort: 0 })
    expect(
      reglerChamp({ effectif: 1, soutien: 0, renfort: 0 }, 'soutien', 2),
    ).toEqual({ effectif: 1, soutien: 2, renfort: 0 })
  })
})
