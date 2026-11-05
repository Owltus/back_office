import { describe, expect, it } from 'vitest'

import {
  ARRIVEE_MATIN_MAX,
  coutArriveeMatin,
  POIDS_ARRIVEE_MATIN_MINUTE,
} from '#/lib/planning/generateur.ts'
import { creneau } from '#/lib/planning/modele.ts'

/*
 * L'équipe du matin arrive à l'ouverture (2026-11-05). Oracle : les 18
 * semaines faites à la main (29/06 au 26/10), où presque tous les matins de
 * l'accueil commencent à 07:00. Coût par minute après l'ouverture du poste
 * ce jour-là, plafonné, pour un créneau du MATIN de l'accueil seulement.
 */

const H = 60
const ouverture = new Map([['4|1', 24 * H + 7 * H]]) // Réception, mardi 07:00
const matin = (
  debut: number,
  extra: Partial<Parameters<typeof creneau>[0]> = {},
) =>
  creneau({
    id: 'c',
    poste: '4',
    debut: 24 * H + debut,
    fin: 24 * H + debut + 8 * H,
    jourPlanning: 1,
    moment: 'matin',
    accueil: true,
    ...extra,
  })

describe('arriver à l’ouverture', () => {
  it('rien à l’heure, le retard se paie à la minute', () => {
    expect(coutArriveeMatin(matin(7 * H), ouverture)).toBe(0)
    expect(coutArriveeMatin(matin(7 * H + 30), ouverture)).toBe(
      30 * POIDS_ARRIVEE_MATIN_MINUTE,
    )
    expect(coutArriveeMatin(matin(8 * H), ouverture)).toBe(
      60 * POIDS_ARRIVEE_MATIN_MINUTE,
    )
  })

  it('plafonné, et jamais négatif', () => {
    expect(coutArriveeMatin(matin(11 * H), ouverture)).toBe(
      ARRIVEE_MATIN_MAX * POIDS_ARRIVEE_MATIN_MINUTE,
    )
    expect(coutArriveeMatin(matin(6 * H), ouverture)).toBe(0)
  })

  it('refusé : un autre moment, un poste hors accueil, un jour sans ouverture', () => {
    expect(
      coutArriveeMatin(matin(8 * H, { moment: 'middle' }), ouverture),
    ).toBe(0)
    expect(coutArriveeMatin(matin(8 * H, { moment: 'soir' }), ouverture)).toBe(
      0,
    )
    expect(coutArriveeMatin(matin(8 * H, { accueil: false }), ouverture)).toBe(
      0,
    )
    expect(coutArriveeMatin(matin(8 * H, { poste: '5' }), ouverture)).toBe(0)
    expect(coutArriveeMatin(matin(8 * H, { jourPlanning: 2 }), ouverture)).toBe(
      0,
    )
  })
})
