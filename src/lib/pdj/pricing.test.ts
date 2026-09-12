import { describe, expect, it } from 'vitest'

import {
  billedRevenueTtc,
  dayUnitPrices,
  includedByCode,
  topPrice,
} from '#/lib/pdj/pricing.ts'

/*
 * Prix RÉELS lus dans la facturation du PMS. Les valeurs sont celles de la
 * production (2026-09-09 au 2026-09-12) : elles documentent autant qu'elles
 * vérifient.
 */

// Tarifs de référence, déduits de l'historique (`detectTarifs`) : repli seul.
const REFERENCE = new Map([
  ['PDJ', 19],
  ['PDJBB', 10],
  ['PDJGROUP10', 10],
])

describe('includedByCode', () => {
  it('regroupe les inclus par code de la chambre', () => {
    const rows = [
      { addons: 'PDJ INCL', breakfasts_included: 2 },
      { addons: 'PDJ INCL', breakfasts_included: 1 },
      { addons: 'PDJBB INCL', breakfasts_included: 2 },
      { addons: 'TAXE SEJOUR', breakfasts_included: 0 },
    ]
    expect(includedByCode(rows)).toEqual(
      new Map([
        ['PDJ', 3],
        ['PDJBB', 2],
      ]),
    )
  })

  it('compte un inclus manuel comme un PDJ', () => {
    const rows = [
      { addons: null, breakfasts_included: 1, manual_kind: 'inclus' },
    ]
    expect(includedByCode(rows).get('PDJ')).toBe(1)
  })
})

describe('dayUnitPrices', () => {
  it('lit le prix du jour : recette ÷ inclus', () => {
    // 2026-09-10, journée ordinaire.
    const prices = dayUnitPrices(
      [
        { code: 'PDJ', revenue_ttc: 304 },
        { code: 'PDJBB', revenue_ttc: 330 },
        { code: 'PDJGROUP10', revenue_ttc: 300 },
      ],
      new Map([
        ['PDJ', 16],
        ['PDJBB', 33],
        ['PDJGROUP10', 30],
      ]),
      REFERENCE,
    )
    expect(prices.get('PDJ')).toBe(19)
    expect(prices.get('PDJBB')).toBe(10)
    expect(prices.get('PDJGROUP10')).toBe(10)
  })

  it('voit la remise du jour sans rien deviner', () => {
    // 2026-09-12 : 16 inclus facturés 296 € au lieu de 304 → 18,50 €.
    // C'est la journée qui avait fait tomber l'ancienne détection à 1,00 €.
    const prices = dayUnitPrices(
      [{ code: 'PDJ', revenue_ttc: 296 }],
      new Map([['PDJ', 16]]),
      REFERENCE,
    )
    expect(prices.get('PDJ')).toBe(18.5)
  })

  it('suivrait un changement de tarif décidé par la direction', () => {
    // Aucun changement dans l'historique réel : ce cas ne peut être vérifié
    // qu'ici. Le prix lu est celui du jour, il n'a rien à rattraper.
    const prices = dayUnitPrices(
      [{ code: 'PDJ', revenue_ttc: 500 }],
      new Map([['PDJ', 20]]),
      REFERENCE,
    )
    expect(prices.get('PDJ')).toBe(25)
  })

  it('retombe sur le prix de référence quand le jour ne dit rien', () => {
    // Recette présente mais aucun inclus côté application (chambre non
    // importée) : le prix du jour n'est pas calculable.
    const prices = dayUnitPrices(
      [{ code: 'PDJ', revenue_ttc: 304 }],
      new Map(),
      REFERENCE,
    )
    expect(prices.get('PDJ')).toBe(19)
  })

  it('ignore un avoir (recette négative) et garde la référence', () => {
    // Huit jours en neuf mois, tous sur le code groupe (jusqu'à −540 €).
    const prices = dayUnitPrices(
      [{ code: 'PDJGROUP10', revenue_ttc: -540 }],
      new Map([['PDJGROUP10', 8]]),
      REFERENCE,
    )
    expect(prices.get('PDJGROUP10')).toBe(10)
  })

  it('rend une carte vide quand rien n est connu', () => {
    expect(dayUnitPrices([], new Map(), new Map()).size).toBe(0)
  })
})

describe('topPrice', () => {
  it('rend le prix le plus élevé — un extra se vend au tarif plein', () => {
    expect(
      topPrice(
        new Map([
          ['PDJ', 19],
          ['PDJBB', 10],
          ['PDJGROUP10', 10],
        ]),
      ),
    ).toBe(19)
  })

  it('suit la remise du jour', () => {
    expect(
      topPrice(
        new Map([
          ['PDJ', 18.5],
          ['PDJBB', 10],
        ]),
      ),
    ).toBe(18.5)
  })

  it('retient le prix de la CARTE malgré une remise du jour', () => {
    // 2026-09-12 : le code PDJ tombe à 18,50 € parce qu'une chambre a été
    // remisée de 8 €. Un client qui descend prendre un petit-déjeuner paie
    // pourtant toujours 19 € — c'est ce prix-là qui vaut pour un extra.
    expect(
      topPrice(
        new Map([
          ['PDJ', 18.5],
          ['PDJBB', 10],
        ]),
        REFERENCE,
      ),
    ).toBe(19)
  })

  it('suit une HAUSSE dès le jour où elle est facturée', () => {
    // La direction passe le petit-déjeuner à 25 € : le prix du jour dépasse la
    // référence, et c'est lui qui l'emporte — sans attendre que l'historique
    // ait basculé.
    expect(topPrice(new Map([['PDJ', 25]]), REFERENCE)).toBe(25)
  })

  it('rend null quand aucun prix n est connu', () => {
    expect(topPrice(new Map())).toBeNull()
    expect(topPrice(new Map(), new Map())).toBeNull()
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
