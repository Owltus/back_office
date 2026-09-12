import { describe, expect, it } from 'vitest'

import { billedRevenueTtc, cardPrices, topPrice } from '#/lib/pdj/pricing.ts'

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

/* --------------------------------------------------------------------------
 * La carte des tarifs, relue dans la facturation.
 *
 * Les valeurs et les proportions ci-dessous sont celles de la production au
 * 2026-09-12 : pour le code PDJ, 203 journées sur 254 donnent exactement
 * 19,00 € — et les 51 autres n'importent pas, puisque c'est la valeur la plus
 * fréquente qui fait le prix.
 * ------------------------------------------------------------------------ */

/** Une journée : `n` couverts inclus facturés `unit` euros pièce. */
function jour(service_date: string, unit: number, n = 16, code = 'PDJ') {
  return { service_date, code, included: n, revenue_ttc: round(unit * n) }
}
function round(x: number): number {
  return Math.round(x * 100) / 100
}
/** `n` journées consécutives au même prix, à partir du 1er du mois. */
function jours(mois: string, unit: number, n: number, code = 'PDJ') {
  return Array.from({ length: n }, (_, i) =>
    jour(`${mois}-${String(i + 1).padStart(2, '0')}`, unit, 16, code),
  )
}

describe('cardPrices', () => {
  it('rend le prix le plus FRÉQUENT, pas la moyenne', () => {
    // Vingt journées à 19 € et une remisée : la remise ne déplace pas la carte.
    const rows = [...jours('2026-08', 19, 20), jour('2026-08-21', 18.5)]
    expect(cardPrices(rows).get('PDJ')).toBe(19)
  })

  it('ignore un groupe facturé en bloc, qui gonfle le quotient', () => {
    // Une recette rattachée à peu de chambres donne un quotient absurde
    // (jusqu'à 96,25 € en production). Minoritaire, donc sans effet.
    const rows = [
      ...jours('2026-08', 19, 20),
      {
        service_date: '2026-08-21',
        code: 'PDJ',
        included: 8,
        revenue_ttc: 770,
      },
    ]
    expect(cardPrices(rows).get('PDJ')).toBe(19)
  })

  it('lit chaque code séparément', () => {
    const rows = [
      ...jours('2026-08', 19, 10),
      ...jours('2026-08', 10, 10, 'PDJBB'),
    ]
    const m = cardPrices(rows)
    expect(m.get('PDJ')).toBe(19)
    expect(m.get('PDJBB')).toBe(10)
  })

  it('SUIT un changement de tarif décidé par la direction', () => {
    // Le point qui avait manqué au 2026-09-12 : la recherche de diviseur qui
    // tenait ce rôle tombait à 1,00 € au seizième jour d'un tarif à 25 €
    // (19 et 25 n'ont pour diviseur commun que 1) et n'en repartait jamais.
    const ancien = jours('2026-07', 19, 25)
    const bascule = (n: number) =>
      cardPrices([...ancien, ...jours('2026-08', 25, n)]).get('PDJ')
    expect(bascule(0)).toBe(19)
    expect(bascule(5)).toBe(19) // minoritaire dans la fenêtre : on ne bouge pas
    expect(bascule(11)).toBe(25) // majoritaire : la carte a basculé
    expect(bascule(30)).toBe(25) // et elle y reste
  })

  it('suit aussi une BAISSE de tarif', () => {
    const rows = [...jours('2026-07', 19, 25), ...jours('2026-08', 15, 15)]
    expect(cardPrices(rows).get('PDJ')).toBe(15)
  })

  it('valorise un jour PASSÉ au tarif qui avait cours alors', () => {
    const rows = [...jours('2026-07', 19, 25), ...jours('2026-08', 25, 25)]
    expect(cardPrices(rows, new Map(), '2026-07-25').get('PDJ')).toBe(19)
    expect(cardPrices(rows).get('PDJ')).toBe(25)
  })

  it('garde le prix de repli tant que la fenêtre ne dit rien', () => {
    const repli = new Map([['PDJ', 19]])
    expect(cardPrices([], repli).get('PDJ')).toBe(19)
    // Deux observations seulement : trop peu pour conclure.
    expect(cardPrices(jours('2026-08', 25, 2), repli).get('PDJ')).toBe(19)
    // Trois : la fenêtre parle.
    expect(cardPrices(jours('2026-08', 25, 3), repli).get('PDJ')).toBe(25)
  })

  it('écarte ce qui ne peut pas donner un prix', () => {
    const rows = [
      ...jours('2026-08', 19, 5),
      {
        service_date: '2026-08-06',
        code: 'PDJ',
        included: 0,
        revenue_ttc: 300,
      }, // rooming absent
      {
        service_date: '2026-08-07',
        code: 'PDJ',
        included: 10,
        revenue_ttc: null,
      }, // Addon absent
      {
        service_date: '2026-08-08',
        code: 'PDJ',
        included: 10,
        revenue_ttc: -540,
      }, // avoir
      { service_date: '2026-08-09', code: null, included: 5, revenue_ttc: 95 }, // chambres sans code
    ]
    expect(cardPrices(rows).get('PDJ')).toBe(19)
    expect(cardPrices(rows).size).toBe(1)
  })
})
