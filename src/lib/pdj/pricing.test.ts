import { describe, expect, it } from 'vitest'

import { billedRevenueTtc, topPrice } from '#/lib/pdj/pricing.ts'

/*
 * Prix RÉELS de la carte, retrouvés par `detectTarifs` dans les 602 recettes de
 * production (vérifié le 2026-09-12) : PDJ 19,00 € TTC (17,27 € HT), PDJBB et
 * PDJGROUP10 10,00 € (9,09 € HT). Rien n'est écrit en dur dans l'application —
 * ces valeurs documentent l'état du jour, pas une constante.
 */
const CARTE = new Map([
  ['PDJ', 19],
  ['PDJBB', 10],
  ['PDJGROUP10', 10],
])

describe('topPrice', () => {
  it('rend le prix le plus élevé — un extra se vend au tarif plein', () => {
    expect(topPrice(CARTE)).toBe(19)
  })

  it('suit un changement de tarif, puisqu il lit la carte détectée', () => {
    // La direction passe le petit-déjeuner à 25 € : `detectTarifs` le retrouve
    // dans les recettes, et l'extra suit sans qu'aucun seuil soit à toucher.
    expect(
      topPrice(
        new Map([
          ['PDJ', 25],
          ['PDJBB', 10],
        ]),
      ),
    ).toBe(25)
  })

  it('rend null quand aucun prix n est connu', () => {
    expect(topPrice(new Map())).toBeNull()
  })
})

describe('billedRevenueTtc', () => {
  it('somme la recette de tous les codes', () => {
    // 2026-09-12 : 296 + 50 + 10.
    expect(
      billedRevenueTtc([
        { code: 'PDJ', revenue_ttc: 296 },
        { code: 'PDJBB', revenue_ttc: 50 },
        { code: 'PDJGROUP10', revenue_ttc: 10 },
      ]),
    ).toBe(356)
  })

  it('inclut le groupe posté en bloc', () => {
    // 2026-01-31 : 770 € pour 8 chambres seulement — 690 € sans chambre.
    // Décision produit : cette recette fait partie du chiffre d'affaires.
    expect(billedRevenueTtc([{ code: 'PDJGROUP10', revenue_ttc: 770 }])).toBe(
      770,
    )
  })

  it('laisse un avoir diminuer la recette', () => {
    expect(
      billedRevenueTtc([
        { code: 'PDJ', revenue_ttc: 300 },
        { code: 'PDJGROUP10', revenue_ttc: -540 },
      ]),
    ).toBe(-240)
  })

  it('rend 0 sans aucune ligne', () => {
    expect(billedRevenueTtc([])).toBe(0)
  })
})
