import { describe, expect, it } from 'vitest'

import { parseComparison } from '#/lib/repjour/parse/comparison.ts'

/* Le même rapport, écrit dans deux casses. L'Edge Function (import-report)
 * compare les libellés en MAJUSCULES : l'import de secours du navigateur doit
 * lire exactement les mêmes chiffres, quelle que soit la casse du PMS. */
const EN_TETE = 'SECTION,TODAY,MTD,LAST YEAR MTD'

const CASSE_PMS = `${EN_TETE}
 Occupied Rooms,74.00,504.00,534.00
ROOM REVENUE,7400.00,50400.00,50000.00
VAT,740.00,5040.00,5000.00
`

const AUTRE_CASSE = `${EN_TETE}
 OCCUPIED ROOMS,74.00,504.00,534.00
Room Revenue,7400.00,50400.00,50000.00
vat,740.00,5040.00,5000.00
`

describe('parseComparison — libellés de section', () => {
  it('lit les trois lignes dans la casse habituelle du PMS', () => {
    const d = parseComparison(CASSE_PMS)
    expect(d.today.occupiedRoomsExclComp).toBe(74)
    expect(d.mtd.occupiedRoomsExclComp).toBe(504)
    expect(d.today.totalRevenueHT).toBe(7400)
    expect(d.mtd.totalRevenueHT).toBe(50400)
    expect(d.today.vat).toBe(740)
  })

  it('ignore la casse, comme la chaîne automatique (Edge Function)', () => {
    expect(parseComparison(AUTRE_CASSE)).toEqual(parseComparison(CASSE_PMS))
  })
})
