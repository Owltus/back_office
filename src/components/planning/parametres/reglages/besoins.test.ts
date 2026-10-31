import { describe, expect, it } from 'vitest'

import {
  besoinsEnEcart,
  nouvellesBornes,
  reglerChamp,
} from '#/components/planning/parametres/reglages/besoins.ts'

/*
 * Oracle : les règles des compteurs de l'écran d'avant le 2026-10-31,
 * gardées par la refonte (« ne change pas le modèle ») — un nouveau besoin
 * ouvre une place d'apprenti ; plus personne nécessaire ni en plus, plus
 * d'apprenti ; le minimum monte, le plafond suit ; le plafond descend, le
 * minimum suit.
 */

describe('reglerChamp', () => {
  it('un nouveau besoin ouvre une place pour un apprenti ou un stagiaire', () => {
    expect(
      reglerChamp({ effectif: 0, soutien: 0, renfort: 0 }, 'effectif', 1),
    ).toEqual({ effectif: 1, soutien: 1, renfort: 0 })
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

describe('nouvellesBornes', () => {
  it('le minimum monte, le plafond suit', () => {
    expect(
      nouvellesBornes({ minimum: 0, maximum: null }, 'minimum', 1),
    ).toEqual({ minimum: 1, maximum: 1 })
    expect(nouvellesBornes({ minimum: 2, maximum: 4 }, 'minimum', 3)).toEqual({
      minimum: 3,
      maximum: 4,
    })
  })
  it('le plafond descend, le minimum suit', () => {
    expect(nouvellesBornes({ minimum: 2, maximum: 2 }, 'maximum', 1)).toEqual({
      minimum: 1,
      maximum: 1,
    })
  })
  it('écart : moins que le minimum ou plus que le maximum', () => {
    expect(besoinsEnEcart(2, { minimum: 3, maximum: null })).toBe(true)
    expect(besoinsEnEcart(3, { minimum: 3, maximum: null })).toBe(false)
    expect(besoinsEnEcart(5, { minimum: 3, maximum: 4 })).toBe(true)
  })
})
