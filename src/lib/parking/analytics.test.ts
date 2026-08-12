import { describe, expect, it } from 'vitest'

import { captageIndex } from '#/lib/parking/analytics.ts'

/*
 * Captage parking = occupation du parking client ÷ occupation de l'hôtel, en %,
 * BORNÉ 0–100 %. 100 % = parking au moins aussi rempli, en proportion, que
 * l'hôtel ; <100 % = parking en retrait ; 0 % = clients mais parking vide.
 * Voir en-tête de analytics.ts. (12 places client, 80 chambres.)
 */

describe('captageIndex', () => {
  it('100 % quand parking et hôtel sont aussi remplis l’un que l’autre', () => {
    // Parking à 50 % (6/12), hôtel à 50 % (40/80) → parité.
    expect(captageIndex(6, 40)).toBeCloseTo(100, 6)
  })

  it('plafonné à 100 % quand le parking est plus tendu que l’hôtel', () => {
    // Parking plein (12/12), hôtel à 25 % (20/80) → division 400 %, ramené à 100 %.
    expect(captageIndex(12, 20)).toBe(100)
  })

  it('faible quand le parking traîne derrière un hôtel plein', () => {
    // Parking à 17 % (2/12), hôtel plein (80/80) → 16,67 %.
    expect(captageIndex(2, 80)).toBeCloseTo(16.67, 2)
  })

  it('0 % quand des clients sont présents mais le parking est vide', () => {
    expect(captageIndex(0, 56)).toBe(0)
  })

  it('en retrait quand le parking est moins rempli que l’hôtel', () => {
    // Parking à 33 % (4/12), hôtel à 70 % (56/80) → 47,6 %.
    expect(captageIndex(4, 56)).toBeCloseTo(47.62, 2)
  })

  it('null quand l’occupation hôtel est inconnue (dénominateur nul)', () => {
    expect(captageIndex(4, 0)).toBeNull()
    expect(captageIndex(0, 0)).toBeNull()
  })
})
